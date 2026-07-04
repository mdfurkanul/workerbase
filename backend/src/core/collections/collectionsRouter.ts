import { Hono } from "hono";
import { z } from "zod";
import type { Env } from "../../env.js";
import type { FieldDefinition, CollectionType } from "../../db/schema.js";
import { requireAuth, requireRole } from "../../auth/middleware.js";
import { hashPassword } from "../../auth/crypto.js";
import { diffSchema, applyMigration } from "./migrations.js";
import { validateRecordFields, parseD1FieldError } from "./validation.js";

/**
 * Dynamic collection router.
 *
 * POST /api/collections  — create a new collection (base / user / view)
 * GET  /api/collections  — list all collections
 * GET  /api/collections/:name — single collection metadata
 *
 * The frontend sends a rich payload matching the SchemaEditor output.
 * We accept the full field definition shape and store it as JSON.
 */

const IDENT = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
const NAME_RE = /^[a-zA-Z][a-zA-Z0-9_]*$/;

/* ── Permissive field schema — accepts everything the editor sends ── */
const fieldSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1).max(64).regex(IDENT, "invalid column name"),
  type: z.string(),  // accept all type strings (text, email, file, relation, geo, etc.)
  required: z.boolean().optional().default(false),
  unique: z.boolean().optional().default(false),
  hidden: z.boolean().optional().default(false),
  system: z.boolean().optional(),
  auto: z.boolean().optional(),
  primaryKey: z.boolean().optional(),
  default: z.union([z.string(), z.number(), z.boolean(), z.null()]).optional(),
  options: z.record(z.unknown()).optional().default({}),
});

/* ── Index + constraint schemas ── */
const indexSchema = z.object({
  name: z.string().min(1).max(128),
  columns: z.array(z.string()),
  unique: z.boolean().optional().default(false),
});

const constraintSchema = z.object({
  name: z.string().optional(),
  columns: z.array(z.string()),
});

/* ── Collection create payload — accepts camelCase (frontend) ── */
const createBaseSchema = z.object({
  type: z.literal("base"),
  name: z.string().min(1).max(64).regex(NAME_RE),
  schema: z.array(fieldSchema).min(1),
  indexes: z.array(indexSchema).optional(),
  constraints: z.array(constraintSchema).optional(),
  listRule: z.string().optional(),
  viewRule: z.string().optional(),
  createRule: z.string().optional(),
  updateRule: z.string().optional(),
  deleteRule: z.string().optional(),
});

const createUserSchema = z.object({
  type: z.literal("user"),
  name: z.string().min(1).max(64).regex(NAME_RE),
  schema: z.array(fieldSchema).optional(),
  indexes: z.array(indexSchema).optional(),
  constraints: z.array(constraintSchema).optional(),
  listRule: z.string().optional(),
  viewRule: z.string().optional(),
  createRule: z.string().optional(),
  updateRule: z.string().optional(),
  deleteRule: z.string().optional(),
  authConfig: z.record(z.unknown()).optional(),
  emailTemplates: z.record(z.unknown()).optional(),
});

const createViewSchema = z.object({
  type: z.literal("view"),
  name: z.string().min(1).max(64).regex(NAME_RE),
  query: z.string().min(1).max(8192),
  listRule: z.string().optional(),
  viewRule: z.string().optional(),
});

const createCollectionSchema = z.discriminatedUnion("type", [
  createBaseSchema,
  createUserSchema,
  createViewSchema,
]);

/* ── Helpers ── */

function assertIdentifier(name: string): void {
  if (!IDENT.test(name)) throw new Error(`unsafe identifier: ${name}`);
}

/** Map a frontend field type to the SQLite column type used in DDL. */
function sqliteType(type: string): string {
  const map: Record<string, string> = {
    text: "TEXT", editor: "TEXT", phone: "TEXT", url: "TEXT", email: "TEXT",
    integer: "INTEGER", real: "REAL",
    bool: "INTEGER",
    date: "TEXT", datetime: "INTEGER",
    file: "TEXT", files: "TEXT",
    relation: "TEXT",
    select: "TEXT",
    json: "TEXT",
    blob: "BLOB",
  };
  return map[type] ?? "TEXT";
}

