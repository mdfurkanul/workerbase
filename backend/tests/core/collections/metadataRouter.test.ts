import { describe, it, expect } from "vitest";
import { normalizeType } from "../../../src/core/collections/metadataRouter.js";

/**
 * normalizeType — maps a raw SQLite column type + column name to a
 * WorkerBase display type. SQLite stores datetimes as INTEGER (epoch),
 * so the column NAME is the signal that distinguishes a timestamp from
 * a plain counter.
 */
describe("normalizeType", () => {
  // 1. Happy path — *_at INTEGER columns are recognised as datetime
  it("maps INTEGER columns ending in _at to 'datetime'", () => {
    expect(normalizeType("created_at", "INTEGER")).toBe("datetime");
    expect(normalizeType("updated_at", "INTEGER")).toBe("datetime");
    expect(normalizeType("expires_at", "INTEGER")).toBe("datetime");
    expect(normalizeType("applied_at", "INTEGER")).toBe("datetime");
  });

  // 2. Happy path — plain INTEGER columns stay as 'integer'
  it("maps non-timestamp INTEGER columns to 'integer'", () => {
    expect(normalizeType("duration_ms", "INTEGER")).toBe("integer");
    expect(normalizeType("status", "INTEGER")).toBe("integer");
    expect(normalizeType("count", "INTEGER")).toBe("integer");
    expect(normalizeType("price", "INTEGER")).toBe("integer");
  });

  // 3. Happy path — TEXT maps to 'text'
  it("maps TEXT to 'text'", () => {
    expect(normalizeType("email", "TEXT")).toBe("text");
    expect(normalizeType("path", "TEXT")).toBe("text");
    expect(normalizeType("key", "TEXT")).toBe("text");
  });

  // 4. Happy path — REAL/float types
  it("maps REAL and float to 'real'", () => {
    expect(normalizeType("latitude", "REAL")).toBe("real");
    expect(normalizeType("score", "FLOAT")).toBe("real");
    expect(normalizeType("ratio", "DOUBLE")).toBe("real");
  });

  // 5. Edge case — column named 'created' or 'timestamp' is datetime
  it("recognises 'created' and 'timestamp' as datetime when INTEGER", () => {
    expect(normalizeType("created", "INTEGER")).toBe("datetime");
    expect(normalizeType("timestamp", "INTEGER")).toBe("datetime");
  });

  // 6. Edge case — explicitly declared DATETIME/TIMESTAMP type
  it("maps explicitly declared DATETIME/TIMESTAMP types", () => {
    expect(normalizeType("some_col", "DATETIME")).toBe("datetime");
    expect(normalizeType("some_col", "TIMESTAMP")).toBe("datetime");
    expect(normalizeType("some_col", "DATE")).toBe("date");
  });

  // 7. Edge case — BOOLEAN/BOOL
  it("maps BOOLEAN/BOOL to 'bool'", () => {
    expect(normalizeType("active", "BOOLEAN")).toBe("bool");
    expect(normalizeType("verified", "BOOL")).toBe("bool");
  });

  // 8. Edge case — empty/null type falls back to 'text'
  it("falls back to 'text' for empty or null types", () => {
    expect(normalizeType("unknown", "")).toBe("text");
    expect(normalizeType("unknown", "")).toBe("text");
  });

  // 9. Edge case — BLOB
  it("maps BLOB to 'blob'", () => {
    expect(normalizeType("data", "BLOB")).toBe("blob");
  });

  // 10. Edge case — *_at column name with non-INTEGER type is NOT
  //     treated as datetime (name detection only applies to INTEGER,
  //     which is how SQLite stores epoch timestamps).
  it("does not treat *_at TEXT columns as datetime", () => {
    expect(normalizeType("metadata_at", "TEXT")).toBe("text");
  });
});
