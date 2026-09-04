/**
 * The availability slot engine.
 *
 * Pure, framework-free: no `next/*` or `src/db` imports, no reads of
 * `Date.now()` — the caller supplies `now`. See `computeFreeWindows` for the
 * schedule -> UTC-window conversion and `getAvailableSlots` for the full
 * candidate-generation pipeline.
 */
import {
  type LocalDate,
  addDays,
  compareLocalDate,
  dayOfWeekInTz,
  eachLocalDate,
  isValidTimeZone,
  localMinutesToUtc,
  todayInTz,
  utcToLocalDate,
} from "@/lib/time";
import { type Interval, clampInterval, expandInterval, mergeIntervals } from "@/lib/time/intervals";

export interface WeeklyRule {
  weekday: number; // 0=Sunday .. 6=Saturday
  startMinute: number;
  endMinute: number;
}

export interface DateOverride {
  date: LocalDate;
  /** null => whole day unavailable; [] also unavailable */
  intervals: { startMinute: number; endMinute: number }[] | null;
}

export interface ScheduleInput {
  timezone: string;
  rules: WeeklyRule[];
  overrides: DateOverride[];
}

export type DateRangePolicy =
  | { type: "rolling"; days: number }
  | { type: "fixed"; from: LocalDate; to: LocalDate }
  | { type: "indefinite" };

export interface EventTypeInput {
  durationMinutes: number;
  slotIntervalMinutes?: number | null; // default durationMinutes
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
  minNoticeMinutes: number;
  maxBookingsPerDay?: number | null;
  dateRange: DateRangePolicy;
}

/** An existing booking, expanded with ITS OWN event type's buffers. */
export interface BookingInput extends Interval {
  bufferBeforeMinutes?: number;
  bufferAfterMinutes?: number;
}

export interface Slot {
  startUtc: Date;
  endUtc: Date;
}

export interface GetAvailableSlotsInput {
  eventType: EventTypeInput;
  schedule: ScheduleInput;
  bookings: BookingInput[];
  externalBusy: Interval[];
  now: Date;
  rangeStart: Date; // UTC, inclusive
  rangeEnd: Date; // UTC, exclusive
  inviteeTimezone: string;
}

export type SlotsByDate = Map<LocalDate, Slot[]>;

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function validateEventType(eventType: EventTypeInput): void {
  if (!(eventType.durationMinutes > 0)) {
    throw new RangeError(`durationMinutes must be positive: ${eventType.durationMinutes}`);
  }
  if (eventType.slotIntervalMinutes != null && !(eventType.slotIntervalMinutes > 0)) {
    throw new RangeError(`slotIntervalMinutes must be positive: ${eventType.slotIntervalMinutes}`);
  }
  if (eventType.bufferBeforeMinutes < 0) {
    throw new RangeError(`bufferBeforeMinutes must not be negative: ${eventType.bufferBeforeMinutes}`);
  }
  if (eventType.bufferAfterMinutes < 0) {
    throw new RangeError(`bufferAfterMinutes must not be negative: ${eventType.bufferAfterMinutes}`);
  }
  if (eventType.minNoticeMinutes < 0) {
    throw new RangeError(`minNoticeMinutes must not be negative: ${eventType.minNoticeMinutes}`);
  }
  if (eventType.maxBookingsPerDay != null && eventType.maxBookingsPerDay < 0) {
    throw new RangeError(`maxBookingsPerDay must not be negative: ${eventType.maxBookingsPerDay}`);
  }
}

function validateMinuteRange(startMinute: number, endMinute: number, label: string): void {
  if (
    !Number.isInteger(startMinute) ||
    !Number.isInteger(endMinute) ||
    startMinute < 0 ||
    startMinute > 1440 ||
    endMinute < 0 ||
    endMinute > 1440
  ) {
    throw new RangeError(`${label} minutes out of range (expected 0..1440): ${startMinute}-${endMinute}`);
  }
  if (startMinute >= endMinute) {
    throw new RangeError(`${label} start must be before end: ${startMinute}-${endMinute}`);
  }
}

