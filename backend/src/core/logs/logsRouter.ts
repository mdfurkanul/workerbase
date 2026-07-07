/**
 * Logs router — mounted at /api/core/logs
 *
 * Endpoints:
 *   GET /          — paginated list of recent request log entries
 *   DELETE /       — bulk clear (admin only)
 *
 * The `_logs` table is populated by the request-logging middleware in
 * `src/index.ts` (one row per request, written via `waitUntil` so the
 * response is never blocked). This router is read-only (plus a clear).
 */
import { Hono } from "hono";
import { z } from "zod";
import type { Env } from "../../env.js";
import type { LogLevel } from "../../db/schema.js";
import { requireAuth, requireRole } from "../../auth/middleware.js";

export const logsRouter = new Hono<{ Bindings: Env }>();

const LEVELS = new Set<LogLevel>(["info", "warn", "error"]);

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(50),
  level: z
    .string()
    .optional()
    .transform((v) => (v && LEVELS.has(v.toLowerCase() as LogLevel) ? (v.toLowerCase() as LogLevel) : undefined)),
});

/* ── GET /api/core/logs — paginated list ── */
logsRouter.get("/", requireAuth, async (c) => {
  const parsed = listQuerySchema.safeParse(c.req.query());
  if (!parsed.success) {
    return c.json({ error: "validation_failed", issues: parsed.error.flatten() }, 400);
  }
  const { page, perPage, level } = parsed.data;
  const offset = (page - 1) * perPage;

  try {
    const db = c.env.SYSTEM_DB;
    const where = level ? "WHERE level = ?" : "";
    const binds = level ? [level, perPage, offset] : [perPage, offset];

    const countRow = await db
      .prepare(`SELECT COUNT(*) as total FROM _logs ${where}`)
      .bind(...(level ? [level] : []))
      .first<{ total: number }>();
    const total = countRow?.total ?? 0;

    const { results } = await db
      .prepare(
        `SELECT id, level, method, path, status, duration_ms, ip, user_agent, error, created_at
           FROM _logs ${where}
          ORDER BY created_at DESC, rowid DESC
          LIMIT ? OFFSET ?`,
      )
      .bind(...binds)
      .all();

    return c.json({
      items: (results ?? []).map((r) => {
        const row = r as Record<string, unknown>;
        return {
          id: row.id,
          level: row.level,
          method: row.method,
          path: row.path,
          status: row.status,
          durationMs: row.duration_ms,
          ip: row.ip ?? null,
          userAgent: row.user_agent ?? null,
          error: row.error ?? null,
          createdAt: row.created_at,
        };
      }),
      page,
      perPage,
      total,
      totalPages: Math.max(1, Math.ceil(total / perPage)),
    });
  } catch (err) {
    // Most likely cause: _logs table doesn't exist yet (pre-install).
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({ error: "query_failed", detail: msg }, 500);
  }
});

/* ── DELETE /api/core/logs — bulk clear ── */
logsRouter.delete("/", requireAuth, requireRole("admin"), async (c) => {
  try {
    await c.env.SYSTEM_DB.prepare(`DELETE FROM _logs`).run();
    return c.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({ error: "clear_failed", detail: msg }, 500);
  }
});

/* ─── Helpers used by the request-logging middleware ────────────────── */

/**
 * Decide a log level from the response status.
 *   2xx/3xx → info
 *   4xx     → warn
 *   5xx     → error
 */
export function levelFromStatus(status: number): LogLevel {
  if (status >= 500) return "error";
  if (status >= 400) return "warn";
  return "info";
}

/** Hard cap on rows retained in `_logs`. The middleware trims to this
 *  after every write so the table can't grow unbounded. */
export const LOG_RETENTION_LIMIT = 5_000;

/**
 * Persist a single request log entry + trim old rows. Designed to run
 * inside `c.executionCtx.waitUntil(...)` — never awaits from the
 * request path itself.
 */
export async function recordRequest(
  env: Env,
  entry: {
    level: LogLevel;
    method: string;
    path: string;
    status: number;
    durationMs: number;
    ip: string | null;
    userAgent: string | null;
    error: string | null;
  },
): Promise<void> {
  const now = Date.now();
  const id = crypto.randomUUID();
  const db = env.SYSTEM_DB;
  try {
    await db
      .prepare(
        `INSERT INTO _logs (id, level, method, path, status, duration_ms, ip, user_agent, error, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        id,
        entry.level,
        entry.method,
        entry.path,
        entry.status,
        entry.durationMs,
        entry.ip,
        entry.userAgent,
        entry.error,
        now,
      )
      .run();

    // Trim — keep only the most recent LOG_RETENTION_LIMIT rows.
    await db
      .prepare(
        `DELETE FROM _logs
          WHERE rowid NOT IN (
            SELECT rowid FROM _logs ORDER BY created_at DESC LIMIT ?
          )`,
      )
      .bind(LOG_RETENTION_LIMIT)
      .run();
  } catch {
    // Swallow — logging must never break the request path. The most
    // common cause is the _logs table not existing yet (pre-install).
  }
}
