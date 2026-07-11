/**
 * Metadata routes for dynamic collections.
 *
 * Routes (mounted at `/` of the composer, which is mounted at
 * `/api/core/collections`):
 *   POST   /                  — create a new collection (base / user / view)
 *   GET    /                  — list all collections
 *   GET    /:name             — single collection metadata
 *   DELETE /:name             — delete a collection (drops table/view)
 *   PATCH  /:name             — schema migration + metadata update
 */
import { Hono } from "hono";
import type { Env } from "../../env.js";
import type { FieldDefinition, CollectionType } from "../../db/schema.js";
import { requireAuth, requireRole } from "../../auth/middleware.js";
import { diffSchema, applyMigration } from "./migrations.js";
import {
  AUTH_COLUMNS,
  AUTH_RESERVED_COLUMNS,
  HIDDEN,
  NAME_RE,
  assertIdentifier,
  isSafeSelectQuery,
  renderCreateTable,
  renderCreateView,
  seedAutoIncrement,
  validateViewQuery,
} from "./ddl.js";
import {
  createCollectionSchema,
  patchBaseSchema,
  patchUserSchema,
  patchViewSchema,
} from "./schemas.js";

export const metadataRouter = new Hono<{ Bindings: Env }>();

/**
 * Map a raw SQLite declared type + column name to a WorkerBase display
 * type. SQLite stores datetimes as `INTEGER` (epoch ms/s), so PRAGMA
 * alone can't distinguish a timestamp from a plain counter — the column
 * name is the signal (`created_at`, `updated_at`, `expires_at`, etc.).
 *
 * This is type NORMALISATION, not column forcing: the column must
 * physically exist in PRAGMA output to appear at all. We're only
 * providing a better type label for the dashboard's renderer.
 */
export function normalizeType(columnName: string, sqliteType: string): string {
  const raw = (sqliteType || "text").toLowerCase();

  // Column-name-driven datetime detection. Matches the naming convention
  // used across every system table and every auto-managed column.
  if (
    raw === "integer" &&
    (/._at$/.test(columnName) ||
      columnName === "created" ||
      columnName === "timestamp" ||
      columnName === "expires" ||
      columnName === "lastRunAt" ||
      columnName === "lastAutoAt")
  ) {
    return "datetime";
  }

  // Map raw SQLite types to WorkerBase display types.
  switch (raw) {
    case "integer":
    case "int":
      return "integer";
    case "real":
    case "float":
    case "double":
      return "real";
    case "blob":
      return "blob";
    case "datetime":
    case "timestamp":
      return "datetime";
    case "date":
      return "date";
    case "boolean":
    case "bool":
      return "bool";
    default:
      return raw || "text";
  }
}

/**
 * Fetch the ACTUAL columns of a table or view directly from the database
 * via `PRAGMA table_info`. This is the single source of truth for which
 * columns physically exist — no hardcoded or forced columns, ever.
 *
 * Returns `{ name, type }` pairs where `type` is normalised to a
 * WorkerBase display type via `normalizeType()`. Callers may further
 * refine types using the stored `_collections.schema` JSON via
 * `resolveLiveSchema()`.
 */
async function fetchPragmaColumns(
  db: D1Database,
  name: string,
): Promise<{ name: string; type: string }[]> {
  // Guard against anything that isn't a safe identifier — PRAGMA doesn't
  // accept parameterised table names, so we inline after asserting shape.
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) return [];
  try {
    const { results } = await db
      .prepare(`PRAGMA table_info("${name}")`)
      .all();
    return (results ?? [])
      .filter((r) => typeof (r as { name?: unknown }).name === "string")
      .map((r) => {
        const row = r as { name: string; type?: string };
        return { name: row.name, type: normalizeType(row.name, row.type ?? "") };
      });
  } catch {
    return [];
  }
}

/**
 * Build the display schema for a collection.
 *
 * Column names + count ALWAYS come from `PRAGMA table_info` — the actual
 * database structure. No hardcoded `id`/`created_at`/`updated_at` are
 * injected; whatever columns the table physically has is what the
 * dashboard sees.
 *
 * If a stored schema exists (from `_collections.schema`), its richer
 * WorkerBase field type (e.g. `"datetime"`, `"editor"`) is mapped onto
 * matching PRAGMA columns to improve display rendering. Columns that
 * exist in the DB but aren't in the stored schema keep their raw SQLite
 * type. Columns in the stored schema that don't exist in the DB are
 * dropped (stale metadata).
 */
