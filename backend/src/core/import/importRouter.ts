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
  opts: {
    addIdPk?: boolean;        // include `"id" TEXT PRIMARY KEY` (auto UUID)
    primaryKeyColumn?: string; // alternative: a source column marked as PK
    addCreatedAt?: boolean;
    addUpdatedAt?: boolean;
  } = {},
): string {
  assertIdentifier(name);
  const parts: string[] = [];

  // Primary key strategy: either auto-id column, or one of the source columns.
  if (opts.addIdPk) {
    parts.push('"id" TEXT PRIMARY KEY');
  }
  for (const f of fields) {
    const col = renderColumnDef(f);
    if (opts.primaryKeyColumn === f.name) {
      parts.push(`${col} PRIMARY KEY`);
    } else {
      parts.push(col);
    }
  }
  if (opts.addCreatedAt) {
    parts.push('"created_at" INTEGER NOT NULL DEFAULT (unixepoch())');
  }
  if (opts.addUpdatedAt) {
    parts.push('"updated_at" INTEGER NOT NULL DEFAULT (unixepoch())');
  }
  return `CREATE TABLE IF NOT EXISTS "${name}" (${parts.join(", ")})`;
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
    /** Required for both modes — the collection name. */
    collection: z.string().min(1).max(64).regex(NAME_RE).optional(),
    /** Only used when mode="new". */
    type: z.enum(["base", "user"]).optional(),
    /**
     * Primary key strategy for mode="new".
     *   "auto"        → add `"id" TEXT PRIMARY KEY` column (UUIDs auto-generated on insert)
     *   "<column>"    → use the named source column as PRIMARY KEY
     *   omitted       → no explicit PK (SQLite uses rowid)
     */
    primaryKey: z.union([z.literal("auto"), z.string().min(1).max(128).regex(IDENT)]).optional(),
    /** mode="new": include a `created_at` column. */
    addCreatedAt: z.boolean().optional(),
    /** mode="new": include an `updated_at` column. */
    addUpdatedAt: z.boolean().optional(),
  }),
  /** Required for mode="existing". For mode="new" with `primaryKey` + columns,
   *  callers may omit mappings and the backend will map source→target 1:1 by name. */
  mappings: z.array(mappingSchema),
  data: z.array(z.record(z.unknown())).min(1),
}).superRefine((val, ctx) => {
  if (!val.target.collection) {
    ctx.addIssue({
      code: "custom",
      path: ["target", "collection"],
      message: "target.collection is required",
    });
  }
  // mode="existing" needs mappings; mode="new" can omit them.
  if (val.target.mode === "existing" && val.mappings.length === 0) {
    ctx.addIssue({
      code: "custom",
      path: ["mappings"],
      message: "mappings are required for mode='existing'",
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

  const { format, target, data } = parsed.data;
  const collectionName = target.collection!;
  const db = c.env.SYSTEM_DB;

  /* For mode="new" without explicit mappings, build a 1:1 mapping from every
   *  source column found in `data` (skipping nothing). mode="existing" requires
   *  explicit mappings (validated by Zod). */
  let mappings = parsed.data.mappings;
  if (target.mode === "new" && mappings.length === 0) {
    const sourceSet = new Set<string>();
    for (const row of data) {
      for (const k of Object.keys(row)) sourceSet.add(k);
    }
    mappings = Array.from(sourceSet).map((src) => ({
      sourceColumn: src,
      targetColumn: src,
    }));
  }

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

    // Resolve primary key strategy.
    const pkChoice = target.primaryKey ?? "auto";
    const addIdPk = pkChoice === "auto";
    // If PK is a source column, validate it's in targetColumns.
    const primaryKeyColumn = !addIdPk ? pkChoice : undefined;
    if (primaryKeyColumn && !targetColumns.includes(primaryKeyColumn)) {
      return c.json(
        { error: "invalid_primary_key", detail: `Column "${primaryKeyColumn}" is not in the mapped columns.` },
        400,
      );
    }

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

    const ddl = renderCreateTable(collectionName, allFields, {
      addIdPk,
      primaryKeyColumn,
      addCreatedAt: target.addCreatedAt === true,
      addUpdatedAt: target.addUpdatedAt === true,
    });

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

  /* ── Build + execute INSERT batch ──
   * Column list depends on the choices made at table-creation time:
   *   - auto-id PK? → include `id` (UUID) as the first column
   *   - addCreatedAt / addUpdatedAt? → include those (set to now())
   *   - source-PK column? → value comes from data, no auto-generation
   * For mode="existing" we detect which of these columns exist via PRAGMA.
   */
  const wantIdPk = target.mode === "new"
    ? (target.primaryKey ?? "auto") === "auto"
    : false;
  let existingHasId = true;
  let existingHasCreatedAt = true;
  let existingHasUpdatedAt = true;
  if (target.mode === "existing") {
    try {
      const { results } = await db.prepare(`PRAGMA table_info("${collectionName}")`).all<{ name: string }>();
      const names = new Set((results ?? []).map((r) => r.name));
      existingHasId = names.has("id");
      existingHasCreatedAt = names.has("created_at");
      existingHasUpdatedAt = names.has("updated_at");
    } catch {
      // PRAGMA failed — assume defaults.
    }
  }
  const includeId = target.mode === "new" ? wantIdPk : existingHasId;
  const includeCreatedAt = target.mode === "new"
    ? target.addCreatedAt === true
    : existingHasCreatedAt;
  const includeUpdatedAt = target.mode === "new"
    ? target.addUpdatedAt === true
    : existingHasUpdatedAt;

  const errors: string[] = [];
  let imported = 0;

  // Build the INSERT column list + placeholder list.
  const insertCols: string[] = [];
  if (includeId) insertCols.push("id");
  for (const col of targetColumns) insertCols.push(`"${col}"`);
  if (includeCreatedAt) insertCols.push("created_at");
  if (includeUpdatedAt) insertCols.push("updated_at");

  const colList = insertCols.join(", ");
  const placeholders = insertCols.map(() => "?").join(", ");
  const insertSql = `INSERT INTO "${collectionName}" (${colList}) VALUES (${placeholders})`;

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

    const now = Math.floor(Date.now() / 1000);
    const bindValues: unknown[] = [];
    if (includeId) bindValues.push(crypto.randomUUID());
    bindValues.push(...mappedValues);
    if (includeCreatedAt) bindValues.push(now);
    if (includeUpdatedAt) bindValues.push(now);

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
