/**
 * View model the bookings service builds and passes into every email/ICS function
 * in this module. Nothing here is validated — the caller owns correctness.
 */
export interface BookingEmailView {
  /** Id of this specific booking row (may change across a reschedule chain). */
  bookingId: string;
  /** Public identifier used in URLs, e.g. APP_URL/booking/{uid}. */
  uid: string;
  eventTitle: string;
  eventDescription?: string | null;
  hostName: string;
  hostEmail: string;
  hostTimezone: string;
  inviteeName: string;
  inviteeEmail: string;
  inviteeTimezone: string;
  startUtc: Date;
  endUtc: Date;
  /** e.g. "Phone call: host will call +1 555..." or a plain address. */
  locationText?: string | null;
  /** Google Meet (or similar) link. */
  meetingUrl?: string | null;
  answers: { label: string; value: string }[];
  /** APP_URL/booking/{uid} */
  manageUrl: string;
  /** APP_URL/booking/{uid}/cancel */
  cancelUrl: string;
  /** APP_URL/booking/{uid}/reschedule */
  rescheduleUrl: string;
  /**
   * Stable UID for the ICS chain. For a reschedule the bookings service passes the
   * ORIGINAL booking id so calendar clients update the same event instead of creating
   * a duplicate.
   */
  icsUid: string;
  /** 0 for the first send; incremented by the caller on reschedule/cancel. */
  icsSequence: number;
}

export type EmailRecipient = "invitee" | "host";
