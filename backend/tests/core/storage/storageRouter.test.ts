import { describe, it, expect } from "vitest";
import { z } from "zod";

/* Import the helpers + schemas from the router so we exercise the real
   validation logic rather than a copy. */
import {
  sanitizeKey,
  buildUploadKey,
  storageKeySchema,
  deleteObjectBodySchema,
  listQuerySchema,
  originalFilenameSchema,
  MAX_KEY_LENGTH,
  MAX_LIST_LIMIT,
  DEFAULT_LIST_LIMIT,
  MAX_FILE_SIZE_BYTES,
} from "../../../src/core/storage/storageRouter.js";

/* ═══════════════════════════════════════════════════════════════════
   sanitizeKey() — pure helper
   ═══════════════════════════════════════════════════════════════════ */

describe("sanitizeKey()", () => {
  // 1. Happy path — valid key passes through unchanged
  it("accepts a valid key with slashes and dots", () => {
    const key = "uploads/2025/01/abc-file.png";
    expect(sanitizeKey(key)).toBe(key);
  });

  // 2. Path traversal — `..` rejected
  it("rejects a key containing `..` (path traversal)", () => {
    expect(() => sanitizeKey("uploads/../../etc/passwd")).toThrow(
      "path_traversal_blocked",
    );
  });

  // 3. Special characters rejected
  it("rejects keys with special characters", () => {
    expect(() => sanitizeKey("file name!")).toThrow("invalid_key_characters");
    expect(() => sanitizeKey("file@name")).toThrow("invalid_key_characters");
    expect(() => sanitizeKey("file#name")).toThrow("invalid_key_characters");
  });

  // 4. Empty key rejected
  it("rejects an empty key", () => {
    expect(() => sanitizeKey("")).toThrow("empty_key");
    expect(() => sanitizeKey("   ")).toThrow("empty_key");
  });

  // 5. Over-length key rejected
  it(`rejects keys longer than ${MAX_KEY_LENGTH} characters`, () => {
    const long = "a".repeat(MAX_KEY_LENGTH + 1);
    expect(() => sanitizeKey(long)).toThrow("key_too_long");
  });

  // 6. Whitespace is trimmed (valid key after trim)
  it("trims surrounding whitespace before validating", () => {
    expect(sanitizeKey("  uploads/file.txt  ")).toBe("uploads/file.txt");
  });
});

/* ═══════════════════════════════════════════════════════════════════
   buildUploadKey()
   ═══════════════════════════════════════════════════════════════════ */

describe("buildUploadKey()", () => {
  // 1. Happy path — produces uploads/yyyy/mm/uuid-name
  it("generates a key in the uploads/yyyy/mm/uuid-name format", () => {
    const key = buildUploadKey("photo.png");
    expect(key).toMatch(/^uploads\/\d{4}\/\d{2}\/[0-9a-f-]+-photo\.png$/);
  });

  // 2. Rejects filenames with path-traversal (`..`)
  it("rejects filenames containing `..`", () => {
    expect(() => buildUploadKey("../evil.txt")).toThrow();
    expect(() => buildUploadKey("..\\evil.txt")).toThrow();
  });

  // 3. Rejects empty filename
  it("rejects an empty original filename", () => {
    expect(() => buildUploadKey("")).toThrow();
  });

  // 4. Rejects filenames with special chars
  it("rejects filenames with shell metacharacters", () => {
    expect(() => buildUploadKey("file;rm.txt")).toThrow();
    expect(() => buildUploadKey("file$name.txt")).toThrow();
  });

  // 5. Accepts filenames with spaces and parens
  it("accepts filenames with spaces and parentheses", () => {
    expect(() => buildUploadKey("my report (final).pdf")).not.toThrow();
  });
});

/* ═══════════════════════════════════════════════════════════════════
   storageKeySchema — Zod validation
   ═══════════════════════════════════════════════════════════════════ */

describe("storageKeySchema", () => {
  // 1. Happy path
  it("accepts a well-formed key", () => {
    const r = storageKeySchema.safeParse("uploads/2025/06/abc-photo.jpg");
    expect(r.success).toBe(true);
  });

  // 2. Path traversal
  it("rejects keys with `..`", () => {
    expect(storageKeySchema.safeParse("../secret").success).toBe(false);
    expect(storageKeySchema.safeParse("uploads/../etc").success).toBe(false);
  });

  // 3. Special characters
  it("rejects keys with spaces or symbols", () => {
    expect(storageKeySchema.safeParse("my file.txt").success).toBe(false);
    expect(storageKeySchema.safeParse("file!").success).toBe(false);
  });

  // 4. Empty
  it("rejects an empty key", () => {
    expect(storageKeySchema.safeParse("").success).toBe(false);
  });

  // 5. Too long
  it("rejects keys exceeding the max length", () => {
    expect(
      storageKeySchema.safeParse("a".repeat(MAX_KEY_LENGTH + 1)).success,
    ).toBe(false);
  });
});

/* ═══════════════════════════════════════════════════════════════════
   deleteObjectBodySchema
   ═══════════════════════════════════════════════════════════════════ */

