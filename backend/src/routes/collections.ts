import { Hono } from "hono";
import { z } from "zod";
import type { Env } from "../env.js";
import type { CollectionField, CollectionType } from "../db/schema.js";

/**
 * Dynamic collection router.
 *
 * POST /api/collections
 *   Creates a new collection. Three modes are supported via `type`:
 *
 *     base : a user-defined custom table built from `schema` fields.
 *            `schema` is required.
 *     user : an auth-purposed table. Auth columns (`email`, `password_hash`,
 *            `password_salt`) are auto-injected; any user-supplied fields in
 *            `schema` are appended (e.g. display_name, role).
 *     view : a virtual collection backed by a SELECT query. `query` is
 *            required; the collection is materialised via CREATE VIEW.
 *
 *   The `name` is always validated against a strict alphanumeric+underscore
 *   rule. Identifiers used in DDL are validated against the same regex; user
 *   values are never string-interpolated into SQL — only validated identifiers
 *   are, and bound parameters handle literals.
 */

const IDENT = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
const NAME_RE = /^[a-zA-Z][a-zA-Z0-9_]*$/;
const FIELD_TYPES = ["text", "integer", "real", "blob"] as const;

const fieldSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(64)
    .regex(IDENT, "invalid column name"),
  type: z.enum(FIELD_TYPES),
  required: z.boolean().optional(),
  unique: z.boolean().optional(),
  default: z.union([z.string(), z.number(), z.boolean(), z.null()]).optional(),
});

const baseSpec = z.object({
  type: z.literal("base"),
  name: z.string().min(1).max(64).regex(NAME_RE, "name must be alphanumeric (underscore allowed) and start with a letter"),
  schema: z.array(fieldSchema).min(1),
  list_rule: z.string().optional(),
  create_rule: z.string().optional(),
});

const userSpec = z.object({
  type: z.literal("user"),
  name: z.string().min(1).max(64).regex(NAME_RE, "name must be alphanumeric (underscore allowed) and start with a letter"),
  // Auth columns are auto-injected; user may declare additional profile columns.
  schema: z.array(fieldSchema).max(32).optional(),
  list_rule: z.string().optional(),
  create_rule: z.string().optional(),
});

const viewSpec = z.object({
  type: z.literal("view"),
  name: z.string().min(1).max(64).regex(NAME_RE, "name must be alphanumeric (underscore allowed) and start with a letter"),
  // The SELECT statement backing the view. Must be a single read-only query.
  query: z
    .string()
    .min(1)
    .max(8192)
    .refine(
      (q) => isSafeSelectQuery(q),
      "query must be a single read-only SELECT statement (no semicolons, no DDL/DML)",
    ),
  list_rule: z.string().optional(),
  create_rule: z.string().optional(),
});

const createCollectionSchema = z.discriminatedUnion("type", [baseSpec, userSpec, viewSpec]);

type BaseSpec = z.infer<typeof baseSpec>;
type UserSpec = z.infer<typeof userSpec>;
type ViewSpec = z.infer<typeof viewSpec>;

export const collectionsRouter = new Hono<{ Bindings: Env }>();

// ---------- helpers ----------

function assertIdentifier(name: string): void {
  if (!IDENT.test(name)) {
    throw new Error(`unsafe identifier: ${name}`);
  }
}

function renderColumnDef(field: CollectionField): string {
  assertIdentifier(field.name);
  const parts = [`"${field.name}"`, field.type];
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

/** Auth columns injected into every `type: "user"` collection. */
const AUTH_COLUMNS: CollectionField[] = [
  { name: "email", type: "text", required: true, unique: true },
  { name: "password_hash", type: "text", required: true },
  { name: "password_salt", type: "text", required: true },
];

function renderCreateTable(name: string, fields: CollectionField[]): string {
  assertIdentifier(name);
  const body = [
    '"id" TEXT PRIMARY KEY',
    ...fields.map(renderColumnDef),
    '"created_at" INTEGER NOT NULL DEFAULT (unixepoch())',
  ].join(", ");
  return `CREATE TABLE IF NOT EXISTS "${name}" (${body})`;
}

function renderCreateView(name: string, query: string): string {
  assertIdentifier(name);
  return `CREATE VIEW IF NOT EXISTS "${name}" AS ${query}`;
}

/**
 * Validate that a user-supplied query is a single read-only SELECT.
 * Cheap-but-effective guardrails: no `;`, no DDL/DML keywords up front.
 */
function isSafeSelectQuery(raw: string): boolean {
  const q = raw.trim();
  if (!q) return false;
  if (q.includes(";")) return false;
  if (!/^SELECT\s+/i.test(q)) return false;
  // Reject obvious write/dml/ddl keywords as leading or anywhere as a clause.
  const forbidden =
    /\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|ATTACH|DETACH|PRAGMA|REPLACE|GRANT|REVOKE|VACUUM|REINDEX)\b/i;
  return !forbidden.test(q);
}

