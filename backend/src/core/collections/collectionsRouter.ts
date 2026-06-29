import { Hono } from "hono";
import { z } from "zod";
import type { Env } from "../../env.js";
import type { FieldDefinition, CollectionType } from "../../db/schema.js";
import { requireAuth, requireRole } from "../../auth/middleware.js";

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
  { name: "email", type: "text", required: true, unique: true },
  { name: "password_hash", type: "text", required: true, unique: false },
  { name: "password_salt", type: "text", required: true, unique: false },
  { name: "token_key", type: "text", required: false, unique: false },
  { name: "verified", type: "bool", required: false, unique: false },
];

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
  if (spec.type === "view") {
    ddl = renderCreateView(spec.name, spec.query);
  } else {
    // For auth collections, prepend auth columns.
    let allFields: { name: string; type: string; required?: boolean; unique?: boolean; default?: string | number | boolean | null }[] = [];
    if (spec.type === "user") {
      allFields = [...AUTH_COLUMNS];
    }
    // Add user-defined fields (excluding system fields like id, created, updated which are handled in DDL).
    const userFields = (spec.schema ?? []).filter(
      (f) => !["id", "created", "updated", "created_at", "updated_at"].includes(f.name),
    );
    allFields.push(...userFields.map((f) => ({ name: f.name, type: f.type, required: f.required, unique: f.unique, default: f.default })));
    ddl = renderCreateTable(spec.name, allFields);
  }

  // 1. Persist metadata.
  try {
    const schemaJson = spec.type !== "view" ? JSON.stringify(spec.schema ?? []) : null;
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

  // 2. Issue DDL.
  try {
    await c.env.DB.exec(ddl);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({ error: "ddl_failed", detail: msg, ddl }, 500);
  }

  // 3. Create indexes if provided.
  if (spec.type !== "view" && "indexes" in spec && spec.indexes) {
    for (const idx of spec.indexes) {
      if (idx.columns.length === 0) continue;
      assertIdentifier(idx.name);
      const cols = idx.columns.map((col) => `"${col}"`).join(", ");
      const uniqueKw = idx.unique ? "UNIQUE " : "";
      try {
        await c.env.DB.exec(`${uniqueKw}INDEX IF NOT EXISTS "${idx.name}" ON "${spec.name}" (${cols})`);
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
  const { results } = await c.env.SYSTEM_DB.prepare(
    `SELECT id, name, type, schema, query, indexes, constraints,
            list_rule, view_rule, create_rule, update_rule, delete_rule,
            auth_config, email_templates, created_at, updated_at
     FROM _collections ORDER BY name`,
  ).all();
  return c.json({ collections: results });
});

collectionsRouter.get("/:name", requireAuth, async (c) => {
  const name = c.req.param("name");
  if (!NAME_RE.test(name) && !name.startsWith("_")) {
    return c.json({ error: "invalid collection name" }, 400);
  }
  const row = await c.env.SYSTEM_DB.prepare(
    `SELECT id, name, type, schema, query, indexes, constraints,
            list_rule, view_rule, create_rule, update_rule, delete_rule,
            auth_config, email_templates, created_at, updated_at
     FROM _collections WHERE name = ?`,
  ).bind(name).first();
  if (!row) return c.json({ error: "not found" }, 404);
  return c.json({ collection: row });
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
    // Check if this is a view (views don't have rowid).
    const typeRow = await c.env.SYSTEM_DB.prepare(
      `SELECT type FROM _collections WHERE name = ?`,
    ).bind(name).first<{ type: string }>();
    const isView = typeRow?.type === "view";

    // Get total count.
    const countRow = await c.env.DB.prepare(
      `SELECT COUNT(*) as total FROM "${name}"`,
    ).first<{ total: number }>();
    const total = countRow?.total ?? 0;

    // Get the page of records — views don't have rowid so use a simple LIMIT/OFFSET.
    const orderBy = isView ? "LIMIT ? OFFSET ?" : "ORDER BY rowid DESC LIMIT ? OFFSET ?";
    const { results } = await c.env.DB.prepare(
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

  // 1. Check the collection exists.
  const row = await c.env.SYSTEM_DB.prepare(
    `SELECT id, type FROM _collections WHERE name = ?`,
  ).bind(name).first<{ id: string; type: string }>();
  if (!row) return c.json({ error: "not_found" }, 404);

  // 2. Drop the physical table (or view).
  try {
    if (row.type === "view") {
      await c.env.DB.exec(`DROP VIEW IF EXISTS "${name}"`);
    } else {
      await c.env.DB.exec(`DROP TABLE IF EXISTS "${name}"`);
    }
  } catch {
    // Non-fatal — the table might already be gone.
  }

  // 3. Delete the metadata row.
  await c.env.SYSTEM_DB.prepare(`DELETE FROM _collections WHERE id = ?`).bind(row.id).run();

  return c.json({ success: true });
});

/* ── POST /api/collections/:name/records — create a record ── */
collectionsRouter.post("/:name/records", requireAuth, requireRole("admin", "editor"), async (c) => {
  const name = c.req.param("name");
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

  const id = crypto.randomUUID();
  const now = Math.floor(Date.now() / 1000);

  // Add system columns.
  const data: Record<string, unknown> = { ...body, id, created_at: now, updated_at: now };

  // Remove any attempt to set system columns from the client.
  delete (data as Record<string, unknown>)["rowid"];

  // Build INSERT.
  const cols = Object.keys(data);
  const placeholders = cols.map(() => "?").join(", ");
  const colNames = cols.map((k) => `"${k}"`).join(", ");
  const values = cols.map((k) => data[k]);

  try {
    await c.env.DB.prepare(
      `INSERT INTO "${name}" (${colNames}) VALUES (${placeholders})`,
    ).bind(...values).run();

    const row = await c.env.DB.prepare(
      `SELECT * FROM "${name}" WHERE id = ?`,
    ).bind(id).first();

    return c.json({ record: row }, 201);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
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

  // Remove protected columns.
  delete body["id"];
  delete body["created_at"];
  delete body["rowid"];

  body["updated_at"] = Math.floor(Date.now() / 1000);

  const sets = Object.keys(body).map((k) => `"${k}" = ?`);
  const values = Object.values(body);

  if (sets.length === 0) {
    return c.json({ error: "no_fields_to_update" }, 400);
  }

  try {
    await c.env.DB.prepare(
      `UPDATE "${name}" SET ${sets.join(", ")} WHERE id = ?`,
    ).bind(...values, recordId).run();

    const row = await c.env.DB.prepare(
      `SELECT * FROM "${name}" WHERE id = ?`,
    ).bind(recordId).first();

    if (!row) return c.json({ error: "not_found" }, 404);
    return c.json({ record: row });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
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
    await c.env.DB.prepare(
      `DELETE FROM "${name}" WHERE id = ?`,
    ).bind(recordId).run();
    return c.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({ error: "delete_failed", detail: msg }, 500);
  }
});
