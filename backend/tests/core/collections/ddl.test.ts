import { describe, it, expect } from "vitest";
import { renderColumnDef, renderCreateTable } from "../../../src/core/collections/ddl.js";
import { DEFAULT_NOW, DEFAULT_NOW_ON_UPDATE } from "../../../src/core/collections/validation.js";

/**
 * renderColumnDef — DDL string builder.
 *
 * The non-obvious branch: dynamic date/datetime defaults ($now,
 * $nowOnUpdate) must NOT be rendered as a SQL DEFAULT — they are
 * resolved by the record routers at write time.
 */
describe("renderColumnDef", () => {
  // 1. Happy path — plain text field with literal string default
  it("renders DEFAULT for a plain string default", () => {
    const sql = renderColumnDef({
      name: "title",
      type: "text",
      default: "untitled",
    });
    expect(sql).toContain('"title" TEXT');
    expect(sql).toContain("DEFAULT 'untitled'");
  });

  // 2. Validation failure — bad identifier throws
  it("throws on unsafe identifiers", () => {
    expect(() =>
      renderColumnDef({ name: "bad name!", type: "text" }),
    ).toThrow(/unsafe identifier/);
  });

  // 3. Edge case — $now on a datetime field is NOT rendered as DEFAULT
  it("skips DEFAULT clause for $now on datetime", () => {
    const sql = renderColumnDef({
      name: "created_on",
      type: "datetime",
      default: DEFAULT_NOW,
    });
    expect(sql).toContain('"created_on" INTEGER');
    expect(sql).not.toContain("DEFAULT");
  });

  // 4. Edge case — $nowOnUpdate on a date field is NOT rendered as DEFAULT
  it("skips DEFAULT clause for $nowOnUpdate on date", () => {
    const sql = renderColumnDef({
      name: "updated_on",
      type: "date",
      default: DEFAULT_NOW_ON_UPDATE,
    });
    expect(sql).toContain('"updated_on" TEXT');
    expect(sql).not.toContain("DEFAULT");
  });

  // 5. Conflict — sentinel on a non-date type IS rendered as a literal
  //    (defence in depth: only date/datetime types treat $now as dynamic)
  it("still renders DEFAULT if a sentinel leaks onto a non-date type", () => {
    const sql = renderColumnDef({
      name: "title",
      type: "text",
      default: DEFAULT_NOW,
    });
    expect(sql).toContain("DEFAULT '$now'");
  });

  // 6. renderCreateTable composes multiple fields + system columns
  it("renderCreateTable wraps fields + adds id/created_at/updated_at", () => {
    const sql = renderCreateTable("posts", [
      { name: "title", type: "text" },
      { name: "created_on", type: "datetime", default: DEFAULT_NOW },
    ]);
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS "posts"');
    expect(sql).toContain('"id" TEXT PRIMARY KEY');
    expect(sql).toContain('"created_at" INTEGER NOT NULL DEFAULT (unixepoch())');
    // Dynamic sentinel must still be skipped inside the table body.
    expect(sql.match(/DEFAULT/g) ?? []).toHaveLength(2); // created_at + updated_at only
  });

  // 7. renderCreateTable with idType="autoincrement" uses INTEGER PRIMARY KEY AUTOINCREMENT
  it("renderCreateTable renders INTEGER PRIMARY KEY AUTOINCREMENT for autoincrement", () => {
    const sql = renderCreateTable(
      "orders",
      [{ name: "total", type: "real" }],
      { idType: "autoincrement" },
    );
    expect(sql).toContain('"id" INTEGER PRIMARY KEY AUTOINCREMENT');
    expect(sql).not.toContain('"id" TEXT PRIMARY KEY');
  });

  // 8. renderCreateTable defaults to UUID TEXT when no opts provided
  it("renderCreateTable defaults to TEXT PRIMARY KEY without opts", () => {
    const sql = renderCreateTable("items", [{ name: "name", type: "text" }]);
    expect(sql).toContain('"id" TEXT PRIMARY KEY');
    expect(sql).not.toContain("AUTOINCREMENT");
  });
});
