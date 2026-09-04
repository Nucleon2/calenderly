"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { isValidTimeZone, localMinutesToUtc } from "@/lib/time";
import { rateLimit } from "@/lib/rate-limit";
import { getSlotsForEventType } from "@/server/bookings/slots-service";
import { createBooking } from "@/server/bookings/service";
import { createBookingSchema } from "@/server/bookings/schema";
import {
  BookingNotFoundError,
  BookingValidationError,
  EventTypeUnavailableError,
  InvalidBookingStateError,
  SlotUnavailableError,
} from "@/server/bookings/errors";

// ---------------------------------------------------------------------------
// getSlotsAction
// ---------------------------------------------------------------------------

export interface GetSlotsInput {
  eventTypeId: string;
  /** First day of the displayed month, `YYYY-MM-DD`, in `timezone`. */
  monthStart: string;
  /** Last day of the displayed month, `YYYY-MM-DD`, in `timezone`. */
  monthEnd: string;
  timezone: string;
  excludeBookingUid?: string;
}

export type GetSlotsResult =
  | {
      ok: true;
      timezone: string;
      slotsByDate: Record<string, { start: string; end: string }[]>;
      rangeStart: string;
      rangeEnd: string;
    }
  | { ok: false; error: string };

/**
 * Fetches available slots for the given month, in the invitee's time zone.
 * The visible month's local boundaries are converted to a precise UTC
 * instant range with `localMinutesToUtc` before handing off to the slots
 * service.
 */
export async function getSlotsAction(input: GetSlotsInput): Promise<GetSlotsResult> {
  if (!input.eventTypeId) {
    return { ok: false, error: "Missing event type." };
  }
  if (!isValidTimeZone(input.timezone)) {
    return { ok: false, error: "Invalid time zone." };
  }

  let rangeStart: Date;
  let rangeEnd: Date;
  try {
    rangeStart = localMinutesToUtc(input.monthStart, 0, input.timezone);
    rangeEnd = localMinutesToUtc(input.monthEnd, 1440, input.timezone);
  } catch {
    return { ok: false, error: "Invalid date range." };
  }

  try {
    const result = await getSlotsForEventType({
      eventTypeId: input.eventTypeId,
      rangeStart,
      rangeEnd,
      inviteeTimezone: input.timezone,
      excludeBookingUid: input.excludeBookingUid,
    });
    return { ok: true, ...result };
  } catch (error) {
    if (error instanceof EventTypeUnavailableError) {
      return { ok: false, error: "This event type is no longer available." };
    }
    console.error("getSlotsAction failed", error);
    return { ok: false, error: "Couldn't load available times. Please try again." };
  }
}

// ---------------------------------------------------------------------------
// submitBookingAction
// ---------------------------------------------------------------------------

export interface SubmitBookingInput {
  eventTypeId: string;
  /** ISO UTC instant. */
  startUtc: string;
  inviteeName: string;
  inviteeEmail: string;
  inviteeTimezone: string;
  answers: { questionId: string; value: string }[];
  rescheduleFromUid?: string;
  /** Honeypot field — must be empty for a real invitee. */
  faxConfirm?: string;
  /** `Date.now()` when the booking form first rendered. */
  startedAt?: number;
}

export type SubmitBookingResult = {
  ok: false;
  error: string;
  field?: string;
  code?: "slot_unavailable";
};
// On success this redirects (`redirect()` throws internally) instead of
// returning — see the note at the bottom of the function.

const GENERIC_ERROR = "Something went wrong. Please try again.";
const TEN_MINUTES_MS = 10 * 60 * 1000;
const MIN_FORM_TIME_MS = 1500;

async function firstIp(): Promise<string> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for");
  if (!forwarded) return "unknown";
  return forwarded.split(",")[0]?.trim() || "unknown";
}

