"use server";

import { redirect } from "next/navigation";
import { cancelBooking } from "@/server/bookings/service";
import { cancelBookingSchema } from "@/server/bookings/schema";
import { BookingNotFoundError, InvalidBookingStateError } from "@/server/bookings/errors";

export type CancelBookingResult = { ok: false; error: string };

/**
 * Cancels a booking as the invitee. Never throws to the client; success
 * redirects to the booking's status page (now showing "cancelled"), called
 * outside the try/catch since `redirect()` throws internally.
 */
export async function cancelBookingAction(uid: string, reason: string): Promise<CancelBookingResult> {
  const parsed = cancelBookingSchema.safeParse({ uid, reason: reason || undefined });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: issue?.message ?? "Please check the form and try again." };
  }

  try {
    await cancelBooking(parsed.data.uid, { by: "invitee", reason: parsed.data.reason });
  } catch (error) {
    if (error instanceof BookingNotFoundError) {
      return { ok: false, error: "That booking could not be found." };
    }
    if (error instanceof InvalidBookingStateError) {
      return { ok: false, error: "This booking can no longer be cancelled." };
    }
    console.error("cancelBookingAction failed", error);
    return { ok: false, error: "Something went wrong. Please try again." };
  }

  redirect(`/booking/${uid}`);
}
