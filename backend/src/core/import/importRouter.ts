/**
 * Import router.
 *
 * Mounted at `/api/core/import`:
 *   POST /  — accepts parsed rows + column mappings and bulk-inserts them
 *             into either an existing collection or a newly created one.
 *
 * The frontend handles file parsing (JSON / CSV) and sends structured data.
 * The endpoint is write-only — it creates a table (when mode="new") and
 * inserts rows; it never returns existing data.
 */

import { Hono } from "hono";
import { z } from "zod";
import type { Env } from "../../env.js";
import type { FieldDefinition, CollectionType } from "../../db/schema.js";
import { requireAuth, requireRole } from "../../auth/middleware.js";

export const importRouter = new Hono<{ Bindings: Env }>();

/* ── Helpers (mirror collectionsRouter.ts for DDL consistency) ────── */

const IDENT = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
const NAME_RE = /^[a-zA-Z][a-zA-Z0-9_]*$/;

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

function renderColumnDef(field: {
  name: string;
  type: string;
  required?: boolean;
  unique?: boolean;
  default?: string | number | boolean | null;
}): string {
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

function renderCreateTable(
  name: string,
  fields: { name: string; type: string; required?: boolean; unique?: boolean; default?: string | number | boolean | null }[],
): string {
  assertIdentifier(name);
  const body = [
    '"id" TEXT PRIMARY KEY',
    ...fields.map(renderColumnDef),
    '"created_at" INTEGER NOT NULL DEFAULT (unixepoch())',
    '"updated_at" INTEGER NOT NULL DEFAULT (unixepoch())',
  ].join(", ");
  return `CREATE TABLE IF NOT EXISTS "${name}" (${body})`;
}

/* ── Zod body schema ─────────────────────────────────────────────── */

const mappingSchema = z.object({
  sourceColumn: z.string().min(1).max(128),
  /** null = skip this source column. */
  targetColumn: z.string().min(1).max(128).regex(IDENT).nullable(),
});

const bodySchema = z.object({
  format: z.enum(["json", "csv"]),
  target: z.object({
    mode: z.enum(["existing", "new"]),
    /** Required when mode="existing"; required when mode="new". */
    collection: z.string().min(1).max(64).regex(NAME_RE).optional(),
    /** Only used when mode="new". */
    type: z.enum(["base", "user"]).optional(),
  }),
  mappings: z.array(mappingSchema).min(1),
  data: z.array(z.record(z.unknown())).min(1),
}).superRefine((val, ctx) => {
  if (!val.target.collection) {
    ctx.addIssue({
      code: "custom",
      path: ["target", "collection"],
      message: "target.collection is required",
    });
  }
});

/* ── POST / — bulk import ────────────────────────────────────────── */
importRouter.post("/", requireAuth, requireRole("admin"), async (c) => {
  let body: unknown;
  try {
    const raw = await c.req.text();
    body = raw ? JSON.parse(raw) : {};
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "validation_failed", issues: parsed.error.flatten() }, 400);
  }

  const { format, target, mappings, data } = parsed.data;
  const collectionName = target.collection!;
  const db = c.env.SYSTEM_DB;

  /* Determine target columns from the mapping (excluding skips). */
  const targetColumns = mappings
    .filter((m) => m.targetColumn !== null)
    .map((m) => m.targetColumn!);

  if (targetColumns.length === 0) {
    return c.json({ error: "no_mapped_columns", detail: "All columns are set to skip." }, 400);
  }

  /* Validate every targetColumn is a safe identifier (already enforced by Zod). */
  for (const col of targetColumns) {
    if (!IDENT.test(col)) {
      return c.json({ error: "invalid_column_name", detail: col }, 400);
    }
  }

  let created = false;

  /* ── mode="new": create the collection + metadata ── */
  if (target.mode === "new") {
    const collectionType: CollectionType = target.type ?? "base";

    // Build the field list for DDL.
    let allFields: { name: string; type: string; required?: boolean; unique?: boolean }[] = [];

    if (collectionType === "user") {
      allFields = [...AUTH_COLUMNS];
    }

    // User-defined columns come from the target columns. We infer them as
    // TEXT (nullable) — the user can refine the schema later via PATCH.
    const AUTH_RESERVED = new Set(AUTH_COLUMNS.map((c) => c.name));
    const SYSTEM_NAMES = ["id", "created", "updated", "created_at", "updated_at"];
    for (const col of targetColumns) {
      if (SYSTEM_NAMES.includes(col)) continue;
      if (collectionType === "user" && AUTH_RESERVED.has(col)) continue;
      allFields.push({ name: col, type: "text", required: false, unique: false });
    }

    const ddl = renderCreateTable(collectionName, allFields);

    // 1. Issue DDL first (so failed DDL doesn't leave orphan metadata).
    try {
      await db.exec(ddl);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/already exists/i.test(msg)) {
        return c.json({ error: "collection already exists" }, 409);
      }
      return c.json({ error: "ddl_failed", detail: msg, ddl }, 500);
    }

    // 2. Persist metadata.
    const id = crypto.randomUUID();
    const now = Date.now();

    // Build stored schema JSON.
    const survivingFields = allFields.filter((f) => {
      // The AUTH_COLUMNS are also fields but we want to record them with
      // full FieldDefinition metadata.
      return true;
    });

    const persistedSchema: FieldDefinition[] = survivingFields.map((f, i) => {
      const isAuth = collectionType === "user" && AUTH_RESERVED.has(f.name);
      return {
        id: isAuth ? `auth_${f.name}` : `col_${i}_${f.name}`,
        name: f.name,
        type: f.type as FieldDefinition["type"],
        required: f.required ?? false,
        unique: f.unique ?? false,
        hidden: isAuth && (f.name === "password_hash" || f.name === "password_salt" || f.name === "token_key"),
        system: isAuth,
        auto: false,
        options: {},
      };
    });

    try {
      await db.prepare(
        `INSERT INTO _collections
          (id, name, type, schema, query, indexes, constraints,
           list_rule, view_rule, create_rule, update_rule, delete_rule,
           auth_config, email_templates, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        id, collectionName, collectionType,
        JSON.stringify(persistedSchema), null, null, null,
        null, null, null, null, null,
        null, null, now, now,
      ).run();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/UNIQUE/i.test(msg)) {
        return c.json({ error: "collection already exists" }, 409);
      }
      return c.json({ error: "metadata_persist_failed", detail: msg }, 500);
    }

    created = true;
  } else {
    /* ── mode="existing": verify the collection exists ── */
    const exists = await db
      .prepare(`SELECT name FROM sqlite_master WHERE type IN ('table','view') AND name = ?`)
      .bind(collectionName)
      .first<{ name: string }>();
    if (!exists) {
      return c.json({ error: "target_collection_not_found" }, 404);
    }
  }

  /* ── Build + execute INSERT batch ── */
  // Build a lookup: sourceColumn → targetColumn (null entries already filtered above).
  const mapLookup = new Map<string, string | null>();
  for (const m of mappings) {
    mapLookup.set(m.sourceColumn, m.targetColumn);
  }

  const errors: string[] = [];
  let imported = 0;

  // Use a single column list for all inserts (the mapped target columns).
  const colNames = targetColumns.map((c) => `"${c}"`).join(", ");
  const placeholders = targetColumns.map(() => "?").join(", ");
  const insertSql = `INSERT INTO "${collectionName}" (id, ${colNames}, created_at, updated_at) VALUES (?, ${placeholders}, ?, ?)`;

  for (let i = 0; i < data.length; i++) {
    const row = data[i]!;

    // Skip blank rows — all mapped source values are empty/null.
    const mappedValues = targetColumns.map((targetCol) => {
      // Find the source column(s) that map to this target column.
      for (const m of mappings) {
        if (m.targetColumn === targetCol) {
          const v = row[m.sourceColumn];
          if (v === undefined || v === null) return null;
          if (typeof v === "string" && v.trim() === "") return null;
          return v;
        }
      }
      return null;
    });

    // Check if the entire row is blank (all target values are null).
    const isBlank = mappedValues.every((v) => v === null || v === "" || v === undefined);
    if (isBlank) continue;

    const id = crypto.randomUUID();
    const now = Math.floor(Date.now() / 1000);
    const bindValues = [id, ...mappedValues, now, now];

    try {
      await db.prepare(insertSql).bind(...bindValues).run();
      imported++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`Row ${i + 1}: ${msg}`);
    }
  }

  return c.json({
    imported,
    collection: collectionName,
    created,
    format,
    errors,
  });
});