function renderColumnDef(field: { name: string; type: string; required?: boolean; unique?: boolean; default?: string | number | boolean | null }): string {
  assertIdentifier(field.name);
  const parts = [`"${field.name}"`, sqliteType(field.type)];
  if (field.required) parts.push("NOT NULL");
  if (field.unique) parts.push("UNIQUE");
  if (field.default !== undefined && field.default !== null) {
    if (typeof field.default === "string") {
      parts.push(`DEFAULT '${field.default.replace(/'/g, "''")}'`);
    } else if (typeof field.default === "boolean") {
      parts.push(`DEFAULT ${field.default ? 1 : 0}`);
    } else {
      parts.push(`DEFAULT ${field.default}`);
    }
  }
  return parts.join(" ");
}

/** Auth columns auto-injected for type="user" collections. */
const AUTH_COLUMNS = [
  { name: "email", type: "email", required: true, unique: true },
  { name: "password_hash", type: "text", required: true, unique: false },
  { name: "password_salt", type: "text", required: true, unique: false },
  { name: "token_key", type: "text", required: false, unique: false },
  { name: "verified", type: "bool", required: false, unique: false },
];

/** Reserved column names that the auth system owns — user-defined fields
 *  with these names are silently dropped from the DDL (auth columns win)
 *  to prevent "duplicate column name" errors. */
const AUTH_RESERVED_COLUMNS = new Set(AUTH_COLUMNS.map((c) => c.name));

function renderCreateTable(name: string, fields: { name: string; type: string; required?: boolean; unique?: boolean; default?: string | number | boolean | null }[]): string {
  assertIdentifier(name);
  const body = [
    '"id" TEXT PRIMARY KEY',
    ...fields.map(renderColumnDef),
    '"created_at" INTEGER NOT NULL DEFAULT (unixepoch())',
    '"updated_at" INTEGER NOT NULL DEFAULT (unixepoch())',
  ].join(", ");
  return `CREATE TABLE IF NOT EXISTS "${name}" (${body})`;
}

function renderCreateView(name: string, query: string): string {
  assertIdentifier(name);
  return `CREATE VIEW IF NOT EXISTS "${name}" AS ${query}`;
}

function isSafeSelectQuery(raw: string): boolean {
  const q = raw.trim();
  if (!q || q.includes(";")) return false;
  if (!/^SELECT\s+/i.test(q)) return false;
  const forbidden = /\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|ATTACH|DETACH|PRAGMA|REPLACE|GRANT|REVOKE|VACUUM|REINDEX)\b/i;
  return !forbidden.test(q);
}

/**
 * Parse-check a view's SELECT query by running `EXPLAIN <query>` against
 * the database. Returns null on success, or the D1 error message on failure.
 *
 * This is a read-only check — EXPLAIN never executes the query, so even
 * pathological SELECTs can't mutate state. It catches syntax errors like
 * `created by` (instead of `ORDER BY`) before we touch sqlite_master.
 */
