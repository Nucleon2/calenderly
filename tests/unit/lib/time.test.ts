import { describe, expect, it } from "vitest";
import {
  addDays,
  compareLocalDate,
  dayOfWeekInTz,
  eachLocalDate,
  formatInTz,
  isValidTimeZone,
  localMinutesToUtc,
  todayInTz,
  tzOffsetLabel,
  utcToLocalDate,
  utcToLocalMinutes,
} from "@/lib/time";

describe("isValidTimeZone", () => {
  it("accepts real IANA zones and UTC", () => {
    expect(isValidTimeZone("America/New_York")).toBe(true);
    expect(isValidTimeZone("Europe/Berlin")).toBe(true);
    expect(isValidTimeZone("Australia/Sydney")).toBe(true);
    expect(isValidTimeZone("Asia/Kolkata")).toBe(true);
    expect(isValidTimeZone("UTC")).toBe(true);
  });

  it("rejects garbage zone names without throwing", () => {
    expect(isValidTimeZone("Not/AZone")).toBe(false);
    expect(isValidTimeZone("")).toBe(false);
    expect(isValidTimeZone("America/New York")).toBe(false);
  });
});

describe("localMinutesToUtc / utcToLocalDate / utcToLocalMinutes round trips", () => {
  const cases: { tz: string; date: string; minute: number; iso: string }[] = [
    { tz: "America/New_York", date: "2026-06-15", minute: 9 * 60, iso: "2026-06-15T13:00:00.000Z" },
    { tz: "Europe/Berlin", date: "2026-06-15", minute: 9 * 60, iso: "2026-06-15T07:00:00.000Z" },
    { tz: "Australia/Sydney", date: "2026-06-15", minute: 9 * 60, iso: "2026-06-14T23:00:00.000Z" },
    { tz: "Asia/Kolkata", date: "2026-06-15", minute: 9 * 60, iso: "2026-06-15T03:30:00.000Z" },
    { tz: "UTC", date: "2026-06-15", minute: 9 * 60, iso: "2026-06-15T09:00:00.000Z" },
  ];

  for (const { tz, date, minute, iso } of cases) {
    it(`round trips ${tz}`, () => {
      const instant = localMinutesToUtc(date, minute, tz);
      expect(instant).toEqual(new Date(iso));
      expect(utcToLocalDate(instant, tz)).toBe(date);
      expect(utcToLocalMinutes(instant, tz)).toBe(minute);
    });
  }
});

describe("DST: spring-forward gap times", () => {
  // Documented, empirically-observed behaviour: a non-existent wall-clock
  // time resolves by shifting FORWARD by the size of the gap, landing on
  // the same instant as the first valid post-transition wall-clock time.
  it("America/New_York 2026-03-08 02:30 (gap) resolves to 03:30 EDT, matching direct 03:30 construction", () => {
    const gap = localMinutesToUtc("2026-03-08", 2 * 60 + 30, "America/New_York");
    const direct = localMinutesToUtc("2026-03-08", 3 * 60 + 30, "America/New_York");
    expect(gap).toEqual(direct);
    expect(gap).toEqual(new Date("2026-03-08T07:30:00.000Z"));
  });

  it("Europe/Berlin 2026-03-29 02:30 (gap) resolves to 03:30 CEST, matching direct 03:30 construction", () => {
    const gap = localMinutesToUtc("2026-03-29", 2 * 60 + 30, "Europe/Berlin");
    const direct = localMinutesToUtc("2026-03-29", 3 * 60 + 30, "Europe/Berlin");
    expect(gap).toEqual(direct);
    expect(gap).toEqual(new Date("2026-03-29T01:30:00.000Z"));
  });

  it("Australia/Sydney 2026-10-04 02:30 (gap) resolves to 03:30 AEDT, matching direct 03:30 construction", () => {
    const gap = localMinutesToUtc("2026-10-04", 2 * 60 + 30, "Australia/Sydney");
    const direct = localMinutesToUtc("2026-10-04", 3 * 60 + 30, "Australia/Sydney");
    expect(gap).toEqual(direct);
    expect(gap).toEqual(new Date("2026-10-03T16:30:00.000Z"));
  });
});

describe("DST: fall-back ambiguous times resolve to a single, consistent instant", () => {
  // Documented, empirically-observed behaviour: for America/New_York the
  // ambiguous hour resolves to the FIRST (pre-transition, daylight/EDT)
  // occurrence. For Europe/Berlin and Australia/Sydney it resolves to the
  // SECOND (post-transition, standard) occurrence. This asymmetry comes
  // from the underlying Intl time zone data / TZDate resolution algorithm,
  // not from any rule this library imposes — hence "verify empirically."
  it("America/New_York 2026-11-01 01:30 (ambiguous) resolves to EDT (-04:00), the earlier occurrence", () => {
    const instant = localMinutesToUtc("2026-11-01", 1 * 60 + 30, "America/New_York");
    expect(instant).toEqual(new Date("2026-11-01T05:30:00.000Z"));
    // Deterministic: repeated calls agree.
    expect(localMinutesToUtc("2026-11-01", 1 * 60 + 30, "America/New_York")).toEqual(instant);
  });

  it("Europe/Berlin 2026-10-25 02:30 (ambiguous) resolves to CET (+01:00), the later occurrence", () => {
    const instant = localMinutesToUtc("2026-10-25", 2 * 60 + 30, "Europe/Berlin");
    expect(instant).toEqual(new Date("2026-10-25T01:30:00.000Z"));
    expect(localMinutesToUtc("2026-10-25", 2 * 60 + 30, "Europe/Berlin")).toEqual(instant);
  });

  it("Australia/Sydney 2026-04-05 02:30 (ambiguous) resolves to AEST (+10:00), the later occurrence", () => {
    const instant = localMinutesToUtc("2026-04-05", 2 * 60 + 30, "Australia/Sydney");
    expect(instant).toEqual(new Date("2026-04-04T16:30:00.000Z"));
    expect(localMinutesToUtc("2026-04-05", 2 * 60 + 30, "Australia/Sydney")).toEqual(instant);
  });
});