function validateSchedule(schedule: ScheduleInput): void {
  if (!isValidTimeZone(schedule.timezone)) {
    throw new RangeError(`Invalid time zone: ${schedule.timezone}`);
  }
  for (const rule of schedule.rules) {
    if (!Number.isInteger(rule.weekday) || rule.weekday < 0 || rule.weekday > 6) {
      throw new RangeError(`Invalid weekday (expected 0..6): ${rule.weekday}`);
    }
    validateMinuteRange(rule.startMinute, rule.endMinute, "Rule");
  }
  for (const override of schedule.overrides) {
    for (const interval of override.intervals ?? []) {
      validateMinuteRange(interval.startMinute, interval.endMinute, "Override");
    }
  }
}

// ---------------------------------------------------------------------------
// Free windows
// ---------------------------------------------------------------------------

/** Availability windows in UTC after overrides are applied, merged and clamped to `[rangeStart, rangeEnd)`. */
export function computeFreeWindows(schedule: ScheduleInput, rangeStart: Date, rangeEnd: Date): Interval[] {
  validateSchedule(schedule);
  if (rangeStart.getTime() >= rangeEnd.getTime()) {
    return [];
  }
  const tz = schedule.timezone;
  const overridesByDate = new Map<LocalDate, DateOverride>();
  for (const override of schedule.overrides) {
    overridesByDate.set(override.date, override);
  }

  const windows: Interval[] = [];
  for (const date of eachLocalDate(rangeStart, rangeEnd, tz)) {
    const override = overridesByDate.get(date);
    const dayIntervals = override
      ? (override.intervals ?? [])
      : schedule.rules.filter((r) => r.weekday === dayOfWeekInTz(date, tz));
    for (const interval of dayIntervals) {
      windows.push({
        start: localMinutesToUtc(date, interval.startMinute, tz),
        end: localMinutesToUtc(date, interval.endMinute, tz),
      });
    }
  }

  const bounds: Interval = { start: rangeStart, end: rangeEnd };
  const clamped: Interval[] = [];
  for (const window of mergeIntervals(windows)) {
    const c = clampInterval(window, bounds);
    if (c) clamped.push(c);
  }
  return clamped;
}

// ---------------------------------------------------------------------------
// Busy
// ---------------------------------------------------------------------------

function computeBusyIntervals(bookings: BookingInput[], externalBusy: Interval[]): Interval[] {
  const expanded = bookings.map((b) => expandInterval(b, b.bufferBeforeMinutes ?? 0, b.bufferAfterMinutes ?? 0));
  return mergeIntervals([...expanded, ...externalBusy]);
}

/**
 * Forward-only sweep over a sorted, merged busy list. Valid only when
 * successive calls pass intervals with non-decreasing `start`.
 */
function makeBusyOverlapChecker(busy: Interval[]): (interval: Interval) => boolean {
  let i = 0;
  return (interval: Interval) => {
    while (i < busy.length && busy[i].end.getTime() <= interval.start.getTime()) {
      i += 1;
    }
    return i < busy.length && busy[i].start.getTime() < interval.end.getTime();
  };
}

// ---------------------------------------------------------------------------
// Date range policy
// ---------------------------------------------------------------------------

function isWithinDateRangePolicy(
  policy: DateRangePolicy,
  scheduleLocalDate: LocalDate,
  now: Date,
  scheduleTimezone: string,
): boolean {
  switch (policy.type) {
    case "indefinite":
      return true;
    case "fixed":
      return (
        compareLocalDate(scheduleLocalDate, policy.from) >= 0 &&
        compareLocalDate(scheduleLocalDate, policy.to) <= 0
      );
    case "rolling": {
      const today = todayInTz(now, scheduleTimezone);
      const lastDate = addDays(today, policy.days - 1);
      return compareLocalDate(scheduleLocalDate, today) >= 0 && compareLocalDate(scheduleLocalDate, lastDate) <= 0;
    }
  }
}

// ---------------------------------------------------------------------------
// Slot generation
// ---------------------------------------------------------------------------

