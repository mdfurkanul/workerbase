import { Hono } from "hono";
import { z } from "zod";
import type { Env } from "../../env.js";
import {
  hashPassword,
  hashTokenValue,
  signToken,
  verifyPassword,
  type TokenPayload,
} from "../../auth/crypto.js";
import { requireAuth } from "../../auth/middleware.js";

/**
 * Superuser auth router — dashboard / admin panel authentication.
 *
 * Endpoints:
 *   POST   /api/superusers/login             — email + password
 *   POST   /api/superusers/magic-request     — request magic link
 *   GET    /api/superusers/magic-verify      — verify magic link token
 *   POST   /api/superusers/forgot-password   — request password reset
 *   POST   /api/superusers/reset-password    — reset password with token
 *   GET    /api/superusers/me                — current superuser (auth)
 *   POST   /api/superusers/create             — create new superuser (auth)
 */

// Token expiry in milliseconds.
const EXPIRY_VERIFICATION_MS = 30 * 60 * 1000; // 30 minutes
const EXPIRY_PASSWORD_RESET_MS = 30 * 60 * 1000; // 30 minutes
const EXPIRY_MAGIC_LINK_MS = 30 * 60 * 1000; // 30 minutes

// ─────────────────────────────────────────────────────────────
//  Zod validation schemas
// ─────────────────────────────────────────────────────────────

const loginSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(8).max(256),
});

const magicRequestSchema = z.object({
  email: z.string().email().max(254),
});

const forgotPasswordSchema = z.object({
  email: z.string().email().max(254),
});

const resetPasswordSchema = z.object({
  token: z.string().min(1).max(512),
  password: z.string().min(8).max(256),
});

const createSuperuserSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(8).max(256),
});

// ─────────────────────────────────────────────────────────────
//  Router
// ─────────────────────────────────────────────────────────────

export const superuserAuthRouter = new Hono<{
  Bindings: Env;
  Variables: { user: TokenPayload | null };
}>();

// ─────────────────────────────────────────────────────────────
//  Helper: insert a token row into _tokens
// ─────────────────────────────────────────────────────────────

async function createToken(
  db: D1Database,
  recordRef: string,
  type: "verification" | "passwordReset" | "emailChange" | "otp",
  expiryMs: number,
): Promise<{ id: string; value: string }> {
  const id = crypto.randomUUID();
  // 32-byte random token, base64url-encoded (URL-safe for email links).
  const raw = crypto.getRandomValues(new Uint8Array(32));
  let binary = "";
  for (let i = 0; i < raw.length; i++) binary += String.fromCharCode(raw[i]!);
  const value = btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

  // ── FIX: store SHA-256 hash, not the raw token ──
  const hashed = await hashTokenValue(value);

  const now = Date.now();
  await db.prepare(
    `INSERT INTO _tokens (id, collection_ref, record_ref, type, value, expires_at, consumed, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 0, ?)`,
  )
    .bind(id, "_superusers", recordRef, type, hashed, now + expiryMs, now)
    .run();

  return { id, value };
}

// ─────────────────────────────────────────────────────────────
//  Helper: consume a token (validate type, expiry, not-yet-consumed)
// ─────────────────────────────────────────────────────────────

async function consumeToken(
  db: D1Database,
  rawValue: string,
  expectedType: "verification" | "passwordReset" | "emailChange" | "otp",
): Promise<{ recordRef: string } | null> {
  // ── FIX: hash the incoming token, look up by hash ──
  const hashed = await hashTokenValue(rawValue);

  const row = await db
    .prepare(
      `SELECT id, record_ref, type, expires_at, consumed FROM _tokens WHERE value = ? AND type = ? LIMIT 1`,
    )
    .bind(hashed, expectedType)
    .first<{
      id: string;
      record_ref: string;
      type: string;
      expires_at: number;
      consumed: number;
    }>();

  if (!row) return null;
  if (row.consumed) return null;
  if (row.expires_at < Date.now()) return null;

  // Mark as consumed so it can't be replayed.
  await db.prepare(`UPDATE _tokens SET consumed = 1 WHERE id = ?`).bind(row.id).run();

  return { recordRef: row.record_ref };
}

// ─────────────────────────────────────────────────────────────
//  POST /api/superusers/login — email + password
// ─────────────────────────────────────────────────────────────

