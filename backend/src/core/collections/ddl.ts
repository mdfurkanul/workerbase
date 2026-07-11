/**
 * DDL helpers and constants for dynamic collections.
 *
 * All identifier quoting / SQL-string construction for physical tables,
 * views, columns, and auth-column injection lives here.
 */

export const IDENT = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
export const NAME_RE = /^[a-zA-Z][a-zA-Z0-9_]*$/;

/** Auth columns auto-injected for type="user" collections. */
export const AUTH_COLUMNS = [
  { name: "email", type: "email", required: true, unique: true },
  { name: "password_hash", type: "text", required: true, unique: false },
  { name: "password_salt", type: "text", required: true, unique: false },
  { name: "token_key", type: "text", required: false, unique: false },
  { name: "verified", type: "bool", required: false, unique: false },
];

/** Reserved column names that the auth system owns — user-defined fields
 *  with these names are silently dropped from the DDL (auth columns win)
 *  to prevent "duplicate column name" errors. */
export const AUTH_RESERVED_COLUMNS = new Set(AUTH_COLUMNS.map((c) => c.name));

/**
 * Standard system-managed columns present on every base/user collection table.
 * These are added by `renderCreateTable` and are filtered out of the
 * user-authored schema at create time. We re-merge them into the schema
 * returned by the metadata API so the dashboard sees the full table shape
 * (otherwise a collection with a single user field would show only that
 * one column — the id/created_at/updated_at columns would be invisible).
 *
 * Marked `system: true` so the migration diff logic protects them from
 * being dropped and so the UI can render them read-only.
 */
export interface SystemColumn {
  id: string;
  name: string;
  type: string;
  required: boolean;
  unique: boolean;
  hidden: boolean;
  system: true;
  auto?: boolean;
  primaryKey?: boolean;
  options: Record<string, unknown>;
}

export const SYSTEM_COLUMNS_FULL: SystemColumn[] = [
  {
    id: "sys_id",
    name: "id",
    type: "text",
    required: true,
    unique: true,
    hidden: false,
    system: true,
    primaryKey: true,
    options: {},
  },
  {
    id: "sys_created_at",
    name: "created_at",
    type: "datetime",
    required: true,
    unique: false,
    hidden: false,
    system: true,
    auto: true,
    options: { includeTime: true },
  },
  {
    id: "sys_updated_at",
    name: "updated_at",
    type: "datetime",
    required: true,
    unique: false,
    hidden: false,
    system: true,
    auto: true,
    options: { includeTime: true },
  },
];

/** Minimal `{ name, type }` projection of the system columns — used by
 *  endpoints that only return column metadata (not the full FieldDefinition). */
export const SYSTEM_COLUMNS: { name: string; type: string }[] =
  SYSTEM_COLUMNS_FULL.map((c) => ({ name: c.name, type: c.type }));

/** Tables hidden from the dashboard collection list. */
export const HIDDEN = new Set([
  "_collections",
  "_db_migrations",
  "d1_migrations",
  "sqlite_sequence",
  "_cf_METADATA",
]);

/* ── Helpers ── */

export function assertIdentifier(name: string): void {
  if (!IDENT.test(name)) throw new Error(`unsafe identifier: ${name}`);
}

/** Map a frontend field type to the SQLite column type used in DDL. */
export function sqliteType(type: string): string {
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

export function renderColumnDef(field: { name: string; type: string; required?: boolean; unique?: boolean; default?: string | number | boolean | null }): string {
  assertIdentifier(field.name);
  const parts = [`"${field.name}"`, sqliteType(field.type)];
  if (field.required) parts.push("NOT NULL");
  if (field.unique) parts.push("UNIQUE");
  if (field.default !== undefined && field.default !== null) {
    // Dynamic date/datetime defaults ($now, $nowOnUpdate) are resolved by the
    // record routers at write time — never emit them as a SQL DEFAULT.
    const isDynamicDate =
      typeof field.default === "string" &&
      (field.type === "date" || field.type === "datetime") &&
      (field.default === "$now" || field.default === "$nowOnUpdate");
    if (!isDynamicDate) {
      if (typeof field.default === "string") {
        parts.push(`DEFAULT '${field.default.replace(/'/g, "''")}'`);
      } else if (typeof field.default === "boolean") {
        parts.push(`DEFAULT ${field.default ? 1 : 0}`);
      } else {
        parts.push(`DEFAULT ${field.default}`);
      }
    }
  }
  return parts.join(" ");
}

/** ID column definitions per ID strategy. */
export type IdType = "uuid" | "autoincrement";

export function renderCreateTable(
  name: string,
  fields: { name: string; type: string; required?: boolean; unique?: boolean; default?: string | number | boolean | null }[],
  opts: { idType?: IdType } = {},
): string {
  assertIdentifier(name);
  const idCol =
    opts.idType === "autoincrement"
      ? '"id" INTEGER PRIMARY KEY AUTOINCREMENT'
      : '"id" TEXT PRIMARY KEY';
  const body = [
    idCol,
    ...fields.map(renderColumnDef),
    '"created_at" INTEGER NOT NULL DEFAULT (unixepoch())',
    '"updated_at" INTEGER NOT NULL DEFAULT (unixepoch())',
  ].join(", ");
  return `CREATE TABLE IF NOT EXISTS "${name}" (${body})`;
}

/**
 * Seed the `sqlite_sequence` table so the next auto-increment ID starts at
 * `start`. Must be called AFTER the table is created (AUTOINCREMENT creates
 * `sqlite_sequence` automatically). Uses `INSERT OR REPLACE` so it works
 * whether or not a row already exists for this table.
 *
 *   start=1  →  seq=0  →  first insert gets id=1
 *   start=100 → seq=99  →  first insert gets id=100
 */
export async function seedAutoIncrement(
  db: D1Database,
  tableName: string,
  start: number,
): Promise<void> {
  assertIdentifier(tableName);
  if (!Number.isInteger(start) || start < 1) return;
  await db
    .prepare(
      `INSERT OR REPLACE INTO sqlite_sequence (name, seq) VALUES (?, ?)`,
    )
    .bind(tableName, start - 1)
    .run();
}

export function renderCreateView(name: string, query: string): string {
  assertIdentifier(name);
  return `CREATE VIEW IF NOT EXISTS "${name}" AS ${query}`;
}

export function isSafeSelectQuery(raw: string): boolean {
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
export async function validateViewQuery(
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
