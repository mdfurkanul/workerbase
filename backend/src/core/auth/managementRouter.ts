import { Hono } from "hono";
import type { Env } from "../../env.js";
import type { SuperuserRole } from "../../db/schema.js";
import type { TokenPayload } from "../../auth/crypto.js";
import { hashPassword, signToken, verifyPassword } from "../../auth/crypto.js";
import { requireAuth, requireRole } from "../../auth/middleware.js";
import { createToken, EXPIRY_VERIFICATION_MS } from "./superuserTokens.js";
import {
  createSuperuserSchema,
  updateEmailSchema,
  changePasswordSchema,
  updateRoleSchema,
  normalizeRole,
} from "./superuserSchemas.js";

/**
 * Management sub-router for the superuser auth routes.
 * Mounted at `/` of the composer `superuserRouter`.
 *
 * Routes:
 *   GET    /me
 *   POST   /create
 *   GET    /list
 *   GET    /:id
 *   PATCH  /:id/email
 *   PATCH  /:id/password
 *   PATCH  /:id/role
 *   DELETE /:id
 */

export const managementRouter = new Hono<{
  Bindings: Env;
  Variables: { user: TokenPayload | null };
}>();

// ─────────────────────────────────────────────────────────────
//  GET /me — current superuser (protected)
// ─────────────────────────────────────────────────────────────

managementRouter.get("/me", requireAuth, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "unauthorized" }, 401);

  const row = await c.env.SYSTEM_DB.prepare(
    `SELECT id, email, role, verified, created_at, updated_at FROM _superusers WHERE id = ?`,
  )
    .bind(user.sub)
    .first<{
      id: string;
      email: string;
      role: string;
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
      role: normalizeRole(row.role),
      verified: row.verified === 1,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    },
  });
});

// ─────────────────────────────────────────────────────────────
//  POST /create — create a new superuser (protected)
// ─────────────────────────────────────────────────────────────

managementRouter.post("/create", requireAuth, requireRole("admin"), async (c) => {
  // Only an existing authenticated superuser may create another.
  const currentUser = c.get("user");
  if (!currentUser) {
    return c.json({ error: "unauthorized" }, 401);
  }

  // Verify the caller actually exists in _superusers.
  const caller = await c.env.SYSTEM_DB.prepare(`SELECT id FROM _superusers WHERE id = ?`)
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
  const newRole: SuperuserRole = parsed.data.role ?? "viewer";
  const normalizedEmail = email.toLowerCase().trim();

  // Check for existing account.
  const existing = await c.env.SYSTEM_DB.prepare(`SELECT id FROM _superusers WHERE email = ?`)
    .bind(normalizedEmail)
    .first();

  if (existing) {
    return c.json({ error: "email_already_registered" }, 409);
  }

  const { hash, salt } = await hashPassword(password);
  const id = crypto.randomUUID();
  const now = Date.now();

  try {
    await c.env.SYSTEM_DB.prepare(
      `INSERT INTO _superusers (id, email, password_hash, password_salt, role, verified, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 0, ?, ?)`,
    )
      .bind(id, normalizedEmail, hash, salt, newRole, now, now)
      .run();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({ error: "persist_failed", detail: msg }, 500);
  }

  // Create a verification token so the new superuser can verify their email.
  const { value } = await createToken(
    c.env.SYSTEM_DB,
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
      user: { id, email: normalizedEmail, role: newRole, verified: false },
      verificationURL: actionURL,
    },
    201,
  );
});

// ─────────────────────────────────────────────────────────────
//  GET /list — all superusers (auth required)
// ─────────────────────────────────────────────────────────────

managementRouter.get("/list", requireAuth, requireRole("admin"), async (c) => {
  const { results } = await c.env.SYSTEM_DB.prepare(
    `SELECT id, email, role, verified, created_at, updated_at
     FROM _superusers ORDER BY created_at DESC`,
  ).all();
  return c.json({ users: results });
});

// ─────────────────────────────────────────────────────────────
//  GET /:id — single superuser (auth required)
// ─────────────────────────────────────────────────────────────

managementRouter.get("/:id", requireAuth, requireRole("admin"), async (c) => {
  const id = c.req.param("id");
  const row = await c.env.SYSTEM_DB.prepare(
    `SELECT id, email, role, verified, created_at, updated_at
     FROM _superusers WHERE id = ?`,
  )
    .bind(id)
    .first();
  if (!row) return c.json({ error: "not_found" }, 404);
  return c.json({ user: row });
});

// ─────────────────────────────────────────────────────────────
//  PATCH /:id/email — update email (auth required)
// ─────────────────────────────────────────────────────────────

