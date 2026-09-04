import type { BookingEmailView } from "@/server/email/types";
import type { BookingDetail, BookingRecord } from "./types";

/**
 * Human-readable summary of where a booking happens. Doesn't include the
 * meeting link itself (callers get that separately from `meetingUrl`).
 */
export function describeLocation(
  locationType: BookingRecord["locationType"],
  locationValue: string | null,
  meetingUrl: string | null,
): string {
  switch (locationType) {
    case "google_meet":
      return meetingUrl ? "Google Meet" : "Google Meet (link sent separately)";
    case "phone":
      return locationValue ? `Phone call: ${locationValue}` : "Phone call";
    case "in_person":
      return locationValue ? `In person: ${locationValue}` : "In person";
    case "custom":
      return locationValue ?? "";
  }
}

/**
 * Maps a `BookingDetail` to the view every email/ICS function consumes.
 *
 * `icsUid` must be the root booking id of the reschedule chain so calendar
 * clients update the same event across reschedules instead of creating a
 * duplicate. This function itself only has one booking's `rescheduledFromId`
 * to work with, so the *caller* (the bookings service, which has DB access)
 * is responsible for resolving the chain and passing that root id in as
 * `detail.rescheduledFromId` when building the detail specifically for an
 * email send. When `rescheduledFromId` is null (no reschedule in this
 * booking's history) `detail.id` is used, which is already the root.
 */
export function toEmailView(detail: BookingDetail): BookingEmailView {
  return {
    bookingId: detail.id,
    uid: detail.uid,
    eventTitle: detail.eventType.title,
    eventDescription: detail.eventType.description,
    hostName: detail.host.name,
    hostEmail: detail.host.email,
    hostTimezone: detail.host.timezone,
    inviteeName: detail.inviteeName,
    inviteeEmail: detail.inviteeEmail,
    inviteeTimezone: detail.inviteeTimezone,
    startUtc: detail.startUtc,
    endUtc: detail.endUtc,
    locationText: describeLocation(detail.locationType, detail.locationValue, detail.meetingUrl),
    meetingUrl: detail.meetingUrl,
    answers: detail.answers.map((a) => ({ label: a.label, value: a.value })),
    manageUrl: detail.urls.manage,
    cancelUrl: detail.urls.cancel,
    rescheduleUrl: detail.urls.reschedule,
    icsUid: detail.rescheduledFromId ?? detail.id,
    icsSequence: detail.icsSequence,
  };
}
