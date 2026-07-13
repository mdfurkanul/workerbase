/**
 * Rate limiting middleware for Hono.
 *
 * Reads the `rateLimit` setting from `_settings`, matches the request path
 * against configured rules, and calls the `RateLimiter` Durable Object to
 * check/increment counters. Returns 429 when a rule is exceeded.
 *
 * Config is cached in-memory for 30 seconds to avoid a D1 read on every
 * request.
 */

import type { MiddlewareHandler } from "hono";
import type { Env } from "../env.js";
import { matchRule } from "./matchRule.js";

export interface RateLimitRule {
  id: string;
  label: string;
  maxRequests: number;
  interval: number; // seconds
  target: string; // "all" | "anonymous" | "authenticated"
}

export interface RateLimitConfig {
  enabled: boolean;
  rules: RateLimitRule[];
}

// ── In-memory config cache ─────────────────────────────────────────
let cachedConfig: RateLimitConfig | null = null;
let cachedAt = 0;
const CACHE_TTL_MS = 30_000; // 30 seconds

async function loadConfig(env: Env): Promise<RateLimitConfig> {
  if (cachedConfig && Date.now() - cachedAt < CACHE_TTL_MS) {
    return cachedConfig;
  }

  try {
    const row = await env.SYSTEM_DB
      .prepare(`SELECT value FROM _settings WHERE key = 'rateLimit'`)
      .first<{ value: string | null }>();

    if (row?.value) {
      const parsed = JSON.parse(row.value) as RateLimitConfig;
      if (parsed && typeof parsed.enabled === "boolean" && Array.isArray(parsed.rules)) {
        cachedConfig = parsed;
        cachedAt = Date.now();
        return parsed;
      }
    }
  } catch {
    // fall through to default
  }

  cachedConfig = { enabled: false, rules: [] };
  cachedAt = Date.now();
  return cachedConfig;
}

/** Force a cache invalidation (called after settings PATCH if needed). */
export function invalidateRateLimitCache(): void {
  cachedConfig = null;
}

// ── IP extraction ──────────────────────────────────────────────────

function getClientIP(c: Parameters<MiddlewareHandler<{ Bindings: Env }>>[0]): string {
  // CF-Connecting-IP is set by Cloudflare and is trustworthy on the edge.
  // X-Forwarded-For is client-controlled and only honored in local dev (where
  // there is no Cloudflare in front). In production we fall back to "unknown"
  // rather than trusting a spoofable header.
  const cfIP = c.req.header("CF-Connecting-IP");
  if (cfIP) return cfIP;
  if (c.env.ENVIRONMENT === "local") {
    return c.req.header("X-Forwarded-For")?.split(",")[0]?.trim() || "unknown";
  }
  return "unknown";
}

// ── Middleware ─────────────────────────────────────────────────────

export const rateLimitMiddleware: MiddlewareHandler<{ Bindings: Env }> = async (c, next) => {
  // Only rate-limit API paths.
  const path = c.req.path;
  if (!path.startsWith("/api/")) {
    return next();
  }

  const config = await loadConfig(c.env);
  if (!config.enabled || config.rules.length === 0) {
    return next();
  }

  const method = c.req.method;
  const matchedRules = config.rules.filter((r) => matchRule(r.label, path, method));
  if (matchedRules.length === 0) {
    return next();
  }

  const ip = getClientIP(c);

  // Call the RateLimiter DO.
  let result: { allowed: boolean; retryAfter?: number };
  try {
    const stub = c.env.RATE_LIMITER.get(c.env.RATE_LIMITER.idFromName("global"));
    const res = await stub.fetch(new Request("https://internal/check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ip,
        rules: matchedRules.map((r) => ({
          id: r.id,
          maxRequests: r.maxRequests,
          interval: r.interval,
        })),
      }),
    }));
    result = await res.json() as { allowed: boolean; retryAfter?: number };
  } catch {
    // If the DO call fails, fail open (allow the request).
    return next();
  }

  if (!result.allowed) {
    const retryAfter = result.retryAfter ?? 1;
    return c.json(
      {
        error: "rate_limited",
        detail: `Too many requests. Try again in ${retryAfter} second${retryAfter === 1 ? "" : "s"}.`,
        retryAfter,
      },
      429,
      { "Retry-After": String(retryAfter) },
    );
  }

  return next();
};
