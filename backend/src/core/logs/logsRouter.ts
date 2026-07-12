/**
 * Logs router — mounted at /api/core/logs
 *
 * Endpoints:
 *   GET  /          — paginated list of recent request log entries
 *   DELETE /        — bulk clear (admin only)
 *   GET  /settings  — read retention settings
 *   PATCH /settings — update retention settings (admin only)
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

/* ─── Settings ─────────────────────────────────────────────────── */

export const LOGS_SETTINGS_KEY = "logs";

export interface LogsSettings {
  /** Max rows to keep in `_logs`. 0 = unlimited. */
  retentionLimit: number;
  /** Max age in days. 0 = no time-based pruning. */
  retentionDays: number;
  /** Epoch-ms of the last time-based pruning pass (info only). */
  lastPrunedAt: number | null;
}

export const DEFAULT_LOGS_SETTINGS: LogsSettings = {
  retentionLimit: 5_000,
  retentionDays: 0,
  lastPrunedAt: null,
};

export async function readLogsSettings(db: D1Database): Promise<LogsSettings> {
  const row = await db
    .prepare(`SELECT value FROM _settings WHERE key = ?`)
    .bind(LOGS_SETTINGS_KEY)
    .first<{ value: string | null }>();
  if (!row?.value) return { ...DEFAULT_LOGS_SETTINGS };
  try {
    const parsed = JSON.parse(row.value) as Partial<LogsSettings>;
    return { ...DEFAULT_LOGS_SETTINGS, ...parsed };
  } catch {
    return { ...DEFAULT_LOGS_SETTINGS };
  }
}