managementRouter.patch("/:id/email", requireAuth, requireRole("admin"), async (c) => {
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
  const existing = await c.env.SYSTEM_DB.prepare(`SELECT id FROM _superusers WHERE id = ?`)
    .bind(id)
    .first();
  if (!existing) return c.json({ error: "not_found" }, 404);

  // Check email isn't taken by someone else.
  const clash = await c.env.SYSTEM_DB.prepare(
    `SELECT id FROM _superusers WHERE email = ? AND id != ?`,
  )
    .bind(normalizedEmail, id)
    .first();
  if (clash) return c.json({ error: "email_already_in_use" }, 409);

  const now = Date.now();
  await c.env.SYSTEM_DB.prepare(
    `UPDATE _superusers SET email = ?, updated_at = ? WHERE id = ?`,
  )
    .bind(normalizedEmail, now, id)
    .run();

  return c.json({ user: { id, email: normalizedEmail, updated_at: now } });
});

// ─────────────────────────────────────────────────────────────
//  PATCH /:id/password — change password (auth required)
// ─────────────────────────────────────────────────────────────

managementRouter.patch("/:id/password", requireAuth, async (c) => {
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
  const row = await c.env.SYSTEM_DB.prepare(
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

  await c.env.SYSTEM_DB.prepare(
    `UPDATE _superusers SET password_hash = ?, password_salt = ?, token_key = ?, updated_at = ? WHERE id = ?`,
  )
    .bind(hash, salt, crypto.randomUUID(), now, id)
    .run();

  return c.json({ success: true });
});

// ─────────────────────────────────────────────────────────────
//  PATCH /:id/role — change a user's role (admin-only)
// ─────────────────────────────────────────────────────────────

managementRouter.patch("/:id/role", requireAuth, requireRole("admin"), async (c) => {
  const id = c.req.param("id");

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }

  const parsed = updateRoleSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "validation_failed", issues: parsed.error.flatten() }, 400);
  }

  const newRole = parsed.data.role;

  // Fetch the target.
  const target = await c.env.SYSTEM_DB.prepare(
    `SELECT id, role FROM _superusers WHERE id = ?`,
  )
    .bind(id)
    .first<{ id: string; role: string }>();
  if (!target) return c.json({ error: "not_found" }, 404);

  // Last-admin safeguard — never demote the only admin.
  if (normalizeRole(target.role) === "admin" && newRole !== "admin") {
    const cnt = await c.env.SYSTEM_DB.prepare(
      `SELECT COUNT(*) as cnt FROM _superusers WHERE role = 'admin'`,
    ).first<{ cnt: number }>();
    if (cnt && cnt.cnt <= 1) {
      return c.json({ error: "cannot_demote_last_admin" }, 400);
    }
  }

  const now = Date.now();
  // Rotate tokenKey so the user's existing sessions must re-login.
  // This ensures the new role takes effect immediately on the next login.
  const newTokenKey = crypto.randomUUID();
  await c.env.SYSTEM_DB.prepare(
    `UPDATE _superusers SET role = ?, token_key = ?, updated_at = ? WHERE id = ?`,
  )
    .bind(newRole, newTokenKey, now, id)
    .run();

  return c.json({ user: { id, role: newRole, updated_at: now } });
});

// ─────────────────────────────────────────────────────────────
//  DELETE /:id — delete a superuser (auth required)
// ─────────────────────────────────────────────────────────────

managementRouter.delete("/:id", requireAuth, requireRole("admin"), async (c) => {
  const id = c.req.param("id");
  const currentUser = c.get("user");

  // Prevent self-deletion.
  if (currentUser?.sub === id) {
    return c.json({ error: "cannot_delete_self" }, 400);
  }

  // Fetch target so we know their role (for the last-admin safeguard).
  const target = await c.env.SYSTEM_DB.prepare(
    `SELECT role FROM _superusers WHERE id = ?`,
  )
    .bind(id)
    .first<{ role: string }>();
  if (!target) return c.json({ error: "not_found" }, 404);

  // Last-admin safeguard — never let the only admin be removed.
  if (normalizeRole(target.role) === "admin") {
    const cnt = await c.env.SYSTEM_DB.prepare(
      `SELECT COUNT(*) as cnt FROM _superusers WHERE role = 'admin'`,
    ).first<{ cnt: number }>();
    if (cnt && cnt.cnt <= 1) {
      return c.json({ error: "cannot_delete_last_admin" }, 400);
    }
  }

  await c.env.SYSTEM_DB.prepare(`DELETE FROM _superusers WHERE id = ?`)
    .bind(id)
    .run();

  return c.json({ success: true });
});