superuserAuthRouter.post("/login", async (c) => {
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

  const row = await c.env.DB.prepare(
    `SELECT id, email, password_hash, password_salt, verified FROM _superusers WHERE email = ?`,
  )
    .bind(normalizedEmail)
    .first<{
      id: string;
      email: string;
      password_hash: string;
      password_salt: string;
      verified: number;
    }>();

  if (!row) {
    return c.json({ error: "invalid_credentials" }, 401);
  }

  const ok = await verifyPassword(password, row.password_hash, row.password_salt);
  if (!ok) {
    return c.json({ error: "invalid_credentials" }, 401);
  }

  const token = await signToken({ sub: row.id, email: row.email }, c.env.AUTH_SECRET);
  return c.json({
    user: { id: row.id, email: row.email, verified: row.verified === 1 },
    token,
  });
});

// ─────────────────────────────────────────────────────────────
//  POST /api/superusers/magic-request — send magic link
// ─────────────────────────────────────────────────────────────

superuserAuthRouter.post("/magic-request", async (c) => {
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

  const row = await c.env.DB.prepare(`SELECT id, email FROM _superusers WHERE email = ?`)
    .bind(normalizedEmail)
    .first<{ id: string; email: string }>();

  // Always return 200 to avoid leaking which emails exist.
  if (!row) {
    return c.json({ success: true });
  }

  const { value } = await createToken(
    c.env.DB,
    row.id,
    "verification",
    EXPIRY_MAGIC_LINK_MS,
  );

  const url = new URL(c.req.url);
  const actionURL = `${url.origin}/api/core/superusers/magic-verify?token=${value}`;

  // Only log in local dev — never expose tokens in production logs.
  if (c.env.ENVIRONMENT === "local") {
    console.log(`[dev-only] magic-link for ${row.email}: ${actionURL}`);
  }

  return c.json({ success: true });
});

// ─────────────────────────────────────────────────────────────
//  GET /api/superusers/magic-verify — verify magic link token
// ─────────────────────────────────────────────────────────────

superuserAuthRouter.get("/magic-verify", async (c) => {
  const tokenValue = c.req.query("token");
  if (!tokenValue) {
    return c.json({ error: "missing_token" }, 400);
  }

  const result = await consumeToken(c.env.DB, tokenValue, "verification");
  if (!result) {
    return c.json({ error: "invalid_or_expired_token" }, 401);
  }

  const row = await c.env.DB.prepare(
    `SELECT id, email, verified FROM _superusers WHERE id = ?`,
  )
    .bind(result.recordRef)
    .first<{ id: string; email: string; verified: number }>();

  if (!row) {
    return c.json({ error: "user_not_found" }, 404);
  }

  // Mark the superuser as verified if they weren't already.
  if (row.verified !== 1) {
    await c.env.DB.prepare(`UPDATE _superusers SET verified = 1, updated_at = ? WHERE id = ?`)
      .bind(Date.now(), row.id)
      .run();
  }

  const sessionToken = await signToken({ sub: row.id, email: row.email }, c.env.AUTH_SECRET);
  return c.json({
    user: { id: row.id, email: row.email, verified: true },
    token: sessionToken,
  });
});

// ─────────────────────────────────────────────────────────────
//  POST /api/superusers/forgot-password — create reset token
// ─────────────────────────────────────────────────────────────

superuserAuthRouter.post("/forgot-password", async (c) => {
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

  const row = await c.env.DB.prepare(`SELECT id, email FROM _superusers WHERE email = ?`)
    .bind(normalizedEmail)
    .first<{ id: string; email: string }>();

  // Always 200 — don't leak whether the email is registered.
  if (!row) {
    return c.json({ success: true });
  }

  const { value } = await createToken(
    c.env.DB,
    row.id,
    "passwordReset",
    EXPIRY_PASSWORD_RESET_MS,
  );

  const url = new URL(c.req.url);
  const actionURL = `${url.origin}/reset-password?token=${value}`;

  if (c.env.ENVIRONMENT === "local") {
    console.log(`[dev-only] password-reset for ${row.email}: ${actionURL}`);
  }

  return c.json({ success: true });
});

// ─────────────────────────────────────────────────────────────
//  POST /api/superusers/reset-password — reset with token
// ─────────────────────────────────────────────────────────────

superuserAuthRouter.post("/reset-password", async (c) => {
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

  const result = await consumeToken(c.env.DB, token, "passwordReset");
  if (!result) {
    return c.json({ error: "invalid_or_expired_token" }, 401);
  }

  const row = await c.env.DB.prepare(
    `SELECT id, email FROM _superusers WHERE id = ?`,
  )
    .bind(result.recordRef)
    .first<{ id: string; email: string }>();

  if (!row) {
    return c.json({ error: "user_not_found" }, 404);
  }

  const { hash, salt } = await hashPassword(password);
  const now = Date.now();

  await c.env.DB.prepare(
    `UPDATE _superusers SET password_hash = ?, password_salt = ?, updated_at = ? WHERE id = ?`,
  )
    .bind(hash, salt, now, row.id)
    .run();

  const sessionToken = await signToken({ sub: row.id, email: row.email }, c.env.AUTH_SECRET);
  return c.json({
    user: { id: row.id, email: row.email },
    token: sessionToken,
  });
});