async function writeLogsSettings(
  db: D1Database,
  patch: Partial<LogsSettings>,
): Promise<LogsSettings> {
  const current = await readLogsSettings(db);
  const next: LogsSettings = { ...current, ...patch };
  await db
    .prepare(
      `INSERT INTO _settings (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    )
    .bind(LOGS_SETTINGS_KEY, JSON.stringify(next), Date.now())
    .run();
  return next;
}

const patchSettingsSchema = z.object({
  retentionLimit: z.number().int().min(0).max(1_000_000).optional(),
  retentionDays: z.number().int().min(0).max(3650).optional(),
});

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(50),
  level: z
    .string()
    .optional()
    .transform((v) => (v && LEVELS.has(v.toLowerCase() as LogLevel) ? (v.toLowerCase() as LogLevel) : undefined)),
  since: z.coerce.number().optional(),
  until: z.coerce.number().optional(),
});

/* ── GET /api/core/logs/timeseries — requests + duration over time ── */
const tsQuerySchema = z.object({
  range: z.enum(["7d", "24h", "day"]).default("24h"),
  date: z.string().optional(), // YYYY-MM-DD — only with range=day
});

logsRouter.get("/timeseries", requireAuth, async (c) => {
  const parsed = tsQuerySchema.safeParse(c.req.query());
  if (!parsed.success) {
    return c.json({ error: "validation_failed", issues: parsed.error.flatten() }, 400);
  }
  const { range, date } = parsed.data;

  const now = Date.now();
  const DAY_MS = 86_400_000;
  const HOUR_MS = 3_600_000;

  try {
    const db = c.env.SYSTEM_DB;

    // Build the full expected bucket list so we can fill gaps with zeros.
    type Bucket = { key: string; label: string };
    const expected: Bucket[] = [];

    // Determine whether we're doing daily or hourly buckets.
    // - range="7d" → 7 daily buckets
    // - range="24h" → 24 hourly buckets
    // - range="day" → 24 hourly buckets for a specific date
    const isDaily = range === "7d";

    if (isDaily) {
      const startOfDay = Math.floor(now / DAY_MS) * DAY_MS;
      for (let i = 6; i >= 0; i--) {
        const t = startOfDay - i * DAY_MS;
        const d = new Date(t);
        expected.push({
          key: d.toISOString().slice(0, 10),
          label: d.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" }),
        });
      }
    } else {
      // Hourly — either last 24h or a specific day.
      let dayStart: number;
      if (range === "day" && date) {
        // Parse YYYY-MM-DD as UTC midnight.
        dayStart = new Date(date + "T00:00:00Z").getTime();
      } else {
        // Last 24 hours from now.
        const startOfHour = Math.floor(now / HOUR_MS) * HOUR_MS;
        dayStart = startOfHour - 23 * HOUR_MS;
      }
      for (let i = 0; i < 24; i++) {
        const t = dayStart + i * HOUR_MS;
        const d = new Date(t);
        expected.push({
          key: d.toISOString().slice(0, 13).replace("T", " ") + ":00",
          label: d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC" }),
        });
      }
    }

    // Compute the time range for the WHERE clause.
    let sinceMs: number;
    let untilMs: number | undefined;
    if (isDaily) {
      sinceMs = now - 7 * DAY_MS;
    } else if (range === "day" && date) {
      sinceMs = new Date(date + "T00:00:00Z").getTime();
      untilMs = sinceMs + DAY_MS;
    } else {
      sinceMs = now - 24 * HOUR_MS;
    }

    const bucketExpr = isDaily
      ? `DATE(created_at / 1000, 'unixepoch')`
      : `strftime('%Y-%m-%d %H:00', created_at / 1000, 'unixepoch')`;

    const whereClause = untilMs
      ? `WHERE created_at >= ? AND created_at < ?`
      : `WHERE created_at >= ?`;
    const binds = untilMs ? [sinceMs, untilMs] : [sinceMs];

    const sql = `SELECT ${bucketExpr} AS bucket,
                  COUNT(*)                                               AS count,
                  COALESCE(CAST(AVG(duration_ms) AS INTEGER), 0)         AS avgDuration,
                  COALESCE(MAX(duration_ms), 0)                          AS maxDuration,
                  COALESCE(SUM(duration_ms), 0)                          AS totalDuration,
                  COALESCE(SUM(CASE WHEN level='info'  THEN 1 ELSE 0 END), 0) AS info,
                  COALESCE(SUM(CASE WHEN level='warn'  THEN 1 ELSE 0 END), 0) AS warn,
                  COALESCE(SUM(CASE WHEN level='error' THEN 1 ELSE 0 END), 0) AS error
             FROM _logs
            ${whereClause}
            GROUP BY bucket
            ORDER BY bucket`;

    const { results } = await db.prepare(sql).bind(...binds).all<{
      bucket: string;
      count: number;
      avgDuration: number;
      maxDuration: number;
      totalDuration: number;
      info: number;
      warn: number;
      error: number;
    }>();

    // Map DB rows by bucket key for O(1) lookup.
    const byKey = new Map(
      (results ?? []).map((r) => [r.bucket, r]),
    );

    const buckets = expected.map((b) => {
      const row = byKey.get(b.key);
      return {
        label: b.label,
        count: row?.count ?? 0,
        avgDuration: row?.avgDuration ?? 0,
        maxDuration: row?.maxDuration ?? 0,
        totalDuration: row?.totalDuration ?? 0,
        info: row?.info ?? 0,
        warn: row?.warn ?? 0,
        error: row?.error ?? 0,
      };
    });

    return c.json({ range, buckets });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({ error: "query_failed", detail: msg }, 500);
  }
});

/* ── GET /api/core/logs/summary — counts per level ── */
logsRouter.get("/summary", requireAuth, async (c) => {
  try {
    const row = await c.env.SYSTEM_DB
      .prepare(
        `SELECT
           COUNT(*)                                          as total,
           COALESCE(SUM(CASE WHEN level='info'  THEN 1 ELSE 0 END), 0) as info,
           COALESCE(SUM(CASE WHEN level='warn'  THEN 1 ELSE 0 END), 0) as warn,
           COALESCE(SUM(CASE WHEN level='error' THEN 1 ELSE 0 END), 0) as error
         FROM _logs`,
      )
      .first<{ total: number; info: number; warn: number; error: number }>();
    return c.json({
      total: row?.total ?? 0,
      info: row?.info ?? 0,
      warn: row?.warn ?? 0,
      error: row?.error ?? 0,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({ error: "query_failed", detail: msg }, 500);
  }
});

/* ── GET /api/core/logs/settings — read retention settings ── */
logsRouter.get("/settings", requireAuth, async (c) => {
  try {
    const settings = await readLogsSettings(c.env.SYSTEM_DB);
    return c.json({ settings });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({ error: "read_failed", detail: msg }, 500);
  }
});

/* ── PATCH /api/core/logs/settings — update retention settings ── */
logsRouter.patch("/settings", requireAuth, requireRole("admin"), async (c) => {
  let body: unknown;
  try {
    body = JSON.parse(await c.req.text());
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }
  const parsed = patchSettingsSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "validation_failed", issues: parsed.error.flatten() }, 400);
  }
  try {
    const next = await writeLogsSettings(c.env.SYSTEM_DB, parsed.data);
    return c.json({ settings: next });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({ error: "write_failed", detail: msg }, 500);
  }
});

/* ── GET /api/core/logs — paginated list ── */
logsRouter.get("/", requireAuth, async (c) => {
  const parsed = listQuerySchema.safeParse(c.req.query());
  if (!parsed.success) {
    return c.json({ error: "validation_failed", issues: parsed.error.flatten() }, 400);
  }
  const { page, perPage, level, since, until } = parsed.data;
  const offset = (page - 1) * perPage;

  try {
    const db = c.env.SYSTEM_DB;
    // Build WHERE clause from optional level + time-range filters.
    const conditions: string[] = [];
    const countBinds: (string | number)[] = [];
    if (level) { conditions.push("level = ?"); countBinds.push(level); }
    if (since !== undefined) { conditions.push("created_at >= ?"); countBinds.push(since); }
    if (until !== undefined) { conditions.push("created_at < ?"); countBinds.push(until); }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const binds = [...countBinds, perPage, offset];

    const countRow = await db
      .prepare(`SELECT COUNT(*) as total FROM _logs ${where}`)
      .bind(...countBinds)
      .first<{ total: number }>();
    const total = countRow?.total ?? 0;

    const { results } = await db
      .prepare(
        `SELECT id, level, method, path, status, duration_ms, ip, user_agent, error, request_by, created_at
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
          requestBy: row.request_by ?? "anonymous",
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

/**
 * Persist a single request log entry + trim old rows. Designed to run
 * inside `c.executionCtx.waitUntil(...)` — never awaits from the
 * request path itself.
 *
 * Retention is configured via `_settings.logs`:
 *   - retentionLimit (>0): keep at most N most-recent rows
 *   - retentionDays  (>0): drop rows older than N days
 *   - time-based pruning runs at most once per hour (throttled by lastPrunedAt)
 */
export async function recordRequest(
  env: Env,
  entry: {
    level: LogLevel;
    method: string;
    path: string;
    status: number;
    durationMs: number;
    /** Epoch-ms captured at request start by the middleware. Using the
     *  caller-provided value (rather than Date.now() inside waitUntil)
     *  ensures the row's timestamp reflects when the request hit the
     *  server, not when the background write happened to fire. */
    startedAt: number;
    /** Who triggered the request — superuser email, "<collection>/<recordId>", or "anonymous". */
    requestBy: string;
    ip: string | null;
    userAgent: string | null;
    error: string | null;
  },
): Promise<void> {
  const id = crypto.randomUUID();
  const db = env.SYSTEM_DB;
  try {
    await db
      .prepare(
        `INSERT INTO _logs (id, level, method, path, status, duration_ms, ip, user_agent, error, request_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        entry.requestBy,
        entry.startedAt,
      )
      .run();

    // Load retention settings (fall back to defaults if missing).
    const s = await readLogsSettings(db);

    // Row-count cap — keep only the most recent N rows.
    if (s.retentionLimit > 0) {
      await db
        .prepare(
          `DELETE FROM _logs
            WHERE rowid NOT IN (
              SELECT rowid FROM _logs ORDER BY created_at DESC LIMIT ?
            )`,
        )
        .bind(s.retentionLimit)
        .run();
    }

    // Age-based pruning — throttled to at most once per hour so the
    // hot request path doesn't pay a full table scan on every write.
    const HOUR_MS = 3_600_000;
    const now = Date.now();
    if (
      s.retentionDays > 0 &&
      (s.lastPrunedAt === null || now - s.lastPrunedAt >= HOUR_MS)
    ) {
      const cutoff = now - s.retentionDays * 86_400_000;
      await db.prepare(`DELETE FROM _logs WHERE created_at < ?`).bind(cutoff).run();
      await writeLogsSettings(db, { lastPrunedAt: now });
    }
  } catch {
    // Swallow — logging must never break the request path. The most
    // common cause is the _logs table not existing yet (pre-install).
  }
}
