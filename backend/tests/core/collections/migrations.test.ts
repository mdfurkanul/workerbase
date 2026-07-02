import { describe, it, expect } from "vitest";
import {
  diffSchema,
  applyMigration,
  type SchemaDiffOp,
} from "../../../src/core/collections/migrations.js";
import type { FieldDefinition } from "../../../src/db/schema.js";

function f(partial: Partial<FieldDefinition> & { id: string; name: string }): FieldDefinition {
  return {
    type: "text",
    required: false,
    unique: false,
    hidden: false,
    options: {},
    ...partial,
  };
}

/* ═══════════════════════════════════════════════════════════════════
   diffSchema — pure unit tests
   ═══════════════════════════════════════════════════════════════════ */

describe("diffSchema", () => {
  it("happy path: add a new field → produces ADD COLUMN", () => {
    const oldFields = [f({ id: "1", name: "title" })];
    const newFields = [
      f({ id: "1", name: "title" }),
      f({ id: "2", name: "body", type: "editor" }),
    ];
    const ops = diffSchema("posts", oldFields, newFields);

    const addOps = ops.filter((o) => o.kind === "add");
    expect(addOps).toHaveLength(1);
    expect(addOps[0]!.column).toBe("body");
    expect(addOps[0]!.sql).toContain('ALTER TABLE "posts" ADD COLUMN');
    expect(addOps[0]!.sql).toContain('"body"');
    expect(addOps[0]!.sql).toContain("TEXT");
    expect(addOps[0]!.field?.type).toBe("editor");
  });

  it("remove a non-system field → produces DROP COLUMN", () => {
    const oldFields = [
      f({ id: "1", name: "title" }),
      f({ id: "2", name: "draft" }),
    ];
    const newFields = [f({ id: "1", name: "title" })];
    const ops = diffSchema("posts", oldFields, newFields);

    const dropOps = ops.filter((o) => o.kind === "drop");
    expect(dropOps).toHaveLength(1);
    expect(dropOps[0]!.column).toBe("draft");
    expect(dropOps[0]!.sql).toContain('ALTER TABLE "posts" DROP COLUMN "draft"');
  });

  it("rename a field (same id, different name) → produces RENAME COLUMN", () => {
    const oldFields = [f({ id: "1", name: "title" })];
    const newFields = [f({ id: "1", name: "headline" })];
    const ops = diffSchema("posts", oldFields, newFields);

    const renameOps = ops.filter((o) => o.kind === "rename");
    expect(renameOps).toHaveLength(1);
    expect(renameOps[0]!.from).toBe("title");
    expect(renameOps[0]!.to).toBe("headline");
    expect(renameOps[0]!.sql).toContain(
      'ALTER TABLE "posts" RENAME COLUMN "title" TO "headline"',
    );
    // No add/drop should be emitted for a pure rename.
    expect(ops.filter((o) => o.kind === "add")).toHaveLength(0);
    expect(ops.filter((o) => o.kind === "drop")).toHaveLength(0);
  });

  it("try to remove a system field → produces no op (protected)", () => {
    const oldFields = [
      f({ id: "sys-1", name: "id", system: true, primaryKey: true }),
      f({ id: "sys-2", name: "created_at", system: true, auto: true }),
      f({ id: "1", name: "title" }),
    ];
    const newFields = [f({ id: "1", name: "title" })];
    const ops = diffSchema("posts", oldFields, newFields);

    const dropOps = ops.filter((o) => o.kind === "drop");
    expect(dropOps).toHaveLength(0);
  });

  it("add multiple fields at once → multiple ops in stable order", () => {
    const oldFields = [f({ id: "1", name: "title" })];
    const newFields = [
      f({ id: "1", name: "title" }),
      f({ id: "2", name: "alpha" }),
      f({ id: "3", name: "beta" }),
      f({ id: "4", name: "gamma" }),
    ];
    const ops = diffSchema("posts", oldFields, newFields);
    const addOps = ops.filter((o) => o.kind === "add");
    expect(addOps.map((o) => o.column)).toEqual(["alpha", "beta", "gamma"]);
  });

  it("reject unsafe identifier in new field name (throw)", () => {
    const oldFields: FieldDefinition[] = [];
    const newFields = [
      f({ id: "1", name: "bad name!" }),
    ];
    expect(() => diffSchema("posts", oldFields, newFields)).toThrow(
      /unsafe identifier/,
    );
  });

  it("rejects unsafe collection name", () => {
    expect(() => diffSchema("bad name!", [], [])).toThrow(/unsafe identifier/);
  });

  it("emits renames before adds, drops last", () => {
    const oldFields = [
      f({ id: "1", name: "title" }),
      f({ id: "2", name: "gone" }),
    ];
    const newFields = [
      f({ id: "1", name: "headline" }),
      f({ id: "3", name: "fresh" }),
    ];
    const ops = diffSchema("posts", oldFields, newFields);
    expect(ops.map((o) => o.kind)).toEqual([
      "rename",
      "add",
      "drop",
    ]);
  });
});