async function validateViewQuery(
  db: D1Database,
  query: string,
): Promise<string | null> {
  try {
    await db.prepare(`EXPLAIN ${query}`).all();
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}

/* ── Router ── */

export const collectionsRouter = new Hono<{ Bindings: Env }>();

collectionsRouter.post("/", requireAuth, requireRole("admin"), async (c) => {
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
    ddl = renderCreateTable(spec.name, allFields);
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
         auth_config, email_templates, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      id, spec.name, spec.type, schemaJson, queryVal,
      indexesJson, constraintsJson,
      ("listRule" in spec ? spec.listRule : null) ?? null,
      ("viewRule" in spec ? spec.viewRule : null) ?? null,
      ("createRule" in spec ? spec.createRule : null) ?? null,
      ("updateRule" in spec ? spec.updateRule : null) ?? null,
      ("deleteRule" in spec ? spec.deleteRule : null) ?? null,
      authConfigJson, emailTemplatesJson,
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

collectionsRouter.get("/", requireAuth, async (c) => {
  // Tables we never want to surface in the dashboard list — framework
  // bookkeeping and the legacy `_collections` registry (no longer used
  // for listing; tables are enumerated from sqlite_master directly).
  const HIDDEN = new Set([
    "_collections",
    "_db_migrations",
    "d1_migrations",
    "sqlite_sequence",
    "_cf_METADATA",
  ]);

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
    `SELECT name, type, schema, query FROM _collections`,
  ).all<{ name: string; type: string; schema: string | null; query: string | null }>();
  const metaByName = new Map<
    string,
    { type: string; schema: FieldDefinition[] | null; query: string | null }
  >(
    (metaRows.results ?? []).map((r) => [
      r.name,
      {
        type: r.type as CollectionType,
        schema: r.schema ? (JSON.parse(r.schema) as FieldDefinition[]) : null,
        query: r.query,
      },
    ]),
  );

  // Helper: fetch live column list for a table via PRAGMA.
  // Names come straight from sqlite_master so they're safe to inline,
  // but we still assert they match a strict identifier shape.
  const fetchSchema = async (
    db: D1Database,
    name: string,
  ): Promise<{ name: string; type: string }[]> => {
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) return [];
    try {
      const { results } = await db.prepare(`PRAGMA table_info("${name}")`).all();
      return (results ?? [])
        .filter((r) => typeof (r as { name?: unknown }).name === "string")
        .map((r) => {
          const row = r as { name: string; type?: string };
          return { name: row.name, type: (row.type || "text").toLowerCase() };
        });
    } catch {
      return [];
    }
  };

  const buildEntries = async (
    names: string[],
    source: "system" | "data",
  ) =>
    Promise.all(
      names.map(async (name) => {
        const db = c.env.SYSTEM_DB;
        const pragmaSchema = await fetchSchema(db, name);
        const meta = metaByName.get(name);
        // Prefer the stored schema (richer — has FieldDefinition metadata
        // like required/unique/hidden) when present, otherwise fall back
        // to the PRAGMA-derived shape.
        const schema = meta?.schema ?? pragmaSchema;
        const declaredType = meta?.type ?? (source === "system" ? "system" : "base");
        return {
          id: `${source}__${name}`,
          name,
          type: declaredType,
          source,
          schema,
          query: declaredType === "view" ? (meta?.query ?? null) : null,
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

collectionsRouter.get("/:name", requireAuth, async (c) => {
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
    .prepare(`SELECT type, schema, query FROM _collections WHERE name = ?`)
    .bind(name)
    .first<{ type: string; schema: string | null; query: string | null }>();
  const declaredType = meta
    ? (meta.type as CollectionType)
    : source === "system"
      ? "system"
      : "base";

  // Prefer stored schema; fall back to PRAGMA-derived columns.
  let schema: { name: string; type: string }[] = [];
  if (meta?.schema) {
    try {
      schema = (JSON.parse(meta.schema) as FieldDefinition[]).map((f) => ({
        name: f.name,
        type: f.type,
      }));
    } catch { /* fall through to PRAGMA */ }
  }
  if (schema.length === 0 && /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
    try {
      const { results } = await db.prepare(`PRAGMA table_info("${name}")`).all();
      schema = (results ?? [])
        .filter((r) => typeof (r as { name?: unknown }).name === "string")
        .map((r) => {
          const row = r as { name: string; type?: string };
          return { name: row.name, type: (row.type || "text").toLowerCase() };
        });
    } catch { /* leave schema empty */ }
  }

  return c.json({
    collection: {
      id: `${source}__${name}`,
      name,
      type: declaredType,
      source,
      schema,
      query: declaredType === "view" ? (meta?.query ?? null) : null,
      count: 0,
    },
  });
});

/* ── GET /api/collections/:name/records — paginated records ── */
collectionsRouter.get("/:name/records", requireAuth, async (c) => {
  const name = c.req.param("name");
  // Allow both user collections and system tables (underscore prefix).
  if (!NAME_RE.test(name) && !name.startsWith("_") && name !== "logs") {
    return c.json({ error: "invalid collection name" }, 400);
  }

  const page = Math.max(1, parseInt(c.req.query("page") ?? "1", 10) || 1);
  const perPage = Math.min(100, Math.max(1, parseInt(c.req.query("perPage") ?? "20", 10) || 20));
  const offset = (page - 1) * perPage;

  try {
    // Route to the correct DB: system tables (underscore-prefixed) live in
    // SYSTEM_DB, user collections live in DB.
    const db = c.env.SYSTEM_DB;

    // Detect views via sqlite_master (views don't have rowid).
    const typeRow = await db
      .prepare(`SELECT type FROM sqlite_master WHERE type IN ('table','view') AND name = ?`)
      .bind(name)
      .first<{ type: string }>();
    const isView = typeRow?.type === "view";

    // Get total count.
    const countRow = await db.prepare(
      `SELECT COUNT(*) as total FROM "${name}"`,
    ).first<{ total: number }>();
    const total = countRow?.total ?? 0;

    // Get the page of records — views don't have rowid so use a simple LIMIT/OFFSET.
    const orderBy = isView ? "LIMIT ? OFFSET ?" : "ORDER BY rowid DESC LIMIT ? OFFSET ?";
    const { results } = await db.prepare(
      `SELECT * FROM "${name}" ${orderBy}`,
    ).bind(perPage, offset).all();

    return c.json({
      items: results ?? [],
      page,
      perPage,
      total,
      totalPages: Math.max(1, Math.ceil(total / perPage)),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({ error: "query_failed", detail: msg }, 500);
  }
});

/* ── DELETE /api/collections/:name — delete a collection ── */
collectionsRouter.delete("/:name", requireAuth, requireRole("admin"), async (c) => {
  const name = c.req.param("name");

  // Block deletion of system tables.
  const SYSTEM_TABLE_NAMES = new Set(["_superusers", "_externalAuths", "_collections", "_settings", "_tokens", "_db_migrations", "_logs", "_sqlQueries", "logs"]);
  if (SYSTEM_TABLE_NAMES.has(name) || name.startsWith("_")) {
    return c.json({ error: "system_table_cannot_be_deleted", message: "System tables cannot be deleted." }, 403);
  }

  if (!NAME_RE.test(name)) {
    return c.json({ error: "invalid collection name" }, 400);
  }

  // 1. Check the collection actually exists in the data DB.
  const row = await c.env.SYSTEM_DB.prepare(
    `SELECT type FROM sqlite_master WHERE type IN ('table','view') AND name = ?`,
  ).bind(name).first<{ type: string }>();
  if (!row) return c.json({ error: "not_found" }, 404);

  // 2. Drop the physical table (or view).
  try {
    if (row.type === "view") {
      await c.env.SYSTEM_DB.exec(`DROP VIEW IF EXISTS "${name}"`);
    } else {
      await c.env.SYSTEM_DB.exec(`DROP TABLE IF EXISTS "${name}"`);
    }
  } catch {
    // Non-fatal — the table might already be gone.
  }

  return c.json({ success: true });
});

/* ── PATCH /api/core/collections/:name — update collection schema/metadata ──
 *
 * Accepts a new `schema` array (FieldDefinition[]) for base/user collections
 * or a new `query` for views. Emits ALTER TABLE statements for added /
 * removed / renamed fields (tracked by stable field id), records each
 * migration in `_db_migrations`, and updates the stored metadata.
 */
const patchBaseSchema = z.object({
  schema: z.array(fieldSchema).min(1),
  indexes: z.array(indexSchema).optional(),
  constraints: z.array(constraintSchema).optional(),
  listRule: z.string().optional(),
  viewRule: z.string().optional(),
  createRule: z.string().optional(),
  updateRule: z.string().optional(),
  deleteRule: z.string().optional(),
});

const patchUserSchema = z.object({
  schema: z.array(fieldSchema).optional(),
  indexes: z.array(indexSchema).optional(),
  constraints: z.array(constraintSchema).optional(),
  listRule: z.string().optional(),
  viewRule: z.string().optional(),
  createRule: z.string().optional(),
  updateRule: z.string().optional(),
  deleteRule: z.string().optional(),
  authConfig: z.record(z.unknown()).optional(),
  emailTemplates: z.record(z.unknown()).optional(),
});

const patchViewSchema = z.object({
  query: z.string().min(1).max(8192),
  listRule: z.string().optional(),
  viewRule: z.string().optional(),
});

collectionsRouter.patch("/:name", requireAuth, requireRole("admin"), async (c) => {
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
            auth_config, email_templates
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

  let migrationResult: { applied: number; errors: string[] } | null = null;

  // For base/user: run schema diff if a new schema was provided.
  if (existing.type !== "view" && Array.isArray((spec as { schema?: unknown }).schema)) {
    const oldFields: FieldDefinition[] = existing.schema
      ? (JSON.parse(existing.schema) as FieldDefinition[])
      : [];
    const newFields = (spec as { schema: FieldDefinition[] }).schema;
    const ops = diffSchema(name, oldFields, newFields);
    if (ops.length > 0) {
      migrationResult = await applyMigration(c.env.SYSTEM_DB, name, ops);
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
        await c.env.SYSTEM_DB.exec(`DROP VIEW IF EXISTS "${name}"`);
        await c.env.SYSTEM_DB.exec(renderCreateView(name, newQuery));
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return c.json({ error: "view_recreate_failed", detail: msg }, 500);
      }
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

  await c.env.SYSTEM_DB.prepare(
    `UPDATE _collections
        SET schema = ?, query = ?, indexes = ?, constraints = ?,
            list_rule = ?, view_rule = ?, create_rule = ?, update_rule = ?, delete_rule = ?,
            auth_config = ?, email_templates = ?, updated_at = ?
      WHERE id = ?`,
  ).bind(
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
    now,
    existing.id,
  ).run();

  return c.json({
    id: existing.id,
    name,
    type: existing.type,
    updated_at: now,
    migrations: migrationResult ?? { applied: 0, errors: [] },
  });
});

/* ── POST /api/collections/:name/records — create a record ── */
collectionsRouter.post("/:name/records", requireAuth, requireRole("admin", "editor"), async (c) => {
  const name = c.req.param("name");
  if (!NAME_RE.test(name) && !name.startsWith("_") && name !== "logs") {
    return c.json({ error: "invalid_collection_name" }, 400);
  }

  let body: Record<string, unknown>;
  try {
    const raw = await c.req.text();
    body = raw ? JSON.parse(raw) : {};
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }

  // Load the collection's stored schema (source of truth) so we can
  // validate the payload against it.
  const collectionRow = await c.env.SYSTEM_DB
    .prepare(`SELECT type, schema FROM _collections WHERE name = ?`)
    .bind(name)
    .first<{ type: CollectionType; schema: string | null }>();
  const schemaFields: FieldDefinition[] | null = collectionRow?.schema
    ? (JSON.parse(collectionRow.schema) as FieldDefinition[])
    : null;

  // For type=user collections, `password` is a *virtual* input field —
  // it's not in the stored schema (password_hash is) but is accepted
  // and auto-hashed into password_hash + password_salt before insert.
  const isAuthCollection = collectionRow?.type === "user";
  const plaintextPassword = isAuthCollection && typeof body.password === "string"
    ? body.password
    : null;
  if (isAuthCollection) delete body.password;

  const { values: cleaned, errors: fieldErrors } = validateRecordFields(
    body,
    schemaFields,
    { partial: false },
  );

  // Hash the plaintext password (if provided) into the auth columns.
  if (isAuthCollection) {
    if (plaintextPassword !== null) {
      if (plaintextPassword.length < 8) {
        fieldErrors.password = "Password must be at least 8 characters";
      } else {
        const { hash, salt } = await hashPassword(plaintextPassword);
        cleaned.password_hash = hash;
        cleaned.password_salt = salt;
        cleaned.token_key = "";
        if (cleaned.verified === undefined) cleaned.verified = 0;
      }
    } else {
      // New record on an auth collection with no password supplied —
      // required since password_hash is NOT NULL.
      fieldErrors.password = "Password is required to create a user record";
    }
  }

  if (Object.keys(fieldErrors).length > 0) {
    return c.json({ error: "validation_failed", fieldErrors }, 400);
  }

  const id = crypto.randomUUID();
  const now = Math.floor(Date.now() / 1000);
  const data: Record<string, unknown> = { ...cleaned, id, created_at: now, updated_at: now };

  const cols = Object.keys(data);
  if (cols.length === 0) {
    return c.json({ error: "no_fields_to_insert" }, 400);
  }
  const placeholders = cols.map(() => "?").join(", ");
  const colNames = cols.map((k) => `"${k}"`).join(", ");
  const values = cols.map((k) => data[k]);

  try {
    await c.env.SYSTEM_DB.prepare(
      `INSERT INTO "${name}" (${colNames}) VALUES (${placeholders})`,
    ).bind(...values).run();

    const row = await c.env.SYSTEM_DB.prepare(
      `SELECT * FROM "${name}" WHERE id = ?`,
    ).bind(id).first();

    return c.json({ record: row }, 201);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Try to surface a field-specific error from the D1 message.
    const fieldErr = parseD1FieldError(msg);
    if (fieldErr) {
      return c.json(
        {
          error: "validation_failed",
          fieldErrors: { [fieldErr.field]: fieldErr.message },
          detail: msg,
        },
        400,
      );
    }
    return c.json({ error: "insert_failed", detail: msg }, 500);
  }
});

/* ── PATCH /api/collections/:name/records/:id — update a record ── */
collectionsRouter.patch("/:name/records/:id", requireAuth, requireRole("admin", "editor"), async (c) => {
  const name = c.req.param("name");
  const recordId = c.req.param("id");
  if (!NAME_RE.test(name) && !name.startsWith("_") && name !== "logs") {
    return c.json({ error: "invalid collection name" }, 400);
  }

  let body: Record<string, unknown>;
  try {
    const raw = await c.req.text();
    body = raw ? JSON.parse(raw) : {};
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }

  // Load the stored schema and validate the partial payload.
  const collectionRow = await c.env.SYSTEM_DB
    .prepare(`SELECT type, schema FROM _collections WHERE name = ?`)
    .bind(name)
    .first<{ type: CollectionType; schema: string | null }>();
  const schemaFields: FieldDefinition[] | null = collectionRow?.schema
    ? (JSON.parse(collectionRow.schema) as FieldDefinition[])
    : null;

  // Auth-collection: pop virtual `password` field before validation.
  const isAuthCollection = collectionRow?.type === "user";
  const plaintextPassword = isAuthCollection && typeof body.password === "string"
    ? body.password
    : null;
  if (isAuthCollection) delete body.password;

  const { values: cleaned, errors: fieldErrors } = validateRecordFields(
    body,
    schemaFields,
    { partial: true },
  );

  // Hash + rotate password if supplied.
  if (isAuthCollection && plaintextPassword !== null) {
    if (plaintextPassword.length < 8) {
      fieldErrors.password = "Password must be at least 8 characters";
    } else {
      const { hash, salt } = await hashPassword(plaintextPassword);
      cleaned.password_hash = hash;
      cleaned.password_salt = salt;
      cleaned.token_key = crypto.randomUUID();
    }
  }

  if (Object.keys(fieldErrors).length > 0) {
    return c.json({ error: "validation_failed", fieldErrors }, 400);
  }

  cleaned["updated_at"] = Math.floor(Date.now() / 1000);

  const sets = Object.keys(cleaned).map((k) => `"${k}" = ?`);
  const values = Object.values(cleaned);

  if (sets.length === 0) {
    return c.json({ error: "no_fields_to_update" }, 400);
  }

  try {
    await c.env.SYSTEM_DB.prepare(
      `UPDATE "${name}" SET ${sets.join(", ")} WHERE id = ?`,
    ).bind(...values, recordId).run();

    const row = await c.env.SYSTEM_DB.prepare(
      `SELECT * FROM "${name}" WHERE id = ?`,
    ).bind(recordId).first();

    if (!row) return c.json({ error: "not_found" }, 404);
    return c.json({ record: row });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const fieldErr = parseD1FieldError(msg);
    if (fieldErr) {
      return c.json(
        {
          error: "validation_failed",
          fieldErrors: { [fieldErr.field]: fieldErr.message },
          detail: msg,
        },
        400,
      );
    }
    return c.json({ error: "update_failed", detail: msg }, 500);
  }
});

/* ── DELETE /api/collections/:name/records/:id — delete a record ── */
collectionsRouter.delete("/:name/records/:id", requireAuth, requireRole("admin", "editor"), async (c) => {
  const name = c.req.param("name");
  const recordId = c.req.param("id");
  if (!NAME_RE.test(name) && !name.startsWith("_") && name !== "logs") {
    return c.json({ error: "invalid collection name" }, 400);
  }

  // Block deletion from system auth tables.
  if (name === "_superusers") {
    return c.json({ error: "cannot_delete_from_auth_table" }, 403);
  }

  try {
    const db = c.env.SYSTEM_DB;
    await db.prepare(
      `DELETE FROM "${name}" WHERE id = ?`,
    ).bind(recordId).run();
    return c.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({ error: "delete_failed", detail: msg }, 500);
  }
});
