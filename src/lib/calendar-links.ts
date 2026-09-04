/**
 * Pure "add to calendar" link builders. No network calls, no framework
 * dependencies — safe to use from client or server components.
 */
export interface CalendarLinkInput {
  title: string;
  startUtc: Date;
  endUtc: Date;
  /** Plain-text event description/notes. */
  details?: string;
  /** Free-text location (address, phone summary, or meeting link). */
  location?: string;
}

/** `YYYYMMDDTHHMMSSZ`, the compact UTC form both Google and generic ICS-ish links expect. */
function toCompactUtc(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
}

/**
 * A Google Calendar "quick add" link that pre-fills an event. Opens
 * calendar.google.com; the user still has to click "Save".
 */
export function googleCalendarUrl(input: CalendarLinkInput): string {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: input.title,
    dates: `${toCompactUtc(input.startUtc)}/${toCompactUtc(input.endUtc)}`,
  });
  if (input.details) params.set("details", input.details);
  if (input.location) params.set("location", input.location);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/**
 * An Outlook (outlook.live.com) "deeplink compose" link that pre-fills an
 * event on the web calendar.
 */
export function outlookCalendarUrl(input: CalendarLinkInput): string {
  const params = new URLSearchParams({
    path: "/calendar/action/compose",
    rru: "addevent",
    subject: input.title,
    startdt: input.startUtc.toISOString(),
    enddt: input.endUtc.toISOString(),
  });
  if (input.details) params.set("body", input.details);
  if (input.location) params.set("location", input.location);
  return `https://outlook.live.com/calendar/0/deeplink/compose?${params.toString()}`;
}
