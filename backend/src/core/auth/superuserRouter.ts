import { Hono } from "hono";
import type { Env } from "../../env.js";
import type { TokenPayload } from "../../auth/crypto.js";
import { authFlowRouter } from "./authFlowRouter.js";
import { managementRouter } from "./managementRouter.js";

/**
 * Superuser auth router — dashboard / admin panel authentication.
 *
 * Composer that mounts two sub-routers at `/`:
 *   - `authFlowRouter`   — login, magic-link, password reset, bootstrap
 *   - `managementRouter` — me, create, list, get, update, delete
 *
 * Public mount point: `/api/core/superusers/*`
 */

export const superuserAuthRouter = new Hono<{
  Bindings: Env;
  Variables: { user: TokenPayload | null };
}>();

superuserAuthRouter.route("/", authFlowRouter);
superuserAuthRouter.route("/", managementRouter);
