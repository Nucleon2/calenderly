import { describe, expect, it } from "vitest";
import {
  clampInterval,
  containsInterval,
  expandInterval,
  intersectIntervals,
  isValidInterval,
  mergeIntervals,
  overlaps,
  subtractIntervals,
  type Interval,
} from "@/lib/time/intervals";

function iv(startIso: string, endIso: string): Interval {
  return { start: new Date(startIso), end: new Date(endIso) };
}

describe("isValidInterval", () => {
  it("true when start < end", () => {
    expect(isValidInterval(iv("2026-01-01T09:00:00Z", "2026-01-01T09:30:00Z"))).toBe(true);
  });

  it("false when start === end or start > end", () => {
    expect(isValidInterval(iv("2026-01-01T09:00:00Z", "2026-01-01T09:00:00Z"))).toBe(false);
    expect(isValidInterval(iv("2026-01-01T09:30:00Z", "2026-01-01T09:00:00Z"))).toBe(false);
  });
});

describe("overlaps", () => {
  it("true for overlapping intervals", () => {
    expect(overlaps(iv("2026-01-01T09:00:00Z", "2026-01-01T10:00:00Z"), iv("2026-01-01T09:30:00Z", "2026-01-01T10:30:00Z"))).toBe(true);
  });

  it("false for touching (half-open, adjacent) intervals", () => {
    expect(overlaps(iv("2026-01-01T09:00:00Z", "2026-01-01T10:00:00Z"), iv("2026-01-01T10:00:00Z", "2026-01-01T11:00:00Z"))).toBe(false);
  });

  it("false for disjoint intervals, order-independent", () => {
    expect(overlaps(iv("2026-01-01T09:00:00Z", "2026-01-01T10:00:00Z"), iv("2026-01-01T11:00:00Z", "2026-01-01T12:00:00Z"))).toBe(false);
    expect(overlaps(iv("2026-01-01T11:00:00Z", "2026-01-01T12:00:00Z"), iv("2026-01-01T09:00:00Z", "2026-01-01T10:00:00Z"))).toBe(false);
  });
});

describe("mergeIntervals", () => {
  it("merges overlapping intervals", () => {
    const result = mergeIntervals([
      iv("2026-01-01T09:00:00Z", "2026-01-01T10:00:00Z"),
      iv("2026-01-01T09:30:00Z", "2026-01-01T11:00:00Z"),
    ]);
    expect(result).toEqual([iv("2026-01-01T09:00:00Z", "2026-01-01T11:00:00Z")]);
  });

  it("merges touching intervals", () => {
    const result = mergeIntervals([
      iv("2026-01-01T09:00:00Z", "2026-01-01T10:00:00Z"),
      iv("2026-01-01T10:00:00Z", "2026-01-01T11:00:00Z"),
    ]);
    expect(result).toEqual([iv("2026-01-01T09:00:00Z", "2026-01-01T11:00:00Z")]);
  });

  it("sorts unsorted input before merging", () => {
    const result = mergeIntervals([
      iv("2026-01-01T11:00:00Z", "2026-01-01T12:00:00Z"),
      iv("2026-01-01T09:00:00Z", "2026-01-01T10:00:00Z"),
      iv("2026-01-01T09:30:00Z", "2026-01-01T09:45:00Z"),
    ]);
    expect(result).toEqual([iv("2026-01-01T09:00:00Z", "2026-01-01T10:00:00Z"), iv("2026-01-01T11:00:00Z", "2026-01-01T12:00:00Z")]);
  });

  it("returns an empty array for empty input, and does not mutate its argument", () => {
    expect(mergeIntervals([])).toEqual([]);
    const input = [iv("2026-01-01T09:00:00Z", "2026-01-01T10:00:00Z"), iv("2026-01-01T08:00:00Z", "2026-01-01T08:30:00Z")];
    const copy = input.map((i) => ({ ...i }));
    mergeIntervals(input);
    expect(input).toEqual(copy);
  });
});

