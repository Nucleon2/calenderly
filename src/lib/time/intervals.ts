/**
 * Half-open UTC-instant interval arithmetic: `[start, end)`.
 *
 * Pure, framework-free, and independent of any time zone — everything here
 * operates on absolute instants (`Date`).
 */

export interface Interval {
  start: Date;
  end: Date;
}

export function isValidInterval(i: Interval): boolean {
  return i.start.getTime() < i.end.getTime();
}

export function overlaps(a: Interval, b: Interval): boolean {
  return a.start.getTime() < b.end.getTime() && b.start.getTime() < a.end.getTime();
}

/** Sorts, then merges overlapping AND touching intervals. Does not mutate input. */
export function mergeIntervals(xs: Interval[]): Interval[] {
  const sorted = [...xs].sort((a, b) => a.start.getTime() - b.start.getTime());
  const result: Interval[] = [];
  for (const cur of sorted) {
    const last = result[result.length - 1];
    if (last && cur.start.getTime() <= last.end.getTime()) {
      if (cur.end.getTime() > last.end.getTime()) {
        result[result.length - 1] = { start: last.start, end: cur.end };
      }
    } else {
      result.push({ start: cur.start, end: cur.end });
    }
  }
  return result;
}

/** `base` minus `busy`, sorted ascending. Both inputs may be unsorted/overlapping. */
export function subtractIntervals(base: Interval[], busy: Interval[]): Interval[] {
  const mergedBusy = mergeIntervals(busy);
  const result: Interval[] = [];
  for (const b of mergeIntervals(base)) {
    let cursor = b.start.getTime();
    const bEnd = b.end.getTime();
    for (const busyInterval of mergedBusy) {
      const bs = busyInterval.start.getTime();
      const be = busyInterval.end.getTime();
      if (be <= cursor) continue; // busy interval entirely before cursor
      if (bs >= bEnd) break; // busy interval (and all after, sorted) start after base ends
      if (bs > cursor) {
        result.push({ start: new Date(cursor), end: new Date(bs) });
      }
      cursor = Math.max(cursor, be);
      if (cursor >= bEnd) break;
    }
    if (cursor < bEnd) {
      result.push({ start: new Date(cursor), end: new Date(bEnd) });
    }
  }
  return result;
}

export function intersectIntervals(a: Interval[], b: Interval[]): Interval[] {
  const as = mergeIntervals(a);
  const bs = mergeIntervals(b);
  const result: Interval[] = [];
  let i = 0;
  let j = 0;
  while (i < as.length && j < bs.length) {
    const start = Math.max(as[i].start.getTime(), bs[j].start.getTime());
    const end = Math.min(as[i].end.getTime(), bs[j].end.getTime());
    if (start < end) {
      result.push({ start: new Date(start), end: new Date(end) });
    }
    if (as[i].end.getTime() < bs[j].end.getTime()) {
      i += 1;
    } else {
      j += 1;
    }
  }
  return result;
}

export function expandInterval(i: Interval, beforeMinutes: number, afterMinutes: number): Interval {
  return {
    start: new Date(i.start.getTime() - beforeMinutes * 60_000),
    end: new Date(i.end.getTime() + afterMinutes * 60_000),
  };
}

/** Clamps `i` to `bounds`. Returns null if the result would be empty/inverted. */
export function clampInterval(i: Interval, bounds: Interval): Interval | null {
  const start = Math.max(i.start.getTime(), bounds.start.getTime());
  const end = Math.min(i.end.getTime(), bounds.end.getTime());
  if (start >= end) return null;
  return { start: new Date(start), end: new Date(end) };
}

export function containsInterval(outer: Interval, inner: Interval): boolean {
  return outer.start.getTime() <= inner.start.getTime() && inner.end.getTime() <= outer.end.getTime();
}
