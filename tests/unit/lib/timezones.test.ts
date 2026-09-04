import { describe, expect, it } from "vitest";
import { detectBrowserTimezone, getTimezoneOptions } from "@/lib/timezones";

describe("getTimezoneOptions", () => {
  const now = new Date("2024-07-01T12:00:00Z");

  it("returns a non-empty list of options", () => {
    const options = getTimezoneOptions(now);
    expect(options.length).toBeGreaterThan(50);
  });

  it("includes UTC and a few well-known IANA zones", () => {
    const values = getTimezoneOptions(now).map((o) => o.value);
    expect(values).toContain("UTC");
    expect(values).toContain("America/New_York");
    expect(values).toContain("Europe/London");
    expect(values).toContain("Asia/Tokyo");
  });

  it("every option has a value and a non-empty label", () => {
    for (const option of getTimezoneOptions(now)) {
      expect(option.value.length).toBeGreaterThan(0);
      expect(option.label.length).toBeGreaterThan(0);
    }
  });

  it("labels include the zone name and a GMT offset", () => {
    const options = getTimezoneOptions(now);
    const newYork = options.find((o) => o.value === "America/New_York");
    expect(newYork).toBeDefined();
    expect(newYork?.label).toContain("America/New York");
    expect(newYork?.label).toMatch(/\(GMT[+-]\d/);
  });

  it("is sorted alphabetically by IANA value", () => {
    const values = getTimezoneOptions(now).map((o) => o.value);
    const sorted = [...values].sort((a, b) => a.localeCompare(b));
    expect(values).toEqual(sorted);
  });

  it("has no duplicate values", () => {
    const values = getTimezoneOptions(now).map((o) => o.value);
    expect(new Set(values).size).toBe(values.length);
  });
});

describe("detectBrowserTimezone", () => {
  it("returns a non-empty string", () => {
    const tz = detectBrowserTimezone();
    expect(typeof tz).toBe("string");
    expect(tz.length).toBeGreaterThan(0);
  });
});
