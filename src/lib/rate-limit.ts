/**
 * In-memory sliding-window rate limiter. Suitable for the single long-running
 * Node process this app is deployed as; horizontal scaling would need Redis.
 */
interface Bucket { hits: number[] }

const buckets = new Map<string, Bucket>();
let lastSweep = Date.now();

function sweep(now: number, windowMs: number) {
  if (now - lastSweep < windowMs) return;
  lastSweep = now;
  for (const [key, b] of buckets) {
    b.hits = b.hits.filter((t) => now - t < windowMs);
    if (b.hits.length === 0) buckets.delete(key);
  }
}

export interface RateLimitResult { ok: boolean; remaining: number; retryAfterSeconds: number }

export function rateLimit(key: string, opts: { limit: number; windowMs: number }, now = Date.now()): RateLimitResult {
  sweep(now, opts.windowMs);
  const bucket = buckets.get(key) ?? { hits: [] };
  bucket.hits = bucket.hits.filter((t) => now - t < opts.windowMs);
  if (bucket.hits.length >= opts.limit) {
    const oldest = bucket.hits[0]!;
    buckets.set(key, bucket);
    return { ok: false, remaining: 0, retryAfterSeconds: Math.ceil((oldest + opts.windowMs - now) / 1000) };
  }
  bucket.hits.push(now);
  buckets.set(key, bucket);
  return { ok: true, remaining: opts.limit - bucket.hits.length, retryAfterSeconds: 0 };
}

export function resetRateLimits() { buckets.clear(); }
