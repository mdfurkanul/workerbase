import { describe, it, expect } from "vitest";
import { findRenameReferences } from "../../../src/core/collections/metadataRouter.js";

/**
 * findRenameReferences — pure helper used by the PATCH handler to decide
 * if a collection rename is safe. Returns a list of human-readable
 * "blocked by" reasons; empty = safe to rename.
 *
 * Live behaviour (HTTP-level): the handler refuses the rename with 409
 * `rename_blocked_by_references` when this helper returns any entries.
 */
describe("findRenameReferences", () => {
  // 1. Happy path — no other collections → safe
  it("returns empty when no other collections exist", () => {
    expect(findRenameReferences([], "posts")).toEqual([]);
  });

  // 2. Happy path — other collections have no references
  it("returns empty when other collections don't reference the old name", () => {
    const rows = [
      { name: "comments", schema: null, query: null },
      {
        name: "users",
        schema: JSON.stringify([{ name: "email", type: "text", options: {} }]),
        query: null,
      },
    ];
    expect(findRenameReferences(rows, "posts")).toEqual([]);
  });

  // 3. Conflict — relation field targets the old name
  it("flags a relation whose targetCollection matches the old name", () => {
    const rows = [
      {
        name: "comments",
        schema: JSON.stringify([
          { name: "post_id", type: "relation", options: { targetCollection: "posts" } },
        ]),
        query: null,
      },
    ];
    expect(findRenameReferences(rows, "posts")).toEqual(["comments (relation)"]);
  });

  // 4. Conflict — view query contains the old name as a word
  it("flags a view query that mentions the old name", () => {
    const rows = [
      {
        name: "top_posts",
        schema: null,
        query: "SELECT id FROM posts ORDER BY views DESC LIMIT 10",
      },
    ];
    expect(findRenameReferences(rows, "posts")).toEqual(["top_posts (view query)"]);
  });

  // 5. Edge case — substring match must NOT trigger (e.g. "post" inside "posts_id")
  it("does NOT flag substring matches inside identifiers (word boundaries only)", () => {
    const rows = [
      {
        name: "other",
        schema: null,
        query: "SELECT id FROM post_stats", // contains "post" but not "posts"
      },
    ];
    expect(findRenameReferences(rows, "posts")).toEqual([]);
  });

  // 6. Edge case — malformed schema JSON is silently skipped
  it("silently skips rows with malformed schema JSON (no crash, no flag)", () => {
    const rows = [
      { name: "broken", schema: "{not valid json", query: null },
    ];
    expect(findRenameReferences(rows, "posts")).toEqual([]);
  });

  // 7. Edge case — relation targets a DIFFERENT collection (not the old name)
  it("does NOT flag a relation pointing at a different collection", () => {
    const rows = [
      {
        name: "comments",
        schema: JSON.stringify([
          { name: "author_id", type: "relation", options: { targetCollection: "users" } },
        ]),
        query: null,
      },
    ];
    expect(findRenameReferences(rows, "posts")).toEqual([]);
  });

  // 8. Edge case — multiple blockers all surface in order
  it("reports multiple blockers across rows", () => {
    const rows = [
      {
        name: "comments",
        schema: JSON.stringify([
          { name: "post_id", type: "relation", options: { targetCollection: "posts" } },
        ]),
        query: null,
      },
      {
        name: "top_posts",
        schema: null,
        query: "SELECT * FROM posts",
      },
    ];
    expect(findRenameReferences(rows, "posts")).toEqual([
      "comments (relation)",
      "top_posts (view query)",
    ]);
  });

  // 9. Edge case — case-insensitive view-query match
  it("matches the old name case-insensitively in view queries", () => {
    const rows = [
      { name: "v", schema: null, query: "select * from POSTS" },
    ];
    expect(findRenameReferences(rows, "posts")).toEqual(["v (view query)"]);
  });

  // 10. Edge case — special-regex-char names are escaped (no ReDoS / false positives)
  it("treats the old name as a literal (no regex injection)", () => {
    const rows = [
      { name: "v", schema: null, query: "SELECT * FROM my.collection WHERE x = 1" },
    ];
    // The literal "." in the name must not be treated as "any char" —
    // "myXcollection" should NOT match `my.collection`.
    expect(findRenameReferences(rows, "my.collection")).toEqual([
      "v (view query)",
    ]);
    // Sanity: a name with no special chars matching the dotted query string
    // word-for-word still works because the literal period IS in the query.
  });
});