function formDataToInput(formData: FormData): SubmitBookingInput {
  const get = (key: string) => {
    const value = formData.get(key);
    return typeof value === "string" ? value : undefined;
  };

  let answers: { questionId: string; value: string }[] = [];
  const rawAnswers = get("answers");
  if (rawAnswers) {
    try {
      const parsed = JSON.parse(rawAnswers);
      if (Array.isArray(parsed)) answers = parsed;
    } catch {
      answers = [];
    }
  }

  const startedAtRaw = get("startedAt");

  return {
    eventTypeId: get("eventTypeId") ?? "",
    startUtc: get("startUtc") ?? "",
    inviteeName: get("inviteeName") ?? "",
    inviteeEmail: get("inviteeEmail") ?? "",
    inviteeTimezone: get("inviteeTimezone") ?? "",
    answers,
    rescheduleFromUid: get("rescheduleFromUid") || undefined,
    faxConfirm: get("faxConfirm"),
    startedAt: startedAtRaw ? Number(startedAtRaw) : undefined,
  };
}

/**
 * Validates and creates a booking. Never throws to the client: failures come
 * back as `{ ok: false, ... }`; success redirects to the confirmation page
 * (called outside the try/catch, since `redirect()` throws internally).
 */
export async function submitBookingAction(
  rawInput: FormData | SubmitBookingInput,
): Promise<SubmitBookingResult> {
  const input: SubmitBookingInput = rawInput instanceof FormData ? formDataToInput(rawInput) : rawInput;

  // Bot defenses: a filled honeypot or a form submitted implausibly fast
  // both fail with the same generic message, so bots can't tell which
  // check tripped.
  if (input.faxConfirm && input.faxConfirm.trim().length > 0) {
    console.warn("[bookings] submission rejected: honeypot filled", { eventTypeId: input.eventTypeId });
    return { ok: false, error: GENERIC_ERROR };
  }
  if (typeof input.startedAt === "number" && Date.now() - input.startedAt < MIN_FORM_TIME_MS) {
    console.warn("[bookings] submission rejected: form submitted too fast", { eventTypeId: input.eventTypeId });
    return { ok: false, error: GENERIC_ERROR };
  }

  const ip = await firstIp();
  const perEventType = rateLimit(`ip:${input.eventTypeId}`, { limit: 5, windowMs: TEN_MINUTES_MS });
  const global = rateLimit(ip, { limit: 20, windowMs: TEN_MINUTES_MS });
  if (!perEventType.ok || !global.ok) {
    return { ok: false, error: "Too many requests. Please wait a bit and try again." };
  }

  const parsed = createBookingSchema.safeParse({
    eventTypeId: input.eventTypeId,
    startUtc: input.startUtc,
    inviteeName: input.inviteeName,
    inviteeEmail: input.inviteeEmail,
    inviteeTimezone: input.inviteeTimezone,
    answers: input.answers,
    rescheduleFromUid: input.rescheduleFromUid,
  });

  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      ok: false,
      error: issue?.message ?? "Please check the form and try again.",
      field: issue?.path[0]?.toString(),
    };
  }

  const userAgent = (await headers()).get("user-agent") ?? undefined;

  let booking: Awaited<ReturnType<typeof createBooking>>;
  try {
    booking = await createBooking({
      ...parsed.data,
      metadata: { ip, userAgent },
    });
  } catch (error) {
    if (error instanceof SlotUnavailableError) {
      return { ok: false, code: "slot_unavailable", error: "That time was just taken. Please pick another." };
    }
    if (error instanceof BookingValidationError) {
      return { ok: false, error: error.message, field: error.field };
    }
    if (error instanceof EventTypeUnavailableError) {
      return { ok: false, error: "This event type is no longer accepting bookings." };
    }
    if (error instanceof BookingNotFoundError || error instanceof InvalidBookingStateError) {
      return { ok: false, error: "That booking can no longer be rescheduled." };
    }
    console.error("submitBookingAction failed", error);
    return { ok: false, error: GENERIC_ERROR };
  }

  const suffix = parsed.data.rescheduleFromUid ? "?rescheduled=1" : "";
  redirect(`/booking/${booking.uid}${suffix}`);
}
