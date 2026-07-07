/**
 * Public records API — Supabase-style client access.
 *
 * Mounted at `/api/collections` so routes become:
 *   GET    /api/collections/:name/records         — list (paged)
 *   POST   /api/collections/:name/records         — create
 *   GET    /api/collections/:name/records/:id     — view
 *   PATCH  /api/collections/:name/records/:id     — update
 *   DELETE /api/collections/:name/records/:id     — delete
 *
 * Access is governed by the collection's stored `apiRules` per operation:
 *   - "public"       → anyone
 *   - "authenticated"→ requires a valid collection-scoped JWT
 *                       (registered user of THIS auth collection)
 *   - "superuser"    → requires a WorkerBase admin/editor session
 *   - undefined      → no public access (deny by default)
 *
 * For `type="user"` auth collections, "authenticated" callers can update /
 * delete their own record (id === token.recordId) regardless of update /
 * delete rules being "authenticated" — but the rule must still be set.
 */

import { Hono, type MiddlewareHandler } from "hono";
import type { Env } from "../../env.js";
import type {
  CollectionType,
  FieldDefinition,
  PermissionScope,
} from "../../db/schema.js";
import { verifyToken } from "../../auth/crypto.js";
import { verifyCollectionToken } from "../../auth/collectionToken.js";
import { pickDynamicDefaults } from "../collections/validation.js";

const NAME_RE = /^[a-zA-Z][a-zA-Z0-9_]*$/;
const IDENT = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

interface CollectionMeta {
  id: string;
  name: string;
  type: CollectionType;
  schema: FieldDefinition[] | null;
  listRule: string | null;
  viewRule: string | null;
  createRule: string | null;
  updateRule: string | null;
  deleteRule: string | null;
}

interface Principal {
  kind: "anonymous" | "collection-user" | "superuser";
  /** For collection-user: collection name + record id from the JWT. */
  collection?: string;
  recordId?: string;
  /** For superuser: role from the dashboard JWT. */
  role?: string;
}

async function loadCollection(db: D1Database, name: string): Promise<CollectionMeta | null> {
  const row = await db
    .prepare(
      `SELECT id, name, type, schema, list_rule, view_rule, create_rule, update_rule, delete_rule
         FROM _collections WHERE name = ?`,
    )
    .bind(name)
    .first<{
      id: string;
      name: string;
      type: string;
      schema: string | null;
      list_rule: string | null;
      view_rule: string | null;
      create_rule: string | null;
      update_rule: string | null;
      delete_rule: string | null;
    }>();
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    type: row.type as CollectionType,
    schema: row.schema ? (JSON.parse(row.schema) as FieldDefinition[]) : null,
    listRule: row.list_rule,
    viewRule: row.view_rule,
    createRule: row.create_rule,
    updateRule: row.update_rule,
    deleteRule: row.delete_rule,
  };
}

/** Resolve the request principal (anonymous / collection-user / superuser). */
async function resolvePrincipal(
  c: Parameters<MiddlewareHandler<{ Bindings: Env }>>[0],
  expectedCollection: string,
): Promise<Principal> {
  const header = c.req.header("Authorization") ?? "";
  const m = header.match(/^Bearer\s+(.+)$/i);
  if (!m) return { kind: "anonymous" };
  const token = m[1]!;

  // Try collection JWT first (most likely path for client traffic).
  const collectionPayload = await verifyCollectionToken(token, c.env.AUTH_SECRET, expectedCollection);
  if (collectionPayload) {
    return {
      kind: "collection-user",
      collection: collectionPayload.collection,
      recordId: collectionPayload.recordId,
    };
  }

  // Fall back to dashboard superuser JWT.
  const dashPayload = await verifyToken(token, c.env.AUTH_SECRET);
  if (dashPayload) {
    return { kind: "superuser", role: dashPayload.role };
  }

  return { kind: "anonymous" };
}

/** Allow access if the rule is satisfied by the principal. Superusers always pass. */
function ruleAllows(rule: string | null | undefined, principal: Principal): boolean {
  if (principal.kind === "superuser") return true;
  const scope = (rule ?? "") as PermissionScope;
  if (scope === "public") return true;
  if (scope === "authenticated" && principal.kind === "collection-user") return true;
  return false;
}

