import type { FieldDefinition } from "../../db/schema.js";

const IDENT = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

function assertIdentifier(name: string): void {
  if (!IDENT.test(name)) throw new Error(`unsafe identifier: ${name}`);
}

function sqliteType(type: string): string {
  const map: Record<string, string> = {
    text: "TEXT", editor: "TEXT", phone: "TEXT", url: "TEXT", email: "TEXT",
    integer: "INTEGER", real: "REAL",
    bool: "INTEGER",
    date: "TEXT", datetime: "INTEGER",
    file: "TEXT", files: "TEXT",
    relation: "TEXT", select: "TEXT", json: "TEXT",
    blob: "BLOB",
  };
  return map[type] ?? "TEXT";
}

function renderColumnDef(field: FieldDefinition): string {
  assertIdentifier(field.name);
  const parts = [`"${field.name}"`, sqliteType(field.type)];
  if (field.required) parts.push("NOT NULL");
  if (field.unique) parts.push("UNIQUE");
  if (field.default !== undefined && field.default !== null) {
    parts.push(`DEFAULT '${String(field.default).replace(/'/g, "''")}'`);
  }
  return parts.join(" ");
}

export interface SchemaDiffOp {
  kind: "add" | "drop" | "rename";
  column: string;
  sql: string;
  field?: FieldDefinition;
  from?: string;
  to?: string;
}

/**
 * Compute the diff between an old and new schema for a collection.
 * Returns ordered ops: renames first, then adds (in new-schema order),
 * then drops (in old-schema order).
 */
export function diffSchema(
  collectionName: string,
  oldFields: FieldDefinition[],
  newFields: FieldDefinition[],
): SchemaDiffOp[] {
  assertIdentifier(collectionName);
  for (const f of newFields) assertIdentifier(f.name);
  for (const f of oldFields) assertIdentifier(f.name);

  const oldById = new Map(oldFields.map((f) => [f.id, f]));
  const newById = new Map(newFields.map((f) => [f.id, f]));

  const ops: SchemaDiffOp[] = [];

  // Renames: same id, different name (use OLD name → NEW name).
  for (const nf of newFields) {
    const of = oldById.get(nf.id);
    if (of && of.name !== nf.name) {
      const oldName = of.name;
      const newName = nf.name;
      assertIdentifier(oldName);
      assertIdentifier(newName);
      ops.push({
        kind: "rename",
        column: newName,
        from: oldName,
        to: newName,
        sql: `ALTER TABLE "${collectionName}" RENAME COLUMN "${oldName}" TO "${newName}";`,
      });
    }
  }

  // Adds: ids in new but not in old.
  for (const nf of newFields) {
    if (!oldById.has(nf.id)) {
      ops.push({
        kind: "add",
        column: nf.name,
        sql: `ALTER TABLE "${collectionName}" ADD COLUMN ${renderColumnDef(nf)};`,
        field: nf,
      });
    }
  }

  // Drops: ids in old but not in new; never drop system fields.
  for (const of of oldFields) {
    if (!newById.has(of.id) && !of.system) {
      ops.push({
        kind: "drop",
        column: of.name,
        sql: `ALTER TABLE "${collectionName}" DROP COLUMN "${of.name}";`,
      });
    }
  }

  return ops;
}

/**
 * Apply a list of SchemaDiffOps against the live D1 database.
 * Records each op's outcome in `_db_migrations`. Continues on error.
 */
export async function applyMigration(
  db: D1Database,
  collectionName: string,
  ops: SchemaDiffOp[],
): Promise<{ applied: number; errors: string[] }> {
  let applied = 0;
  const errors: string[] = [];

  for (const op of ops) {
    const id = crypto.randomUUID();
    const now = Date.now();
    try {
      await db.exec(op.sql);
      await db
        .prepare(
          `INSERT INTO _db_migrations (id, collection_name, sql, status, applied_at) VALUES (?, ?, ?, ?, ?)`,
        )
        .bind(id, collectionName, op.sql, "applied", now)
        .run();
      applied++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${op.kind} "${op.column}": ${msg}`);
      try {
        await db
          .prepare(
            `INSERT INTO _db_migrations (id, collection_name, sql, status, applied_at) VALUES (?, ?, ?, ?, ?)`,
          )
          .bind(id, collectionName, op.sql, "failed", now)
          .run();
      } catch {
        // give up recording
      }
    }
  }

  return { applied, errors };
}