/* ═══════════════════════════════════════════════════════════════════
   applyMigration — mocked D1Database
   ═══════════════════════════════════════════════════════════════════ */

function mockD1(
  execResult: { shouldFail: boolean } = { shouldFail: false },
): {
  db: D1Database;
  calls: { sql: string; binds: unknown[] }[];
} {
  const calls: { sql: string; binds: unknown[] }[] = [];
  const db = {
    exec: async (sql: string) => {
      calls.push({ sql, binds: [] });
      if (execResult.shouldFail) throw new Error("exec failed");
    },
    prepare: (sql: string) => ({
      bind: (...vals: unknown[]) => ({
        run: async () => {
          calls.push({ sql, binds: vals });
        },
        first: async () => null,
        all: async () => ({ results: [] }),
      }),
      run: async () => {
        calls.push({ sql, binds: [] });
      },
      first: async () => null,
      all: async () => ({ results: [] }),
    }),
  } as unknown as D1Database;
  return { db, calls };
}

describe("applyMigration", () => {
  it("applies all ops when exec succeeds and records status", async () => {
    const { db, calls } = mockD1();
    const ops: SchemaDiffOp[] = [
      {
        kind: "add",
        column: "x",
        sql: 'ALTER TABLE "t" ADD COLUMN "x" TEXT;',
      },
      {
        kind: "drop",
        column: "y",
        sql: 'ALTER TABLE "t" DROP COLUMN "y";',
      },
    ];
    const result = await applyMigration(db, "t", ops);

    expect(result.applied).toBe(2);
    expect(result.errors).toHaveLength(0);
    // Each op: 1 exec call + 1 insert into _db_migrations.
    expect(calls).toHaveLength(4);
    const inserts = calls.filter((c) =>
      c.sql.includes("INSERT INTO _db_migrations"),
    );
    expect(inserts).toHaveLength(2);
    expect(inserts[0]!.binds[3]).toBe("applied");
    expect(inserts[1]!.binds[3]).toBe("applied");
  });

  it("continues on error and records 'failed' status", async () => {
    const { db, calls } = mockD1({ shouldFail: true });
    const ops: SchemaDiffOp[] = [
      {
        kind: "add",
        column: "x",
        sql: 'ALTER TABLE "t" ADD COLUMN "x" TEXT;',
      },
      {
        kind: "add",
        column: "y",
        sql: 'ALTER TABLE "t" ADD COLUMN "y" TEXT;',
      },
    ];
    const result = await applyMigration(db, "t", ops);

    expect(result.applied).toBe(0);
    expect(result.errors).toHaveLength(2);
    expect(result.errors[0]).toContain("add \"x\"");
    const failedInserts = calls.filter(
      (c) =>
        c.sql.includes("INSERT INTO _db_migrations") &&
        c.binds[3] === "failed",
    );
    expect(failedInserts).toHaveLength(2);
  });
});
