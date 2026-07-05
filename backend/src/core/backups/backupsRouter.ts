/**
 * Backups router — mounted at /api/core/backups
 *
 * Time-travel snapshots of the entire D1 database. Each snapshot is stored
 * as a JSON file in R2 under prefix `workerbase_db_backup/`, and a metadata
 * row is written to the `_backups` table in SYSTEM_DB (manifest). The
 * manifest is the source of truth for name / type / size / count / timestamps
 * so listing never depends on R2 customMetadata propagation.
 *
 * Endpoints:
 *   POST   /                — create a manual backup (admin)
 *   GET    /                — list backups (any superuser)
 *   GET    /:id             — download a backup JSON (any superuser)
 *   DELETE /:id             — delete a backup (admin)
 *   POST   /:id/restore     — restore DB to this snapshot (admin)
 *
 * Restore uses the **shadow-swap** pattern so the live DB is never
 * partially overwritten: shadow tables are built under
 * `_wb_restore_<name>`, then a single atomic `db.batch()` swaps them
 * into place. If any phase fails the live tables are untouched.
 *
 * Auto-snapshotting is driven by a Cloudflare Cron Trigger that calls
 * `runAutoBackupIfNeeded(env)` (exported below) — see `backend/src/index.ts`.
 */

import { Hono } from "hono";
import { z } from "zod";
import type { Env } from "../../env.js";
import { requireAuth, requireRole, currentUser } from "../../auth/middleware.js";

/* ═══════════════════════════════════════════════════════════════════
   Constants
   ═══════════════════════════════════════════════════════════════════ */

export const BACKUP_PREFIX = "workerbase_db_backup/";

/** Practical ceiling — R2 single-PUT is much higher but D1 read time +
 *  JSON.stringify memory pressure make ~45 MiB a sensible cap. */
export const MAX_BACKUP_BYTES = 45 * 1024 * 1024;

/** D1 batch statement count soft cap for restore row inserts. */
const RESTORE_BATCH_CHUNK = 500;

/** Backup id — filename without the prefix. No path separators allowed. */
const BACKUP_ID_RE = /^[a-zA-Z0-9_\-\.]+\.json$/;

/** Settings key under which the backup config is persisted in `_settings`. */
export const BACKUPS_SETTINGS_KEY = "backups";

export interface BackupsSettings {
  autoEnabled: boolean;
  /** Hours between automatic snapshots. Must be one of [1, 6, 12, 24, 168]. */
  intervalHours: number;
  /** Maximum number of backup rows to keep. Older rows are pruned on
   *  every create (manual or auto). 0 = unlimited. */
  maxRetention: number;
  /** ms epoch of the last successful auto snapshot; set by the scheduled
   *  handler and read by it to decide if a new one is due. */
  lastAutoAt: number | null;
}

export const DEFAULT_BACKUPS_SETTINGS: BackupsSettings = {
  autoEnabled: false,
  intervalHours: 24,
  maxRetention: 30,
  lastAutoAt: null,
};

export const ALLOWED_INTERVALS = new Set([1, 6, 12, 24, 168]);

/* ═══════════════════════════════════════════════════════════════════
   Zod schemas — exported for tests
   ═══════════════════════════════════════════════════════════════════ */

export const createBodySchema = z.object({
  name: z
    .string()
    .max(120, "name_too_long")
    .regex(/^[a-zA-Z0-9 _\-]*$/, "invalid_name")
    .optional(),
});

export const listQuerySchema = z.object({
  cursor: z.string().max(1024).optional(),
  limit: z
    .union([z.string(), z.number()])
    .optional()
    .transform((v) => {
      if (v === undefined || v === null || v === "") return 200;
      const n = typeof v === "number" ? v : parseInt(v, 10);
      if (Number.isNaN(n) || n < 1) return 200;
      return Math.min(n, 500);
    }),
});

