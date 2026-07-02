import { describe, it, expect } from "vitest";
import { z } from "zod";

/**
 * External auth router — Zod schema validation tests.
 *
 * These mirror the schemas defined in externalAuthRouter.ts. We re-declare
 * them here (rather than importing private module-level consts) to keep the
 * tests self-contained, following the pattern in collectionsRouter.test.ts.
 */

// ─────────────────────────────────────────────────────────────
//  Schemas (mirror of externalAuthRouter.ts)
// ─────────────────────────────────────────────────────────────

const registerSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(256),
  data: z.record(z.unknown()).optional(),
});

const loginSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(256),
});

const requestPasswordResetSchema = z.object({
  email: z.string().email().max(254),
});

const resetPasswordSchema = z.object({
  token: z.string().min(1).max(512),
  password: z.string().min(1).max(256),
});

const NAME_RE = /^[a-zA-Z][a-zA-Z0-9_]*$/;

/* ═══════════════════════════════════════════════════════════════════
   POST /:name/auth/register
   ═══════════════════════════════════════════════════════════════════ */

describe("POST /api/collections/:name/auth/register", () => {
  // 1. Happy path — valid register payload
  it("accepts a valid email + password + optional data", () => {
    const payload = {
      email: "user@example.com",
      password: "Password123",
      data: { firstName: "Jane", age: 30 },
    };
    const result = registerSchema.safeParse(payload);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe("user@example.com");
      expect(result.data.data?.firstName).toBe("Jane");
    }
  });

  // 2. Invalid email → reject
  it("rejects an invalid email", () => {
    const payload = { email: "not-an-email", password: "Password123" };
    const result = registerSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });

  // 3. Password too short (schema min is 1; per-collection min enforced dynamically)
  it("rejects an empty password", () => {
    const payload = { email: "user@example.com", password: "" };
    const result = registerSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });

  // 4. Empty body → reject
  it("rejects an empty body", () => {
    const payload = {};
    const result = registerSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });

  // 5. Edge — register without optional data (valid)
  it("accepts register without the optional data field", () => {
    const payload = { email: "user@example.com", password: "Password123" };
    const result = registerSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });
});

/* ═══════════════════════════════════════════════════════════════════
   POST /:name/auth/login
   ═══════════════════════════════════════════════════════════════════ */

describe("POST /api/collections/:name/auth/login", () => {
  // 1. Happy path
  it("accepts a valid login payload", () => {
    const payload = { email: "user@example.com", password: "Password123" };
    const result = loginSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  // 2. Invalid email → reject
  it("rejects an invalid email", () => {
    const payload = { email: "bad", password: "Password123" };
    const result = loginSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });

  // 3. Missing password → reject
  it("rejects when password is missing", () => {
    const payload = { email: "user@example.com" };
    const result = loginSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });

  // 4. Empty body → reject
  it("rejects an empty body", () => {
    const payload = {};
    const result = loginSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });

  // 5. Password too long → reject
  it("rejects a password longer than 256 chars", () => {
    const payload = { email: "user@example.com", password: "x".repeat(257) };
    const result = loginSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });
});

/* ═══════════════════════════════════════════════════════════════════
   POST /:name/auth/request-password-reset
   ═══════════════════════════════════════════════════════════════════ */

describe("POST /api/collections/:name/auth/request-password-reset", () => {
  // 1. Happy path
  it("accepts a valid email", () => {
    const payload = { email: "user@example.com" };
    const result = requestPasswordResetSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  // 2. Invalid email → reject
  it("rejects an invalid email", () => {
    const payload = { email: "not-email" };
    const result = requestPasswordResetSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });

  // 3. Empty body → reject
  it("rejects an empty body", () => {
    const result = requestPasswordResetSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  // 4. Email too long → reject
  it("rejects an email longer than 254 chars", () => {
    const payload = { email: "x".repeat(255) };
    const result = requestPasswordResetSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });

  // 5. Missing email key → reject
  it("rejects when email key is absent", () => {
    const payload = { foo: "bar" };
    const result = requestPasswordResetSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });
});

/* ═══════════════════════════════════════════════════════════════════
   POST /:name/auth/reset-password
   ═══════════════════════════════════════════════════════════════════ */

describe("POST /api/collections/:name/auth/reset-password", () => {
  // 1. Happy path
  it("accepts a valid token + password", () => {
    const payload = { token: "abc123token", password: "NewPassword456" };
    const result = resetPasswordSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  // 2. Missing token → reject
  it("rejects when token is missing", () => {
    const payload = { password: "NewPassword456" };
    const result = resetPasswordSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });

  // 3. Missing password → reject
  it("rejects when password is missing", () => {
    const payload = { token: "abc123token" };
    const result = resetPasswordSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });

  // 4. Empty token → reject
  it("rejects an empty token", () => {
    const payload = { token: "", password: "NewPassword456" };
    const result = resetPasswordSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });

  // 5. Empty body → reject
  it("rejects an empty body", () => {
    const result = resetPasswordSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

/* ═══════════════════════════════════════════════════════════════════
   Collection name validation (route param)
   ═══════════════════════════════════════════════════════════════════ */

describe("Collection name validation (route param :name)", () => {
  // 1. Valid name
  it("accepts a simple alphabetic name", () => {
    expect(NAME_RE.test("users")).toBe(true);
  });

  // 2. Valid name with underscore
  it("accepts a name with underscores", () => {
    expect(NAME_RE.test("team_members")).toBe(true);
  });

  // 3. Rejects leading digit
  it("rejects a name starting with a digit", () => {
    expect(NAME_RE.test("1users")).toBe(false);
  });

  // 4. Rejects spaces
  it("rejects a name with spaces", () => {
    expect(NAME_RE.test("team members")).toBe(false);
  });

  // 5. Rejects special characters
  it("rejects a name with a dash", () => {
    expect(NAME_RE.test("team-members")).toBe(false);
  });
});
