import { createEvent, type DateArray, type EventAttributes } from "ics";
import type { BookingEmailView } from "./types";

export type IcsMethod = "REQUEST" | "CANCEL";

/** Converts a UTC `Date` into the `[Y, M, D, H, Min, S]` array `ics` expects for `startInputType: "utc"`. */
function toUtcArray(date: Date): DateArray {
  return [
    date.getUTCFullYear(),
    date.getUTCMonth() + 1,
    date.getUTCDate(),
    date.getUTCHours(),
    date.getUTCMinutes(),
  ];
}

function buildDescription(view: BookingEmailView): string {
  const lines = [view.eventDescription?.trim() || null, `Manage this booking: ${view.manageUrl}`].filter(
    (line): line is string => Boolean(line),
  );
  return lines.join("\n\n");
}

/**
 * Builds an RFC 5545 VCALENDAR document for a booking. `method` selects between a
 * new/updated invite (`REQUEST`) and a cancellation (`CANCEL`); the ICS `SEQUENCE`
 * and `STATUS` are derived accordingly. Throws if the underlying `ics` library
 * reports a build error.
 */
export function buildIcs(view: BookingEmailView, method: IcsMethod): string {
  const attributes: EventAttributes = {
    uid: view.icsUid,
    sequence: view.icsSequence,
    method,
    status: method === "CANCEL" ? "CANCELLED" : "CONFIRMED",
    start: toUtcArray(view.startUtc),
    startInputType: "utc",
    startOutputType: "utc",
    end: toUtcArray(view.endUtc),
    endInputType: "utc",
    endOutputType: "utc",
    title: view.eventTitle,
    description: buildDescription(view),
    location: view.meetingUrl || view.locationText || undefined,
    url: view.manageUrl,
    organizer: { name: view.hostName, email: view.hostEmail },
    attendees: [
      {
        name: view.inviteeName,
        email: view.inviteeEmail,
        rsvp: true,
        partstat: "ACCEPTED",
        role: "REQ-PARTICIPANT",
      },
    ],
  };

  const { error, value } = createEvent(attributes);
  if (error || !value) {
    throw error ?? new Error("Failed to build ICS event: no value returned");
  }
  return value;
}

/**
 * Builds the ICS document as a Nodemailer-ready attachment. `contentType` carries
 * `method=REQUEST`/`method=CANCEL` so calendar clients pick the right verb.
 */
export function icsAttachment(
  view: BookingEmailView,
  method: IcsMethod,
): { filename: string; content: string; contentType: string } {
  const content = buildIcs(view, method);
  return {
    filename: "invite.ics",
    content,
    contentType: `text/calendar; charset=utf-8; method=${method}`,
  };
}
