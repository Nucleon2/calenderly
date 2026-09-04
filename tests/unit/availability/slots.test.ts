import { describe, expect, it } from "vitest";
import { addDays } from "@/lib/time";
import {
  getAvailableSlots,
  isSlotAvailable,
  type ScheduleInput,
  type Slot,
} from "@/server/availability/slots";
import {
  buildBooking,
  buildEventType,
  buildSchedule,
  dateOverride,
  fixedRange,
  indefiniteRange,
  rollingRange,
  weeklyRule,
} from "../../fixtures/schedules";

function allWeekNineToFive(timezone: string): ScheduleInput {
  return {
    timezone,
    rules: [0, 1, 2, 3, 4, 5, 6].map((weekday) => weeklyRule(weekday, 9, 17)),
    overrides: [],
  };
}

function starts(slots: Slot[]): string[] {
  return slots.map((s) => s.startUtc.toISOString());
}

function allSlots(result: Map<string, Slot[]>): Slot[] {
  return [...result.values()].flat();
}

describe("getAvailableSlots", () => {
  it("1. NY host 9-17 Mon-Fri across the week containing 2026-03-08 (spring-forward), grouped for a Tokyo invitee", () => {
    const schedule = allWeekNineToFive("America/New_York");
    schedule.rules = schedule.rules.filter((r) => r.weekday >= 1 && r.weekday <= 5); // Mon-Fri only
    const result = getAvailableSlots({
      eventType: buildEventType({ durationMinutes: 30 }),
      schedule,
      bookings: [],
      externalBusy: [],
      now: new Date("2026-01-01T00:00:00Z"),
      rangeStart: new Date("2026-03-06T00:00:00Z"), // Fri
      rangeEnd: new Date("2026-03-10T00:00:00Z"), // Tue 00:00, covers Fri/Sat/Sun/Mon
      inviteeTimezone: "Asia/Tokyo",
    });

    const flat = allSlots(result).sort((a, b) => a.startUtc.getTime() - b.startUtc.getTime());
    // Sat + Sun have no rule -> only Friday (EST) and Monday (EDT) produce slots.
    expect(flat).toHaveLength(32); // 16 (Fri) + 16 (Mon)

    // Prior Friday 09:00 EST = 14:00Z.
    expect(flat[0].startUtc).toEqual(new Date("2026-03-06T14:00:00.000Z"));
    // Monday 09:00 EDT = 13:00Z (post spring-forward).
    const mondayFirst = flat.find((s) => s.startUtc.getTime() === new Date("2026-03-09T13:00:00.000Z").getTime());
    expect(mondayFirst).toBeDefined();

    // Tokyo (UTC+9, no DST) grouping: 13:00Z + 9h = 22:00, same calendar day.
    expect(result.get("2026-03-09")).toBeDefined();
    expect(starts(result.get("2026-03-09")!)).toContain("2026-03-09T13:00:00.000Z");
  });

  it("2. Override makes spring-forward Sunday 2026-03-08 working 01:00-04:00 NY: no slot at a non-existent local time, no crash, no duplicates", () => {
    const schedule = buildSchedule({
      timezone: "America/New_York",
      overrides: [dateOverride("2026-03-08", [{ startMinute: 60, endMinute: 240 }])],
    });
    const result = getAvailableSlots({
      eventType: buildEventType({ durationMinutes: 30 }),
      schedule,
      bookings: [],
      externalBusy: [],
      now: new Date("2026-01-01T00:00:00Z"),
      rangeStart: new Date("2026-03-08T00:00:00Z"),
      rangeEnd: new Date("2026-03-09T00:00:00Z"),
      inviteeTimezone: "America/New_York",
    });

    const flat = allSlots(result);
    const startTimes = starts(flat);
    // 01:00 EST -> 06:00Z; 04:00 EDT -> 08:00Z. Real UTC span is 2 hours (not 3),
    // because the 02:00-03:00 local hour never happened.
    expect(startTimes.sort()).toEqual([
      "2026-03-08T06:00:00.000Z",
      "2026-03-08T06:30:00.000Z",
      "2026-03-08T07:00:00.000Z",
      "2026-03-08T07:30:00.000Z",
    ]);
    expect(new Set(startTimes).size).toBe(startTimes.length); // no duplicates
  });

  it("3. Override makes fall-back Sunday 2026-11-01 working 00:30-03:00 NY: the ambiguous hour yields unique starts", () => {
    const schedule = buildSchedule({
      timezone: "America/New_York",
      overrides: [dateOverride("2026-11-01", [{ startMinute: 30, endMinute: 180 }])],
    });
    const result = getAvailableSlots({
      eventType: buildEventType({ durationMinutes: 30 }),
      schedule,
      bookings: [],
      externalBusy: [],
      now: new Date("2026-01-01T00:00:00Z"),
      rangeStart: new Date("2026-11-01T00:00:00Z"),
      rangeEnd: new Date("2026-11-02T00:00:00Z"),
      inviteeTimezone: "America/New_York",
    });

    const flat = allSlots(result);
    const startTimes = starts(flat).sort();
    // 00:30 EDT -> 04:30Z; 03:00 EST -> 08:00Z. Real UTC span is 3.5 hours
    // (not 2.5), because the 01:00-02:00 local hour happened twice.
    expect(startTimes).toEqual([
      "2026-11-01T04:30:00.000Z",
      "2026-11-01T05:00:00.000Z",
      "2026-11-01T05:30:00.000Z",
      "2026-11-01T06:00:00.000Z",
      "2026-11-01T06:30:00.000Z",
      "2026-11-01T07:00:00.000Z",
      "2026-11-01T07:30:00.000Z",
    ]);
    expect(new Set(startTimes).size).toBe(startTimes.length);
  });

  it("4. Sydney host 9-17 across the 2026-10-04 spring-forward: Monday's first slot is an hour earlier in UTC than the prior Friday's", () => {
    const schedule = allWeekNineToFive("Australia/Sydney");
    schedule.rules = schedule.rules.filter((r) => r.weekday >= 1 && r.weekday <= 5);
    const result = getAvailableSlots({
      eventType: buildEventType({ durationMinutes: 30 }),
      schedule,
      bookings: [],
      externalBusy: [],
      now: new Date("2026-01-01T00:00:00Z"),
      rangeStart: new Date("2026-10-01T00:00:00Z"), // Thu
      rangeEnd: new Date("2026-10-06T00:00:00Z"), // Tue
      inviteeTimezone: "Australia/Sydney",
    });
    const startTimes = starts(allSlots(result));

    // Friday 09:00 AEST (+10) and Monday 09:00 AEDT (+11): the same local
    // wall-clock start lands an hour earlier in UTC after the gap.
    expect(startTimes).toContain("2026-10-01T23:00:00.000Z");
    expect(startTimes).toContain("2026-10-04T22:00:00.000Z");
  });

  it("5. A booking removes candidates whose buffered window overlaps it, keeping non-adjacent candidates", () => {
    const schedule = buildSchedule({
      timezone: "UTC",
      overrides: [dateOverride("2026-06-17", [{ startMinute: 540, endMinute: 690 }])], // 09:00-11:30
    });
    const result = getAvailableSlots({
      eventType: buildEventType({ durationMinutes: 30, bufferBeforeMinutes: 15, bufferAfterMinutes: 15 }),
      schedule,
      bookings: [buildBooking("2026-06-17T10:00:00Z", "2026-06-17T10:30:00Z")],
      externalBusy: [],
      now: new Date("2026-06-01T00:00:00Z"),
      rangeStart: new Date("2026-06-17T00:00:00Z"),
      rangeEnd: new Date("2026-06-18T00:00:00Z"),
      inviteeTimezone: "UTC",
    });
    expect(starts(allSlots(result)).sort()).toEqual([
      "2026-06-17T09:00:00.000Z",
      "2026-06-17T11:00:00.000Z",
    ]);
  });

  it("6. A booking's own bufferAfter blocks the following slot even when the candidate event type has 0 buffers", () => {
    const schedule = buildSchedule({
      timezone: "UTC",
      overrides: [dateOverride("2026-06-17", [{ startMinute: 540, endMinute: 660 }])], // 09:00-11:00
    });
    const result = getAvailableSlots({
      eventType: buildEventType({ durationMinutes: 30, bufferBeforeMinutes: 0, bufferAfterMinutes: 0 }),
      schedule,
      bookings: [buildBooking("2026-06-17T10:00:00Z", "2026-06-17T10:30:00Z", { bufferAfterMinutes: 30 })],
      externalBusy: [],
      now: new Date("2026-06-01T00:00:00Z"),
      rangeStart: new Date("2026-06-17T00:00:00Z"),
      rangeEnd: new Date("2026-06-18T00:00:00Z"),
      inviteeTimezone: "UTC",
    });
    expect(starts(allSlots(result)).sort()).toEqual([
      "2026-06-17T09:00:00.000Z",
      "2026-06-17T09:30:00.000Z",
    ]);
  });

  it("7. Two adjacent bookings with overlapping buffers merge cleanly: no crash, no slot in the consumed gap", () => {
    const schedule = buildSchedule({
      timezone: "UTC",
      overrides: [dateOverride("2026-06-17", [{ startMinute: 540, endMinute: 720 }])], // 09:00-12:00
    });
    expect(() =>
      getAvailableSlots({
        eventType: buildEventType({ durationMinutes: 30, bufferBeforeMinutes: 0, bufferAfterMinutes: 0 }),
        schedule,
        bookings: [
          buildBooking("2026-06-17T09:00:00Z", "2026-06-17T09:30:00Z", { bufferAfterMinutes: 20 }),
          buildBooking("2026-06-17T10:00:00Z", "2026-06-17T10:30:00Z", { bufferBeforeMinutes: 20 }),
        ],
        externalBusy: [],
        now: new Date("2026-06-01T00:00:00Z"),
        rangeStart: new Date("2026-06-17T00:00:00Z"),
        rangeEnd: new Date("2026-06-18T00:00:00Z"),
        inviteeTimezone: "UTC",
      }),
    ).not.toThrow();

    const result = getAvailableSlots({
      eventType: buildEventType({ durationMinutes: 30, bufferBeforeMinutes: 0, bufferAfterMinutes: 0 }),
      schedule,
      bookings: [
        buildBooking("2026-06-17T09:00:00Z", "2026-06-17T09:30:00Z", { bufferAfterMinutes: 20 }),
        buildBooking("2026-06-17T10:00:00Z", "2026-06-17T10:30:00Z", { bufferBeforeMinutes: 20 }),
      ],
      externalBusy: [],
      now: new Date("2026-06-01T00:00:00Z"),
      rangeStart: new Date("2026-06-17T00:00:00Z"),
      rangeEnd: new Date("2026-06-18T00:00:00Z"),
      inviteeTimezone: "UTC",
    });
    // Merged buffered busy block is [09:00,10:30); nothing in that span survives.
    expect(starts(allSlots(result)).sort()).toEqual([
      "2026-06-17T10:30:00.000Z",
      "2026-06-17T11:00:00.000Z",
      "2026-06-17T11:30:00.000Z",
    ]);
  });

  it("8. minNotice 240 with now=08:00: 12:00 is the first slot (inclusive boundary), 11:30 excluded", () => {
    const schedule = buildSchedule({
      timezone: "UTC",
      overrides: [dateOverride("2026-06-17", [{ startMinute: 540, endMinute: 1020 }])], // 09:00-17:00
    });
    const result = getAvailableSlots({
      eventType: buildEventType({ durationMinutes: 30, minNoticeMinutes: 240 }),
      schedule,
      bookings: [],
      externalBusy: [],
      now: new Date("2026-06-17T08:00:00Z"),
      rangeStart: new Date("2026-06-17T00:00:00Z"),
      rangeEnd: new Date("2026-06-18T00:00:00Z"),
      inviteeTimezone: "UTC",
    });
    const startTimes = starts(allSlots(result));
    expect(startTimes).toContain("2026-06-17T12:00:00.000Z");
    expect(startTimes).not.toContain("2026-06-17T11:30:00.000Z");
    expect(Math.min(...startTimes.map((s) => new Date(s).getTime()))).toBe(new Date("2026-06-17T12:00:00Z").getTime());
  });

  it("9. minNotice makes the whole current day empty when now is 16:45", () => {
    const schedule = buildSchedule({
      timezone: "UTC",
      overrides: [dateOverride("2026-06-17", [{ startMinute: 540, endMinute: 1020 }])], // 09:00-17:00
    });
    const result = getAvailableSlots({
      eventType: buildEventType({ durationMinutes: 30, minNoticeMinutes: 60 }),
      schedule,
      bookings: [],
      externalBusy: [],
      now: new Date("2026-06-17T16:45:00Z"),
      rangeStart: new Date("2026-06-17T00:00:00Z"),
      rangeEnd: new Date("2026-06-18T00:00:00Z"),
      inviteeTimezone: "UTC",
    });
    expect(result.has("2026-06-17")).toBe(false);
  });

  it("10. An override marking one weekday unavailable removes only that day", () => {
    const schedule: ScheduleInput = {
      timezone: "UTC",
      rules: [weeklyRule(1, 9, 17), weeklyRule(2, 9, 17)],
      overrides: [dateOverride("2026-06-15", null)], // Monday off
    };
    const result = getAvailableSlots({
      eventType: buildEventType({ durationMinutes: 30 }),
      schedule,
      bookings: [],
      externalBusy: [],
      now: new Date("2026-06-01T00:00:00Z"),
      rangeStart: new Date("2026-06-15T00:00:00Z"),
      rangeEnd: new Date("2026-06-17T00:00:00Z"),
      inviteeTimezone: "UTC",
    });
    expect(result.has("2026-06-15")).toBe(false);
    expect(result.get("2026-06-16")).toHaveLength(16);
  });

  it("11. An override adding Saturday hours on a Mon-Fri schedule gives exactly the expected starts", () => {
    const schedule = allWeekNineToFive("UTC");
    schedule.rules = schedule.rules.filter((r) => r.weekday >= 1 && r.weekday <= 5);
    schedule.overrides = [dateOverride("2026-06-20", [{ startMinute: 600, endMinute: 840 }])]; // Sat 10:00-14:00
    const result = getAvailableSlots({
      eventType: buildEventType({ durationMinutes: 30 }),
      schedule,
      bookings: [],
      externalBusy: [],
      now: new Date("2026-06-01T00:00:00Z"),
      rangeStart: new Date("2026-06-20T00:00:00Z"),
      rangeEnd: new Date("2026-06-21T00:00:00Z"),
      inviteeTimezone: "UTC",
    });
    expect(starts(result.get("2026-06-20") ?? []).sort()).toEqual([
      "2026-06-20T10:00:00.000Z",
      "2026-06-20T10:30:00.000Z",
      "2026-06-20T11:00:00.000Z",
      "2026-06-20T11:30:00.000Z",
      "2026-06-20T12:00:00.000Z",
      "2026-06-20T12:30:00.000Z",
      "2026-06-20T13:00:00.000Z",
      "2026-06-20T13:30:00.000Z",
    ]);
  });

  it("12. An override narrower than the weekly hours removes the afternoon for that date only", () => {
    const schedule: ScheduleInput = {
      timezone: "UTC",
      rules: [weeklyRule(3, 9, 17), weeklyRule(4, 9, 17)],
      overrides: [dateOverride("2026-06-17", [{ startMinute: 540, endMinute: 720 }])], // Wed 09:00-12:00
    };
    const result = getAvailableSlots({
      eventType: buildEventType({ durationMinutes: 30 }),
      schedule,
      bookings: [],
      externalBusy: [],
      now: new Date("2026-06-01T00:00:00Z"),
      rangeStart: new Date("2026-06-17T00:00:00Z"),
      rangeEnd: new Date("2026-06-19T00:00:00Z"),
      inviteeTimezone: "UTC",
    });
    expect(result.get("2026-06-17")).toHaveLength(6); // 09:00-12:00, 30-min
    expect(result.get("2026-06-18")).toHaveLength(16); // untouched Thursday
  });

  it("13. maxBookingsPerDay 2 with two confirmed bookings empties that day, next day intact", () => {
    const schedule: ScheduleInput = {
      timezone: "UTC",
      rules: [weeklyRule(3, 9, 17), weeklyRule(4, 9, 17)],
      overrides: [],
    };
    const result = getAvailableSlots({
      eventType: buildEventType({ durationMinutes: 30, maxBookingsPerDay: 2 }),
      schedule,
      bookings: [
        buildBooking("2026-06-17T09:00:00Z", "2026-06-17T09:30:00Z"),
        buildBooking("2026-06-17T13:00:00Z", "2026-06-17T13:30:00Z"),
      ],
      externalBusy: [],
      now: new Date("2026-06-01T00:00:00Z"),
      rangeStart: new Date("2026-06-17T00:00:00Z"),
      rangeEnd: new Date("2026-06-19T00:00:00Z"),
      inviteeTimezone: "UTC",
    });
    expect(result.has("2026-06-17")).toBe(false);
    expect(result.get("2026-06-18")).toHaveLength(16);
  });

  it("14. maxBookingsPerDay 2 with one booking leaves the day intact (counts only the bookings passed in)", () => {
    const schedule: ScheduleInput = { timezone: "UTC", rules: [weeklyRule(3, 9, 17)], overrides: [] };
    const result = getAvailableSlots({
      eventType: buildEventType({ durationMinutes: 30, maxBookingsPerDay: 2 }),
      schedule,
      bookings: [buildBooking("2026-06-17T08:00:00Z", "2026-06-17T08:15:00Z")],
      externalBusy: [],
      now: new Date("2026-06-01T00:00:00Z"),
      rangeStart: new Date("2026-06-17T00:00:00Z"),
      rangeEnd: new Date("2026-06-18T00:00:00Z"),
      inviteeTimezone: "UTC",
    });
    expect(result.get("2026-06-17")).toHaveLength(16);
  });

  it("15. slotInterval 15 with duration 30: starts every 15 minutes, last start 16:30", () => {
    const schedule = buildSchedule({
      timezone: "UTC",
      overrides: [dateOverride("2026-06-17", [{ startMinute: 540, endMinute: 1020 }])],
    });
    const result = getAvailableSlots({
      eventType: buildEventType({ durationMinutes: 30, slotIntervalMinutes: 15 }),
      schedule,
      bookings: [],
      externalBusy: [],
      now: new Date("2026-06-01T00:00:00Z"),
      rangeStart: new Date("2026-06-17T00:00:00Z"),
      rangeEnd: new Date("2026-06-18T00:00:00Z"),
      inviteeTimezone: "UTC",
    });
    const slots = result.get("2026-06-17") ?? [];
    expect(slots).toHaveLength(31);
    expect(slots[0].startUtc).toEqual(new Date("2026-06-17T09:00:00Z"));
    expect(slots[slots.length - 1].startUtc).toEqual(new Date("2026-06-17T16:30:00Z"));
  });

  it("16. slotInterval omitted defaults to duration: every 30 min for a 30-min event, every 60 for a 60-min event", () => {
    const schedule = buildSchedule({
      timezone: "UTC",
      overrides: [dateOverride("2026-06-17", [{ startMinute: 540, endMinute: 1020 }])],
    });
    const base = {
      schedule,
      bookings: [],
      externalBusy: [],
      now: new Date("2026-06-01T00:00:00Z"),
      rangeStart: new Date("2026-06-17T00:00:00Z"),
      rangeEnd: new Date("2026-06-18T00:00:00Z"),
      inviteeTimezone: "UTC",
    };
    const thirty = getAvailableSlots({ ...base, eventType: buildEventType({ durationMinutes: 30 }) });
    const sixty = getAvailableSlots({ ...base, eventType: buildEventType({ durationMinutes: 60 }) });
    expect(thirty.get("2026-06-17")).toHaveLength(16);
    expect(sixty.get("2026-06-17")).toHaveLength(8);
  });

  it("17. rolling 14 days: day 14 (today+13) has slots, day 15 does not, even though rangeEnd is 60 days out", () => {
    const schedule = allWeekNineToFive("UTC");
    const now = new Date("2026-06-01T00:00:00Z");
    const result = getAvailableSlots({
      eventType: buildEventType({ durationMinutes: 30, dateRange: rollingRange(14) }),
      schedule,
      bookings: [],
      externalBusy: [],
      now,
      rangeStart: now,
      rangeEnd: new Date(now.getTime() + 60 * 24 * 60 * 60_000),
      inviteeTimezone: "UTC",
    });
    const today = "2026-06-01";
    expect(result.get(addDays(today, 13))).toBeDefined();
    expect(result.has(addDays(today, 14))).toBe(false);
  });

  it("18. A fixed range fully in the past yields an empty map without throwing", () => {
    const schedule = allWeekNineToFive("UTC");
    expect(() =>
      getAvailableSlots({
        eventType: buildEventType({ durationMinutes: 30, dateRange: fixedRange("2020-01-01", "2020-01-31") }),
        schedule,
        bookings: [],
        externalBusy: [],
        now: new Date("2026-06-01T00:00:00Z"),
        rangeStart: new Date("2026-06-01T00:00:00Z"),
        rangeEnd: new Date("2026-06-08T00:00:00Z"),
        inviteeTimezone: "UTC",
      }),
    ).not.toThrow();
    const result = getAvailableSlots({
      eventType: buildEventType({ durationMinutes: 30, dateRange: fixedRange("2020-01-01", "2020-01-31") }),
      schedule,
      bookings: [],
      externalBusy: [],
      now: new Date("2026-06-01T00:00:00Z"),
      rangeStart: new Date("2026-06-01T00:00:00Z"),
      rangeEnd: new Date("2026-06-08T00:00:00Z"),
      inviteeTimezone: "UTC",
    });
    expect(result.size).toBe(0);
  });

  it("19. A fixed range partially overlapping the query keeps only dates in the intersection", () => {
    const schedule = allWeekNineToFive("UTC");
    const result = getAvailableSlots({
      eventType: buildEventType({ durationMinutes: 30, dateRange: fixedRange("2026-06-10", "2026-06-20") }),
      schedule,
      bookings: [],
      externalBusy: [],
      now: new Date("2026-06-01T00:00:00Z"),
      rangeStart: new Date("2026-06-01T00:00:00Z"),
      rangeEnd: new Date("2026-06-16T00:00:00Z"), // exclusive: covers through 06-15
      inviteeTimezone: "UTC",
    });
    expect(result.has("2026-06-09")).toBe(false); // before fixed range
    expect(result.has("2026-06-10")).toBe(true); // fixed range starts
    expect(result.has("2026-06-15")).toBe(true); // last date the query covers
    expect(result.has("2026-06-16")).toBe(false); // excluded by query's exclusive end
    expect([...result.keys()].sort()).toEqual(["2026-06-10", "2026-06-11", "2026-06-12", "2026-06-13", "2026-06-14", "2026-06-15"]);
  });

  it("20. An indefinite range has slots 400 days out", () => {
    const schedule = allWeekNineToFive("UTC");
    const today = "2026-01-01";
    const target = addDays(today, 400);
    const result = getAvailableSlots({
      eventType: buildEventType({ durationMinutes: 30, dateRange: indefiniteRange() }),
      schedule,
      bookings: [],
      externalBusy: [],
      now: new Date(`${today}T00:00:00Z`),
      rangeStart: new Date(`${addDays(today, 399)}T00:00:00Z`),
      rangeEnd: new Date(`${addDays(today, 402)}T00:00:00Z`),
      inviteeTimezone: "UTC",
    });
    expect(result.has(target)).toBe(true);
  });

  it("21. External busy 10:00-10:15 removes exactly the overlapping candidate under half-open interval semantics", () => {
    // NOTE: with strict half-open intervals [start,end), a 30-min candidate
    // ending exactly at 10:00 does not overlap a busy interval starting at
    // 10:00 (they merely touch). The 10:00 candidate itself does overlap.
    const schedule = buildSchedule({
      timezone: "UTC",
      overrides: [dateOverride("2026-06-17", [{ startMinute: 540, endMinute: 1020 }])],
    });
    const result = getAvailableSlots({
      eventType: buildEventType({ durationMinutes: 30 }),
      schedule,
      bookings: [],
      externalBusy: [{ start: new Date("2026-06-17T10:00:00Z"), end: new Date("2026-06-17T10:15:00Z") }],
      now: new Date("2026-06-01T00:00:00Z"),
      rangeStart: new Date("2026-06-17T00:00:00Z"),
      rangeEnd: new Date("2026-06-18T00:00:00Z"),
      inviteeTimezone: "UTC",
    });
    const startTimes = starts(result.get("2026-06-17") ?? []);
    expect(startTimes).toContain("2026-06-17T09:30:00.000Z");
    expect(startTimes).toContain("2026-06-17T10:30:00.000Z");
    expect(startTimes).not.toContain("2026-06-17T10:00:00.000Z");
  });

  it("22. External busy covering the whole window leaves that day empty", () => {
    const schedule = buildSchedule({
      timezone: "UTC",
      overrides: [dateOverride("2026-06-17", [{ startMinute: 540, endMinute: 1020 }])],
    });
    const result = getAvailableSlots({
      eventType: buildEventType({ durationMinutes: 30 }),
      schedule,
      bookings: [],
      externalBusy: [{ start: new Date("2026-06-17T09:00:00Z"), end: new Date("2026-06-17T17:00:00Z") }],
      now: new Date("2026-06-01T00:00:00Z"),
      rangeStart: new Date("2026-06-17T00:00:00Z"),
      rangeEnd: new Date("2026-06-18T00:00:00Z"),
      inviteeTimezone: "UTC",
    });
    expect(result.has("2026-06-17")).toBe(false);
  });

  it("23. Overlapping booking-buffer and external busy merge cleanly, matching an explicit list of surviving starts", () => {
    const schedule = buildSchedule({
      timezone: "UTC",
      overrides: [dateOverride("2026-06-17", [{ startMinute: 540, endMinute: 1020 }])],
    });
    const result = getAvailableSlots({
      eventType: buildEventType({ durationMinutes: 30 }),
      schedule,
      bookings: [buildBooking("2026-06-17T10:00:00Z", "2026-06-17T10:30:00Z", { bufferBeforeMinutes: 15, bufferAfterMinutes: 15 })],
      externalBusy: [{ start: new Date("2026-06-17T10:30:00Z"), end: new Date("2026-06-17T11:15:00Z") }],
      now: new Date("2026-06-01T00:00:00Z"),
      rangeStart: new Date("2026-06-17T00:00:00Z"),
      rangeEnd: new Date("2026-06-18T00:00:00Z"),
      inviteeTimezone: "UTC",
    });
    const morning = starts(result.get("2026-06-17") ?? [])
      .filter((s) => new Date(s).getTime() < new Date("2026-06-17T12:00:00Z").getTime())
      .sort();
    // Booking buffer [09:45,10:45) merges with external busy [10:30,11:15)
    // into [09:45,11:15); only 09:00 and 11:30 survive before noon.
    expect(morning).toEqual(["2026-06-17T09:00:00.000Z", "2026-06-17T11:30:00.000Z"]);
  });

  it("24. Host window ending at local midnight (LA, 60-min event over a 22:00-24:00 window): 23:00 exists, 23:30 doesn't; 22:30 groups under the next Tokyo date", () => {
    const schedule = buildSchedule({
      timezone: "America/Los_Angeles",
      overrides: [dateOverride("2026-06-17", [{ startMinute: 1320, endMinute: 1440 }])], // 22:00-24:00
    });
    const result = getAvailableSlots({
      eventType: buildEventType({ durationMinutes: 60, slotIntervalMinutes: 30 }),
      schedule,
      bookings: [],
      externalBusy: [],
      now: new Date("2026-06-01T00:00:00Z"),
      rangeStart: new Date("2026-06-17T00:00:00Z"),
      rangeEnd: new Date("2026-06-19T00:00:00Z"),
      inviteeTimezone: "Asia/Tokyo",
    });
    const tokyoNextDay = result.get("2026-06-18") ?? [];
    const startTimes = starts(tokyoNextDay).sort();
    expect(startTimes).toEqual([
      "2026-06-18T05:00:00.000Z", // 22:00 LA
      "2026-06-18T05:30:00.000Z", // 22:30 LA
      "2026-06-18T06:00:00.000Z", // 23:00 LA
    ]);
    expect(startTimes).not.toContain("2026-06-18T06:30:00.000Z"); // 23:30 LA would end past midnight
    expect(result.has("2026-06-17")).toBe(false); // nothing grouped under the host's own local date for Tokyo
  });

  it("25. Split shift 9-12 / 13-17 with 45-min duration: 11:15 exists (11:30 never on-grid), 13:00 exists", () => {
    const schedule = buildSchedule({
      timezone: "UTC",
      overrides: [
        dateOverride("2026-06-17", [
          { startMinute: 540, endMinute: 720 }, // 09:00-12:00
          { startMinute: 780, endMinute: 1020 }, // 13:00-17:00
        ]),
      ],
    });
    const result = getAvailableSlots({
      eventType: buildEventType({ durationMinutes: 45 }),
      schedule,
      bookings: [],
      externalBusy: [],
      now: new Date("2026-06-01T00:00:00Z"),
      rangeStart: new Date("2026-06-17T00:00:00Z"),
      rangeEnd: new Date("2026-06-18T00:00:00Z"),
      inviteeTimezone: "UTC",
    });
    const startTimes = starts(result.get("2026-06-17") ?? []).sort();
    expect(startTimes).toEqual([
      "2026-06-17T09:00:00.000Z",
      "2026-06-17T09:45:00.000Z",
      "2026-06-17T10:30:00.000Z",
      "2026-06-17T11:15:00.000Z",
      "2026-06-17T13:00:00.000Z",
      "2026-06-17T13:45:00.000Z",
      "2026-06-17T14:30:00.000Z",
      "2026-06-17T15:15:00.000Z",
      "2026-06-17T16:00:00.000Z",
    ]);
    expect(startTimes).not.toContain("2026-06-17T11:30:00.000Z");
  });

  it("26. A weekday with no rules and no override produces no slots", () => {
    const schedule = buildSchedule({ timezone: "UTC", rules: [], overrides: [] });
    const result = getAvailableSlots({
      eventType: buildEventType({ durationMinutes: 30 }),
      schedule,
      bookings: [],
      externalBusy: [],
      now: new Date("2026-06-01T00:00:00Z"),
      rangeStart: new Date("2026-06-17T00:00:00Z"),
      rangeEnd: new Date("2026-06-18T00:00:00Z"),
      inviteeTimezone: "UTC",
    });
    expect(result.size).toBe(0);
  });

  it("27. rangeStart in the past relative to now: nothing before now+minNotice, nothing crashes", () => {
    const schedule = allWeekNineToFive("UTC");
    expect(() =>
      getAvailableSlots({
        eventType: buildEventType({ durationMinutes: 30, minNoticeMinutes: 60 }),
        schedule,
        bookings: [],
        externalBusy: [],
        now: new Date("2026-06-10T12:00:00Z"),
        rangeStart: new Date("2026-06-01T00:00:00Z"),
        rangeEnd: new Date("2026-06-12T00:00:00Z"),
        inviteeTimezone: "UTC",
      }),
    ).not.toThrow();

    const result = getAvailableSlots({
      eventType: buildEventType({ durationMinutes: 30, minNoticeMinutes: 60 }),
      schedule,
      bookings: [],
      externalBusy: [],
      now: new Date("2026-06-10T12:00:00Z"),
      rangeStart: new Date("2026-06-01T00:00:00Z"),
      rangeEnd: new Date("2026-06-12T00:00:00Z"),
      inviteeTimezone: "UTC",
    });
    for (let d = 1; d <= 9; d += 1) {
      expect(result.has(`2026-06-${String(d).padStart(2, "0")}`)).toBe(false);
    }
    const flat = allSlots(result).sort((a, b) => a.startUtc.getTime() - b.startUtc.getTime());
    expect(flat[0].startUtc).toEqual(new Date("2026-06-10T13:00:00Z")); // now(12:00) + 60min notice
    expect(result.get("2026-06-11")).toHaveLength(16); // fully after the notice threshold
  });

  it("28. Unsorted, overlapping same-weekday rules (9-13 and 12-17) behave as a single continuous 9-17", () => {
    const schedule: ScheduleInput = {
      timezone: "UTC",
      rules: [weeklyRule(1, 12, 17), weeklyRule(1, 9, 13)], // Monday, given out of order & overlapping
      overrides: [],
    };
    const result = getAvailableSlots({
      eventType: buildEventType({ durationMinutes: 30 }),
      schedule,
      bookings: [],
      externalBusy: [],
      now: new Date("2026-06-01T00:00:00Z"),
      rangeStart: new Date("2026-06-15T00:00:00Z"), // Monday
      rangeEnd: new Date("2026-06-16T00:00:00Z"),
      inviteeTimezone: "UTC",
    });
    const startTimes = starts(result.get("2026-06-15") ?? []).sort();
    expect(startTimes).toHaveLength(16);
    expect(startTimes[0]).toBe("2026-06-15T09:00:00.000Z");
    expect(startTimes[startTimes.length - 1]).toBe("2026-06-15T16:30:00.000Z");
    // No seam at the rules' shared boundary (12:00-13:00).
    expect(startTimes).toContain("2026-06-15T12:00:00.000Z");
    expect(startTimes).toContain("2026-06-15T12:30:00.000Z");
    expect(startTimes).toContain("2026-06-15T13:00:00.000Z");
  });

  it("29. isSlotAvailable: true for a returned slot; false when off-grid, booked, or violating min notice", () => {
    const schedule = buildSchedule({
      timezone: "UTC",
      overrides: [dateOverride("2026-06-17", [{ startMinute: 540, endMinute: 1020 }])],
    });
    const baseInput = {
      eventType: buildEventType({ durationMinutes: 30 }),
      schedule,
      bookings: [],
      externalBusy: [],
      now: new Date("2026-06-16T00:00:00Z"),
    };

    expect(
      isSlotAvailable(baseInput, {
        startUtc: new Date("2026-06-17T09:00:00Z"),
        endUtc: new Date("2026-06-17T09:30:00Z"),
      }),
    ).toBe(true);

    expect(
      isSlotAvailable(baseInput, {
        startUtc: new Date("2026-06-17T09:10:00Z"),
        endUtc: new Date("2026-06-17T09:40:00Z"),
      }),
    ).toBe(false);

    const bookedInput = {
      ...baseInput,
      bookings: [buildBooking("2026-06-17T10:00:00Z", "2026-06-17T10:30:00Z")],
    };
    expect(
      isSlotAvailable(bookedInput, {
        startUtc: new Date("2026-06-17T10:00:00Z"),
        endUtc: new Date("2026-06-17T10:30:00Z"),
      }),
    ).toBe(false);

    const noticeInput = {
      ...baseInput,
      eventType: buildEventType({ durationMinutes: 30, minNoticeMinutes: 600 }),
      now: new Date("2026-06-17T08:00:00Z"),
    };
    expect(
      isSlotAvailable(noticeInput, {
        startUtc: new Date("2026-06-17T09:00:00Z"),
        endUtc: new Date("2026-06-17T09:30:00Z"),
      }),
    ).toBe(false);
  });

  it("30. Performance: a 60-day range with 5 rules/day and 200 bookings runs well under budget", () => {
    const rules: { weekday: number; startMinute: number; endMinute: number }[] = [];
    for (let weekday = 0; weekday <= 6; weekday += 1) {
      for (const [startMinute, endMinute] of [
        [8 * 60, 9 * 60],
        [9 * 60 + 30, 10 * 60 + 30],
        [11 * 60, 12 * 60],
        [13 * 60, 14 * 60],
        [15 * 60, 16 * 60],
      ]) {
        rules.push({ weekday, startMinute, endMinute });
      }
    }

    const schedule: ScheduleInput = { timezone: "UTC", rules, overrides: [] };
    const rangeStart = new Date("2026-06-01T00:00:00Z");
    const rangeEnd = new Date(rangeStart.getTime() + 60 * 24 * 60 * 60_000);

    const bookings = [];
    for (let i = 0; i < 200; i += 1) {
      const dayOffset = i % 60;
      const minuteOffset = 8 * 60 + (i % 8) * 60; // spread across 08:00-16:00
      const start = new Date(rangeStart.getTime() + dayOffset * 24 * 60 * 60_000 + minuteOffset * 60_000);
      const end = new Date(start.getTime() + 20 * 60_000);
      bookings.push(buildBooking(start.toISOString(), end.toISOString(), { bufferBeforeMinutes: 10, bufferAfterMinutes: 10 }));
    }

    const t0 = performance.now();
    const result = getAvailableSlots({
      eventType: buildEventType({ durationMinutes: 30 }),
      schedule,
      bookings,
      externalBusy: [],
      now: rangeStart,
      rangeStart,
      rangeEnd,
      inviteeTimezone: "UTC",
    });
    const elapsed = performance.now() - t0;

    expect(elapsed).toBeLessThan(200);
    expect(result.size).toBeGreaterThan(0);
  });
});