describe("minute === 1440 means midnight of the next day", () => {
  it("matches localMinutesToUtc(addDays(date,1), 0, tz) across a DST boundary", () => {
    const tz = "America/New_York";
    const date = "2026-03-08";
    expect(localMinutesToUtc(date, 1440, tz)).toEqual(localMinutesToUtc(addDays(date, 1), 0, tz));
  });

  it("matches on an ordinary day in several zones", () => {
    for (const tz of ["America/New_York", "Europe/Berlin", "Australia/Sydney", "Asia/Kolkata", "UTC"]) {
      const date = "2026-06-15";
      expect(localMinutesToUtc(date, 1440, tz)).toEqual(localMinutesToUtc(addDays(date, 1), 0, tz));
    }
  });
});

describe("dayOfWeekInTz", () => {
  it("computes weekday for the given calendar date directly (Thursday for 2026-01-01)", () => {
    expect(dayOfWeekInTz("2026-01-01", "Asia/Tokyo")).toBe(4);
  });

  it("is correct even when the UTC date differs from the local date", () => {
    // Tokyo 2026-01-01 00:30 local is 2025-12-31T15:30:00Z in UTC — a
    // naive UTC-based weekday computation on that instant would say
    // Wednesday, but the local calendar date 2026-01-01 is Thursday.
    const instant = localMinutesToUtc("2026-01-01", 30, "Asia/Tokyo");
    expect(instant).toEqual(new Date("2025-12-31T15:30:00.000Z"));
    expect(instant.getUTCDay()).toBe(3); // Wednesday in raw UTC
    expect(dayOfWeekInTz(utcToLocalDate(instant, "Asia/Tokyo"), "Asia/Tokyo")).toBe(4); // Thursday, in Tokyo
  });

  it("agrees with JS Date for a plain UTC date", () => {
    expect(dayOfWeekInTz("2026-01-01", "UTC")).toBe(new Date("2026-01-01T00:00:00Z").getUTCDay());
  });
});

describe("eachLocalDate", () => {
  it("returns every local date touched, inclusive of both ends, across a month boundary", () => {
    const start = new Date("2026-01-31T23:00:00Z");
    const end = new Date("2026-02-01T01:00:00Z");
    expect(eachLocalDate(start, end, "UTC")).toEqual(["2026-01-31", "2026-02-01"]);
  });

  it("returns every local date touched across a year boundary in a UTC+9 zone", () => {
    const start = new Date("2025-12-31T10:00:00Z"); // Tokyo 2025-12-31 19:00
    const end = new Date("2026-01-01T20:00:00Z"); // Tokyo 2026-01-02 05:00
    expect(eachLocalDate(start, end, "Asia/Tokyo")).toEqual(["2025-12-31", "2026-01-01", "2026-01-02"]);
  });

  it("returns a single date when start and end fall on the same local day", () => {
    const start = new Date("2026-06-15T01:00:00Z");
    const end = new Date("2026-06-15T02:00:00Z");
    expect(eachLocalDate(start, end, "UTC")).toEqual(["2026-06-15"]);
  });

  it("returns an empty array when start is after end", () => {
    expect(eachLocalDate(new Date("2026-06-16T00:00:00Z"), new Date("2026-06-15T00:00:00Z"), "UTC")).toEqual([]);
  });
});

describe("addDays / compareLocalDate", () => {
  it("adds days across month and year boundaries with pure calendar arithmetic", () => {
    expect(addDays("2026-01-31", 1)).toBe("2026-02-01");
    expect(addDays("2025-12-31", 1)).toBe("2026-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(addDays("2024-02-28", 1)).toBe("2024-02-29"); // leap year
  });

  it("compareLocalDate orders correctly", () => {
    expect(compareLocalDate("2026-01-01", "2026-01-02")).toBe(-1);
    expect(compareLocalDate("2026-01-02", "2026-01-01")).toBe(1);
    expect(compareLocalDate("2026-01-01", "2026-01-01")).toBe(0);
  });
});

describe("todayInTz", () => {
  it("returns the local date for `now` in the given zone", () => {
    // 2026-01-01T00:30:00Z is still 2025-12-31 in Los Angeles (UTC-8).
    expect(todayInTz(new Date("2026-01-01T00:30:00Z"), "America/Los_Angeles")).toBe("2025-12-31");
    expect(todayInTz(new Date("2026-01-01T00:30:00Z"), "UTC")).toBe("2026-01-01");
  });
});

describe("formatInTz / tzOffsetLabel", () => {
  it("formats an instant using the given zone and options", () => {
    const instant = new Date("2026-06-15T13:00:00Z");
    const formatted = formatInTz(instant, "America/New_York", { hour: "2-digit", minute: "2-digit", hour12: false });
    expect(formatted).toContain("09");
  });

  it("produces a GMT offset label, including half-hour zones", () => {
    expect(tzOffsetLabel(new Date("2026-06-15T00:00:00Z"), "America/New_York")).toBe("GMT-4");
    expect(tzOffsetLabel(new Date("2026-01-15T00:00:00Z"), "America/New_York")).toBe("GMT-5");
    expect(tzOffsetLabel(new Date("2026-06-15T00:00:00Z"), "Asia/Kolkata")).toBe("GMT+5:30");
    expect(tzOffsetLabel(new Date("2026-06-15T00:00:00Z"), "UTC")).toBe("GMT+0");
  });
});
