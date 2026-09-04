import { describe, expect, it } from "vitest";
import { googleCalendarUrl, outlookCalendarUrl } from "@/lib/calendar-links";

const startUtc = new Date("2026-06-15T13:00:00.000Z");
const endUtc = new Date("2026-06-15T13:30:00.000Z");

describe("googleCalendarUrl", () => {
  it("builds a calendar.google.com render link with compact UTC dates", () => {
    const url = googleCalendarUrl({ title: "Intro Call", startUtc, endUtc });
    const parsed = new URL(url);

    expect(parsed.origin + parsed.pathname).toBe("https://calendar.google.com/calendar/render");
    expect(parsed.searchParams.get("action")).toBe("TEMPLATE");
    expect(parsed.searchParams.get("text")).toBe("Intro Call");
    expect(parsed.searchParams.get("dates")).toBe("20260615T130000Z/20260615T133000Z");
    expect(parsed.searchParams.has("details")).toBe(false);
    expect(parsed.searchParams.has("location")).toBe(false);
  });

  it("includes details and location when provided", () => {
    const url = googleCalendarUrl({
      title: "Intro Call",
      startUtc,
      endUtc,
      details: "Manage: https://example.com/booking/abc",
      location: "Google Meet",
    });
    const parsed = new URL(url);

    expect(parsed.searchParams.get("details")).toBe("Manage: https://example.com/booking/abc");
    expect(parsed.searchParams.get("location")).toBe("Google Meet");
  });

  it("percent-encodes special characters in the title", () => {
    const url = googleCalendarUrl({ title: "Intro & Consultation / Q&A", startUtc, endUtc });
    const parsed = new URL(url);
    expect(parsed.searchParams.get("text")).toBe("Intro & Consultation / Q&A");
  });
});

describe("outlookCalendarUrl", () => {
  it("builds an outlook.live.com deeplink compose link with ISO dates", () => {
    const url = outlookCalendarUrl({ title: "Intro Call", startUtc, endUtc });
    const parsed = new URL(url);

    expect(parsed.origin + parsed.pathname).toBe("https://outlook.live.com/calendar/0/deeplink/compose");
    expect(parsed.searchParams.get("path")).toBe("/calendar/action/compose");
    expect(parsed.searchParams.get("rru")).toBe("addevent");
    expect(parsed.searchParams.get("subject")).toBe("Intro Call");
    expect(parsed.searchParams.get("startdt")).toBe(startUtc.toISOString());
    expect(parsed.searchParams.get("enddt")).toBe(endUtc.toISOString());
    expect(parsed.searchParams.has("body")).toBe(false);
    expect(parsed.searchParams.has("location")).toBe(false);
  });

  it("includes details as body and location when provided", () => {
    const url = outlookCalendarUrl({
      title: "Intro Call",
      startUtc,
      endUtc,
      details: "Manage: https://example.com/booking/abc",
      location: "+1 555-0100",
    });
    const parsed = new URL(url);

    expect(parsed.searchParams.get("body")).toBe("Manage: https://example.com/booking/abc");
    expect(parsed.searchParams.get("location")).toBe("+1 555-0100");
  });
});