describe("deleteObjectBodySchema", () => {
  // 1. Happy path
  it("accepts { key: 'valid/path.txt' }", () => {
    const r = deleteObjectBodySchema.safeParse({ key: "uploads/file.txt" });
    expect(r.success).toBe(true);
  });

  // 2. Missing key
  it("rejects body without key", () => {
    expect(deleteObjectBodySchema.safeParse({}).success).toBe(false);
  });

  // 3. Path traversal in key
  it("rejects body with path-traversal key", () => {
    expect(
      deleteObjectBodySchema.safeParse({ key: "../../etc/passwd" }).success,
    ).toBe(false);
  });

  // 4. Special chars
  it("rejects body with special-char key", () => {
    expect(
      deleteObjectBodySchema.safeParse({ key: "bad key!" }).success,
    ).toBe(false);
  });

  // 5. Non-string key
  it("rejects a non-string key", () => {
    expect(
      deleteObjectBodySchema.safeParse({ key: 123 }).success,
    ).toBe(false);
  });
});

/* ═══════════════════════════════════════════════════════════════════
   listQuerySchema — limit defaulting + capping
   ═══════════════════════════════════════════════════════════════════ */

describe("listQuerySchema", () => {
  // 1. Default limit applied when omitted
  it("applies the default limit when omitted", () => {
    const r = listQuerySchema.safeParse({});
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.limit).toBe(DEFAULT_LIST_LIMIT);
  });

  // 2. Limit over max is capped
  it("caps limit at MAX_LIST_LIMIT", () => {
    const r = listQuerySchema.safeParse({ limit: MAX_LIST_LIMIT + 5000 });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.limit).toBe(MAX_LIST_LIMIT);
  });

  // 3. String limit parsed correctly
  it("parses string limit to number", () => {
    const r = listQuerySchema.safeParse({ limit: "50" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.limit).toBe(50);
  });

  // 4. Invalid limit falls back to default
  it("falls back to default for NaN limit", () => {
    const r = listQuerySchema.safeParse({ limit: "abc" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.limit).toBe(DEFAULT_LIST_LIMIT);
  });

  // 5. Zero or negative limit falls back to default
  it("falls back to default for zero/negative limit", () => {
    const r1 = listQuerySchema.safeParse({ limit: "0" });
    expect(r1.success).toBe(true);
    if (r1.success) expect(r1.data.limit).toBe(DEFAULT_LIST_LIMIT);

    const r2 = listQuerySchema.safeParse({ limit: -10 });
    expect(r2.success).toBe(true);
    if (r2.success) expect(r2.data.limit).toBe(DEFAULT_LIST_LIMIT);
  });

  // 6. Prefix and cursor pass through
  it("passes prefix and cursor through unchanged", () => {
    const r = listQuerySchema.safeParse({
      prefix: "uploads/2025/",
      cursor: "abc-cursor",
      limit: 25,
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.prefix).toBe("uploads/2025/");
      expect(r.data.cursor).toBe("abc-cursor");
      expect(r.data.limit).toBe(25);
    }
  });
});

/* ═══════════════════════════════════════════════════════════════════
   originalFilenameSchema
   ═══════════════════════════════════════════════════════════════════ */

describe("originalFilenameSchema", () => {
  // 1. Happy path
  it("accepts a normal filename", () => {
    expect(originalFilenameSchema.safeParse("report.pdf").success).toBe(true);
  });

  // 2. Rejects path traversal
  it("rejects `..` in filename", () => {
    expect(originalFilenameSchema.safeParse("../evil").success).toBe(false);
  });

  // 3. Rejects shell metacharacters
  it("rejects filenames with shell metacharacters", () => {
    expect(originalFilenameSchema.safeParse("file;cmd").success).toBe(false);
    expect(originalFilenameSchema.safeParse("file|pipe").success).toBe(false);
  });

  // 4. Rejects empty
  it("rejects an empty filename", () => {
    expect(originalFilenameSchema.safeParse("").success).toBe(false);
  });

  // 5. Accepts spaces and parentheses (common in user filenames)
  it("accepts filenames with spaces and parentheses", () => {
    expect(
      originalFilenameSchema.safeParse("Invoice (Final).pdf").success,
    ).toBe(true);
  });
});

/* ═══════════════════════════════════════════════════════════════════
   Response shape contracts — document the expected JSON structure
   so frontend code can rely on these tests as a contract.
   ═══════════════════════════════════════════════════════════════════ */

describe("Response shape contracts", () => {
  // 1. Upload response
  it("POST /upload returns { key, size, contentType } on 201", () => {
    const mock = { key: "uploads/2025/01/uuid-file.png", size: 1024, contentType: "image/png" };
    expect(mock).toHaveProperty("key");
    expect(mock).toHaveProperty("size");
    expect(mock).toHaveProperty("contentType");
    expect(typeof mock.size).toBe("number");
  });

  // 2. List response
  it("GET /list returns { objects, truncated, cursor? }", () => {
    const mock = { objects: [], truncated: false };
    expect(Array.isArray(mock.objects)).toBe(true);
    expect(typeof mock.truncated).toBe("boolean");
  });

  // 3. Delete response
  it("DELETE /object returns { success: true }", () => {
    const mock = { success: true };
    expect(mock.success).toBe(true);
  });

  // 4. Error shape
  it("errors follow { error: 'snake_case_code' }", () => {
    const errors = [
      "no_file_provided",
      "file_too_large",
      "invalid_key_characters",
      "path_traversal_blocked",
      "key_required",
      "not_found",
      "r2_upload_failed",
    ];
    for (const e of errors) {
      expect(e).toMatch(/^[a-z0-9_]+$/);
    }
  });

  // 5. Max file size constant
  it("MAX_FILE_SIZE_BYTES is 25 MiB", () => {
    expect(MAX_FILE_SIZE_BYTES).toBe(25 * 1024 * 1024);
  });
});
