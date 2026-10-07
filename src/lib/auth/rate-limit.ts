/**
 * In-memory sliding-window limiter for login attempts, keyed by IP + email.
 * Per-process only (fine for the single VPS node; move to a shared store if we ever scale out).
 */
export interface RateLimiterOptions {
  max: number;
  windowMs: number;
  now?: () => number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  /** Seconds until the oldest counted attempt expires (only meaningful when blocked). */
  retryAfterSec: number;
}

export function createRateLimiter({ max, windowMs, now = Date.now }: RateLimiterOptions) {
  const hits = new Map<string, number[]>();

  const live = (key: string): number[] => {
    const cutoff = now() - windowMs;
    const list = (hits.get(key) ?? []).filter((t) => t > cutoff);
    if (list.length) hits.set(key, list);
    else hits.delete(key);
    return list;
  };

  const result = (list: number[]): RateLimitResult => ({
    allowed: list.length < max,
    remaining: Math.max(0, max - list.length),
    retryAfterSec: list.length >= max ? Math.max(1, Math.ceil((list[0] + windowMs - now()) / 1000)) : 0,
  });

  return {
    /** Read-only check: is another attempt allowed right now? */
    check: (key: string): RateLimitResult => result(live(key)),
    /** Record a failed attempt. */
    fail: (key: string): RateLimitResult => {
      const list = live(key);
      list.push(now());
      hits.set(key, list);
      return result(list);
    },
    /** Clear after a successful sign-in. */
    reset: (key: string) => void hits.delete(key),
    size: () => hits.size,
  };
}

export const loginKey = (ip: string, email: string) => `${ip}|${email.trim().toLowerCase()}`;

/** Shared limiter for the login action: 5 failed attempts per 15 minutes per IP + email. */
export const loginLimiter = createRateLimiter({ max: 5, windowMs: 15 * 60 * 1000 });
