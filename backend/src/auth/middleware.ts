import type { Context, MiddlewareHandler } from "hono";
import type { Env } from "../env.js";
import { verifyToken, type TokenPayload } from "./crypto.js";
import type { SuperuserRole } from "../db/schema.js";

export type AuthVars = { user: TokenPayload | null };

/**
 * Require a valid `Authorization: Bearer <token>` header.
 * On success, attaches the decoded payload to `c.set("user", payload)`.
 * On failure, returns 401.
 */
export const requireAuth: MiddlewareHandler<{
  Bindings: Env;
  Variables: AuthVars;
}> = async (c, next) => {
  const header = c.req.header("Authorization") ?? "";
  const m = header.match(/^Bearer\s+(.+)$/i);
  if (!m) {
    return c.json({ error: "missing_bearer_token" }, 401);
  }
  const payload = await verifyToken(m[1]!, c.env.AUTH_SECRET);
  if (!payload) {
    return c.json({ error: "invalid_or_expired_token" }, 401);
  }
  c.set("user", payload);
  await next();
};

/**
 * Optional variant — attaches `user` if a valid token is present, but does not
 * reject anonymous requests.
 */
export const optionalAuth: MiddlewareHandler<{
  Bindings: Env;
  Variables: AuthVars;
}> = async (c, next) => {
  const header = c.req.header("Authorization") ?? "";
  const m = header.match(/^Bearer\s+(.+)$/i);
  if (m) {
    const payload = await verifyToken(m[1]!, c.env.AUTH_SECRET);
    if (payload) c.set("user", payload);
  }
  await next();
};

/** Convenience helper to read the current user (or null) inside a handler. */
export function currentUser(
  c: Context<{ Bindings: Env; Variables: AuthVars }>,
): TokenPayload | null {
  return c.get("user");
}

/**
 * Require that the authenticated user has one of `allowed` roles.
 *
 * Must run AFTER `requireAuth` (which sets `c.get("user")`). Returns 403
 * `{ error: "insufficient_role" }` if the user's role is not permitted.
 */
export function requireRole(
  ...allowed: SuperuserRole[]
): MiddlewareHandler<{
  Bindings: Env;
  Variables: AuthVars;
}> {
  const allowedSet = new Set(allowed);
  return async (c, next) => {
    const user = c.get("user");
    // requireAuth should already have run — defend against misuse.
    if (!user) {
      return c.json({ error: "unauthorized" }, 401);
    }
    if (!allowedSet.has(user.role)) {
      return c.json({ error: "insufficient_role" }, 403);
    }
    await next();
  };
}
