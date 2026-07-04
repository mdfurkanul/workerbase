import { describe, it, expect } from "vitest";
import { z } from "zod";

/**
 * Import router — Zod schema validation tests.
 *
 * These mirror the schemas defined in importRouter.ts. We re-declare them
 * here (rather than importing private module-level consts) to keep the
 * tests self-contained, following the pattern in externalAuthRouter.test.ts.
 */

// ─────────────────────────────────────────────────────────────
//  Schemas (mirror of importRouter.ts)
// ─────────────────────────────────────────────────────────────

const IDENT = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
const NAME_RE = /^[a-zA-Z][a-zA-Z0-9_]*$/;

const mappingSchema = z.object({
  sourceColumn: z.string().min(1).max(128),
  targetColumn: z.string().min(1).max(128).regex(IDENT).nullable(),
});

const bodySchema = z.object({
  format: z.enum(["json", "csv"]),
  target: z.object({
    mode: z.enum(["existing", "new"]),
    collection: z.string().min(1).max(64).regex(NAME_RE).optional(),
    type: z.enum(["base", "user"]).optional(),
  }),
  mappings: z.array(mappingSchema).min(1),
  data: z.array(z.record(z.unknown())).min(1),
}).superRefine((val, ctx) => {
  if (!val.target.collection) {
    ctx.addIssue({
      code: "custom",
      path: ["target", "collection"],
      message: "target.collection is required",
    });
  }
});

// ─────────────────────────────────────────────────────────────
//  Tests
// ─────────────────────────────────────────────────────────────

describe("POST /api/core/import — schema validation", () => {
  // 1. Happy path — valid body passes
  it("accepts a valid import payload (existing target)", () => {
    const payload = {
      format: "json",
      target: { mode: "existing", collection: "posts" },
      mappings: [
        { sourceColumn: "title", targetColumn: "title" },
        { sourceColumn: "body", targetColumn: "content" },
      ],
      data: [
        { title: "Hello", body: "World" },
        { title: "Second", body: "Post" },
      ],
    };
    const result = bodySchema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  // 2. Invalid format value rejected
  it("rejects an invalid format value", () => {
    const payload = {
      format: "xml",
      target: { mode: "existing", collection: "posts" },
      mappings: [{ sourceColumn: "title", targetColumn: "title" }],
      data: [{ title: "Hello" }],
    };
    const result = bodySchema.safeParse(payload);
    expect(result.success).toBe(false);
  });

  // 3. Missing target.collection when mode=new rejected
  it("rejects when target.collection is missing (mode=new)", () => {
    const payload = {
      format: "json",
      target: { mode: "new", type: "base" },
      mappings: [{ sourceColumn: "name", targetColumn: "name" }],
      data: [{ name: "Test" }],
    };
    const result = bodySchema.safeParse(payload);
    expect(result.success).toBe(false);
  });

  // 4. Empty mappings array rejected
  it("rejects an empty mappings array", () => {
    const payload = {
      format: "json",
      target: { mode: "existing", collection: "posts" },
      mappings: [],
      data: [{ title: "Hello" }],
    };
    const result = bodySchema.safeParse(payload);
    expect(result.success).toBe(false);
  });

  // 5. Empty data array rejected
  it("rejects an empty data array", () => {
    const payload = {
      format: "csv",
      target: { mode: "existing", collection: "posts" },
      mappings: [{ sourceColumn: "title", targetColumn: "title" }],
      data: [],
    };
    const result = bodySchema.safeParse(payload);
    expect(result.success).toBe(false);
  });

  // 6. Happy path — new collection with type=user
  it("accepts a valid import payload (new user collection)", () => {
    const payload = {
      format: "csv",
      target: { mode: "new", collection: "members", type: "user" },
      mappings: [
        { sourceColumn: "email", targetColumn: "email" },
        { sourceColumn: "name", targetColumn: "name" },
      ],
      data: [{ email: "a@b.com", name: "Alice" }],
    };
    const result = bodySchema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  // 7. Column mapping with null target (skip) is valid
  it("accepts null targetColumn (skip column)", () => {
    const payload = {
      format: "json",
      target: { mode: "existing", collection: "posts" },
      mappings: [
        { sourceColumn: "title", targetColumn: "title" },
        { sourceColumn: "junk", targetColumn: null },
      ],
      data: [{ title: "Hi", junk: "x" }],
    };
    const result = bodySchema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  // 8. Invalid target column name (starts with digit) rejected
  it("rejects a targetColumn that starts with a digit", () => {
    const payload = {
      format: "json",
      target: { mode: "existing", collection: "posts" },
      mappings: [{ sourceColumn: "title", targetColumn: "1title" }],
      data: [{ title: "Hi" }],
    };
    const result = bodySchema.safeParse(payload);
    expect(result.success).toBe(false);
  });
});
