/**
 * Framework-free wall-clock <-> UTC-instant conversions.
 *
 * All local-time math lives in this file. Everything that crosses this
 * module's boundary is either a UTC `Date` (an instant) or a `LocalDate`
 * string (a calendar date with no attached time or zone).
 *
 * DST handling is delegated to `@date-fns/tz`'s `TZDate`. Its resolution of
 * non-existent ("gap") and ambiguous ("fall-back") wall-clock times is
 * observed empirically in `tests/unit/lib/time.test.ts` rather than assumed
 * here — see that file for the documented, per-zone behaviour.
 */
import { TZDate } from "@date-fns/tz";

export type LocalDate = string; // 'YYYY-MM-DD'

const LOCAL_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

interface CalendarDate {
  y: number;
  m: number; // 1-12
  d: number;
}

function parseLocalDate(date: LocalDate): CalendarDate {
  const match = LOCAL_DATE_RE.exec(date);
  if (!match) {
    throw new RangeError(`Invalid LocalDate (expected 'YYYY-MM-DD'): ${date}`);
  }
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  if (m < 1 || m > 12 || d < 1 || d > 31) {
    throw new RangeError(`Invalid LocalDate: ${date}`);
  }
  return { y, m, d };
}

function pad(n: number, width = 2): string {
  return String(Math.abs(n)).padStart(width, "0");
}

function formatLocalDate({ y, m, d }: CalendarDate): LocalDate {
  const sign = y < 0 ? "-" : "";
  return `${sign}${pad(y, 4)}-${pad(m)}-${pad(d)}`;
}

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch (error) {
    if (error instanceof RangeError) {
      return false;
    }
    throw error;
  }
}

function assertValidTimeZone(tz: string): void {
  if (!isValidTimeZone(tz)) {
    throw new RangeError(`Invalid time zone: ${tz}`);
  }
}

/**
 * Converts a wall-clock date + minute-of-day in `tz` to the UTC instant it
 * represents. `minute` ranges 0..1440 inclusive; 1440 means midnight of the
 * *next* calendar day (i.e. `localMinutesToUtc(date, 1440, tz)` is defined
 * to equal `localMinutesToUtc(addDays(date, 1), 0, tz)`).
 */
export function localMinutesToUtc(date: LocalDate, minute: number, tz: string): Date {
  assertValidTimeZone(tz);
  if (!Number.isInteger(minute) || minute < 0 || minute > 1440) {
    throw new RangeError(`Invalid minute-of-day (expected 0..1440): ${minute}`);
  }
  const { y, m, d } = parseLocalDate(date);
  const hour = Math.floor(minute / 60);
  const min = minute % 60;
  // TZDate normalizes overflowing fields (hour === 24) the same way the
  // native Date constructor normalizes overflowing calendar fields, rolling
  // forward into the next local day. Verified empirically in time.test.ts.
  const instant = new TZDate(y, m - 1, d, hour, min, 0, 0, tz);
  return new Date(instant.getTime());
}

export function utcToLocalDate(instant: Date, tz: string): LocalDate {
  assertValidTimeZone(tz);
  const zoned = new TZDate(instant, tz);
  return formatLocalDate({ y: zoned.getFullYear(), m: zoned.getMonth() + 1, d: zoned.getDate() });
}

export function utcToLocalMinutes(instant: Date, tz: string): number {
  assertValidTimeZone(tz);
  const zoned = new TZDate(instant, tz);
  return zoned.getHours() * 60 + zoned.getMinutes();
}

export function dayOfWeekInTz(date: LocalDate, tz: string): 0 | 1 | 2 | 3 | 4 | 5 | 6 {
  assertValidTimeZone(tz);
  const { y, m, d } = parseLocalDate(date);
  // Anchor at local noon: no IANA zone has a DST transition that makes noon
  // ambiguous or non-existent, so this sidesteps gap/fall-back entirely
  // while still landing on the correct calendar date in `tz`.
  const instant = new TZDate(y, m - 1, d, 12, 0, 0, 0, tz);
  return instant.getDay() as 0 | 1 | 2 | 3 | 4 | 5 | 6;
}

/** Pure calendar arithmetic. No time zone or DST involved. */
export function addDays(date: LocalDate, days: number): LocalDate {
  const { y, m, d } = parseLocalDate(date);
  const utc = new Date(Date.UTC(y, m - 1, d));
  utc.setUTCDate(utc.getUTCDate() + days);
  return formatLocalDate({ y: utc.getUTCFullYear(), m: utc.getUTCMonth() + 1, d: utc.getUTCDate() });
}

export function compareLocalDate(a: LocalDate, b: LocalDate): -1 | 0 | 1 {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/**
 * Every local calendar date touched by the UTC instant range, inclusive of
 * both `rangeStartUtc`'s and `rangeEndUtc`'s local dates. Callers that treat
 * `rangeEndUtc` as an exclusive bound (e.g. availability windows) should
 * clamp the resulting UTC intervals afterwards; this function itself does
 * not special-case exclusivity.
 */
export function eachLocalDate(rangeStartUtc: Date, rangeEndUtc: Date, tz: string): LocalDate[] {
  assertValidTimeZone(tz);
  if (rangeStartUtc.getTime() > rangeEndUtc.getTime()) {
    return [];
  }
  const endDate = utcToLocalDate(rangeEndUtc, tz);
  const dates: LocalDate[] = [];
  let cursor = utcToLocalDate(rangeStartUtc, tz);
  while (compareLocalDate(cursor, endDate) <= 0) {
    dates.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return dates;
}

export function todayInTz(now: Date, tz: string): LocalDate {
  return utcToLocalDate(now, tz);
}

export function formatInTz(
  instant: Date,
  tz: string,
  opts?: Intl.DateTimeFormatOptions,
  locale?: string,
): string {
  assertValidTimeZone(tz);
  return new Intl.DateTimeFormat(locale, { ...opts, timeZone: tz }).format(instant);
}

/** e.g. "GMT-4", "GMT+5:30", "GMT+0" */
export function tzOffsetLabel(instant: Date, tz: string): string {
  assertValidTimeZone(tz);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    timeZoneName: "shortOffset",
  }).formatToParts(instant);
  const label = parts.find((p) => p.type === "timeZoneName")?.value;
  if (!label) {
    throw new RangeError(`Unable to determine UTC offset label for time zone: ${tz}`);
  }
  return label;
}
