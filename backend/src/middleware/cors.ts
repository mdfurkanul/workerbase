/**
 * CORS middleware for split-Worker deployments.
 *
 * In single-Worker mode the dashboard is served from the same origin as
 * the API, so no CORS headers are needed. When the dashboard is deployed
 * to a different origin (a separate Worker or Cloudflare Pages), the
 * browser will block every fetch unless the API responds with appropriate
 * `Access-Control-Allow-*` headers and answers preflight `OPTIONS`.
 *
 * Allowed origins are resolved by `resolveCorsOrigins()`:
 *   1. `_settings.deploy.corsOrigins` (set from the Settings UI)
 *   2. `env.CORS_ORIGINS` (comma-separated)
 *   3. `env.DASHBOARD_URL` (single-origin fallback)
 * Same-origin requests skip the headers entirely (keeps the default
 * same-origin deploy unaffected and avoids needless echoes).
 *
 * Auth is bearer-token-in-localStorage — no cookies — so we don't set
 * `Access-Control-Allow-Credentials`. The `Authorization` header is
 * explicitly listed in `Allow-Headers`.
 */
import type { MiddlewareHandler } from "hono";
import type { Env } from "../env.js";
import { resolveCorsOrigins } from "../core/settings/deploymentSettings.js";

/** Methods the dashboard / API token clients use. */
const ALLOWED_METHODS = "GET, POST, PUT, PATCH, DELETE, OPTIONS";

/** Headers the dashboard sends (Authorization for JWTs, Content-Type for JSON bodies). */
const ALLOWED_HEADERS = "Authorization, Content-Type, Accept, X-Requested-With";

/** Headers the browser is allowed to expose to JS. */
const EXPOSED_HEADERS = "Content-Length, Content-Type";

/**
 * Echo back the request's `Origin` if it's in the allow-list. Returns
 * the `Access-Control-Allow-Origin` header value, or null if the origin
 * is not allowed (or no Origin header was sent — i.e. same-origin).
 */
function resolveAllowOrigin(
  originHeader: string | undefined,
  allowed: Set<string>,
): string | null {
  if (!originHeader || originHeader === "null") return null;
  const normalized = originHeader.replace(/\/$/, "");
  return allowed.has(normalized) ? normalized : null;
}

export const corsMiddleware: MiddlewareHandler<{ Bindings: Env }> = async (
  c,
  next,
) => {
  const originHeader = c.req.header("Origin");
  const allowed = await resolveCorsOrigins(c.env.SYSTEM_DB, c.env);
  const allowOrigin = resolveAllowOrigin(originHeader, allowed);

  // Preflight — short-circuit before downstream handlers.
  if (c.req.method === "OPTIONS") {
    // Always respond 204 to preflight; set headers only if origin is allowed.
    // If origin isn't allowed, still return 204 with no CORS headers — the
    // browser will block the actual request, which is the desired behavior.
    if (allowOrigin) {
      c.header("Access-Control-Allow-Origin", allowOrigin);
      c.header("Access-Control-Allow-Methods", ALLOWED_METHODS);
      c.header("Access-Control-Allow-Headers", ALLOWED_HEADERS);
      c.header("Access-Control-Max-Age", "86400");
      c.header("Access-Control-Expose-Headers", EXPOSED_HEADERS);
      c.header("Vary", "Origin");
    }
    return c.body(null, 204);
  }

  // Actual request — attach headers and continue.
  if (allowOrigin) {
    c.header("Access-Control-Allow-Origin", allowOrigin);
    c.header("Access-Control-Expose-Headers", EXPOSED_HEADERS);
    c.header("Vary", "Origin");
  }

  await next();
};
