import { and, eq, gte, lt, ne } from "drizzle-orm";
import { db } from "@/db/client";
import { bookings, eventTypes, type EventType } from "@/db/schema";
import { isValidTimeZone } from "@/lib/time";
import type { Interval } from "@/lib/time/intervals";
import { getScheduleInputForUser } from "@/server/availability/service";
import {
  getAvailableSlots,
  type BookingInput,
  type EventTypeInput as EngineEventTypeInput,
  type ScheduleInput as EngineScheduleInput,
} from "@/server/availability/slots";
import type { CalendarProvider } from "@/server/calendar/provider";
import { getProviderForUser } from "@/server/calendar/service";
import { toEngineInput } from "@/server/event-types/service";
import { BookingValidationError, EventTypeUnavailableError } from "./errors";
import type { BookingDeps } from "./types";

const MAX_RANGE_MS = 62 * 24 * 60 * 60_000;
const PAD_MS = 24 * 60 * 60_000;

/** External (Google) busy periods are cached briefly per host+range to avoid a freebusy call on every slot lookup. */
const EXTERNAL_BUSY_TTL_MS = 2 * 60 * 1000;
const externalBusyCache = new Map<string, { intervals: Interval[]; expiresAt: number }>();
export function clearExternalBusyCache(): void {
  externalBusyCache.clear();
}

export interface SlotsResult {
  /** The host schedule's own time zone. */
  timezone: string;
  /** Invitee-local `YYYY-MM-DD` -> ISO-UTC slot start/end pairs. */
  slotsByDate: Record<string, { start: string; end: string }[]>;
  rangeStart: string;
  rangeEnd: string;
}

export interface AssembledSlotInput {
  hostId: string;
  eventTypeRow: EventType;
  engineEventType: EngineEventTypeInput;
  schedule: EngineScheduleInput;
  bookings: BookingInput[];
  externalBusy: Interval[];
}

/**
 * Loads everything the slot engine needs for `eventTypeId`: the event type
 * itself (must be active — throws `EventTypeUnavailableError` otherwise),
 * its host's availability schedule, the host's confirmed bookings in
 * `[rangeStart - 1d, rangeEnd + 1d]` (each carrying its own event type's
 * buffers), and external busy time from the host's calendar provider
 * (failures are swallowed to `[]` and logged).
 *
 * Shared by `getSlotsForEventType` and the booking service's server-side
 * re-check in `createBooking`.
 */
export async function assembleSlotInput(
  eventTypeId: string,
  rangeStart: Date,
  rangeEnd: Date,
  opts: { excludeBookingUid?: string; calendar?: CalendarProvider } = {},
): Promise<AssembledSlotInput> {
  const eventTypeRow = await db.query.eventTypes.findFirst({ where: eq(eventTypes.id, eventTypeId) });
  if (!eventTypeRow || !eventTypeRow.isActive) {
    throw new EventTypeUnavailableError(eventTypeId);
  }
  const hostId = eventTypeRow.ownerUserId;

  const schedule = await getScheduleInputForUser(hostId, eventTypeRow.scheduleId);

  const paddedStart = new Date(rangeStart.getTime() - PAD_MS);
  const paddedEnd = new Date(rangeEnd.getTime() + PAD_MS);

  const bookingRows = await db
    .select({
      startUtc: bookings.startUtc,
      endUtc: bookings.endUtc,
      uid: bookings.uid,
      bufferBeforeMinutes: eventTypes.bufferBeforeMinutes,
      bufferAfterMinutes: eventTypes.bufferAfterMinutes,
    })
    .from(bookings)
    .innerJoin(eventTypes, eq(bookings.eventTypeId, eventTypes.id))
    .where(
      and(
        eq(bookings.hostUserId, hostId),
        eq(bookings.status, "confirmed"),
        gte(bookings.startUtc, paddedStart),
        lt(bookings.startUtc, paddedEnd),
        opts.excludeBookingUid ? ne(bookings.uid, opts.excludeBookingUid) : undefined,
      ),
    );

  const bookingInputs: BookingInput[] = bookingRows.map((b) => ({
    start: b.startUtc,
    end: b.endUtc,
    bufferBeforeMinutes: b.bufferBeforeMinutes,
    bufferAfterMinutes: b.bufferAfterMinutes,
  }));

  let externalBusy: Interval[] = [];
  const cacheKey = `${hostId}:${rangeStart.toISOString()}:${rangeEnd.toISOString()}`;
  const cached = opts.calendar ? undefined : externalBusyCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    externalBusy = cached.intervals;
  } else {
    try {
      const provider = opts.calendar ?? (await getProviderForUser(hostId));
      externalBusy = await provider.getBusyIntervals(hostId, rangeStart, rangeEnd);
      if (!opts.calendar) {
        externalBusyCache.set(cacheKey, { intervals: externalBusy, expiresAt: Date.now() + EXTERNAL_BUSY_TTL_MS });
      }
    } catch (err) {
      console.error("[bookings] getBusyIntervals failed", err);
      externalBusy = [];
    }
  }

  return {
    hostId,
    eventTypeRow,
    engineEventType: toEngineInput(eventTypeRow),
    schedule,
    bookings: bookingInputs,
    externalBusy,
  };
}

/**
 * Public slot listing for the booking page. `rangeEnd - rangeStart` must be
 * at most 62 days (throws `BookingValidationError` otherwise).
 */
export async function getSlotsForEventType(
  params: {
    eventTypeId: string;
    rangeStart: Date;
    rangeEnd: Date;
    inviteeTimezone: string;
    /** Reschedule: ignore this booking's own slot when computing busy time. */
    excludeBookingUid?: string;
    now?: Date;
  },
  deps: Pick<BookingDeps, "calendar" | "now"> = {},
): Promise<SlotsResult> {
  if (!isValidTimeZone(params.inviteeTimezone)) {
    throw new BookingValidationError("Invalid time zone", "inviteeTimezone");
  }
  if (params.rangeEnd.getTime() <= params.rangeStart.getTime()) {
    throw new BookingValidationError("rangeEnd must be after rangeStart", "rangeEnd");
  }
  if (params.rangeEnd.getTime() - params.rangeStart.getTime() > MAX_RANGE_MS) {
    throw new BookingValidationError("Range must be at most 62 days", "rangeEnd");
  }

  const now = deps.now ? deps.now() : (params.now ?? new Date());

  const assembled = await assembleSlotInput(params.eventTypeId, params.rangeStart, params.rangeEnd, {
    excludeBookingUid: params.excludeBookingUid,
    calendar: deps.calendar,
  });

  const slotsByDate = getAvailableSlots({
    eventType: assembled.engineEventType,
    schedule: assembled.schedule,
    bookings: assembled.bookings,
    externalBusy: assembled.externalBusy,
    now,
    rangeStart: params.rangeStart,
    rangeEnd: params.rangeEnd,
    inviteeTimezone: params.inviteeTimezone,
  });

  const result: SlotsResult["slotsByDate"] = {};
  for (const [date, slots] of slotsByDate) {
    result[date] = slots.map((s) => ({ start: s.startUtc.toISOString(), end: s.endUtc.toISOString() }));
  }

  return {
    timezone: assembled.schedule.timezone,
    slotsByDate: result,
    rangeStart: params.rangeStart.toISOString(),
    rangeEnd: params.rangeEnd.toISOString(),
  };
}
