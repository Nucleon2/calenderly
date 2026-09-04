import type { CalendarProvider } from "@/server/calendar/provider";

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

export interface BookingAnswerInput {
  questionId: string;
  value: string;
}

export interface CreateBookingInput {
  eventTypeId: string;
  /** endUtc is derived from `eventType.durationMinutes`. */
  startUtc: Date;
  inviteeName: string;
  inviteeEmail: string;
  inviteeTimezone: string;
  answers: BookingAnswerInput[];
  /** When set: same invitee/event type, old booking -> 'rescheduled'. */
  rescheduleFromUid?: string;
  metadata?: { ip?: string | null; userAgent?: string | null };
}

// ---------------------------------------------------------------------------
// Outputs
// ---------------------------------------------------------------------------

export type BookingStatus = "pending" | "confirmed" | "cancelled" | "rescheduled";
export type BookingLocationType = "google_meet" | "phone" | "in_person" | "custom";
export type BookingCancelledBy = "host" | "invitee" | "system";

/** Plain serializable row subset. */
export interface BookingRecord {
  id: string;
  uid: string;
  status: BookingStatus;
  eventTypeId: string;
  hostUserId: string;
  startUtc: Date;
  endUtc: Date;
  inviteeName: string;
  inviteeEmail: string;
  inviteeTimezone: string;
  answers: { questionId: string; label: string; value: string }[];
  locationType: BookingLocationType;
  locationValue: string | null;
  meetingUrl: string | null;
  cancelReason: string | null;
  cancelledBy: BookingCancelledBy | null;
  cancelledAt: Date | null;
  rescheduledFromId: string | null;
  icsSequence: number;
  noShow: boolean;
  createdAt: Date;
}

/** For public pages + the host dashboard sheet. */
export interface BookingDetail extends BookingRecord {
  eventType: {
    id: string;
    title: string;
    slug: string;
    durationMinutes: number;
    color: string;
    description: string | null;
    locationType: BookingRecord["locationType"];
    locationDetails: { text?: string; phone?: string; address?: string };
  };
  host: {
    id: string;
    name: string;
    username: string;
    email: string;
    image: string | null;
    timezone: string;
  };
  /** When status === 'rescheduled', the uid of the replacement booking. */
  rescheduledToUid: string | null;
  /** Absolute, from env.APP_URL. */
  urls: { manage: string; cancel: string; reschedule: string };
}

/** Dashboard list rows. */
export interface BookingListItem {
  id: string;
  uid: string;
  status: BookingRecord["status"];
  startUtc: Date;
  endUtc: Date;
  inviteeName: string;
  inviteeEmail: string;
  inviteeTimezone: string;
  noShow: boolean;
  eventType: {
    id: string;
    title: string;
    color: string;
    durationMinutes: number;
    locationType: BookingRecord["locationType"];
  };
  meetingUrl: string | null;
  locationValue: string | null;
  answers: BookingRecord["answers"];
  cancelReason: string | null;
  cancelledBy: BookingRecord["cancelledBy"];
  createdAt: Date;
}

export type BookingListRange = "upcoming" | "past" | "cancelled" | { from: Date; to: Date };

export interface BookingDeps {
  calendar?: CalendarProvider;
  mailer?: Pick<
    typeof import("@/server/email/mailer"),
    "sendBookingConfirmation" | "sendBookingCancelled" | "sendBookingRescheduled"
  >;
  reminders?: typeof import("@/server/jobs/reminders");
  now?: () => Date;
}