export const settingsPatchSchema = z.object({
  autoEnabled: z.boolean().optional(),
  intervalHours: z
    .union([z.number().int(), z.string()])
    .optional()
    .transform((v) => (typeof v === "string" ? parseInt(v, 10) : v))
    .refine((v) => v === undefined || ALLOWED_INTERVALS.has(v), {
      message: "intervalHours must be one of 1, 6, 12, 24, 168",
    }),
  maxRetention: z
    .union([z.number().int().min(0).max(10000), z.string()])
    .optional()
    .transform((v) => (typeof v === "string" ? parseInt(v, 10) : v))
    .refine((v) => v === undefined || (v >= 0 && v <= 10000), {
      message: "maxRetention must be 0..10000",
    }),
});

/** Validate a backup id — used for /:id routes. */
export function validateBackupId(raw: string): string {
  if (typeof raw !== "string" || raw.length === 0) throw new Error("invalid_id");
  if (raw.length > 1024) throw new Error("id_too_long");
  if (raw.includes("..") || raw.includes("/")) throw new Error("invalid_id");
  if (!BACKUP_ID_RE.test(raw)) throw new Error("invalid_id");
  return raw;
}

/** Slugify a user-supplied name into a filename-safe fragment. */
export function slugifyName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/** Build the R2 key (full, including prefix) for a new backup. */
export function buildBackupKey(name: string, now = new Date()): string {
  const iso = now.toISOString();
  // Filename-safe & lexicographically sortable: 2026-07-05T14-21-22-123Z
  const sortable = iso.replace(/:/g, "-");
  const slug = slugifyName(name);
  const uuid = crypto.randomUUID().slice(0, 8);
  const tail = slug ? `${slug}_${uuid}.json` : `${uuid}.json`;
  return `${BACKUP_PREFIX}${sortable}_${tail}`;
}

/* ═══════════════════════════════════════════════════════════════════
   Types
   ═══════════════════════════════════════════════════════════════════ */

interface MasterRow {
  name: string;
  type: string;
  tbl_name: string | null;
  sql: string | null;
}

interface PragmaInfo {
  name: string;
  type: string;
  notNull: number;
  dflt_value: string | null;
  pk: number;
}

interface BackupObject {
  name: string;
  type: string;
  ddl: string | null;
  schema: PragmaInfo[] | null;
  rowCount: number | null;
  rows: Record<string, unknown>[] | null;
}

interface BackupPayload {
  version: 1;
  name: string;
  type: "manual" | "auto";
  createdAt: string;
  generatedBy: string;
  objects: BackupObject[];
}

export interface BackupRow {
  id: string;
  name: string;
  type: "manual" | "auto";
  sizeBytes: number;
  objectCount: number;
  createdAt: number; // ms epoch
  generatedBy: string | null;
}

interface SettingsRow {
  key: string;
  value: string | null;
}

/* ═══════════════════════════════════════════════════════════════════
   Settings helpers
   ═══════════════════════════════════════════════════════════════════ */

export async function readBackupsSettings(db: D1Database): Promise<BackupsSettings> {
  const { results } = await db
    .prepare(`SELECT key, value FROM _settings WHERE key = ?`)
    .bind(BACKUPS_SETTINGS_KEY)
    .all<SettingsRow>();
  const row = (results ?? [])[0];
  if (!row || !row.value) return { ...DEFAULT_BACKUPS_SETTINGS };
  try {
    const parsed = JSON.parse(row.value) as Partial<BackupsSettings>;
    return {
      autoEnabled: parsed.autoEnabled ?? DEFAULT_BACKUPS_SETTINGS.autoEnabled,
      intervalHours: ALLOWED_INTERVALS.has(parsed.intervalHours ?? 0)
        ? (parsed.intervalHours as number)
        : DEFAULT_BACKUPS_SETTINGS.intervalHours,
      maxRetention:
        typeof parsed.maxRetention === "number"
          ? parsed.maxRetention
          : DEFAULT_BACKUPS_SETTINGS.maxRetention,
      lastAutoAt:
        typeof parsed.lastAutoAt === "number" ? parsed.lastAutoAt : null,
    };
  } catch {
    return { ...DEFAULT_BACKUPS_SETTINGS };
  }
}