async function resolveLiveSchema(
  db: D1Database,
  name: string,
  stored: FieldDefinition[] | null,
): Promise<FieldDefinition[]> {
  const pragmaCols = await fetchPragmaColumns(db, name);
  if (pragmaCols.length === 0) return [];

  // No stored schema — synthesize minimal FieldDefinitions from PRAGMA so
  // the dashboard still sees real columns. Synthesized ids are stable for
  // the session (a function of column name) so toggling flags in the UI
  // then saving does not look like a drop+add.
  if (!stored || stored.length === 0) {
    return pragmaCols.map((col) => ({
      id: `col_${col.name}`,
      name: col.name,
      type: col.type as FieldDefinition["type"],
      required: false,
      unique: false,
      hidden: false,
      options: {},
    }));
  }

  // Merge stored FieldDefinitions (rich metadata + stable id) with the
  // live PRAGMA columns.
  //
  // ORDERING: we iterate the STORED schema, not PRAGMA. SQLite physically
  // appends every ALTER TABLE ADD COLUMN to the end of the table, so
  // PRAGMA order ≠ the order the user arranged in the editor. The stored
  // schema is the source of truth for both metadata and ordering. Any
  // live PRAGMA columns that aren't in the stored schema (e.g. columns
  // added directly in SQL, or freshly-injected auth columns) are appended
  // at the end so they remain visible without disturbing the user's
  // intended field order.
  //
  // SYSTEM COLUMN POSITIONS: `id` is always first, `created_at` and
  // `updated_at` are always last — regardless of where they appear in
  // the stored schema or PRAGMA. This matches the physical DDL layout
  // (`renderCreateTable` emits id → user fields → created_at → updated_at)
  // and keeps the dashboard's field editor predictable.
  const pragmaNames = new Set(pragmaCols.map((c) => c.name));
  const storedByName = new Map(stored.map((f) => [f.name, f]));

  const ordered: FieldDefinition[] = stored
    .filter((f) => pragmaNames.has(f.name))
    .map((f) => storedByName.get(f.name)!);

  for (const col of pragmaCols) {
    if (!storedByName.has(col.name)) {
      ordered.push({
        id: `col_${col.name}`,
        name: col.name,
        type: col.type as FieldDefinition["type"],
        required: false,
        unique: false,
        hidden: false,
        options: {},
      });
    }
  }

  // Enforce system column positions: id first, created_at/updated_at last.
  const SYSTEM_FIRST = new Set(["id"]);
  const SYSTEM_LAST = new Set(["created_at", "updated_at"]);
  const first = ordered.filter((f) => SYSTEM_FIRST.has(f.name));
  const middle = ordered.filter((f) => !SYSTEM_FIRST.has(f.name) && !SYSTEM_LAST.has(f.name));
  const last = ordered.filter((f) => SYSTEM_LAST.has(f.name));
  return [...first, ...middle, ...last];
}

/** Escape a literal string for safe embedding inside a RegExp constructor. */
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Pure helper — given the OTHER collections' metadata rows and the old
 * name being renamed away from, return a list of human-readable reasons
 * the rename must be refused. Empty array = safe to rename.
 *
 * Exported for unit tests; the live PATCH handler calls this with rows
 * fetched from `_collections`.
 */
export function findRenameReferences(
  rows: { name: string; schema: string | null; query: string | null }[],
  oldName: string,
): string[] {
  const blockedBy: string[] = [];
  for (const r of rows) {
    // relation check (base/user only — schema holds field defs)
    if (r.schema) {
      try {
        const fields = JSON.parse(r.schema) as {
          name?: string;
          type?: string;
          options?: { targetCollection?: string };
        }[];
        const refs = fields.some(
          (f) => f.type === "relation" && f.options?.targetCollection === oldName,
        );
        if (refs) {
          blockedBy.push(`${r.name} (relation)`);
          continue;
        }
      } catch {
        /* malformed schema — skip */
      }
    }
    // view query check — conservative word-boundary match
    if (r.query) {
      const re = new RegExp(`\\b${escapeRegex(oldName)}\\b`, "i");
      if (re.test(r.query)) {
        blockedBy.push(`${r.name} (view query)`);
      }
    }
  }
  return blockedBy;
}