// ─────────────────────────────────────────────────────────────
//  GET /api/superusers/me — current superuser (protected)
// ─────────────────────────────────────────────────────────────

superuserAuthRouter.get("/me", requireAuth, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "unauthorized" }, 401);

  const row = await c.env.DB.prepare(
    `SELECT id, email, verified, created_at, updated_at FROM _superusers WHERE id = ?`,
  )
    .bind(user.sub)
    .first<{
      id: string;
      email: string;
      verified: number;
      created_at: number;
      updated_at: number;
    }>();

  if (!row) {
    return c.json({ error: "user_not_found" }, 404);
  }

  return c.json({
    user: {
      id: row.id,
      email: row.email,
      verified: row.verified === 1,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    },
  });
});

// ─────────────────────────────────────────────────────────────
//  POST /api/superusers/create — create a new superuser (protected)
// ─────────────────────────────────────────────────────────────

superuserAuthRouter.post("/create", requireAuth, async (c) => {
  // Only an existing authenticated superuser may create another.
  const currentUser = c.get("user");
  if (!currentUser) {
    return c.json({ error: "unauthorized" }, 401);
  }

  // Verify the caller actually exists in _superusers.
  const caller = await c.env.DB.prepare(`SELECT id FROM _superusers WHERE id = ?`)
    .bind(currentUser.sub)
    .first<{ id: string }>();

  if (!caller) {
    return c.json({ error: "forbidden" }, 403);
  }

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }

  const parsed = createSuperuserSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "validation_failed", issues: parsed.error.flatten() }, 400);
  }

  const { email, password } = parsed.data;
  const normalizedEmail = email.toLowerCase().trim();

  // Check for existing account.
  const existing = await c.env.DB.prepare(`SELECT id FROM _superusers WHERE email = ?`)
    .bind(normalizedEmail)
    .first();

  if (existing) {
    return c.json({ error: "email_already_registered" }, 409);
  }

  const { hash, salt } = await hashPassword(password);
  const id = crypto.randomUUID();
  const now = Date.now();

  try {
    await c.env.DB.prepare(
      `INSERT INTO _superusers (id, email, password_hash, password_salt, verified, created_at, updated_at)
       VALUES (?, ?, ?, ?, 0, ?, ?)`,
    )
      .bind(id, normalizedEmail, hash, salt, now, now)
      .run();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({ error: "persist_failed", detail: msg }, 500);
  }

  // Create a verification token so the new superuser can verify their email.
  const { value } = await createToken(
    c.env.DB,
    id,
    "verification",
    EXPIRY_VERIFICATION_MS,
  );

  const url = new URL(c.req.url);
  const actionURL = `${url.origin}/api/core/superusers/magic-verify?token=${value}`;

  if (c.env.ENVIRONMENT === "local") {
    console.log(`[dev-only] welcome for ${normalizedEmail}: ${actionURL}`);
  }

  // Issue a session token for the newly created superuser (optional —
  // the caller may prefer to force email verification first).  We return
  // the superuser record without a token here; the caller can decide.
  return c.json(
    {
      user: { id, email: normalizedEmail, verified: false },
      verificationURL: actionURL,
    },
    201,
  );
});

// ─────────────────────────────────────────────────────────────
//  GET /api/superusers/list — all superusers (auth required)
// ─────────────────────────────────────────────────────────────

