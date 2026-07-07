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
  SYSTEM_COLUMNS,
  assertIdentifier,
  isSafeSelectQuery,
  renderCreateTable,
  renderCreateView,
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
 * Prepend the standard system-managed columns (id, created_at, updated_at)
 * to a returned schema. The system columns are always auto-managed by DDL
 * — they exist on every base/user table even when absent from the stored
 * `_collections.schema` JSON. If a user-defined field happens to share a
 * system name (e.g. legacy "id" column), the system shape wins because
 * that's what the physical table actually contains — the user's version
 * was filtered out at create time by `isReserved()`.
 */
export function mergeSystemColumns<T extends { name: string; type: string }>(
  schema: T[],
): T[] {
  const sysNames: Set<string> = new Set(SYSTEM_COLUMNS.map((c) => c.name));
  const userFields = schema.filter((f) => !sysNames.has(f.name));
  // The SYSTEM_COLUMNS constant is `{ name, type }` only — cast back to T
  // since the dashboard treats schema entries as opaque column descriptors.
  return [...SYSTEM_COLUMNS, ...userFields] as unknown as T[];
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
        const baseSchema = meta?.schema ?? pragmaSchema;
        // System columns (id, created_at, updated_at) are auto-managed by DDL
        // and intentionally excluded from the stored schema. Re-merge them in
        // so the dashboard sees the full table shape (views don't have them).
        const isViewCollection = (meta?.type ?? "") === "view";
        const schema = isViewCollection
          ? baseSchema
          : mergeSystemColumns(baseSchema);
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
  // Re-merge the auto-managed system columns (id, created_at, updated_at)
  // for base/user tables. Views don't have them.
  if (declaredType !== "view") {
    schema = mergeSystemColumns(schema);
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
        SET ${renamedTo ? `name = ?, ` : ""}schema = ?, query = ?, indexes = ?, constraints = ?,
            list_rule = ?, view_rule = ?, create_rule = ?, update_rule = ?, delete_rule = ?,
            auth_config = ?, email_templates = ?, updated_at = ?
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