/** System columns that clients may never set. */
const SYSTEM_COLUMNS = new Set([
  "id",
  "created_at",
  "updated_at",
  "rowid",
  "password_hash",
  "password_salt",
  "token_key",
  "verified",
]);

/** Filter a user payload down to fields declared in the collection schema. */
function filterWriteFields(
  data: Record<string, unknown>,
  schemaFields: FieldDefinition[] | null,
): Record<string, unknown> {
  if (!schemaFields) return {};
  const allowed = new Map(schemaFields.map((f) => [f.name, f]));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    if (SYSTEM_COLUMNS.has(k)) continue;
    if (!IDENT.test(k)) continue;
    if (!allowed.has(k)) continue;
    out[k] = v;
  }
  return out;
}

/** System columns that must not be returned on reads. */
const HIDDEN_READ_COLUMNS = new Set([
  "password_hash",
  "password_salt",
  "token_key",
]);

function maskRow(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (!HIDDEN_READ_COLUMNS.has(k)) out[k] = v;
  }
  return out;
}

// ─────────────────────────────────────────────────────────────
//  Router
// ─────────────────────────────────────────────────────────────

export const recordsRouter = new Hono<{ Bindings: Env }>();

/**
 * Fetch the collection metadata + principal, enforce the per-op rule.
 * Returns a 401/403 response on auth failure, or `null` to continue.
 */
async function gate(
  c: Parameters<MiddlewareHandler<{ Bindings: Env }>>[0],
  ruleKey: keyof Pick<
    CollectionMeta,
    "listRule" | "viewRule" | "createRule" | "updateRule" | "deleteRule"
  >,
): Promise<Response | { collection: CollectionMeta; principal: Principal }> {
  const name = c.req.param("name");
  if (!name || !NAME_RE.test(name)) {
    return c.json({ error: "invalid_collection_name" }, 400);
  }

  const collection = await loadCollection(c.env.SYSTEM_DB, name);
  if (!collection) return c.json({ error: "not_found" }, 404);

  const principal = await resolvePrincipal(c, name);
  const rule = collection[ruleKey];

  // No rule → deny (rule-explicit BaaS semantics).
  if (!rule) {
    return c.json({ error: "operation_not_allowed", rule: ruleKey }, 403);
  }
  if (!ruleAllows(rule, principal)) {
    if (principal.kind === "anonymous") {
      return c.json({ error: "authentication_required" }, 401);
    }
    return c.json({ error: "insufficient_permissions" }, 403);
  }

  return { collection, principal };
}

// ─────────────────────────────────────────────────────────────
//  GET /api/collections/:name/records — list
// ─────────────────────────────────────────────────────────────