superuserAuthRouter.get("/list", requireAuth, async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT id, email, verified, created_at, updated_at
     FROM _superusers ORDER BY created_at DESC`,
  ).all();
  return c.json({ users: results });
});

// ─────────────────────────────────────────────────────────────
//  GET /api/superusers/:id — single superuser (auth required)
// ─────────────────────────────────────────────────────────────

superuserAuthRouter.get("/:id", requireAuth, async (c) => {
  const id = c.req.param("id");
  const row = await c.env.DB.prepare(
    `SELECT id, email, verified, created_at, updated_at
     FROM _superusers WHERE id = ?`,
  )
    .bind(id)
    .first();
  if (!row) return c.json({ error: "not_found" }, 404);
  return c.json({ user: row });
});

// ─────────────────────────────────────────────────────────────
//  PATCH /api/superusers/:id/email — update email (auth required)
// ─────────────────────────────────────────────────────────────

const updateEmailSchema = z.object({
  email: z.string().email().max(254),
});

superuserAuthRouter.patch("/:id/email", requireAuth, async (c) => {
  const id = c.req.param("id");

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }

  const parsed = updateEmailSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "validation_failed", issues: parsed.error.flatten() }, 400);
  }

  const normalizedEmail = parsed.data.email.toLowerCase().trim();

  // Check the target exists.
  const existing = await c.env.DB.prepare(`SELECT id FROM _superusers WHERE id = ?`)
    .bind(id)
    .first();
  if (!existing) return c.json({ error: "not_found" }, 404);

  // Check email isn't taken by someone else.
  const clash = await c.env.DB.prepare(
    `SELECT id FROM _superusers WHERE email = ? AND id != ?`,
  )
    .bind(normalizedEmail, id)
    .first();
  if (clash) return c.json({ error: "email_already_in_use" }, 409);

  const now = Date.now();
  await c.env.DB.prepare(
    `UPDATE _superusers SET email = ?, updated_at = ? WHERE id = ?`,
  )
    .bind(normalizedEmail, now, id)
    .run();

  return c.json({ user: { id, email: normalizedEmail, updated_at: now } });
});

// ─────────────────────────────────────────────────────────────
//  PATCH /api/superusers/:id/password — change password (auth required)
// ─────────────────────────────────────────────────────────────

const changePasswordSchema = z.object({
  /** Current password — verified if the caller is changing their own. */
  currentPassword: z.string().min(8).max(256).optional(),
  newPassword: z.string().min(8).max(256),
});

superuserAuthRouter.patch("/:id/password", requireAuth, async (c) => {
  const id = c.req.param("id");
  const currentUser = c.get("user");

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }

  const parsed = changePasswordSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "validation_failed", issues: parsed.error.flatten() }, 400);
  }

  // Fetch target.
  const row = await c.env.DB.prepare(
    `SELECT id, email, password_hash, password_salt FROM _superusers WHERE id = ?`,
  )
    .bind(id)
    .first<{
      id: string;
      email: string;
      password_hash: string;
      password_salt: string;
    }>();

  if (!row) return c.json({ error: "not_found" }, 404);

  // If changing your own password, verify the current one.
  if (currentUser?.sub === id && parsed.data.currentPassword) {
    const ok = await verifyPassword(
      parsed.data.currentPassword,
      row.password_hash,
      row.password_salt,
    );
    if (!ok) return c.json({ error: "current_password_incorrect" }, 403);
  }

  // Hash the new password.
  const { hash, salt } = await hashPassword(parsed.data.newPassword);
  const now = Date.now();

  await c.env.DB.prepare(
    `UPDATE _superusers SET password_hash = ?, password_salt = ?, token_key = ?, updated_at = ? WHERE id = ?`,
  )
    .bind(hash, salt, crypto.randomUUID(), now, id)
    .run();

  return c.json({ success: true });
});

// ─────────────────────────────────────────────────────────────
//  DELETE /api/superusers/:id — delete a superuser (auth required)
// ─────────────────────────────────────────────────────────────

superuserAuthRouter.delete("/:id", requireAuth, async (c) => {
  const id = c.req.param("id");
  const currentUser = c.get("user");

  // Prevent self-deletion.
  if (currentUser?.sub === id) {
    return c.json({ error: "cannot_delete_self" }, 400);
  }

  await c.env.DB.prepare(`DELETE FROM _superusers WHERE id = ?`)
    .bind(id)
    .run();

  return c.json({ success: true });
});

// ─────────────────────────────────────────────────────────────
//  POST /api/core/superusers/bootstrap — create the first superuser.
//  Disabled once any superuser exists.  No auth required.
// ─────────────────────────────────────────────────────────────

superuserAuthRouter.post("/bootstrap", async (c) => {
  // Read the body FIRST — in Workers, the stream can be lost after an await.
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }

  // Refuse if any superuser already exists.
  const existing = await c.env.DB.prepare(`SELECT COUNT(*) as cnt FROM _superusers`)
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

  await c.env.DB.prepare(
    `INSERT INTO _superusers (id, email, password_hash, password_salt, token_key, verified, created_at, updated_at)
     VALUES (?, ?, ?, ?, '', 1, ?, ?)`,
  )
    .bind(id, normalizedEmail, hash, salt, now, now)
    .run();

  const token = await signToken({ sub: id, email: normalizedEmail }, c.env.AUTH_SECRET);
  return c.json(
    { user: { id, email: normalizedEmail, verified: true }, token },
    201,
  );
});
