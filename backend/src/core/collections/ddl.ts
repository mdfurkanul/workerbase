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

export function renderCreateTable(name: string, fields: { name: string; type: string; required?: boolean; unique?: boolean; default?: string | number | boolean | null }[]): string {
  assertIdentifier(name);
  const body = [
    '"id" TEXT PRIMARY KEY',
    ...fields.map(renderColumnDef),
    '"created_at" INTEGER NOT NULL DEFAULT (unixepoch())',
    '"updated_at" INTEGER NOT NULL DEFAULT (unixepoch())',
  ].join(", ");
  return `CREATE TABLE IF NOT EXISTS "${name}" (${body})`;
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
