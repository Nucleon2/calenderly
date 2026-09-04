import { beforeEach, describe, expect, it } from "vitest";
import { rateLimit, resetRateLimits } from "@/lib/rate-limit";

describe("rateLimit", () => {
  beforeEach(() => resetRateLimits());

  it("allows up to the limit then blocks within the window", () => {
    const t0 = 1_000_000;
    const opts = { limit: 3, windowMs: 60_000 };
    expect(rateLimit("a", opts, t0).ok).toBe(true);
    expect(rateLimit("a", opts, t0 + 1).ok).toBe(true);
    expect(rateLimit("a", opts, t0 + 2).ok).toBe(true);
    const blocked = rateLimit("a", opts, t0 + 3);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterSeconds).toBe(60);
    expect(rateLimit("b", opts, t0 + 3).ok).toBe(true);
  });

  it("frees capacity once old hits leave the window", () => {
    const opts = { limit: 1, windowMs: 1000 };
    expect(rateLimit("k", opts, 0).ok).toBe(true);
    expect(rateLimit("k", opts, 999).ok).toBe(false);
    expect(rateLimit("k", opts, 1000).ok).toBe(true);
  });
});
