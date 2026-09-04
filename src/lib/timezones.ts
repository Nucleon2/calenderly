import { tzOffsetLabel } from "@/lib/time";

export interface TimezoneOption {
  value: string;
  label: string;
}

/** Small fallback list for runtimes without `Intl.supportedValuesOf`. */
const FALLBACK_TIMEZONES: readonly string[] = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Anchorage",
  "America/Sao_Paulo",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Moscow",
  "Africa/Cairo",
  "Africa/Johannesburg",
  "Asia/Dubai",
  "Asia/Karachi",
  "Asia/Kolkata",
  "Asia/Dhaka",
  "Asia/Bangkok",
  "Asia/Shanghai",
  "Asia/Tokyo",
  "Asia/Seoul",
  "Australia/Sydney",
  "Pacific/Auckland",
];

function listTimeZoneNames(): string[] {
  if (typeof Intl.supportedValuesOf === "function") {
    try {
      const names = Intl.supportedValuesOf("timeZone");
      // Some runtimes omit the "UTC" alias from this list even though it's a
      // valid, commonly expected time zone value.
      return names.includes("UTC") ? names : [...names, "UTC"];
    } catch {
      // fall through to the static list
    }
  }
  return [...FALLBACK_TIMEZONES];
}

function formatLabel(tz: string, now: Date): string {
  const offset = tzOffsetLabel(now, tz);
  return `${tz.replace(/_/g, " ")} (${offset})`;
}

/**
 * All IANA time zones as `{ value, label }` options, labelled with their
 * current UTC offset (e.g. "America/New_York (GMT-4)"). Sorted alphabetically
 * by IANA name.
 */
export function getTimezoneOptions(now: Date = new Date()): TimezoneOption[] {
  const names = listTimeZoneNames();
  return names
    .map((tz) => {
      let label: string;
      try {
        label = formatLabel(tz, now);
      } catch {
        label = tz;
      }
      return { value: tz, label };
    })
    .sort((a, b) => a.value.localeCompare(b.value));
}

/** Client-side best-effort detection of the browser's IANA time zone. */
export function detectBrowserTimezone(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return tz || "UTC";
  } catch {
    return "UTC";
  }
}
