/**
 * RateLimiter — single Durable Object instance that tracks per-IP request
 * counts for rate limit rules.
 *
 * Uses an in-memory Map (no SQLite storage) because rate limit counters are
 * ephemeral — if the DO is evicted, counters simply reset (slightly more
 * permissive, never a security issue).
 *
 * The middleware calls this DO via fetch() with a JSON body:
 *   { ip: string, rules: [{ id, maxRequests, interval }] }
 *
 * Response:
 *   { allowed: true }
 *   { allowed: false, retryAfter: <seconds> }
 */

interface CounterEntry {
  count: number;
  resetAt: number; // epoch ms
}

interface CheckRequest {
  ip: string;
  rules: {
    id: string;
    maxRequests: number;
    interval: number; // seconds
  }[];
}

interface CheckResponse {
  allowed: boolean;
  retryAfter?: number;
}

export class RateLimiter implements DurableObject {
  /** Key: "ip:ruleId" → counter entry */
  private counters = new Map<string, CounterEntry>();

  constructor(private readonly state: DurableObjectState) {}

  async fetch(request: Request): Promise<Response> {
    let body: CheckRequest;
    try {
      body = (await request.json()) as CheckRequest;
    } catch {
      return Response.json({ allowed: true } satisfies CheckResponse);
    }

    if (!body.ip || !Array.isArray(body.rules) || body.rules.length === 0) {
      return Response.json({ allowed: true } satisfies CheckResponse);
    }

    const now = Date.now();
    let denied = false;
    let retryAfter = 0;

    for (const rule of body.rules) {
      const key = `${body.ip}:${rule.id}`;
      let entry = this.counters.get(key);

      // Expired or missing → start a fresh window.
      if (!entry || entry.resetAt <= now) {
        entry = { count: 0, resetAt: now + rule.interval * 1000 };
      }

      entry.count++;

      if (entry.count > rule.maxRequests) {
        denied = true;
        const wait = Math.ceil((entry.resetAt - now) / 1000);
        if (wait > retryAfter) retryAfter = wait;
      }

      this.counters.set(key, entry);
    }

    // Lazy GC — clean up expired entries every ~100 requests.
    if (this.counters.size > 500) {
      for (const [k, e] of this.counters) {
        if (e.resetAt <= now) this.counters.delete(k);
      }
    }

    const result: CheckResponse = denied
      ? { allowed: false, retryAfter: Math.max(1, retryAfter) }
      : { allowed: true };

    return Response.json(result);
  }
}
