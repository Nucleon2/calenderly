/**
 * Test-only builders for schedules, event types, and bookings. Keeps
 * slots.test.ts (and friends) readable by giving sensible defaults that
 * individual tests override.
 */
import type { LocalDate } from "@/lib/time";
import type {
  BookingInput,
  DateOverride,
  DateRangePolicy,
  EventTypeInput,
  ScheduleInput,
  WeeklyRule,
} from "@/server/availability/slots";

export function minutesOf(hour: number, minute = 0): number {
  return hour * 60 + minute;
}

export function weeklyRule(
  weekday: number,
  startHour: number,
  endHour: number,
  startMinute = 0,
  endMinute = 0,
): WeeklyRule {
  return {
    weekday,
    startMinute: minutesOf(startHour, startMinute),
    endMinute: minutesOf(endHour, endMinute),
  };
}

export function buildSchedule(overrides: Partial<ScheduleInput> = {}): ScheduleInput {
  return {
    timezone: "UTC",
    rules: [],
    overrides: [],
    ...overrides,
  };
}

/** Mon-Fri (default) 09:00-17:00 schedule in `timezone`. */
export function weekdayNineToFiveSchedule(
  timezone: string,
  weekdays: number[] = [1, 2, 3, 4, 5],
): ScheduleInput {
  return {
    timezone,
    rules: weekdays.map((weekday) => weeklyRule(weekday, 9, 17)),
    overrides: [],
  };
}

export function dateOverride(
  date: LocalDate,
  intervals: { startMinute: number; endMinute: number }[] | null,
): DateOverride {
  return { date, intervals };
}

export function buildEventType(overrides: Partial<EventTypeInput> = {}): EventTypeInput {
  return {
    durationMinutes: 30,
    slotIntervalMinutes: undefined,
    bufferBeforeMinutes: 0,
    bufferAfterMinutes: 0,
    minNoticeMinutes: 0,
    maxBookingsPerDay: null,
    dateRange: { type: "indefinite" },
    ...overrides,
  };
}

export function buildBooking(
  startIso: string,
  endIso: string,
  buffers: { bufferBeforeMinutes?: number; bufferAfterMinutes?: number } = {},
): BookingInput {
  return {
    start: new Date(startIso),
    end: new Date(endIso),
    ...buffers,
  };
}

export function rollingRange(days: number): DateRangePolicy {
  return { type: "rolling", days };
}

export function fixedRange(from: LocalDate, to: LocalDate): DateRangePolicy {
  return { type: "fixed", from, to };
}

export function indefiniteRange(): DateRangePolicy {
  return { type: "indefinite" };
}
