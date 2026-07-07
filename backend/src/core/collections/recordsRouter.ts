/**
 * Admin record routes for dynamic collections.
 *
 * Routes (mounted at `/` of the composer, which is mounted at
 * `/api/core/collections`):
 *   GET    /:name/records        — paginated records list
 *   POST   /:name/records        — create a record
 *   PATCH  /:name/records/:id    — update a record
 *   DELETE /:name/records/:id    — delete a record
 */
import { Hono } from "hono";
import type { Env } from "../../env.js";
import type { FieldDefinition, CollectionType } from "../../db/schema.js";
import { requireAuth, requireRole } from "../../auth/middleware.js";
import { hashPassword } from "../../auth/crypto.js";
import { validateRecordFields, parseD1FieldError, pickDynamicDefaults } from "./validation.js";
import { NAME_RE } from "./ddl.js";

export const recordsRouter = new Hono<{ Bindings: Env }>();

/* ── GET /api/collections/:name/records — paginated records ── */
recordsRouter.get("/:name/records", requireAuth, async (c) => {
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

/* ── POST /api/collections/:name/records — create a record ── */
recordsRouter.post("/:name/records", requireAuth, requireRole("admin", "editor"), async (c) => {
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
  // Auto-fill dynamic date defaults ($now / $nowOnUpdate) for any field
  // the client omitted. Client-supplied values win — they explicitly set it.
  const dynamicDefaults = pickDynamicDefaults(schemaFields, "insert", now);
  const data: Record<string, unknown> = { ...dynamicDefaults, ...cleaned, id, created_at: now, updated_at: now };

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
recordsRouter.patch("/:name/records/:id", requireAuth, requireRole("admin", "editor"), async (c) => {
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

  // Refresh any $nowOnUpdate date fields (auto-timestamp on every write).
  // $now fields are NOT touched here — they only fire on insert.
  const updateNow = Math.floor(Date.now() / 1000);
  const dynamicRefresh = pickDynamicDefaults(schemaFields, "update", updateNow);
  for (const [k, v] of Object.entries(dynamicRefresh)) cleaned[k] = v;
  cleaned["updated_at"] = updateNow;

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
recordsRouter.delete("/:name/records/:id", requireAuth, requireRole("admin", "editor"), async (c) => {
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