describe("subtractIntervals", () => {
  it("removes a partial overlap from the start", () => {
    const result = subtractIntervals([iv("2026-01-01T09:00:00Z", "2026-01-01T10:00:00Z")], [iv("2026-01-01T08:30:00Z", "2026-01-01T09:30:00Z")]);
    expect(result).toEqual([iv("2026-01-01T09:30:00Z", "2026-01-01T10:00:00Z")]);
  });

  it("removes a partial overlap from the end", () => {
    const result = subtractIntervals([iv("2026-01-01T09:00:00Z", "2026-01-01T10:00:00Z")], [iv("2026-01-01T09:30:00Z", "2026-01-01T10:30:00Z")]);
    expect(result).toEqual([iv("2026-01-01T09:00:00Z", "2026-01-01T09:30:00Z")]);
  });

  it("removes the entire base interval when fully covered", () => {
    const result = subtractIntervals([iv("2026-01-01T09:00:00Z", "2026-01-01T10:00:00Z")], [iv("2026-01-01T08:00:00Z", "2026-01-01T11:00:00Z")]);
    expect(result).toEqual([]);
  });

  it("splits the base interval in two when busy is fully inside it", () => {
    const result = subtractIntervals([iv("2026-01-01T09:00:00Z", "2026-01-01T11:00:00Z")], [iv("2026-01-01T09:30:00Z", "2026-01-01T10:00:00Z")]);
    expect(result).toEqual([iv("2026-01-01T09:00:00Z", "2026-01-01T09:30:00Z"), iv("2026-01-01T10:00:00Z", "2026-01-01T11:00:00Z")]);
  });

  it("subtracts multiple busy intervals", () => {
    const result = subtractIntervals(
      [iv("2026-01-01T09:00:00Z", "2026-01-01T12:00:00Z")],
      [iv("2026-01-01T09:30:00Z", "2026-01-01T10:00:00Z"), iv("2026-01-01T10:30:00Z", "2026-01-01T11:00:00Z")],
    );
    expect(result).toEqual([
      iv("2026-01-01T09:00:00Z", "2026-01-01T09:30:00Z"),
      iv("2026-01-01T10:00:00Z", "2026-01-01T10:30:00Z"),
      iv("2026-01-01T11:00:00Z", "2026-01-01T12:00:00Z"),
    ]);
  });

  it("returns the base unchanged when there is no overlap", () => {
    const base = [iv("2026-01-01T09:00:00Z", "2026-01-01T10:00:00Z")];
    const result = subtractIntervals(base, [iv("2026-01-01T11:00:00Z", "2026-01-01T12:00:00Z")]);
    expect(result).toEqual(base);
  });

  it("handles multiple base intervals against multiple busy intervals", () => {
    const result = subtractIntervals(
      [iv("2026-01-01T09:00:00Z", "2026-01-01T10:00:00Z"), iv("2026-01-01T13:00:00Z", "2026-01-01T14:00:00Z")],
      [iv("2026-01-01T09:15:00Z", "2026-01-01T09:45:00Z"), iv("2026-01-01T13:30:00Z", "2026-01-01T15:00:00Z")],
    );
    expect(result).toEqual([
      iv("2026-01-01T09:00:00Z", "2026-01-01T09:15:00Z"),
      iv("2026-01-01T09:45:00Z", "2026-01-01T10:00:00Z"),
      iv("2026-01-01T13:00:00Z", "2026-01-01T13:30:00Z"),
    ]);
  });
});

