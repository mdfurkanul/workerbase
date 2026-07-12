/**
 * Global application settings router.
 *
 * Mounted at `/api/core/settings`:
 *   GET   /                  — returns all settings as { settings: { ... } }
 *   PATCH /                  — merges { key: value, ... } into _settings
 *
 * Settings are stored as one row per key in the `_settings` table. Values
 * are JSON-encoded. The router is admin-only (requireRole("admin")).
 */

import { Hono } from "hono";
import { z } from "zod";
import type { Env } from "../../env.js";
import { requireAuth, requireRole } from "../../auth/middleware.js";
import { invalidateRateLimitCache } from "../../ratelimit/middleware.js";
import { invalidateDeploySettingsCache } from "./deploymentSettings.js";

export const settingsRouter = new Hono<{ Bindings: Env }>();

const patchSchema = z
  .record(z.string(), z.unknown())
  .refine((obj) => Object.keys(obj).length > 0, {
    message: "at least one setting key is required",
  });

/**
 * Reserved keys that callers are NOT allowed to mutate through this router.
 * `installed` is set once during the install flow; tampering with it via
 * the settings UI would be a footgun.
 */
const RESERVED_KEYS = new Set(["installed"]);

/* ── GET / — list all settings ───────────────────────────────────── */
settingsRouter.get("/", requireAuth, async (c) => {
  const { results } = await c.env.SYSTEM_DB
    .prepare(`SELECT key, value FROM _settings`)
    .all<{ key: string; value: string | null }>();

  const settings: Record<string, unknown> = {};
  for (const row of results ?? []) {
    if (!row.key) continue;
    settings[row.key] = row.value == null ? null : safeParse(row.value);
  }
  return c.json({ settings });
});

/* ── PATCH / — merge settings ────────────────────────────────────── */
settingsRouter.patch("/", requireAuth, requireRole("admin"), async (c) => {
  let body: unknown;
  try {
    const raw = await c.req.text();
    body = raw ? JSON.parse(raw) : {};
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "validation_failed", issues: parsed.error.flatten() }, 400);
  }

  // Filter reserved keys (silently drop rather than 400 — UI doesn't show them).
  const entries = Object.entries(parsed.data).filter(([k]) => !RESERVED_KEYS.has(k));
  if (entries.length === 0) {
    return c.json({ error: "no_valid_keys" }, 400);
  }

  const now = Date.now();
  const stmts = entries.map(([key, value]) =>
    c.env.SYSTEM_DB
      .prepare(
        `INSERT INTO _settings (key, value, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      )
      .bind(key, JSON.stringify(value), now),
  );

  try {
    await c.env.SYSTEM_DB.batch(stmts);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({ error: "settings_persist_failed", detail: msg }, 500);
  }

  // If rate limit settings changed, invalidate the in-memory cache so the
  // middleware picks up the new config on the next request.
  if (entries.some(([k]) => k === "rateLimit")) {
    invalidateRateLimitCache();
  }

  // If deploy settings (dashboard URL / CORS origins) changed, invalidate
  // the deploy cache so CORS + email-link redirects pick up the new values.
  if (entries.some(([k]) => k === "deploy")) {
    invalidateDeploySettingsCache();
  }

  // Re-read the full settings blob so callers can reconcile state without
  // a follow-up GET. Mirrors the `/me/prefs` PATCH response shape.
  const { results } = await c.env.SYSTEM_DB
    .prepare(`SELECT key, value FROM _settings`)
    .all<{ key: string; value: string | null }>();
  const after: Record<string, unknown> = {};
  for (const row of results ?? []) {
    if (!row.key) continue;
    after[row.key] = row.value == null ? null : safeParse(row.value);
  }
  return c.json({ settings: after, updated: entries.map(([k]) => k) });
});

/* ── helpers ─────────────────────────────────────────────────────── */
function safeParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}