async function writeBackupsSettings(
  db: D1Database,
  patch: Partial<BackupsSettings>,
): Promise<void> {
  const current = await readBackupsSettings(db);
  const merged = { ...current, ...patch };
  await db
    .prepare(
      `INSERT INTO _settings (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    )
    .bind(BACKUPS_SETTINGS_KEY, JSON.stringify(merged), Date.now())
    .run();
}

/* ═══════════════════════════════════════════════════════════════════
   Manifest helpers
   ═══════════════════════════════════════════════════════════════════ */

async function insertManifestRow(
  db: D1Database,
  row: BackupRow,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO _backups (id, name, type, size_bytes, object_count, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(row.id, row.name, row.type, row.sizeBytes, row.objectCount, row.generatedBy, row.createdAt)
    .run();
}

async function deleteManifestRow(db: D1Database, id: string): Promise<void> {
  await db.prepare(`DELETE FROM _backups WHERE id = ?`).bind(id).run();
}

async function listManifestRows(db: D1Database, limit: number): Promise<BackupRow[]> {
  const { results } = await db
    .prepare(
      `SELECT id, name, type, size_bytes AS sizeBytes, object_count AS objectCount,
              created_at AS createdAt, created_by AS generatedBy
         FROM _backups
         ORDER BY created_at DESC
         LIMIT ?`,
    )
    .bind(limit)
    .all<BackupRow>();
  return (results ?? []) as BackupRow[];
}

async function getManifestRow(db: D1Database, id: string): Promise<BackupRow | null> {
  const { results } = await db
    .prepare(
      `SELECT id, name, type, size_bytes AS sizeBytes, object_count AS objectCount,
              created_at AS createdAt, created_by AS generatedBy
         FROM _backups WHERE id = ?`,
    )
    .bind(id)
    .all<BackupRow>();
  return (results ?? [])[0] ?? null;
}

/** Apply retention policy. If `maxRetention > 0` and the manifest count
 *  exceeds it, delete the oldest rows AND their R2 objects. Returns the
 *  number of backups pruned. */
async function applyRetention(env: Env): Promise<number> {
  const settings = await readBackupsSettings(env.SYSTEM_DB);
  if (!settings.maxRetention || settings.maxRetention <= 0) return 0;

  const { results } = await env.SYSTEM_DB
    .prepare(
      `SELECT id FROM _backups
         WHERE id IN (
           SELECT id FROM _backups
           ORDER BY created_at DESC
           LIMIT -1 OFFSET ?
         )`,
    )
    .bind(settings.maxRetention)
    .all<{ id: string }>();

  const toPrune = (results ?? []) as { id: string }[];
  if (toPrune.length === 0) return 0;

  for (const row of toPrune) {
    try {
      await env.STORAGE.delete(BACKUP_PREFIX + row.id);
    } catch {
      // R2 already gone — still drop the manifest row.
    }
    await deleteManifestRow(env.SYSTEM_DB, row.id);
  }
  return toPrune.length;
}

/* ═══════════════════════════════════════════════════════════════════
   Snapshot helpers (shared between manual + auto paths)
   ═══════════════════════════════════════════════════════════════════ */

function qident(name: string): string {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
    throw new Error(`unsafe_identifier:${name}`);
  }
  return `"${name}"`;
}

/**
 * D1 / SQLite protect certain tables from being DROPped or ALTERed by user
 * code — attempting to do so returns `SQLITE_AUTH`. Filter them out of
 * both the snapshot and the restore swap list.
 *
 * Protected prefixes:
 *   - `sqlite_%`  — SQLite internals (sqlite_sequence, sqlite_master, …)
 *   - `_cf_%`     — Cloudflare D1 internals (e.g. _cf_KV)
 *   - `d1_%`      — D1 bookkeeping
 *
 * We also exclude our own shadow-table prefix `_wb_restore_%` so a
 * failed restore can never re-snapshot its own scratch tables.
 */
export function isProtectedTableName(name: string): boolean {
  return (
    name.startsWith("sqlite_") ||
    name.startsWith("_cf_") ||
    name.startsWith("d1_") ||
    name.startsWith("_wb_restore_")
  );
}

/**
 * Whether a `sqlite_master` object should be excluded from the backup
 * payload entirely. In addition to D1-protected names, this excludes
 * every WorkerBase system table (anything `_`-prefixed) and any
 * index / trigger whose parent table is excluded — so snapshots contain
 * only user data (real collections + their views / indexes / triggers).
 *
 * Per the project naming rule, user-created collection names must match
 * `^[a-zA-Z][a-zA-Z0-9_]*$` — they cannot start with `_`. Any
 * underscore-prefixed table is therefore a WorkerBase system table.
 */
export function shouldExcludeFromBackup(
  name: string,
  tblName: string | null,
): boolean {
  if (isProtectedTableName(name)) return true;
  // WorkerBase system tables (underscore-prefixed) and any object
  // whose parent table is a system table.
  if (name.startsWith("_")) return true;
  if (tblName) {
    if (isProtectedTableName(tblName)) return true;
    if (tblName.startsWith("_")) return true;
  }
  return false;
}

/** Dump the entire DB to a BackupPayload (in memory). Throws on errors. */
async function buildBackupPayload(
  env: Env,
  opts: { name: string; type: "manual" | "auto"; generatedBy: string },
): Promise<{ payload: BackupPayload; serialized: string; key: string; id: string }> {
  const db = env.SYSTEM_DB;
  const masterRes = await db
    .prepare(
      `SELECT name, type, tbl_name, sql FROM sqlite_master
         WHERE type IN ('table','view','index','trigger')
           AND name NOT LIKE 'sqlite\\_%' ESCAPE '\\'
           AND name NOT LIKE '\\_cf\\_%' ESCAPE '\\'
           AND name NOT LIKE 'd1\\_%' ESCAPE '\\'
           AND name NOT LIKE '\\_wb\\_restore\\_%' ESCAPE '\\'
           AND name NOT LIKE '\\_%' ESCAPE '\\'
           AND COALESCE(tbl_name, name) NOT LIKE '\\_%' ESCAPE '\\'
         ORDER BY type DESC, name ASC`,
    )
    .all<MasterRow>();
  const masters = ((masterRes.results ?? []) as MasterRow[]).filter(
    (m) => !shouldExcludeFromBackup(m.name, m.tbl_name),
  );

  const typeRank: Record<string, number> = { table: 0, view: 1, index: 2, trigger: 3 };
  masters.sort((a, b) => (typeRank[a.type] ?? 9) - (typeRank[b.type] ?? 9));

  const objects: BackupObject[] = [];
  for (const m of masters) {
    const obj: BackupObject = {
      name: m.name,
      type: m.type,
      ddl: m.sql,
      schema: null,
      rowCount: null,
      rows: null,
    };

    if (m.type === "table") {
      try {
        const pi = await db
          .prepare(`PRAGMA table_info(${qident(m.name)})`)
          .all<PragmaInfo>();
        obj.schema = (pi.results ?? []) as PragmaInfo[];
      } catch {
        obj.schema = [];
      }

      try {
        const rr = await db
          .prepare(`SELECT * FROM ${qident(m.name)}`)
          .all<Record<string, unknown>>();
        obj.rows = (rr.results ?? []) as Record<string, unknown>[];
        obj.rowCount = obj.rows.length;
      } catch {
        obj.rows = [];
        obj.rowCount = 0;
      }
    }

    objects.push(obj);
  }

  const createdAt = new Date().toISOString();
  const payload: BackupPayload = {
    version: 1,
    name: opts.name,
    type: opts.type,
    createdAt,
    generatedBy: opts.generatedBy,
    objects,
  };
  const serialized = JSON.stringify(payload);
  const key = buildBackupKey(opts.name, new Date(createdAt));
  const id = key.slice(BACKUP_PREFIX.length);
  return { payload, serialized, key, id };
}

/** Core create-snapshot routine. Used by both the manual POST endpoint
 *  and the auto-snapshot scheduler. */
export async function createSnapshot(
  env: Env,
  opts: { name: string; type: "manual" | "auto"; generatedBy: string },
): Promise<BackupRow> {
  const { payload, serialized, key, id } = await buildBackupPayload(env, opts);

  if (serialized.length > MAX_BACKUP_BYTES) {
    throw new Error(
      `backup_too_large: ${serialized.length} > ${MAX_BACKUP_BYTES}`,
    );
  }

  await env.STORAGE.put(key, serialized, {
    httpMetadata: { contentType: "application/json" },
    customMetadata: {
      // Mirror in customMetadata as belt-and-suspenders — the _backups
      // manifest is the source of truth for listings.
      name: opts.name,
      type: opts.type,
      createdAt: payload.createdAt,
    },
  });

  const row: BackupRow = {
    id,
    name: opts.name,
    type: opts.type,
    sizeBytes: serialized.length,
    objectCount: payload.objects.length,
    createdAt: Date.parse(payload.createdAt) || Date.now(),
    generatedBy: opts.generatedBy,
  };

  await insertManifestRow(env.SYSTEM_DB, row);

  // Apply retention — best effort, never fail the create.
  try {
    await applyRetention(env);
  } catch {
    /* retention errors shouldn't fail the create */
  }

  return row;
}

/**
 * Entry point for the Cloudflare Cron Trigger.
 *
 * Reads settings; if `autoEnabled` and enough time has elapsed since
 * `lastAutoAt`, creates an automatic snapshot. Returns the new BackupRow
 * or null if no snapshot was taken.
 */
export async function runAutoBackupIfNeeded(env: Env): Promise<BackupRow | null> {
  const settings = await readBackupsSettings(env.SYSTEM_DB);
  if (!settings.autoEnabled) return null;

  const now = Date.now();
  const last = settings.lastAutoAt ?? 0;
  const elapsed = now - last;
  const intervalMs = settings.intervalHours * 60 * 60 * 1000;

  if (elapsed < intervalMs) return null;

  const row = await createSnapshot(env, {
    name: `Automatic ${new Date().toISOString()}`,
    type: "auto",
    generatedBy: "system",
  });

  await writeBackupsSettings(env.SYSTEM_DB, { lastAutoAt: now });
  return row;
}

/* ═══════════════════════════════════════════════════════════════════
   Router
   ═══════════════════════════════════════════════════════════════════ */

export const backupsRouter = new Hono<{ Bindings: Env }>();

/* ── POST / — create a manual backup ───────────────────────────── */
backupsRouter.post("/", requireAuth, requireRole("admin"), async (c) => {
  let body: unknown;
  try {
    const raw = await c.req.text();
    body = raw ? JSON.parse(raw) : {};
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }

  const parsed = createBodySchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "validation_failed", issues: parsed.error.flatten() }, 400);
  }
  const name = (parsed.data.name ?? "").trim();
  const user = currentUser(c);

  let row: BackupRow;
  try {
    row = await createSnapshot(c.env, {
      name,
      type: "manual",
      generatedBy: user?.email ?? "unknown",
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.startsWith("backup_too_large")) {
      const [, sizeStr, maxStr] = msg.match(/backup_too_large: (\d+) > (\d+)/) ?? [];
      return c.json(
        {
          error: "backup_too_large",
          sizeBytes: sizeStr ? Number(sizeStr) : 0,
          maxBytes: maxStr ? Number(maxStr) : MAX_BACKUP_BYTES,
        },
        413,
      );
    }
    return c.json({ error: "create_failed", detail: msg }, 500);
  }

  return c.json(
    {
      id: row.id,
      key: BACKUP_PREFIX + row.id,
      name: row.name,
      type: row.type,
      createdAt: new Date(row.createdAt).toISOString(),
      sizeBytes: row.sizeBytes,
      objectCount: row.objectCount,
    },
    201,
  );
});

/* ── GET / — list backups ──────────────────────────────────────── */
backupsRouter.get("/", requireAuth, async (c) => {
  const parsed = listQuerySchema.safeParse({
    cursor: c.req.query("cursor") ?? undefined,
    limit: c.req.query("limit") ?? undefined,
  });
  if (!parsed.success) {
    return c.json({ error: "validation_failed", issues: parsed.error.flatten() }, 400);
  }
  const { limit } = parsed.data;
  const rows = await listManifestRows(c.env.SYSTEM_DB, limit);
  return c.json({
    backups: rows.map((r) => ({
      ...r,
      createdAt: new Date(r.createdAt).toISOString(),
    })),
    truncated: false,
  });
});

/* ── GET /settings — read backup settings ──────────────────────── */
backupsRouter.get("/settings", requireAuth, async (c) => {
  const settings = await readBackupsSettings(c.env.SYSTEM_DB);
  return c.json({ settings });
});

/* ── PATCH /settings — update backup settings ──────────────────── */
backupsRouter.patch(
  "/settings",
  requireAuth,
  requireRole("admin"),
  async (c) => {
    let body: unknown;
    try {
      const raw = await c.req.text();
      body = raw ? JSON.parse(raw) : {};
    } catch {
      return c.json({ error: "invalid_json" }, 400);
    }

    const parsed = settingsPatchSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: "validation_failed", issues: parsed.error.flatten() }, 400);
    }

    // Don't let callers set lastAutoAt via this endpoint — it's the
    // scheduler's bookkeeping field.
    const { lastAutoAt: _omit, ...patch } = parsed.data as Partial<BackupsSettings>;
    void _omit;

    await writeBackupsSettings(c.env.SYSTEM_DB, patch);
    const next = await readBackupsSettings(c.env.SYSTEM_DB);
    return c.json({ settings: next });
  },
);

/* ── POST /cleanup-shadows — drop leftover _wb_restore_* tables ── */
backupsRouter.post(
  "/cleanup-shadows",
  requireAuth,
  requireRole("admin"),
  async (c) => {
    const db = c.env.SYSTEM_DB;
    try {
      const { results } = await db
        .prepare(
          `SELECT name FROM sqlite_master
             WHERE type='table' AND name LIKE '\\_wb\\_restore\\_%' ESCAPE '\\'`,
        )
        .all<{ name: string }>();
      const dropped: string[] = [];
      for (const row of (results ?? []) as { name: string }[]) {
        // Defense in depth: only drop actual shadow tables.
        if (!row.name.startsWith("_wb_restore_")) continue;
        try {
          await db.prepare(`DROP TABLE IF EXISTS ${qident(row.name)}`).run();
          dropped.push(row.name);
        } catch {
          // best-effort — keep going
        }
      }
      return c.json({ dropped, count: dropped.length });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return c.json({ error: "shadow_cleanup_failed", detail: msg }, 500);
    }
  },
);

/* ── GET /:id — download backup JSON ───────────────────────────── */
backupsRouter.get("/:id", requireAuth, async (c) => {
  let id: string;
  try {
    id = validateBackupId(c.req.param("id"));
  } catch (err) {
    const code = err instanceof Error ? err.message : "invalid_id";
    return c.json({ error: code }, 400);
  }

  const key = BACKUP_PREFIX + id;
  const obj = await c.env.STORAGE.get(key);
  if (!obj) return c.json({ error: "not_found" }, 404);

  const body = await obj.arrayBuffer();
  const filename = id.replace(/[^a-zA-Z0-9_\-\.]/g, "_");

  return new Response(body, {
    headers: {
      "Content-Type": "application/json",
      "Content-Length": String(obj.size),
      "Content-Disposition": `attachment; filename="${filename}"`,
      ETag: obj.etag,
    },
  });
});

/* ── DELETE /:id — delete backup ───────────────────────────────── */
backupsRouter.delete("/:id", requireAuth, requireRole("admin"), async (c) => {
  let id: string;
  try {
    id = validateBackupId(c.req.param("id"));
  } catch (err) {
    const code = err instanceof Error ? err.message : "invalid_id";
    return c.json({ error: code }, 400);
  }

  // Verify existence in the manifest first.
  const row = await getManifestRow(c.env.SYSTEM_DB, id);
  if (!row) return c.json({ error: "not_found" }, 404);

  try {
    await c.env.STORAGE.delete(BACKUP_PREFIX + id);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({ error: "r2_delete_failed", detail: msg }, 500);
  }
  await deleteManifestRow(c.env.SYSTEM_DB, id);

  return c.json({ success: true });
});

/* ── POST /:id/restore — transactional restore ─────────────────── */
backupsRouter.post(
  "/:id/restore",
  requireAuth,
  requireRole("admin"),
  async (c) => {
    let id: string;
    try {
      id = validateBackupId(c.req.param("id"));
    } catch (err) {
      const code = err instanceof Error ? err.message : "invalid_id";
      return c.json({ error: code }, 400);
    }

    const key = BACKUP_PREFIX + id;
    const obj = await c.env.STORAGE.get(key);
    if (!obj) return c.json({ error: "not_found" }, 404);

    let text: string;
    try {
      text = await obj.text();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return c.json({ error: "r2_read_failed", detail: msg }, 500);
    }

    let payload: BackupPayload;
    try {
      payload = JSON.parse(text) as BackupPayload;
    } catch {
      return c.json({ error: "invalid_backup_json" }, 500);
    }

    if (!payload || !Array.isArray(payload.objects)) {
      return c.json({ error: "invalid_backup_shape" }, 500);
    }

    const tables = payload.objects.filter(
      (o) => o.type === "table" && !shouldExcludeFromBackup(o.name, null),
    );
    const others = payload.objects.filter(
      (o) => o.type !== "table" && !shouldExcludeFromBackup(o.name, null),
    );

    const db = c.env.SYSTEM_DB;

    /* Phase 0: clean shadow tables from prior failed restore. */
    try {
      const { results } = await db
        .prepare(
          `SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '_wb_restore_%'`,
        )
        .all<{ name: string }>();
      for (const row of (results ?? []) as { name: string }[]) {
        // Use prepare().run() — db.exec() does not handle multi-line DDL.
        await db.prepare(`DROP TABLE IF EXISTS ${qident(row.name)}`).run();
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return c.json({ error: "shadow_cleanup_failed", detail: msg, phase: 0 }, 500);
    }

    /* Phase 1: build shadow tables. Live DB untouched. */
    try {
      for (const t of tables) {
        const shadow = `_wb_restore_${t.name}`;
        if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(t.name)) {
          throw new Error(`unsafe_table_name:${t.name}`);
        }

        await db.prepare(`DROP TABLE IF EXISTS ${qident(shadow)}`).run();

        let createSql: string;
        if (t.ddl && t.ddl.length > 0) {
          const re = new RegExp(
            `^(CREATE\\s+(?:TEMP\\s+|IF\\s+NOT\\s+EXISTS\\s*)*TABLE\\s+(?:\\"|\\\`|\\[)?)${t.name}((?:\\"|\\\`|\\])?\\s*\\()`,
            "i",
          );
          const replaced = t.ddl.replace(re, `$1${shadow}$2`);
          createSql = replaced === t.ddl
            ? t.ddl.replace(new RegExp(`\\b${t.name}\\b`), shadow)
            : replaced;
        } else if (t.schema && t.schema.length > 0) {
          const cols = t.schema
            .map((s) => {
              const parts = [qident(s.name), s.type || "TEXT"];
              if (s.notNull) parts.push("NOT NULL");
              if (s.pk) parts.push("PRIMARY KEY");
              if (s.dflt_value !== null) parts.push(`DEFAULT '${String(s.dflt_value).replace(/'/g, "''")}'`);
              return parts.join(" ");
            })
            .join(", ");
          createSql = `CREATE TABLE ${qident(shadow)} (${cols})`;
        } else {
          throw new Error(`no_schema_for_table:${t.name}`);
        }

        // Strip any trailing semicolons — D1's prepare() takes a single
        // statement and rejects trailing junk. db.exec() would have been
        // the alternative but it cannot parse multi-line CREATE TABLE
        // DDL (it splits on newlines and yields "incomplete input").
        createSql = createSql.replace(/;\s*$/, "");

        await db.prepare(createSql).run();

        const rows = t.rows ?? [];
        if (rows.length > 0) {
          const cols = Object.keys(rows[0]!);
          const placeholders = cols.map(() => "?").join(", ");
          const colList = cols.map(qident).join(", ");
          const insertSql = `INSERT INTO ${qident(shadow)} (${colList}) VALUES (${placeholders});`;

          for (let i = 0; i < rows.length; i += RESTORE_BATCH_CHUNK) {
            const chunk = rows.slice(i, i + RESTORE_BATCH_CHUNK);
            const stmts = chunk.map((row) =>
              db.prepare(insertSql).bind(...cols.map((c2) => (row as Record<string, unknown>)[c2])),
            );
            await db.batch(stmts);
          }
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return c.json({ error: "restore_build_failed", detail: msg, phase: 1 }, 500);
    }

    /* Phase 1.5: pre-flight existence check. */
    try {
      const { results } = await db
        .prepare(
          `SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '_wb_restore_%'`,
        )
        .all<{ name: string }>();
      const existing = new Set((results ?? []).map((r) => r.name));
      for (const t of tables) {
        if (!existing.has(`_wb_restore_${t.name}`)) {
          throw new Error(`missing_shadow_table:_wb_restore_${t.name}`);
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return c.json({ error: "restore_preflight_failed", detail: msg, phase: 1.5 }, 500);
    }

    /* Phase 2: atomic swap.
     *
     * Split into two batches:
     *   2a — drop views / indexes / triggers, drop live tables, rename
     *        shadows into place. All atomic.
     *   2b — recreate views / indexes / triggers from stored DDL. Run as
     *        a separate batch because D1 batches do not let a CREATE VIEW
     *        see the schema changes made by earlier statements in the
     *        same batch (the view's SELECT compiles against the pre-batch
     *        schema and fails with "no such table").
     *
     * If 2a fails, the live DB is unchanged (D1 rolled the batch back).
     * If 2b fails, tables are correctly restored but views / indexes /
     * triggers may be missing — they can be re-created by retrying the
     * restore. */
    try {
      // 2a: drop dependents first, then swap tables.
      const dropDeps: D1PreparedStatement[] = [];
      for (const o of others) {
        if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(o.name)) continue;
        const kw =
          o.type === "view" ? "VIEW" :
          o.type === "index" ? "INDEX" :
          o.type === "trigger" ? "TRIGGER" : null;
        if (!kw) continue;
        dropDeps.push(db.prepare(`DROP ${kw} IF EXISTS ${qident(o.name)};`));
      }
      const swapTables: D1PreparedStatement[] = [];
      for (const t of tables) {
        const live = qident(t.name);
        const shadow = qident(`_wb_restore_${t.name}`);
        swapTables.push(db.prepare(`DROP TABLE IF EXISTS ${live};`));
        swapTables.push(db.prepare(`ALTER TABLE ${shadow} RENAME TO ${live};`));
      }
      await db.batch([...dropDeps, ...swapTables]);

      // 2b: recreate views / indexes / triggers now that the renamed
      // tables are visible to a fresh batch.
      const recreate: D1PreparedStatement[] = [];
      for (const o of others) {
        if (o.ddl && o.ddl.length > 0 && /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(o.name)) {
          recreate.push(db.prepare(o.ddl));
        }
      }
      if (recreate.length > 0) {
        await db.batch(recreate);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return c.json(
        {
          error: "restore_swap_failed",
          detail: msg,
          phase: 2,
          note: "Live database is unchanged. Shadow tables (_wb_restore_*) were left in place and will be cleaned up on the next restore attempt.",
        },
        500,
      );
    }

    return c.json({
      restored: payload.objects.length,
      tables: tables.length,
      swappedAt: new Date().toISOString(),
    });
  },
);
