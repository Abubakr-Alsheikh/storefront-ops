import type { Context } from "hono";

/**
 * A fixed-window counter per client, per function instance (DATA.md §5).
 * Serverless instances do not share memory, so the true ceiling is this
 * limit times the number of warm instances: enough to stop a runaway script
 * without a shared store, which is all a demo needs.
 */
export class RateLimiter {
  private readonly hits = new Map<string, { windowStart: number; count: number }>();
  private readonly limit: number;
  private readonly windowMs: number;

  constructor(limit: number, windowMs: number) {
    this.limit = limit;
    this.windowMs = windowMs;
  }

  /** Counts one hit; returns the seconds to wait when over the limit, or 0. */
  hit(key: string, now: number): number {
    const entry = this.hits.get(key);
    if (!entry || now - entry.windowStart >= this.windowMs) {
      this.hits.set(key, { windowStart: now, count: 1 });
      this.sweep(now);
      return 0;
    }
    entry.count++;
    if (entry.count <= this.limit) return 0;
    return Math.ceil((entry.windowStart + this.windowMs - now) / 1000);
  }

  /** Drops finished windows now and then, so the map cannot grow without bound. */
  private sweep(now: number) {
    if (this.hits.size < 1000) return;
    for (const [key, entry] of this.hits) {
      if (now - entry.windowStart >= this.windowMs) this.hits.delete(key);
    }
  }
}

/** The caller's address as Netlify (or a local proxy) reports it. */
export function clientKey(c: Context): string {
  return (
    c.req.header("x-nf-client-connection-ip") ??
    c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ??
    c.req.header("x-real-ip") ??
    "local"
  );
}
