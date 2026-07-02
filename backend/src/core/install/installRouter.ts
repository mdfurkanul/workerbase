import { Hono } from "hono";
import { z } from "zod";
import type { Env } from "../../env.js";
import {
  hashPassword,
  signToken,
} from "../../auth/crypto.js";

/**
 * Installation router — first-run setup flow.
 *
 * Endpoints:
 *   GET  /api/core/install/status   — has the instance been installed?
 *   POST /api/core/install          — perform first-run install (creates the first admin)
 *   GET  /api/core/install/seed     — (internal) ensure default _settings exist
 *
 * Once installed, POST /install returns 403 `already_installed`.
 */

export const installRouter = new Hono<{ Bindings: Env }>();

// ─────────────────────────────────────────────────────────────
//  Default settings seeded on install. Keep keys flat & JSON-safe.
// ─────────────────────────────────────────────────────────────

const DEFAULT_SETTINGS: Record<string, unknown> = {
  installed: false,
  brandColor: "#F38020", // Cloudflare orange
  appName: "WorkerBase",
  storageQuotaMB: 1024,
};

// ─────────────────────────────────────────────────────────────
//  Helpers
// ─────────────────────────────────────────────────────────────

async function isInstalled(db: D1Database): Promise<boolean> {
  // Two independent signals — either is enough:
  //   1. _settings.installed === true
  //   2. at least one superuser row exists
  const setting = await db
    .prepare(`SELECT value FROM _settings WHERE key = ?`)
    .bind("installed")
    .first<{ value: string | null }>();

  if (setting && setting.value === "true") return true;

  const cnt = await db
    .prepare(`SELECT COUNT(*) as cnt FROM _superusers`)
    .first<{ cnt: number }>();
  return !!(cnt && cnt.cnt > 0);
}

async function seedDefaultSettings(db: D1Database): Promise<void> {
  const now = Date.now();
  const stmts = Object.entries(DEFAULT_SETTINGS).map(([key, value]) =>
    db
      .prepare(
        `INSERT INTO _settings (key, value, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      )
      .bind(key, JSON.stringify(value), now),
  );
  await db.batch(stmts);
}

async function markInstalled(db: D1Database): Promise<void> {
  const now = Date.now();
  await db
    .prepare(
      `INSERT INTO _settings (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    )
    .bind("installed", JSON.stringify(true), now)
    .run();
}

// ─────────────────────────────────────────────────────────────
//  Zod schema for POST /install
// ─────────────────────────────────────────────────────────────

const installSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(8).max(256),
  appName: z.string().min(1).max(64).optional(),
  brandColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
});

// ─────────────────────────────────────────────────────────────
//  GET /api/core/install/status
// ─────────────────────────────────────────────────────────────

installRouter.get("/status", async (c) => {
  const installed = await isInstalled(c.env.SYSTEM_DB);
  return c.json({ installed });
});

// ─────────────────────────────────────────────────────────────
//  POST /api/core/install — first-run install (no auth required)
// ─────────────────────────────────────────────────────────────

installRouter.post("/", async (c) => {
  if (await isInstalled(c.env.SYSTEM_DB)) {
    return c.json(
      { error: "already_installed", message: "Instance is already installed." },
      403,
    );
  }

  // Body parsing: read as text, then JSON.parse — avoids Wrangler stream issues.
  let body: unknown;
  try {
    const raw = await c.req.text();
    body = raw ? JSON.parse(raw) : {};
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }

  const parsed = installSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "validation_failed", issues: parsed.error.flatten() }, 400);
  }

  const { email, password } = parsed.data;
  const normalizedEmail = email.toLowerCase().trim();

  // 1. Seed default settings (writes/updates, idempotent).
  try {
    await seedDefaultSettings(c.env.SYSTEM_DB);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({ error: "settings_seed_failed", detail: msg }, 500);
  }

  // 2. Apply optional overrides from the install payload.
  if (parsed.data.appName || parsed.data.brandColor) {
    const now = Date.now();
    const overrides: [string, unknown][] = [];
    if (parsed.data.appName) overrides.push(["appName", parsed.data.appName]);
    if (parsed.data.brandColor) overrides.push(["brandColor", parsed.data.brandColor]);

    const stmts = overrides.map(([key, value]) =>
      c.env.SYSTEM_DB
        .prepare(
          `INSERT INTO _settings (key, value, updated_at) VALUES (?, ?, ?)
           ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
        )
        .bind(key, JSON.stringify(value), now),
    );
    await c.env.SYSTEM_DB.batch(stmts);
  }

  // 3. Create the first admin superuser.
  const { hash, salt } = await hashPassword(password);
  const id = crypto.randomUUID();
  const now = Date.now();

  try {
    await c.env.SYSTEM_DB.prepare(
      `INSERT INTO _superusers (id, email, password_hash, password_salt, token_key, role, verified, created_at, updated_at)
       VALUES (?, ?, ?, ?, '', 'admin', 1, ?, ?)`,
    )
      .bind(id, normalizedEmail, hash, salt, now, now)
      .run();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/UNIQUE/i.test(msg)) {
      return c.json({ error: "email_already_registered" }, 409);
    }
    return c.json({ error: "install_failed", detail: msg }, 500);
  }

  // 4. Mark installed.
  await markInstalled(c.env.SYSTEM_DB);

  // 5. Issue session token for the new admin.
  const token = await signToken(
    { sub: id, email: normalizedEmail, role: "admin" },
    c.env.AUTH_SECRET,
  );

  return c.json(
    {
      installed: true,
      user: { id, email: normalizedEmail, role: "admin", verified: true },
      token,
    },
    201,
  );
});

// ─────────────────────────────────────────────────────────────
//  GET /api/core/install/seed — idempotent settings seeder
//  Useful for migrations / upgrades that introduce new defaults.
//  Auth required (any superuser) so anonymous users can't trigger it.
// ─────────────────────────────────────────────────────────────

installRouter.get("/seed", async (c) => {
  // Lightweight auth: require a valid bearer token (any role).
  const header = c.req.header("Authorization") ?? "";
  const m = header.match(/^Bearer\s+(.+)$/i);
  if (!m) return c.json({ error: "missing_bearer_token" }, 401);

  // Defer to verifyToken lazily to avoid a circular import with the auth
  // middleware (which imports from crypto). Inline verify here is enough.
  const { verifyToken } = await import("../../auth/crypto.js");
  const payload = await verifyToken(m[1]!, c.env.AUTH_SECRET);
  if (!payload) return c.json({ error: "invalid_or_expired_token" }, 401);

  try {
    await seedDefaultSettings(c.env.SYSTEM_DB);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({ error: "settings_seed_failed", detail: msg }, 500);
  }

  return c.json({ success: true });
});

export { isInstalled, seedDefaultSettings, DEFAULT_SETTINGS };