metadataRouter.post("/", requireAuth, requireRole("admin"), async (c) => {
  let body: unknown;
  try {
    const raw = await c.req.text();
    body = raw ? JSON.parse(raw) : {};
  } catch {
    return c.json({ error: "invalid JSON body" }, 400);
  }

  const parsed = createCollectionSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "validation_failed", issues: parsed.error.flatten() }, 400);
  }

  const spec = parsed.data;
  const id = crypto.randomUUID();
  const now = Date.now();
  let ddl: string;

  // Build the schema JSON for storage + the DDL for the physical table.
  // Track which user-defined fields survive into the DDL so the stored
  // schema matches the physical table.
  let persistedSchema: FieldDefinition[] | null = null;
  if (spec.type === "view") {
    // Validate the SELECT query before touching sqlite_master.
    if (!isSafeSelectQuery(spec.query)) {
      return c.json({ error: "unsafe_view_query" }, 400);
    }
    const explainErr = await validateViewQuery(c.env.SYSTEM_DB, spec.query);
    if (explainErr) {
      return c.json({ error: "invalid_view_query", detail: explainErr }, 400);
    }
    ddl = renderCreateView(spec.name, spec.query);
  } else {
    // For auth collections, prepend auth columns.
    let allFields: { name: string; type: string; required?: boolean; unique?: boolean; default?: string | number | boolean | null }[] = [];
    if (spec.type === "user") {
      allFields = [...AUTH_COLUMNS];
    }
    // Add user-defined fields. Drop:
    //   - system columns (id, created, updated — handled in DDL)
    //   - auth-reserved names for type=user (email, password_hash, ...) —
    //     they collide with auto-injected AUTH_COLUMNS.
    const SYSTEM_NAMES = ["id", "created", "updated", "created_at", "updated_at"];
    const isReserved = (name: string) =>
      SYSTEM_NAMES.includes(name) ||
      (spec.type === "user" && AUTH_RESERVED_COLUMNS.has(name));

    const survivingUserFields = (spec.schema ?? []).filter((f) => !isReserved(f.name));
    // Keep the stored schema in sync with what actually lands in DDL:
    // auth collections get the auth columns appended to the stored schema
    // so the dashboard's PRAGMA-derived view matches expectations.
    persistedSchema = (spec.type === "user"
      ? [
          ...AUTH_COLUMNS.map((c) => ({
            id: `auth_${c.name}`,
            name: c.name,
            type: c.type as FieldDefinition["type"],
            required: c.required,
            unique: c.unique,
            hidden: c.name === "password_hash" || c.name === "password_salt" || c.name === "token_key",
            system: true,
            auto: false,
            options: {},
          })),
          ...survivingUserFields.map((f) => ({ ...f, id: f.id ?? crypto.randomUUID() })),
        ]
      : survivingUserFields.map((f) => ({ ...f, id: f.id ?? crypto.randomUUID() }))
    ) as FieldDefinition[];

    allFields.push(
      ...survivingUserFields.map((f) => ({
        name: f.name,
        type: f.type,
        required: f.required,
        unique: f.unique,
        default: f.default,
      })),
    );
    ddl = renderCreateTable(spec.name, allFields, {
      idType: "idType" in spec && spec.idType ? spec.idType : "uuid",
    });
  }

  // 1. Issue DDL FIRST. This way a failure (e.g. duplicate column) leaves
  //    no orphan metadata row in _collections — which would otherwise
  //    block every retry with "collection already exists".
  try {
    await c.env.SYSTEM_DB.exec(ddl);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({ error: "ddl_failed", detail: msg, ddl }, 500);
  }

  // 1b. Seed the auto-increment sequence if a start value was provided.
  const idType = "idType" in spec && spec.idType ? spec.idType : "uuid";
  const idStart = "idStart" in spec && typeof spec.idStart === "number" ? spec.idStart : null;
  if (spec.type !== "view" && idType === "autoincrement" && idStart !== null && idStart > 1) {
    try {
      await seedAutoIncrement(c.env.SYSTEM_DB, spec.name, idStart);
    } catch (err) {
      // Non-fatal — the table works, just starts from 1.
    }
  }

  // 2. Persist metadata (only after DDL succeeded).
  try {
    const schemaJson = spec.type !== "view" ? JSON.stringify(persistedSchema ?? []) : null;
    const queryVal = spec.type === "view" ? spec.query : null;
    const indexesJson = "indexes" in spec && spec.indexes ? JSON.stringify(spec.indexes) : null;
    const constraintsJson = "constraints" in spec && spec.constraints ? JSON.stringify(spec.constraints) : null;
    const authConfigJson = "authConfig" in spec && spec.authConfig ? JSON.stringify(spec.authConfig) : null;
    const emailTemplatesJson = "emailTemplates" in spec && spec.emailTemplates ? JSON.stringify(spec.emailTemplates) : null;

    await c.env.SYSTEM_DB.prepare(
      `INSERT INTO _collections
        (id, name, type, schema, query, indexes, constraints,
         list_rule, view_rule, create_rule, update_rule, delete_rule,
         auth_config, email_templates, id_type, id_start, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      id, spec.name, spec.type, schemaJson, queryVal,
      indexesJson, constraintsJson,
      ("listRule" in spec ? spec.listRule : null) ?? null,
      ("viewRule" in spec ? spec.viewRule : null) ?? null,
      ("createRule" in spec ? spec.createRule : null) ?? null,
      ("updateRule" in spec ? spec.updateRule : null) ?? null,
      ("deleteRule" in spec ? spec.deleteRule : null) ?? null,
      authConfigJson, emailTemplatesJson,
      idType, idStart,
      now, now,
    ).run();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/UNIQUE/i.test(msg)) {
      return c.json({ error: "collection already exists" }, 409);
    }
    return c.json({ error: "metadata_persist_failed", detail: msg }, 500);
  }

  // 3. Create indexes if provided.
  if (spec.type !== "view" && "indexes" in spec && spec.indexes) {
    for (const idx of spec.indexes) {
      if (idx.columns.length === 0) continue;
      assertIdentifier(idx.name);
      const cols = idx.columns.map((col) => `"${col}"`).join(", ");
      const uniqueKw = idx.unique ? "UNIQUE " : "";
      try {
        await c.env.SYSTEM_DB.exec(`${uniqueKw}INDEX IF NOT EXISTS "${idx.name}" ON "${spec.name}" (${cols})`);
      } catch {
        // Index creation failure is non-fatal.
      }
    }
  }

  // 4. Best-effort realtime broadcast.
  c.executionCtx.waitUntil(
    (async () => {
      try {
        const stub = c.env.REALTIME.get(c.env.REALTIME.idFromName(spec.name));
        await stub.fetch(new Request("https://internal/broadcast", {
          method: "POST",
          body: JSON.stringify({ type: "collection_created", name: spec.name }),
        }));
      } catch { /* ignore */ }
    })(),
  );

  return c.json({ id, name: spec.name, type: spec.type, created_at: now }, 201);
});

metadataRouter.get("/", requireAuth, async (c) => {
  // System tables live in SYSTEM_DB and are underscore-prefixed.
  const sysRes = await c.env.SYSTEM_DB.prepare(
    `SELECT name FROM sqlite_master
     WHERE type='table' AND name LIKE '\\_%' ESCAPE '\\'
     ORDER BY name`,
  ).all();

  // User collections live in DB (the data database). Include both tables
  // AND views — view collections (type="view" in _collections) are stored
  // as SQLite views, so filtering only type='table' hides them.
  const dataRes = await c.env.SYSTEM_DB.prepare(
    `SELECT name FROM sqlite_master
     WHERE type IN ('table', 'view')
       AND name NOT LIKE 'sqlite\\_%' ESCAPE '\\'
       AND name NOT LIKE '\\_%' ESCAPE '\\'
     ORDER BY name`,
  ).all();

  const sysNames = (sysRes.results ?? [])
    .map((r) => (r as { name: string }).name)
    .filter((n) => !HIDDEN.has(n));
  const dataNames = (dataRes.results ?? [])
    .map((r) => (r as { name: string }).name)
    .filter((n) => !HIDDEN.has(n));

  // Pull the stored `type` and `schema` from `_collections` so we can
  // distinguish base / user / view collections (PRAGMA alone can't tell
  // us this — it only returns column names + raw SQL types).
  const metaRows = await c.env.SYSTEM_DB.prepare(
    `SELECT name, type, schema, query, id_type, id_start FROM _collections`,
  ).all<{ name: string; type: string; schema: string | null; query: string | null; id_type: string | null; id_start: number | null }>();
  const metaByName = new Map<
    string,
    { type: string; schema: FieldDefinition[] | null; query: string | null; idType: string; idStart: number | null }
  >(
    (metaRows.results ?? []).map((r) => [
      r.name,
      {
        type: r.type as CollectionType,
        schema: r.schema ? (JSON.parse(r.schema) as FieldDefinition[]) : null,
        query: r.query,
        idType: r.id_type ?? "uuid",
        idStart: r.id_start,
      },
    ]),
  );

  // Helper: fetch live column list for a table via PRAGMA.
  // Delegates to the module-level resolveLiveSchema so column display
  // is always driven by the actual database structure.
  const buildEntries = async (
    names: string[],
    source: "system" | "data",
  ) =>
    Promise.all(
      names.map(async (name) => {
        const db = c.env.SYSTEM_DB;
        const meta = metaByName.get(name);
        const declaredType = meta?.type ?? (source === "system" ? "system" : "base");
        // Column list + types come from PRAGMA (actual DB structure).
        // Stored schema refines types where it matches — see
        // resolveLiveSchema for details.
        const schema = await resolveLiveSchema(db, name, meta?.schema ?? null);
        return {
          id: `${source}__${name}`,
          name,
          type: declaredType,
          source,
          schema,
          query: declaredType === "view" ? (meta?.query ?? null) : null,
          idType: meta?.idType ?? "uuid",
          idStart: meta?.idStart ?? null,
          count: 0,
        };
      }),
    );

  const collections = [
    ...(await buildEntries(dataNames, "data")),
    ...(await buildEntries(sysNames, "system")),
  ];
  collections.sort((a, b) => a.name.localeCompare(b.name));

  return c.json({ collections });
});

metadataRouter.get("/:name", requireAuth, async (c) => {
  const name = c.req.param("name");
  if (!NAME_RE.test(name) && !name.startsWith("_")) {
    return c.json({ error: "invalid collection name" }, 400);
  }

  const source: "system" | "data" = name.startsWith("_") ? "system" : "data";
  const db = c.env.SYSTEM_DB;

  // Confirm the table (or view) actually exists.
  const exists = await db
    .prepare(`SELECT name FROM sqlite_master WHERE type IN ('table','view') AND name = ?`)
    .bind(name)
    .first<{ name: string }>();
  if (!exists) return c.json({ error: "not found" }, 404);

  // Look up declared type + stored schema (source of truth).
  const meta = await db
    .prepare(`SELECT type, schema, query, id_type, id_start FROM _collections WHERE name = ?`)
    .bind(name)
    .first<{ type: string; schema: string | null; query: string | null; id_type: string | null; id_start: number | null }>();
  const declaredType = meta
    ? (meta.type as CollectionType)
    : source === "system"
      ? "system"
      : "base";

  // Column list + types come from PRAGMA (the actual database structure).
  // Stored schema refines the type for matching columns where available.
  // No hardcoded or forced columns — what the DB reports is what's shown.
  let storedSchema: FieldDefinition[] | null = null;
  if (meta?.schema) {
    try {
      storedSchema = JSON.parse(meta.schema) as FieldDefinition[];
    } catch { /* treat as null */ }
  }
  const schema = await resolveLiveSchema(db, name, storedSchema);

  return c.json({
    collection: {
      id: `${source}__${name}`,
      name,
      type: declaredType,
      source,
      schema,
      query: declaredType === "view" ? (meta?.query ?? null) : null,
      idType: meta?.id_type ?? "uuid",
      idStart: meta?.id_start ?? null,
      count: 0,
    },
  });
});

/* ── DELETE /api/collections/:name — delete a collection ── */
metadataRouter.delete("/:name", requireAuth, requireRole("admin"), async (c) => {
  const name = c.req.param("name");

  // Block deletion of system tables.
  const SYSTEM_TABLE_NAMES = new Set(["_superusers", "_externalAuths", "_collections", "_settings", "_tokens", "_db_migrations", "_logs", "_sqlQueries", "logs"]);
  if (SYSTEM_TABLE_NAMES.has(name) || name.startsWith("_")) {
    return c.json({ error: "system_table_cannot_be_deleted", message: "System tables cannot be deleted." }, 403);
  }

  if (!NAME_RE.test(name)) {
    return c.json({ error: "invalid collection name" }, 400);
  }

  // 1. Drop the physical table/view if it still exists. We intentionally
  //    do NOT 404 when sqlite_master has no row — the metadata row in
  //    `_collections` may still be present (orphan from a prior partial
  //    delete) and must still be cleaned up. Previously this returned 404
  //    early and left the `_collections` row behind, which made deleted
  //    collections reappear in DB queries.
  const row = await c.env.SYSTEM_DB.prepare(
    `SELECT type FROM sqlite_master WHERE type IN ('table','view') AND name = ?`,
  ).bind(name).first<{ type: string }>();

  if (row) {
    try {
      if (row.type === "view") {
        await c.env.SYSTEM_DB.exec(`DROP VIEW IF EXISTS "${name}"`);
      } else {
        await c.env.SYSTEM_DB.exec(`DROP TABLE IF EXISTS "${name}"`);
      }
    } catch (err) {
      // Surface the error — a failed DROP used to be silently swallowed,
      // leaving the table AND metadata in place while the UI reported
      // success. Better to fail loudly so the user can retry.
      const msg = err instanceof Error ? err.message : String(err);
      return c.json({ error: "drop_failed", detail: msg }, 500);
    }
  }

  // 2. Remove the metadata row. This is the source of truth for the
  //    dashboard's collection list enrichment (type, schema, query) and
  //    must be deleted even if the physical table was already gone.
  await c.env.SYSTEM_DB.prepare(
    `DELETE FROM _collections WHERE name = ?`,
  ).bind(name).run();

  return c.json({ success: true });
});

/* ── PATCH /api/core/collections/:name — update collection schema/metadata ──
 *
 * Accepts a new `schema` array (FieldDefinition[]) for base/user collections
 * or a new `query` for views. Emits ALTER TABLE statements for added /
 * removed / renamed fields (tracked by stable field id), records each
 * migration in `_db_migrations`, and updates the stored metadata.
 */
metadataRouter.patch("/:name", requireAuth, requireRole("admin"), async (c) => {
  const name = c.req.param("name");
  if (!NAME_RE.test(name)) {
    return c.json({ error: "invalid_collection_name" }, 400);
  }

  let body: unknown;
  try {
    const raw = await c.req.text();
    body = raw ? JSON.parse(raw) : {};
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }

  // Load the existing metadata.
  const existing = await c.env.SYSTEM_DB.prepare(
    `SELECT id, type, schema, query, indexes, constraints,
            list_rule, view_rule, create_rule, update_rule, delete_rule,
            auth_config, email_templates, id_type, id_start
       FROM _collections WHERE name = ?`,
  ).bind(name).first<{
    id: string;
    type: CollectionType;
    schema: string | null;
    query: string | null;
    indexes: string | null;
    constraints: string | null;
    list_rule: string | null;
    view_rule: string | null;
    create_rule: string | null;
    update_rule: string | null;
    delete_rule: string | null;
    auth_config: string | null;
    email_templates: string | null;
    id_type: string | null;
    id_start: number | null;
  }>();
  if (!existing) return c.json({ error: "not_found" }, 404);

  // Validate against the correct shape based on stored type.
  const parsed =
    existing.type === "view"
      ? patchViewSchema.safeParse(body)
      : existing.type === "user"
        ? patchUserSchema.safeParse(body)
        : patchBaseSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "validation_failed", issues: parsed.error.flatten() }, 400);
  }
  const spec = parsed.data;

  // ── Rename handling ─────────────────────────────────────────────
  // If `name` is present and differs from the current name, we run an
  // ALTER TABLE/VIEW rename. Refused when:
  //   - target name already exists in _collections
  //   - another collection references the old name via a relation field
  //   - any view query mentions the old name (heuristic, conservative)
  let renamedTo: string | null = null;
  if (typeof (spec as { name?: unknown }).name === "string") {
    const requested = (spec as { name: string }).name;
    if (requested !== name) {
      // 1. Target must not already exist.
      const clash = await c.env.SYSTEM_DB
        .prepare(`SELECT 1 FROM _collections WHERE name = ? LIMIT 1`)
        .bind(requested)
        .first();
      if (clash) {
        return c.json({ error: "rename_target_exists", target: requested }, 409);
      }

      // 2. Scan every OTHER collection for references to the old name.
      //    Relations store targetCollection in the schema JSON; views
      //    embed the name in their SQL query.
      const allRows = await c.env.SYSTEM_DB
        .prepare(`SELECT name, schema, query FROM _collections WHERE name != ?`)
        .bind(name)
        .all<{ name: string; schema: string | null; query: string | null }>();

      const blockedBy = findRenameReferences(allRows.results ?? [], name);
      if (blockedBy.length > 0) {
        return c.json(
          {
            error: "rename_blocked_by_references",
            referencedBy: blockedBy,
            hint: "Update or remove the references first, then rename.",
          },
          409,
        );
      }

      // 3. Execute the rename.
      try {
        if (existing.type === "view") {
          // SQLite has no ALTER VIEW RENAME — must drop + recreate under the new name.
          await c.env.SYSTEM_DB.exec(`DROP VIEW IF EXISTS "${name}"`);
          await c.env.SYSTEM_DB.exec(renderCreateView(requested, existing.query ?? ""));
        } else {
          await c.env.SYSTEM_DB.exec(
            `ALTER TABLE "${name}" RENAME TO "${requested}"`,
          );
        }
        renamedTo = requested;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return c.json({ error: "rename_failed", detail: msg }, 500);
      }
    }
  }

  // The table name used by downstream migration / view-recreate steps.
  // After a rename, all DDL must target the NEW name.
  const effectiveName = renamedTo ?? name;

  let migrationResult: { applied: number; errors: string[] } | null = null;

  // For base/user: run schema diff if a new schema was provided.
  if (existing.type !== "view" && Array.isArray((spec as { schema?: unknown }).schema)) {
    const oldFields: FieldDefinition[] = existing.schema
      ? (JSON.parse(existing.schema) as FieldDefinition[])
      : [];
    const newFields = (spec as { schema: FieldDefinition[] }).schema;
    const ops = diffSchema(effectiveName, oldFields, newFields);
    if (ops.length > 0) {
      migrationResult = await applyMigration(c.env.SYSTEM_DB, effectiveName, ops);
    }
  }

  // For view: drop + recreate if the query changed.
  if (existing.type === "view" && typeof (spec as { query?: string }).query === "string") {
    const newQuery = (spec as { query: string }).query;
    if (newQuery !== existing.query) {
      if (!isSafeSelectQuery(newQuery)) {
        return c.json({ error: "unsafe_view_query" }, 400);
      }
      // Parse-check before dropping the existing view — leaves the
      // current definition intact if the new SQL is malformed.
      const explainErr = await validateViewQuery(c.env.SYSTEM_DB, newQuery);
      if (explainErr) {
        return c.json({ error: "invalid_view_query", detail: explainErr }, 400);
      }
      try {
        await c.env.SYSTEM_DB.exec(`DROP VIEW IF EXISTS "${effectiveName}"`);
        await c.env.SYSTEM_DB.exec(renderCreateView(effectiveName, newQuery));
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return c.json({ error: "view_recreate_failed", detail: msg }, 500);
      }
    }
  }

  // ── ID type change (base/user only) ──────────────────────────────
  // Changing the ID type requires recreating the physical table (SQLite
  // can't ALTER a column type). We only allow this when the table is
  // empty to avoid data loss. The "starting from" value can be adjusted
  // independently for autoincrement tables via sqlite_sequence.
  const currentIdType = existing.id_type ?? "uuid";
  const requestedIdType = "idType" in spec && spec.idType ? spec.idType : undefined;
  const requestedIdStart = "idStart" in spec && typeof spec.idStart === "number" ? spec.idStart : undefined;

  if (existing.type !== "view" && requestedIdType && requestedIdType !== currentIdType) {
    // Check row count — refuse if the table has data.
    const countRow = await c.env.SYSTEM_DB
      .prepare(`SELECT COUNT(*) as cnt FROM "${effectiveName}"`)
      .first<{ cnt: number }>();
    if ((countRow?.cnt ?? 0) > 0) {
      return c.json(
        { error: "id_type_change_requires_empty_table", detail: "Clear all records before changing the ID type." },
        409,
      );
    }
    // Recreate the table with the new ID column type.
    try {
      await c.env.SYSTEM_DB.exec(`DROP TABLE IF EXISTS "${effectiveName}"`);
      const storedFields: FieldDefinition[] = existing.schema
        ? (JSON.parse(existing.schema) as FieldDefinition[])
        : [];
      // Rebuild the DDL fields from stored schema (auth columns already included).
      const ddlFields = storedFields.map((f) => ({
        name: f.name,
        type: f.type,
        required: f.required,
        unique: f.unique,
        default: f.default,
      }));
      const newDdl = renderCreateTable(effectiveName, ddlFields, { idType: requestedIdType });
      await c.env.SYSTEM_DB.exec(newDdl);
      // Seed autoincrement if requested.
      if (requestedIdType === "autoincrement" && requestedIdStart !== undefined && requestedIdStart > 1) {
        await seedAutoIncrement(c.env.SYSTEM_DB, effectiveName, requestedIdStart);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return c.json({ error: "id_type_change_failed", detail: msg }, 500);
    }
  } else if (existing.type !== "view" && currentIdType === "autoincrement" && requestedIdStart !== undefined) {
    // Adjust the starting position on an existing autoincrement table.
    try {
      await seedAutoIncrement(c.env.SYSTEM_DB, effectiveName, requestedIdStart);
    } catch {
      // Non-fatal — the table still works, just may not have the desired start.
    }
  }

  // Persist updated metadata.
  const now = Date.now();
  const schemaJson =
    existing.type !== "view" && Array.isArray((spec as { schema?: unknown }).schema)
      ? JSON.stringify((spec as { schema: FieldDefinition[] }).schema)
      : existing.schema;
  const queryVal =
    existing.type === "view" && typeof (spec as { query?: string }).query === "string"
      ? (spec as { query: string }).query
      : existing.query;
  const indexesJson =
    "indexes" in spec && spec.indexes ? JSON.stringify(spec.indexes) : existing.indexes;
  const constraintsJson =
    "constraints" in spec && spec.constraints
      ? JSON.stringify(spec.constraints)
      : existing.constraints;
  const authConfigJson =
    "authConfig" in spec && spec.authConfig ? JSON.stringify(spec.authConfig) : existing.auth_config;
  const emailTemplatesJson =
    "emailTemplates" in spec && spec.emailTemplates
      ? JSON.stringify(spec.emailTemplates)
      : existing.email_templates;
  const idTypeVal = requestedIdType ?? currentIdType;
  const idStartVal = requestedIdStart !== undefined ? requestedIdStart : (existing.id_start ?? null);

  await c.env.SYSTEM_DB.prepare(
    `UPDATE _collections
        SET ${renamedTo ? `name = ?, ` : ""}schema = ?, query = ?, indexes = ?, constraints = ?,
            list_rule = ?, view_rule = ?, create_rule = ?, update_rule = ?, delete_rule = ?,
            auth_config = ?, email_templates = ?, id_type = ?, id_start = ?, updated_at = ?
      WHERE id = ?`,
  ).bind(
    ...(renamedTo ? [renamedTo] : []),
    schemaJson,
    queryVal,
    indexesJson,
    constraintsJson,
    ("listRule" in spec ? spec.listRule : undefined) ?? existing.list_rule,
    ("viewRule" in spec ? spec.viewRule : undefined) ?? existing.view_rule,
    ("createRule" in spec ? spec.createRule : undefined) ?? existing.create_rule,
    ("updateRule" in spec ? spec.updateRule : undefined) ?? existing.update_rule,
    ("deleteRule" in spec ? spec.deleteRule : undefined) ?? existing.delete_rule,
    authConfigJson,
    emailTemplatesJson,
    idTypeVal,
    idStartVal,
    now,
    existing.id,
  ).run();

  return c.json({
    id: existing.id,
    name: effectiveName,
    renamedFrom: renamedTo ? name : undefined,
    type: existing.type,
    updated_at: now,
    migrations: migrationResult ?? { applied: 0, errors: [] },
  });
});
