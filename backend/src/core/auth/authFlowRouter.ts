import { Hono } from "hono";
import type { Env } from "../../env.js";
import type { TokenPayload } from "../../auth/crypto.js";
import { hashPassword, signToken, verifyPassword } from "../../auth/crypto.js";
import {
  createToken,
  consumeToken,
  EXPIRY_VERIFICATION_MS,
  EXPIRY_PASSWORD_RESET_MS,
  EXPIRY_MAGIC_LINK_MS,
} from "./superuserTokens.js";
import {
  loginSchema,
  magicRequestSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  createSuperuserSchema,
  normalizeRole,
} from "./superuserSchemas.js";
import { sendEmail } from "../../emails/sendEmail.js";

/**
 * Resolve the base URL that email action links should point at.
 *
 * In local dev the dashboard runs on the Vite dev server (e.g.
 * http://localhost:5173) because the Worker's serveStatic can't serve the
 * SPA bundle from `wrangler dev`. In production this is unset and we fall
 * back to the request origin — the Worker serves the built dashboard.
 */
function dashboardBaseURL(env: Env, reqURL: URL): string {
  return env.DASHBOARD_URL?.replace(/\/$/, "") ?? `${reqURL.origin}`;
}

/**
 * Auth-flow sub-router for the superuser auth routes.
 * Mounted at `/` of the composer `superuserRouter`.
 *
 * Routes:
 *   POST /login
 *   POST /magic-request
 *   GET  /magic-verify
 *   POST /forgot-password
 *   POST /reset-password
 *   POST /bootstrap
 */

export const authFlowRouter = new Hono<{
  Bindings: Env;
  Variables: { user: TokenPayload | null };
}>();

// ─────────────────────────────────────────────────────────────
//  POST /login — email + password
// ─────────────────────────────────────────────────────────────

authFlowRouter.post("/login", async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }

  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "validation_failed", issues: parsed.error.flatten() }, 400);
  }

  const { email, password } = parsed.data;
  const normalizedEmail = email.toLowerCase().trim();

  const row = await c.env.SYSTEM_DB.prepare(
    `SELECT id, email, password_hash, password_salt, role, verified FROM _superusers WHERE email = ?`,
  )
    .bind(normalizedEmail)
    .first<{
      id: string;
      email: string;
      password_hash: string;
      password_salt: string;
      role: string;
      verified: number;
    }>();

  if (!row) {
    return c.json({ error: "invalid_credentials" }, 401);
  }

  const ok = await verifyPassword(password, row.password_hash, row.password_salt);
  if (!ok) {
    return c.json({ error: "invalid_credentials" }, 401);
  }

  const role = normalizeRole(row.role);
  const token = await signToken({ sub: row.id, email: row.email, role }, c.env.AUTH_SECRET);
  return c.json({
    user: { id: row.id, email: row.email, role, verified: row.verified === 1 },
    token,
  });
});

// ─────────────────────────────────────────────────────────────
//  POST /magic-request — send magic link
// ─────────────────────────────────────────────────────────────

authFlowRouter.post("/magic-request", async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }

  const parsed = magicRequestSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "validation_failed", issues: parsed.error.flatten() }, 400);
  }

  const normalizedEmail = parsed.data.email.toLowerCase().trim();

  const row = await c.env.SYSTEM_DB.prepare(`SELECT id, email FROM _superusers WHERE email = ?`)
    .bind(normalizedEmail)
    .first<{ id: string; email: string }>();

  // Always return 200 to avoid leaking which emails exist.
  if (!row) {
    return c.json({ success: true });
  }

  const { value } = await createToken(
    c.env.SYSTEM_DB,
    row.id,
    "verification",
    EXPIRY_MAGIC_LINK_MS,
  );

  const url = new URL(c.req.url);
  const actionURL = `${dashboardBaseURL(c.env, url)}/magic-login?token=${value}`;

  // Always attempt delivery via the Email Service binding (simulated
  // locally — wrangler logs the content to the console). Also keep a
  // dev-only console log so the token is visible without digging through
  // the simulated email files.
  c.executionCtx.waitUntil(
    sendEmail(c.env, {
      to: row.email,
      template: "magicLink",
      vars: { email: row.email, actionURL },
    }),
  );

  if (c.env.ENVIRONMENT === "local") {
    console.log(`[dev-only] magic-link for ${row.email}: ${actionURL}`);
  }

  return c.json({ success: true });
});

// ─────────────────────────────────────────────────────────────
//  GET /magic-verify — verify magic link token
// ─────────────────────────────────────────────────────────────

