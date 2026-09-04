"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOnboardedUser } from "@/server/auth/session";
import { BookingNotFoundError, InvalidBookingStateError } from "@/server/bookings/errors";
import { cancelBooking, getBookingForHost, setNoShow } from "@/server/bookings/service";
import type { BookingDetailData } from "@/components/bookings/booking-detail-sheet";

const BOOKINGS_PATH = "/dashboard/bookings";

export type ActionResult = { ok: true } | { ok: false; error: string };

const cancelBookingSchema = z.object({
  uid: z.string().min(1, "Missing booking."),
  reason: z.string().trim().max(2000, "Reason must be at most 2000 characters").optional(),
});

export async function cancelBookingAction(input: unknown): Promise<ActionResult> {
  const user = await requireOnboardedUser();

  const parsed = cancelBookingSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check the form and try again." };
  }

  try {
    await cancelBooking(parsed.data.uid, {
      by: "host",
      reason: parsed.data.reason,
      actorUserId: user.id,
    });
  } catch (error) {
    if (error instanceof BookingNotFoundError) {
      return { ok: false, error: "This booking no longer exists." };
    }
    if (error instanceof InvalidBookingStateError) {
      return { ok: false, error: "This booking can no longer be cancelled." };
    }
    throw error;
  }

  revalidatePath(BOOKINGS_PATH);
  return { ok: true };
}

const setNoShowSchema = z.object({
  bookingId: z.string().min(1, "Missing booking."),
  noShow: z.boolean(),
});

export async function setNoShowAction(input: unknown): Promise<ActionResult> {
  const user = await requireOnboardedUser();

  const parsed = setNoShowSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check the form and try again." };
  }

  try {
    await setNoShow(user.id, parsed.data.bookingId, parsed.data.noShow);
  } catch (error) {
    if (error instanceof BookingNotFoundError) {
      return { ok: false, error: "This booking no longer exists." };
    }
    if (error instanceof InvalidBookingStateError) {
      return { ok: false, error: "No-show can only be set once the meeting's start time has passed." };
    }
    throw error;
  }

  revalidatePath(BOOKINGS_PATH);
  return { ok: true };
}

export type GetBookingDetailResult = { ok: true; booking: BookingDetailData } | { ok: false; error: string };

/** Fetches full booking detail (answers, urls, host/eventType) for the
 * detail sheet, on demand — the list view only carries `BookingListItem`. */
export async function getBookingDetailAction(bookingId: string): Promise<GetBookingDetailResult> {
  const user = await requireOnboardedUser();

  if (typeof bookingId !== "string" || bookingId.length === 0) {
    return { ok: false, error: "Invalid booking." };
  }

  const detail = await getBookingForHost(user.id, bookingId);
  if (!detail) {
    return { ok: false, error: "This booking no longer exists." };
  }

  return {
    ok: true,
    booking: {
      id: detail.id,
      uid: detail.uid,
      status: detail.status,
      startUtc: detail.startUtc.toISOString(),
      endUtc: detail.endUtc.toISOString(),
      inviteeName: detail.inviteeName,
      inviteeEmail: detail.inviteeEmail,
      inviteeTimezone: detail.inviteeTimezone,
      noShow: detail.noShow,
      eventType: detail.eventType,
      meetingUrl: detail.meetingUrl,
      locationValue: detail.locationValue,
      answers: detail.answers,
      cancelReason: detail.cancelReason,
      cancelledBy: detail.cancelledBy,
      createdAt: detail.createdAt.toISOString(),
      urls: detail.urls,
      rescheduledToUid: detail.rescheduledToUid,
    },
  };
}
