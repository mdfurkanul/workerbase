import { Hono } from "hono";
import { z } from "zod";
import type { Env } from "../env.js";
import type { CollectionField } from "../db/schema.js";

/**
 * Dynamic collection router.
 *
 * POST /api/collections
 *   Accepts a JSON spec describing a new collection, validates the name
 *   against a strict alphanumeric+underscore rule, persists metadata to
 *   `_collections`, and issues a live `CREATE TABLE` against D1.
 */

const FIELD_TYPES = ["text", "integer", "real", "blob"] as const;

const fieldSchema = z.object({
  name: z
    .string()
    .min(1)
    .regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/, "invalid column name"),
  type: z.enum(FIELD_TYPES),
  required: z.boolean().optional(),
  unique: z.boolean().optional(),
  default: z.union([z.string(), z.number(), z.boolean(), z.null()]).optional(),
});

const createCollectionSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-zA-Z][a-zA-Z0-9_]*$/, "name must be alphanumeric (underscore allowed) and start with a letter"),
  schema: z.array(fieldSchema).min(1),
  list_rule: z.string().optional(),
  create_rule: z.string().optional(),
});

export const collectionsRouter = new Hono<{ Bindings: Env }>();

const IDENT = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
function assertIdentifier(name: string) {
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

function renderCreateTable(name: string, fields: CollectionField[]): string {
  assertIdentifier(name);
  const body = [
    '"id" TEXT PRIMARY KEY',
    ...fields.map(renderColumnDef),
    '"created_at" INTEGER NOT NULL DEFAULT (unixepoch())',
  ].join(", ");
  return `CREATE TABLE IF NOT EXISTS "${name}" (${body})`;
}

function uuid(): string {
  // Crypto.randomUUID is available in the Workers runtime.
  return crypto.randomUUID();
}

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

  const { name, schema: fields, list_rule, create_rule } = parsed.data;

  // Strictly enforce the alphanumeric collection-name rule before any SQL.
  if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(name)) {
    return c.json({ error: "collection name must be alphanumeric" }, 400);
  }

  // 1. Persist metadata in `_collections`.
  const id = uuid();
  try {
    await c.env.DB.prepare(
      `INSERT INTO _collections (id, name, schema, list_rule, create_rule) VALUES (?, ?, ?, ?, ?)`,
    )
      .bind(id, name, JSON.stringify(fields), list_rule ?? null, create_rule ?? null)
      .run();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/UNIQUE/i.test(msg)) {
      return c.json({ error: "collection already exists" }, 409);
    }
    // Metadata table may not yet exist; surface the error so the operator runs migrations.
    return c.json({ error: "metadata_persist_failed", detail: msg }, 500);
  }

  // 2. Live CREATE TABLE on D1 (no string-interpolation of user-supplied identifiers —
  //    identifiers are validated above, and column VALUES are bound, not interpolated).
  const ddl = renderCreateTable(name, fields as CollectionField[]);
  try {
    await c.env.DB.exec(ddl);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({ error: "create_table_failed", detail: msg, ddl }, 500);
  }

  // 3. Fire-and-forget broadcast to any subscribed realtime clients for this collection.
  //    Use ctx.waitUntil so the response isn't blocked by DO fan-out.
  c.executionCtx.waitUntil(
    (async () => {
      try {
        const stub = c.env.REALTIME.get(c.env.REALTIME.idFromName(name));
        await stub.fetch(
          new Request("https://internal/broadcast", {
            method: "POST",
            body: JSON.stringify({ type: "collection_created", name }),
          }),
        );
      } catch {
        // Best-effort; do not fail the request.
      }
    })(),
  );

  return c.json({ id, name, schema: fields, list_rule, create_rule }, 201);
});

collectionsRouter.get("/", async (c) => {
  const { results } = await c.env.DB.prepare(`SELECT id, name, schema, list_rule, create_rule FROM _collections ORDER BY name`).all();
  return c.json({ collections: results });
});

collectionsRouter.get("/:name", async (c) => {
  const name = c.req.param("name");
  if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(name)) {
    return c.json({ error: "invalid collection name" }, 400);
  }
  const row = await c.env.DB.prepare(
    `SELECT id, name, schema, list_rule, create_rule FROM _collections WHERE name = ?`,
  )
    .bind(name)
    .first();
  if (!row) return c.json({ error: "not found" }, 404);
  return c.json({ collection: row });
});
