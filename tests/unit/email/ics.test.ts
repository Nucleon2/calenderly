import { describe, expect, it } from "vitest";
import { buildIcs, icsAttachment } from "@/server/email/ics";
import { formatDuration, formatRange } from "@/server/email/format";
import { makeBookingEmailView } from "../../fixtures/email";

/** RFC 5545 line-unfolding (CRLF followed by a space/tab is a continuation, not a break). */
function unfold(ics: string): string {
  return ics.replace(/\r\n[ \t]/g, "");
}

describe("buildIcs", () => {
  it("builds a REQUEST invite with the expected fields", () => {
    const view = makeBookingEmailView({ icsSequence: 3 });
    const ics = buildIcs(view, "REQUEST");
    const flat = unfold(ics);

    expect(ics).toContain("METHOD:REQUEST");
    expect(ics).toContain(`UID:${view.icsUid}`);
    expect(ics).toContain("SEQUENCE:3");
    expect(ics).toContain("STATUS:CONFIRMED");
    expect(ics).toContain("DTSTART:20260310T130000Z");
    expect(ics).toContain("DTEND:20260310T133000Z");
    expect(flat).toMatch(/ORGANIZER;.*mailto:hedy@example\.com/i);
    expect(flat).toMatch(/ATTENDEE;.*mailto:ivy@example\.com/i);
    expect(flat).toContain("SUMMARY:30 Minute Meeting");
    expect(flat).toContain(`URL:${view.manageUrl}`);
  });

  it("builds a CANCEL variant with STATUS:CANCELLED", () => {
    const view = makeBookingEmailView({ icsSequence: 1 });
    const ics = buildIcs(view, "CANCEL");

    expect(ics).toContain("METHOD:CANCEL");
    expect(ics).toContain("STATUS:CANCELLED");
    expect(ics).toContain("SEQUENCE:1");
  });

  it("uses the meeting URL as location when present", () => {
    const view = makeBookingEmailView({ meetingUrl: "https://meet.example.com/xyz" });
    const ics = buildIcs(view, "REQUEST");
    expect(ics).toContain("LOCATION:https://meet.example.com/xyz");
  });

  it("falls back to locationText when there is no meeting URL", () => {
    const view = makeBookingEmailView({ meetingUrl: null, locationText: "123 Main St" });
    const ics = buildIcs(view, "REQUEST");
    expect(ics).toContain("LOCATION:123 Main St");
  });
});

describe("icsAttachment", () => {
  it("returns invite.ics with a method-qualified content type", () => {
    const view = makeBookingEmailView();
    const attachment = icsAttachment(view, "REQUEST");

    expect(attachment.filename).toBe("invite.ics");
    expect(attachment.contentType).toContain("method=REQUEST");
    expect(attachment.contentType).toContain("text/calendar");
    expect(attachment.content).toContain("METHOD:REQUEST");
  });

  it("qualifies the content type with method=CANCEL for cancellations", () => {
    const view = makeBookingEmailView();
    const attachment = icsAttachment(view, "CANCEL");
    expect(attachment.contentType).toContain("method=CANCEL");
  });
});

describe("formatRange", () => {
  it("shows each party's time in their own time zone with a tz abbreviation", () => {
    const view = makeBookingEmailView();
    const inviteeRange = formatRange(view.startUtc, view.endUtc, view.inviteeTimezone);
    const hostRange = formatRange(view.startUtc, view.endUtc, view.hostTimezone);

    expect(inviteeRange).toContain("9:00 AM");
    expect(inviteeRange).toContain("9:30 AM");
    expect(inviteeRange).toContain("EDT");
    expect(inviteeRange).toContain("Tuesday, March 10, 2026");

    expect(hostRange).toContain("2:00 PM");
    expect(hostRange).toContain("2:30 PM");
    // Europe/Berlin has no short CLDR abbreviation on most ICU builds; it falls
    // back to a GMT offset (CET is UTC+1, before the late-March DST change).
    expect(hostRange).toMatch(/GMT\+1|CET|CEST/);
  });

  it("shows both calendar days when the range crosses midnight in the display tz", () => {
    // 06:30 UTC -> 10:30 PM Pacific the previous day (PST, UTC-8), ending
    // 08:00 UTC -> 12:00 AM Pacific the next day.
    const start = new Date("2026-01-07T06:30:00.000Z");
    const end = new Date("2026-01-07T08:00:00.000Z");
    const range = formatRange(start, end, "America/Los_Angeles");

    expect(range).toContain("January 6, 2026");
    expect(range).toContain("January 7, 2026");
    expect(range).toContain("–");
  });
});

describe("formatDuration", () => {
  it("formats minutes under an hour", () => {
    const start = new Date("2026-03-10T13:00:00.000Z");
    expect(formatDuration(start, new Date("2026-03-10T13:30:00.000Z"))).toBe("30 min");
  });

  it("formats whole hours", () => {
    const start = new Date("2026-03-10T13:00:00.000Z");
    expect(formatDuration(start, new Date("2026-03-10T15:00:00.000Z"))).toBe("2 hrs");
  });

  it("formats hours plus minutes", () => {
    const start = new Date("2026-03-10T13:00:00.000Z");
    expect(formatDuration(start, new Date("2026-03-10T14:30:00.000Z"))).toBe("1 hr 30 min");
  });
});
