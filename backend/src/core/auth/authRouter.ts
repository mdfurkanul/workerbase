import { Hono } from "hono";
import { z } from "zod";
import type { Env } from "../../env.js";
import { hashPassword, signToken, verifyPassword, verifyToken } from "../../auth/crypto.js";
import { requireAuth } from "../../auth/middleware.js";

/**
 * Auth router — `POST /api/auth/login`, `POST /api/auth/register`,
 * `GET /api/auth/me`. Issues HMAC-signed JWT session tokens.
 */

const credentialsSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(8).max(256),
});

export const authRouter = new Hono<{
  Bindings: Env;
  Variables: { user: Awaited<ReturnType<typeof verifyToken>> };
}>();

/** POST /api/auth/register — create a new account. */
authRouter.post("/register", async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }
  const parsed = credentialsSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "validation_failed", issues: parsed.error.flatten() }, 400);
  }
  const { email, password } = parsed.data;
  const normalizedEmail = email.toLowerCase().trim();

  const existing = await c.env.DB.prepare(`SELECT id FROM _users WHERE email = ?`)
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
      `INSERT INTO _users (id, email, password_hash, password_salt, created_at) VALUES (?, ?, ?, ?, ?)`,
    )
      .bind(id, normalizedEmail, hash, salt, now)
      .run();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({ error: "persist_failed", detail: msg }, 500);
  }

  const token = await signToken({ sub: id, email: normalizedEmail }, c.env.AUTH_SECRET);
  return c.json(
    { user: { id, email: normalizedEmail }, token },
    201,
  );
});

/** POST /api/auth/login — exchange email + password for a session token. */
authRouter.post("/login", async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }
  const parsed = credentialsSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "validation_failed", issues: parsed.error.flatten() }, 400);
  }
  const { email, password } = parsed.data;
  const normalizedEmail = email.toLowerCase().trim();

  const row = await c.env.DB.prepare(
    `SELECT id, email, password_hash, password_salt FROM _users WHERE email = ?`,
  )
    .bind(normalizedEmail)
    .first<{ id: string; email: string; password_hash: string; password_salt: string }>();

  if (!row) {
    // Do not leak whether the email exists.
    return c.json({ error: "invalid_credentials" }, 401);
  }

  const ok = await verifyPassword(password, row.password_hash, row.password_salt);
  if (!ok) {
    return c.json({ error: "invalid_credentials" }, 401);
  }

  const token = await signToken({ sub: row.id, email: row.email }, c.env.AUTH_SECRET);
  return c.json({ user: { id: row.id, email: row.email }, token });
});

/** GET /api/auth/me — return the currently authenticated user. */
authRouter.get("/me", requireAuth, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "unauthorized" }, 401);
  return c.json({ user: { id: user.sub, email: user.email } });
});
