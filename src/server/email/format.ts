/**
 * Human-readable time formatting for emails. Uses `Intl` directly (rather than
 * date-fns-tz helpers) so both the calendar day and the time-zone abbreviation come
 * straight from ICU data for the target IANA zone, with no manual DST math.
 */

const DEFAULT_LOCALE = "en-US";

function dayFormatter(locale: string, timeZone: string) {
  return new Intl.DateTimeFormat(locale, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone,
  });
}

function timeFormatter(locale: string, timeZone: string) {
  return new Intl.DateTimeFormat(locale, {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone,
  });
}

/** Short time-zone abbreviation for the given instant, e.g. "EDT", "GMT+8". */
function tzAbbreviation(locale: string, timeZone: string, at: Date): string {
  const parts = new Intl.DateTimeFormat(locale, {
    timeZone,
    hour: "numeric",
    timeZoneName: "short",
  }).formatToParts(at);
  return parts.find((p) => p.type === "timeZoneName")?.value ?? timeZone;
}

/**
 * Formats a UTC start/end pair in the given IANA time zone, e.g.
 * "Tuesday, March 10, 2026 · 9:00 AM – 9:30 AM (EDT)". When the range crosses a
 * calendar day in `tz`, both dates are shown: "Mon, Jan 5 · 11:30 PM – Tue, Jan 6 · 12:00 AM (PST)".
 */
export function formatRange(
  startUtc: Date,
  endUtc: Date,
  tz: string,
  locale: string = DEFAULT_LOCALE,
): string {
  const day = dayFormatter(locale, tz);
  const time = timeFormatter(locale, tz);

  const startDay = day.format(startUtc);
  const endDay = day.format(endUtc);
  const startTime = time.format(startUtc);
  const endTime = time.format(endUtc);
  const abbr = tzAbbreviation(locale, tz, startUtc);

  if (startDay === endDay) {
    return `${startDay} · ${startTime} – ${endTime} (${abbr})`;
  }
  return `${startDay} · ${startTime} – ${endDay} · ${endTime} (${abbr})`;
}

/** Formats a duration as "30 min", "1 hr", "1 hr 30 min", "2 hrs", etc. */
export function formatDuration(startUtc: Date, endUtc: Date): string {
  const totalMinutes = Math.max(0, Math.round((endUtc.getTime() - startUtc.getTime()) / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours === 0) {
    return `${minutes} min`;
  }
  const hourPart = `${hours} hr${hours === 1 ? "" : "s"}`;
  if (minutes === 0) {
    return hourPart;
  }
  return `${hourPart} ${minutes} min`;
}
