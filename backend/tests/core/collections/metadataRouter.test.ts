import { describe, it, expect } from "vitest";
import { mergeSystemColumns } from "../../../src/core/collections/metadataRouter.js";
import { SYSTEM_COLUMNS } from "../../../src/core/collections/ddl.js";

type Col = { name: string; type: string };

/**
 * mergeSystemColumns — prepends id / created_at / updated_at to a returned
 * collection schema so the dashboard sees the full physical table shape.
 *
 * System columns are auto-managed by DDL and intentionally filtered OUT of
 * the stored `_collections.schema` JSON. They must be re-merged at read time.
 */
describe("mergeSystemColumns", () => {
  // 1. Happy path — empty schema returns just the system columns
  it("returns the system columns when the input schema is empty", () => {
    const out = mergeSystemColumns<Col>([]);
    expect(out.map((f) => f.name)).toEqual(
      SYSTEM_COLUMNS.map((c) => c.name),
    );
  });

  // 2. Happy path — user fields come back with system columns prepended
  it("prepends system columns to user-defined fields", () => {
    const out = mergeSystemColumns([
      { name: "title", type: "text" },
      { name: "views", type: "integer" },
    ]);
    expect(out.map((f) => f.name)).toEqual([
      "id",
      "created_at",
      "updated_at",
      "title",
      "views",
    ]);
  });

  // 3. Conflict — dedupes when a user-defined column already shares a system name
  //    (e.g. an "id" field from a legacy import) — system shape wins, no duplicate.
  it("does not duplicate a user-defined 'id' column", () => {
    const out = mergeSystemColumns([
      { name: "id", type: "text" },
      { name: "body", type: "text" },
    ]);
    const ids = out.filter((f) => f.name === "id");
    expect(ids).toHaveLength(1);
    expect(out.map((f) => f.name)).toEqual([
      "id",
      "created_at",
      "updated_at",
      "body",
    ]);
  });

  // 4. Edge case — preserves all extra metadata on user-defined fields
  //    ( FieldDefinition has many keys beyond { name, type } )
  it("preserves extra metadata on user-defined fields", () => {
    const out = mergeSystemColumns([
      {
        name: "email",
        type: "text",
        required: true,
        unique: true,
        hidden: false,
        options: { maxLength: 120 },
      },
    ]);
    expect(out[out.length - 1]).toMatchObject({
      name: "email",
      required: true,
      unique: true,
      options: { maxLength: 120 },
    });
  });

  // 5. Conflict — when a user-defined column has a DIFFERENT type than the
  //    system column, the system shape wins (their version is replaced).
  //    This guarantees the dashboard renders id/created_at/updated_at with
  //    the canonical types the backend manages them as.
  it("overwrites a conflicting user-defined system column with the canonical type", () => {
    const out = mergeSystemColumns([
      { name: "id", type: "integer" }, // wrong type — system says text
      { name: "created_at", type: "text" }, // wrong type — system says datetime
    ]);
    const id = out.find((f) => f.name === "id");
    const createdAt = out.find((f) => f.name === "created_at");
    expect(id?.type).toBe("text");
    expect(createdAt?.type).toBe("datetime");
  });
});