describe("intersectIntervals", () => {
  it("returns overlapping portions of two lists", () => {
    const result = intersectIntervals(
      [iv("2026-01-01T09:00:00Z", "2026-01-01T12:00:00Z")],
      [iv("2026-01-01T10:00:00Z", "2026-01-01T11:00:00Z"), iv("2026-01-01T11:30:00Z", "2026-01-01T13:00:00Z")],
    );
    expect(result).toEqual([iv("2026-01-01T10:00:00Z", "2026-01-01T11:00:00Z"), iv("2026-01-01T11:30:00Z", "2026-01-01T12:00:00Z")]);
  });

  it("returns an empty array when there is no overlap", () => {
    expect(intersectIntervals([iv("2026-01-01T09:00:00Z", "2026-01-01T10:00:00Z")], [iv("2026-01-01T11:00:00Z", "2026-01-01T12:00:00Z")])).toEqual([]);
  });

  it("returns an empty array when either list is empty", () => {
    expect(intersectIntervals([], [iv("2026-01-01T09:00:00Z", "2026-01-01T10:00:00Z")])).toEqual([]);
    expect(intersectIntervals([iv("2026-01-01T09:00:00Z", "2026-01-01T10:00:00Z")], [])).toEqual([]);
  });
});

describe("expandInterval", () => {
  it("pads start and end independently", () => {
    const result = expandInterval(iv("2026-01-01T09:00:00Z", "2026-01-01T09:30:00Z"), 15, 30);
    expect(result).toEqual(iv("2026-01-01T08:45:00Z", "2026-01-01T10:00:00Z"));
  });

  it("supports zero padding on either side", () => {
    const result = expandInterval(iv("2026-01-01T09:00:00Z", "2026-01-01T09:30:00Z"), 0, 10);
    expect(result).toEqual(iv("2026-01-01T09:00:00Z", "2026-01-01T09:40:00Z"));
  });
});

describe("clampInterval", () => {
  it("clamps to bounds when partially outside", () => {
    const result = clampInterval(iv("2026-01-01T08:00:00Z", "2026-01-01T10:00:00Z"), iv("2026-01-01T09:00:00Z", "2026-01-01T11:00:00Z"));
    expect(result).toEqual(iv("2026-01-01T09:00:00Z", "2026-01-01T10:00:00Z"));
  });

  it("returns the interval unchanged when fully inside bounds", () => {
    const inner = iv("2026-01-01T09:00:00Z", "2026-01-01T10:00:00Z");
    expect(clampInterval(inner, iv("2026-01-01T08:00:00Z", "2026-01-01T11:00:00Z"))).toEqual(inner);
  });

  it("returns null when entirely outside bounds", () => {
    expect(clampInterval(iv("2026-01-01T06:00:00Z", "2026-01-01T07:00:00Z"), iv("2026-01-01T09:00:00Z", "2026-01-01T10:00:00Z"))).toBeNull();
  });

  it("returns null when clamping would produce a zero-length interval", () => {
    expect(clampInterval(iv("2026-01-01T09:00:00Z", "2026-01-01T10:00:00Z"), iv("2026-01-01T10:00:00Z", "2026-01-01T11:00:00Z"))).toBeNull();
  });
});

describe("containsInterval", () => {
  it("true when inner is fully within outer, including touching boundaries", () => {
    expect(containsInterval(iv("2026-01-01T09:00:00Z", "2026-01-01T11:00:00Z"), iv("2026-01-01T09:00:00Z", "2026-01-01T11:00:00Z"))).toBe(true);
    expect(containsInterval(iv("2026-01-01T09:00:00Z", "2026-01-01T11:00:00Z"), iv("2026-01-01T09:30:00Z", "2026-01-01T10:30:00Z"))).toBe(true);
  });

  it("false when inner extends outside outer", () => {
    expect(containsInterval(iv("2026-01-01T09:00:00Z", "2026-01-01T11:00:00Z"), iv("2026-01-01T08:30:00Z", "2026-01-01T10:00:00Z"))).toBe(false);
    expect(containsInterval(iv("2026-01-01T09:00:00Z", "2026-01-01T11:00:00Z"), iv("2026-01-01T10:00:00Z", "2026-01-01T11:30:00Z"))).toBe(false);
  });
});