recordsRouter.get("/:name/records", async (c) => {
  const decision = await gate(c, "listRule");
  if (decision instanceof Response) return decision;
  const { collection } = decision;
  const name = collection.name;

  const page = Math.max(1, parseInt(c.req.query("page") ?? "1", 10) || 1);
  const perPage = Math.min(100, Math.max(1, parseInt(c.req.query("perPage") ?? "20", 10) || 20));
  const offset = (page - 1) * perPage;

  try {
    const countRow = await c.env.SYSTEM_DB.prepare(
      `SELECT COUNT(*) as total FROM "${name}"`,
    ).first<{ total: number }>();
    const total = countRow?.total ?? 0;

    const { results } = await c.env.SYSTEM_DB.prepare(
      `SELECT * FROM "${name}" ORDER BY rowid DESC LIMIT ? OFFSET ?`,
    ).bind(perPage, offset).all();

    const items = (results ?? []).map((r) =>
      maskRow(r as Record<string, unknown>),
    );

    return c.json({
      items,
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

// ─────────────────────────────────────────────────────────────
//  POST /api/collections/:name/records — create
// ─────────────────────────────────────────────────────────────

recordsRouter.post("/:name/records", async (c) => {
  const decision = await gate(c, "createRule");
  if (decision instanceof Response) return decision;
  const { collection } = decision;
  const name = collection.name;

  let body: Record<string, unknown>;
  try {
    const raw = await c.req.text();
    body = raw ? JSON.parse(raw) : {};
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }

  const filtered = filterWriteFields(body, collection.schema);
  const id = crypto.randomUUID();
  const now = Math.floor(Date.now() / 1000);
  // Auto-fill dynamic date defaults ($now / $nowOnUpdate). Client values win.
  const dynamicDefaults = pickDynamicDefaults(collection.schema, "insert", now);
  const data: Record<string, unknown> = { ...dynamicDefaults, ...filtered, id, created_at: now, updated_at: now };

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

    return c.json({ record: row ? maskRow(row as Record<string, unknown>) : null }, 201);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/UNIQUE/i.test(msg)) {
      return c.json({ error: "unique_violation", detail: msg }, 409);
    }
    return c.json({ error: "insert_failed", detail: msg }, 500);
  }
});

// ─────────────────────────────────────────────────────────────
//  GET /api/collections/:name/records/:id — view
// ─────────────────────────────────────────────────────────────

recordsRouter.get("/:name/records/:id", async (c) => {
  const decision = await gate(c, "viewRule");
  if (decision instanceof Response) return decision;
  const { collection } = decision;
  const recordId = c.req.param("id");

  const row = await c.env.SYSTEM_DB.prepare(
    `SELECT * FROM "${collection.name}" WHERE id = ?`,
  ).bind(recordId).first();
  if (!row) return c.json({ error: "not_found" }, 404);

  return c.json({ record: maskRow(row as Record<string, unknown>) });
});

// ─────────────────────────────────────────────────────────────
//  PATCH /api/collections/:name/records/:id — update
// ─────────────────────────────────────────────────────────────

recordsRouter.patch("/:name/records/:id", async (c) => {
  const decision = await gate(c, "updateRule");
  if (decision instanceof Response) return decision;
  const { collection, principal } = decision;
  const name = collection.name;
  const recordId = c.req.param("id");

  // For auth-collection users, only allow editing the own record.
  if (principal.kind === "collection-user" && principal.recordId !== recordId) {
    return c.json({ error: "forbidden_not_owner" }, 403);
  }

  let body: Record<string, unknown>;
  try {
    const raw = await c.req.text();
    body = raw ? JSON.parse(raw) : {};
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }

  const filtered = filterWriteFields(body, collection.schema);
  delete filtered.id;
  delete filtered.created_at;
  delete filtered.updated_at;
  // Refresh any $nowOnUpdate date fields on every write.
  const updateNow = Math.floor(Date.now() / 1000);
  const dynamicRefresh = pickDynamicDefaults(collection.schema, "update", updateNow);
  for (const [k, v] of Object.entries(dynamicRefresh)) filtered[k] = v;
  filtered.updated_at = updateNow;

  const sets = Object.keys(filtered).map((k) => `"${k}" = ?`);
  const values = Object.values(filtered);
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

    return c.json({ record: maskRow(row as Record<string, unknown>) });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({ error: "update_failed", detail: msg }, 500);
  }
});

// ─────────────────────────────────────────────────────────────
//  DELETE /api/collections/:name/records/:id — delete
// ─────────────────────────────────────────────────────────────

recordsRouter.delete("/:name/records/:id", async (c) => {
  const decision = await gate(c, "deleteRule");
  if (decision instanceof Response) return decision;
  const { collection, principal } = decision;
  const name = collection.name;
  const recordId = c.req.param("id");

  if (principal.kind === "collection-user" && principal.recordId !== recordId) {
    return c.json({ error: "forbidden_not_owner" }, 403);
  }

  // Block deletion from internal auth tables via public API.
  if (name.startsWith("_")) {
    return c.json({ error: "cannot_modify_system_table" }, 403);
  }

  try {
    const existing = await c.env.SYSTEM_DB.prepare(
      `SELECT id FROM "${name}" WHERE id = ?`,
    ).bind(recordId).first();
    if (!existing) return c.json({ error: "not_found" }, 404);

    await c.env.SYSTEM_DB.prepare(
      `DELETE FROM "${name}" WHERE id = ?`,
    ).bind(recordId).run();
    return c.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({ error: "delete_failed", detail: msg }, 500);
  }
});

// ─────────────────────────────────────────────────────────────
//  Exported helpers (for tests + composability)
// ─────────────────────────────────────────────────────────────

export {
  gate,
  resolvePrincipal,
  ruleAllows,
  filterWriteFields,
  maskRow,
  loadCollection,
  SYSTEM_COLUMNS,
  HIDDEN_READ_COLUMNS,
};
