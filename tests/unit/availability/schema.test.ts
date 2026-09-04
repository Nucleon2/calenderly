import { describe, expect, it } from "vitest";
import {
  createScheduleSchema,
  dateOverrideInputSchema,
  intervalSchema,
  scheduleInputSchema,
  updateScheduleSchema,
  weeklyRulesSchema,
} from "@/server/availability/schema";

describe("intervalSchema", () => {
  it("accepts a valid 5-minute-aligned interval", () => {
    const result = intervalSchema.safeParse({ startMinute: 540, endMinute: 1020 });
    expect(result.success).toBe(true);
  });

  it("rejects start >= end", () => {
    expect(intervalSchema.safeParse({ startMinute: 600, endMinute: 600 }).success).toBe(false);
    expect(intervalSchema.safeParse({ startMinute: 600, endMinute: 500 }).success).toBe(false);
  });

  it("rejects minutes not on a 5-minute mark", () => {
    expect(intervalSchema.safeParse({ startMinute: 541, endMinute: 600 }).success).toBe(false);
    expect(intervalSchema.safeParse({ startMinute: 540, endMinute: 601 }).success).toBe(false);
  });

  it("rejects out-of-range minutes", () => {
    expect(intervalSchema.safeParse({ startMinute: -5, endMinute: 60 }).success).toBe(false);
    expect(intervalSchema.safeParse({ startMinute: 1430, endMinute: 1440 }).success).toBe(false);
    expect(intervalSchema.safeParse({ startMinute: 0, endMinute: 1445 }).success).toBe(false);
  });

  it("accepts the full-day boundary (0..1440)", () => {
    expect(intervalSchema.safeParse({ startMinute: 0, endMinute: 1440 }).success).toBe(true);
  });
});

describe("weeklyRulesSchema", () => {
  it("accepts non-overlapping intervals across and within days", () => {
    const result = weeklyRulesSchema.safeParse([
      { weekday: 1, startMinute: 540, endMinute: 720 },
      { weekday: 1, startMinute: 780, endMinute: 1020 },
      { weekday: 2, startMinute: 540, endMinute: 1020 },
    ]);
    expect(result.success).toBe(true);
  });

  it("accepts touching (back-to-back) intervals on the same day", () => {
    const result = weeklyRulesSchema.safeParse([
      { weekday: 1, startMinute: 540, endMinute: 720 },
      { weekday: 1, startMinute: 720, endMinute: 900 },
    ]);
    expect(result.success).toBe(true);
  });

  it("rejects overlapping intervals on the same weekday", () => {
    const result = weeklyRulesSchema.safeParse([
      { weekday: 1, startMinute: 540, endMinute: 720 },
      { weekday: 1, startMinute: 600, endMinute: 900 },
    ]);
    expect(result.success).toBe(false);
  });

  it("does not reject overlapping minute ranges on different weekdays", () => {
    const result = weeklyRulesSchema.safeParse([
      { weekday: 1, startMinute: 540, endMinute: 720 },
      { weekday: 2, startMinute: 600, endMinute: 900 },
    ]);
    expect(result.success).toBe(true);
  });

  it("rejects an invalid weekday", () => {
    expect(weeklyRulesSchema.safeParse([{ weekday: 7, startMinute: 0, endMinute: 60 }]).success).toBe(false);
    expect(weeklyRulesSchema.safeParse([{ weekday: -1, startMinute: 0, endMinute: 60 }]).success).toBe(false);
  });
});

describe("dateOverrideInputSchema", () => {
  it("accepts null intervals (whole day unavailable)", () => {
    expect(dateOverrideInputSchema.safeParse({ date: "2026-09-04", intervals: null }).success).toBe(true);
  });

  it("accepts an empty array as unavailable too", () => {
    expect(dateOverrideInputSchema.safeParse({ date: "2026-09-04", intervals: [] }).success).toBe(true);
  });

  it("accepts a custom-hours override", () => {
    const result = dateOverrideInputSchema.safeParse({
      date: "2026-09-04",
      intervals: [{ startMinute: 600, endMinute: 840 }],
    });
    expect(result.success).toBe(true);
  });

  it("rejects overlapping intervals within the same override", () => {
    const result = dateOverrideInputSchema.safeParse({
      date: "2026-09-04",
      intervals: [
        { startMinute: 600, endMinute: 840 },
        { startMinute: 800, endMinute: 900 },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a malformed date", () => {
    expect(dateOverrideInputSchema.safeParse({ date: "09-04-2026", intervals: null }).success).toBe(false);
    expect(dateOverrideInputSchema.safeParse({ date: "2026-9-4", intervals: null }).success).toBe(false);
  });
});

describe("scheduleInputSchema", () => {
  function baseInput() {
    return {
      name: "Working hours",
      timezone: "America/New_York",
      rules: [{ weekday: 1, startMinute: 540, endMinute: 1020 }],
      overrides: [{ date: "2026-09-04", intervals: null }],
    };
  }

  it("accepts a well-formed schedule", () => {
    expect(scheduleInputSchema.safeParse(baseInput()).success).toBe(true);
  });

  it("rejects an empty name", () => {
    const result = scheduleInputSchema.safeParse({ ...baseInput(), name: "  " });
    expect(result.success).toBe(false);
  });

  it("rejects a name over 80 characters", () => {
    const result = scheduleInputSchema.safeParse({ ...baseInput(), name: "a".repeat(81) });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid time zone", () => {
    const result = scheduleInputSchema.safeParse({ ...baseInput(), timezone: "Not/AZone" });
    expect(result.success).toBe(false);
  });

  it("rejects duplicate override dates", () => {
    const result = scheduleInputSchema.safeParse({
      ...baseInput(),
      overrides: [
        { date: "2026-09-04", intervals: null },
        { date: "2026-09-04", intervals: [{ startMinute: 600, endMinute: 700 }] },
      ],
    });
    expect(result.success).toBe(false);
  });
});

describe("createScheduleSchema", () => {
  it("accepts just a name and timezone", () => {
    const result = createScheduleSchema.safeParse({ name: "New schedule", timezone: "UTC" });
    expect(result.success).toBe(true);
  });

  it("rejects a missing timezone", () => {
    expect(createScheduleSchema.safeParse({ name: "New schedule" }).success).toBe(false);
  });
});

describe("updateScheduleSchema", () => {
  it("requires rules and overrides arrays", () => {
    const result = updateScheduleSchema.safeParse({ name: "Working hours", timezone: "UTC" });
    expect(result.success).toBe(false);
  });

  it("accepts empty rules and overrides", () => {
    const result = updateScheduleSchema.safeParse({
      name: "Working hours",
      timezone: "UTC",
      rules: [],
      overrides: [],
    });
    expect(result.success).toBe(true);
  });
});