export function getAvailableSlots(input: GetAvailableSlotsInput): SlotsByDate {
  const { eventType, schedule, bookings, externalBusy, now, rangeStart, rangeEnd, inviteeTimezone } = input;

  validateEventType(eventType);
  validateSchedule(schedule);
  if (!isValidTimeZone(inviteeTimezone)) {
    throw new RangeError(`Invalid time zone: ${inviteeTimezone}`);
  }

  const grouped = new Map<LocalDate, Slot[]>();
  if (rangeStart.getTime() >= rangeEnd.getTime()) {
    return grouped;
  }

  const durationMs = eventType.durationMinutes * 60_000;
  const stepMs = (eventType.slotIntervalMinutes ?? eventType.durationMinutes) * 60_000;
  const bufferBeforeMs = eventType.bufferBeforeMinutes * 60_000;
  const bufferAfterMs = eventType.bufferAfterMinutes * 60_000;
  const noticeThresholdMs = now.getTime() + eventType.minNoticeMinutes * 60_000;
  const maxPerDay = eventType.maxBookingsPerDay;

  const freeWindows = computeFreeWindows(schedule, rangeStart, rangeEnd);
  const busy = computeBusyIntervals(bookings, externalBusy);
  const overlapsBusy = makeBusyOverlapChecker(busy);

  let dayCounts: Map<LocalDate, number> | null = null;
  if (maxPerDay != null) {
    dayCounts = new Map();
    for (const b of bookings) {
      const d = utcToLocalDate(b.start, schedule.timezone);
      dayCounts.set(d, (dayCounts.get(d) ?? 0) + 1);
    }
  }

  const rangeStartMs = rangeStart.getTime();
  const rangeEndMs = rangeEnd.getTime();
  const seenStarts = new Set<number>();

  for (const window of freeWindows) {
    const windowEndMs = window.end.getTime();
    let startMs = window.start.getTime();
    while (startMs + durationMs <= windowEndMs) {
      const endMs = startMs + durationMs;

      if (startMs >= rangeStartMs && startMs < rangeEndMs && startMs >= noticeThresholdMs) {
        const padded: Interval = {
          start: new Date(startMs - bufferBeforeMs),
          end: new Date(endMs + bufferAfterMs),
        };
        if (!overlapsBusy(padded)) {
          const scheduleLocalDate = utcToLocalDate(new Date(startMs), schedule.timezone);
          if (isWithinDateRangePolicy(eventType.dateRange, scheduleLocalDate, now, schedule.timezone)) {
            const dayCount = dayCounts?.get(scheduleLocalDate) ?? 0;
            if (maxPerDay == null || dayCount < maxPerDay) {
              if (!seenStarts.has(startMs)) {
                seenStarts.add(startMs);
                const candidateStart = new Date(startMs);
                const candidateEnd = new Date(endMs);
                const inviteeLocalDate = utcToLocalDate(candidateStart, inviteeTimezone);
                let list = grouped.get(inviteeLocalDate);
                if (!list) {
                  list = [];
                  grouped.set(inviteeLocalDate, list);
                }
                list.push({ startUtc: candidateStart, endUtc: candidateEnd });
              }
            }
          }
        }
      }

      startMs += stepMs;
    }
  }

  const result: SlotsByDate = new Map();
  for (const date of [...grouped.keys()].sort(compareLocalDate)) {
    const slots = grouped.get(date)!;
    slots.sort((a, b) => a.startUtc.getTime() - b.startUtc.getTime());
    result.set(date, slots);
  }
  return result;
}

/**
 * Re-runs the pipeline over a one-day-padded window around `candidate`,
 * grouping by the schedule's own time zone, and checks for a slot with an
 * identical start and end. Used by booking creation's server-side re-check.
 */
export function isSlotAvailable(
  input: Omit<GetAvailableSlotsInput, "rangeStart" | "rangeEnd" | "inviteeTimezone">,
  candidate: Slot,
): boolean {
  const oneDayMs = 24 * 60 * 60_000;
  const rangeStart = new Date(candidate.startUtc.getTime() - oneDayMs);
  const rangeEnd = new Date(candidate.endUtc.getTime() + oneDayMs);

  const slots = getAvailableSlots({
    ...input,
    rangeStart,
    rangeEnd,
    inviteeTimezone: input.schedule.timezone,
  });

  for (const list of slots.values()) {
    for (const slot of list) {
      if (
        slot.startUtc.getTime() === candidate.startUtc.getTime() &&
        slot.endUtc.getTime() === candidate.endUtc.getTime()
      ) {
        return true;
      }
    }
  }
  return false;
}