authFlowRouter.get("/magic-verify", async (c) => {
  const tokenValue = c.req.query("token");
  if (!tokenValue) {
    return c.json({ error: "missing_token" }, 400);
  }

  const result = await consumeToken(c.env.SYSTEM_DB, tokenValue, "verification");
  if (!result) {
    return c.json({ error: "invalid_or_expired_token" }, 401);
  }

  const row = await c.env.SYSTEM_DB.prepare(
    `SELECT id, email, role, verified FROM _superusers WHERE id = ?`,
  )
    .bind(result.recordRef)
    .first<{ id: string; email: string; role: string; verified: number }>();

  if (!row) {
    return c.json({ error: "user_not_found" }, 404);
  }

  // Mark the superuser as verified if they weren't already.
  if (row.verified !== 1) {
    await c.env.SYSTEM_DB.prepare(`UPDATE _superusers SET verified = 1, updated_at = ? WHERE id = ?`)
      .bind(Date.now(), row.id)
      .run();
  }

  const role = normalizeRole(row.role);
  const sessionToken = await signToken({ sub: row.id, email: row.email, role }, c.env.AUTH_SECRET);
  return c.json({
    user: { id: row.id, email: row.email, role, verified: true },
    token: sessionToken,
  });
});

// ─────────────────────────────────────────────────────────────
//  POST /forgot-password — create reset token
// ─────────────────────────────────────────────────────────────

authFlowRouter.post("/forgot-password", async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }

  const parsed = forgotPasswordSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "validation_failed", issues: parsed.error.flatten() }, 400);
  }

  const normalizedEmail = parsed.data.email.toLowerCase().trim();

  const row = await c.env.SYSTEM_DB.prepare(`SELECT id, email FROM _superusers WHERE email = ?`)
    .bind(normalizedEmail)
    .first<{ id: string; email: string }>();

  // Always 200 — don't leak whether the email is registered.
  if (!row) {
    return c.json({ success: true });
  }

  const { value } = await createToken(
    c.env.SYSTEM_DB,
    row.id,
    "passwordReset",
    EXPIRY_PASSWORD_RESET_MS,
  );

  const url = new URL(c.req.url);
  const actionURL = `${dashboardBaseURL(c.env, url)}/reset-password?token=${value}`;

  c.executionCtx.waitUntil(
    sendEmail(c.env, {
      to: row.email,
      template: "resetPassword",
      vars: { email: row.email, actionURL },
    }),
  );

  if (c.env.ENVIRONMENT === "local") {
    console.log(`[dev-only] password-reset for ${row.email}: ${actionURL}`);
  }

  return c.json({ success: true });
});

// ─────────────────────────────────────────────────────────────
//  POST /reset-password — reset with token
// ─────────────────────────────────────────────────────────────

authFlowRouter.post("/reset-password", async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }

  const parsed = resetPasswordSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "validation_failed", issues: parsed.error.flatten() }, 400);
  }

  const { token, password } = parsed.data;

  const result = await consumeToken(c.env.SYSTEM_DB, token, "passwordReset");
  if (!result) {
    return c.json({ error: "invalid_or_expired_token" }, 401);
  }

  const row = await c.env.SYSTEM_DB.prepare(
    `SELECT id, email, role FROM _superusers WHERE id = ?`,
  )
    .bind(result.recordRef)
    .first<{ id: string; email: string; role: string }>();

  if (!row) {
    return c.json({ error: "user_not_found" }, 404);
  }

  const { hash, salt } = await hashPassword(password);
  const now = Date.now();

  await c.env.SYSTEM_DB.prepare(
    `UPDATE _superusers SET password_hash = ?, password_salt = ?, updated_at = ? WHERE id = ?`,
  )
    .bind(hash, salt, now, row.id)
    .run();

  const role = normalizeRole(row.role);
  const sessionToken = await signToken({ sub: row.id, email: row.email, role }, c.env.AUTH_SECRET);
  return c.json({
    user: { id: row.id, email: row.email, role },
    token: sessionToken,
  });
});

// ─────────────────────────────────────────────────────────────
//  POST /bootstrap — create the first superuser.
//  Disabled once any superuser exists.  No auth required.
// ─────────────────────────────────────────────────────────────

authFlowRouter.post("/bootstrap", async (c) => {
  // Read body as text then parse — avoids stream issues in Wrangler local dev.
  let body: unknown;
  try {
    const raw = await c.req.text();
    body = raw ? JSON.parse(raw) : {};
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }

  // Refuse if any superuser already exists.
  const existing = await c.env.SYSTEM_DB.prepare(`SELECT COUNT(*) as cnt FROM _superusers`)
    .first<{ cnt: number }>();
  if (existing && existing.cnt > 0) {
    return c.json({ error: "bootstrap_disabled", message: "Superusers already exist." }, 403);
  }

  const parsed = createSuperuserSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "validation_failed", issues: parsed.error.flatten() }, 400);
  }

  const { email, password } = parsed.data;
  const normalizedEmail = email.toLowerCase().trim();
  const { hash, salt } = await hashPassword(password);
  const id = crypto.randomUUID();
  const now = Date.now();

  await c.env.SYSTEM_DB.prepare(
    `INSERT INTO _superusers (id, email, password_hash, password_salt, token_key, role, verified, created_at, updated_at)
     VALUES (?, ?, ?, ?, '', 'admin', 1, ?, ?)`,
  )
    .bind(id, normalizedEmail, hash, salt, now, now)
    .run();

  const token = await signToken({ sub: id, email: normalizedEmail, role: "admin" }, c.env.AUTH_SECRET);
  return c.json(
    { user: { id, email: normalizedEmail, role: "admin", verified: true }, token },
    201,
  );
});
