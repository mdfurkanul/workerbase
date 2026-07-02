import type { FieldDefinition } from "../../db/schema.js";

const IDENT = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

/** Columns the client may never write directly. */
export const READONLY_COLUMNS = new Set([
  "id",
  "created_at",
  "updated_at",
  "rowid",
]);

/** Auth-managed columns — writable only by the auth flow, not the admin
 *  record editor. The dashboard hides them; the API rejects them on write. */
export const AUTH_MANAGED_COLUMNS = new Set([
  "password_hash",
  "password_salt",
  "token_key",
  "verified",
]);

export interface ValidationError {
  field: string;
  message: string;
}

/**
 * Filter a client payload down to fields declared in the collection schema
 * (or physical columns when schema is unknown) and validate each one.
 *
 * Returns `{ values, errors }`:
 *   - `values` — the cleaned map of column → coerced value (ready to bind)
 *   - `errors` — field-keyed validation errors (empty when valid)
 *
 * Unknown fields are dropped and surfaced as a single `__unknown` error so
 * the user sees *why* their payload was trimmed.
 */
export function validateRecordFields(
  payload: Record<string, unknown>,
  schemaFields: FieldDefinition[] | null,
  opts: { partial?: boolean } = {},
): {
  values: Record<string, unknown>;
  errors: Record<string, string>;
} {
  const partial = opts.partial ?? false;
  const values: Record<string, unknown> = {};
  const errors: Record<string, string> = {};

  if (!schemaFields || schemaFields.length === 0) {
    // No schema metadata — accept anything that looks like a safe identifier
    // and isn't a system/auth-managed column.
    for (const [k, v] of Object.entries(payload)) {
      if (READONLY_COLUMNS.has(k) || AUTH_MANAGED_COLUMNS.has(k)) continue;
      if (!IDENT.test(k)) {
        errors[k] = `Not a writable column`;
        continue;
      }
      values[k] = v;
    }
    return { values, errors };
  }

  const allowed = new Map(schemaFields.map((f) => [f.name, f]));
  const seen = new Set<string>();

  for (const [k, v] of Object.entries(payload)) {
    seen.add(k);
    if (READONLY_COLUMNS.has(k)) {
      // Silently drop — clients often send these back unchanged.
      continue;
    }
    if (AUTH_MANAGED_COLUMNS.has(k)) {
      errors[k] = `Managed by the auth system — cannot be set directly`;
      continue;
    }
    const field = allowed.get(k);
    if (!field) {
      errors[k] = `Unknown column — not in the "${schemaFields[0] ? "collection" : "table"}" schema`;
      continue;
    }

    const isEmpty =
      v === null ||
      v === undefined ||
      v === "" ||
      (typeof v === "string" && v.trim() === "");

    if (isEmpty) {
      if (!partial && field.required && field.default === undefined) {
        errors[k] = `Required field cannot be empty`;
      }
      continue;
    }

    const coercionError = coerceAndCheck(field, v);
    if (coercionError) {
      errors[k] = coercionError;
      continue;
    }
    values[k] = coerceValue(field, v);
  }

  // Required-field check (skip in partial mode for PATCH).
  if (!partial) {
    for (const field of schemaFields) {
      if (READONLY_COLUMNS.has(field.name) || AUTH_MANAGED_COLUMNS.has(field.name)) continue;
      if (field.system) continue;
      if (!field.required) continue;
      if (field.default !== undefined) continue;
      if (!seen.has(field.name) || isEmptyValue(payload[field.name])) {
        errors[field.name] ??= `Required field is missing`;
      }
    }
  }

  return { values, errors };
}

function isEmptyValue(v: unknown): boolean {
  return (
    v === null ||
    v === undefined ||
    v === "" ||
    (typeof v === "string" && v.trim() === "")
  );
}

/** Type-check (no coercion). Returns an error message or null when valid. */
function coerceAndCheck(field: FieldDefinition, v: unknown): string | null {
  switch (field.type) {
    case "integer": {
      const n = typeof v === "number" ? v : Number(v);
      if (!Number.isInteger(n)) return `Must be a whole number`;
      return null;
    }
    case "real": {
      const n = typeof v === "number" ? v : Number(v);
      if (Number.isNaN(n)) return `Must be a valid number`;
      return null;
    }
    case "bool": {
      if (typeof v === "boolean") return null;
      if (v === 0 || v === 1 || v === "0" || v === "1") return null;
      if (typeof v === "string" && ["true", "false"].includes(v.toLowerCase())) return null;
      return `Must be true or false`;
    }
    case "email": {
      if (typeof v !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) {
        return `Must be a valid email address`;
      }
      return null;
    }
    case "url": {
      if (typeof v !== "string" || !/^https?:\/\/.+/.test(v)) {
        return `Must be a valid URL (starting with http:// or https://)`;
      }
      return null;
    }
    case "phone": {
      if (typeof v !== "string" || !/^[+]?[0-9\s\-()]{4,20}$/.test(v)) {
        return `Must be a valid phone number`;
      }
      return null;
    }
    case "text":
    case "editor":
    case "file":
    case "files":
    case "relation":
    case "select":
    case "json":
    case "geo":
    case "date":
    case "datetime": {
      // Stored as TEXT / JSON; accept any string / object.
      return null;
    }
    default:
      return null;
  }
}

/** Coerce a client value into the storage form for the given field type. */
function coerceValue(field: FieldDefinition, v: unknown): unknown {
  switch (field.type) {
    case "integer": {
      return typeof v === "number" ? v : parseInt(String(v), 10);
    }
    case "real": {
      return typeof v === "number" ? v : parseFloat(String(v));
    }
    case "bool": {
      if (typeof v === "boolean") return v ? 1 : 0;
      if (v === "true" || v === 1 || v === "1") return 1;
      return 0;
    }
    case "json": {
      if (typeof v === "string") {
        try {
          return JSON.parse(v);
        } catch {
          return v;
        }
      }
      return v;
    }
    default:
      return v;
  }
}

/**
 * Parse a D1 / SQLite error message into a field-level error when possible.
 *
 * Recognised patterns:
 *   - `UNIQUE constraint failed: <table>.<col>`
 *   - `NOT NULL constraint failed: <table>.<col>`
 *   - `table <table> has no column named <col>`
 *
 * Returns `{ field, message }` or null when the error isn't field-specific.
 */
export function parseD1FieldError(
  errMsg: string,
): { field: string; message: string } | null {
  // UNIQUE constraint failed: users.email
  let m = errMsg.match(/UNIQUE constraint failed:\s+\S+\.(\w+)/i);
  if (m) {
    return { field: m[1]!, message: `This value must be unique — already in use` };
  }

  // NOT NULL constraint failed: users.email
  m = errMsg.match(/NOT NULL constraint failed:\s+\S+\.(\w+)/i);
  if (m) {
    return { field: m[1]!, message: `Required field cannot be empty` };
  }

  // CHECK constraint failed: <name>
  m = errMsg.match(/CHECK constraint failed:\s+(\w+)/i);
  if (m) {
    return { field: m[1]!, message: `Failed the CHECK constraint` };
  }

  // table <name> has no column named <col>
  m = errMsg.match(/table\s+\S+\s+has no column named\s+(\w+)/i);
  if (m) {
    return { field: m[1]!, message: `Unknown column — not in this collection's schema` };
  }

  return null;
}