function uuid(): string {
  return crypto.randomUUID();
}

interface PersistedMeta {
  id: string;
  name: string;
  type: CollectionType;
  schema: CollectionField[] | null;
  query: string | null;
  list_rule?: string | null;
  create_rule?: string | null;
}

/** Persist the metadata row into `_collections`. Throws on UNIQUE collision. */
async function persistMeta(
  env: Env,
  meta: PersistedMeta,
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO _collections (id, name, type, schema, query, list_rule, create_rule)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      meta.id,
      meta.name,
      meta.type,
      meta.schema ? JSON.stringify(meta.schema) : null,
      meta.query,
      meta.list_rule ?? null,
      meta.create_rule ?? null,
    )
    .run();
}

// ---------- POST /api/collections ----------

collectionsRouter.post("/", async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid JSON body" }, 400);
  }

  const parsed = createCollectionSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "validation_failed", issues: parsed.error.flatten() }, 400);
  }

  const spec = parsed.data;
  const id = uuid();
  let ddl: string;
  let meta: PersistedMeta;

  if (spec.type === "view") {
    const v: ViewSpec = spec;
    ddl = renderCreateView(v.name, v.query);
    meta = {
      id,
      name: v.name,
      type: "view",
      schema: null,
      query: v.query,
      list_rule: v.list_rule,
      create_rule: v.create_rule,
    };
  } else if (spec.type === "user") {
    const u: UserSpec = spec;
    const extra = (u.schema ?? []) as CollectionField[];
    // Strip any user-supplied columns that collide with the auth columns.
    const reserved = new Set(AUTH_COLUMNS.map((c) => c.name));
    const deduped = extra.filter((f) => !reserved.has(f.name));
    const mergedSchema = [...AUTH_COLUMNS, ...deduped];
    ddl = renderCreateTable(u.name, mergedSchema);
    meta = {
      id,
      name: u.name,
      type: "user",
      schema: mergedSchema,
      query: null,
      list_rule: u.list_rule,
      create_rule: u.create_rule,
    };
  } else {
    const b: BaseSpec = spec;
    ddl = renderCreateTable(b.name, b.schema as CollectionField[]);
    meta = {
      id,
      name: b.name,
      type: "base",
      schema: b.schema as CollectionField[],
      query: null,
      list_rule: b.list_rule,
      create_rule: b.create_rule,
    };
  }

  // 1. Persist metadata.
  try {
    await persistMeta(c.env, meta);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/UNIQUE/i.test(msg)) {
      return c.json({ error: "collection already exists" }, 409);
    }
    return c.json({ error: "metadata_persist_failed", detail: msg }, 500);
  }

  // 2. Issue DDL (CREATE TABLE for base/user, CREATE VIEW for view).
  try {
    await c.env.DB.exec(ddl);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({ error: "ddl_failed", detail: msg, ddl }, 500);
  }

  // 3. Best-effort realtime broadcast — never block the response.
  c.executionCtx.waitUntil(
    (async () => {
      try {
        const stub = c.env.REALTIME.get(c.env.REALTIME.idFromName(meta.name));
        await stub.fetch(
          new Request("https://internal/broadcast", {
            method: "POST",
            body: JSON.stringify({ type: "collection_created", name: meta.name, collectionType: meta.type }),
          }),
        );
      } catch {
        // ignore — best effort
      }
    })(),
  );

  return c.json(meta, 201);
});

// ---------- GET /api/collections ----------

collectionsRouter.get("/", async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT id, name, type, schema, query, list_rule, create_rule FROM _collections ORDER BY name`,
  ).all();
  return c.json({ collections: results });
});

collectionsRouter.get("/:name", async (c) => {
  const name = c.req.param("name");
  if (!NAME_RE.test(name)) {
    return c.json({ error: "invalid collection name" }, 400);
  }
  const row = await c.env.DB.prepare(
    `SELECT id, name, type, schema, query, list_rule, create_rule FROM _collections WHERE name = ?`,
  )
    .bind(name)
    .first();
  if (!row) return c.json({ error: "not found" }, 404);
  return c.json({ collection: row });
});
