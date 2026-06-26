import { describe, it, expect } from "vitest";
import {
  hashPassword,
  verifyPassword,
  signToken,
  verifyToken,
  hashTokenValue,
  bytesToBase64url,
  base64urlToString,
} from "./crypto.js";

const TEST_SECRET = "a".repeat(64); // 64-char test secret

/* ─── Password hashing ───────────────────────────────────────────── */
describe("password hashing", () => {
  it("hashes a password and verifies it correctly", async () => {
    const { hash, salt } = await hashPassword("SuperSecret123!");
    expect(hash).toBeTruthy();
    expect(salt).toBeTruthy();
    expect(hash).not.toBe("SuperSecret123!");

    const ok = await verifyPassword("SuperSecret123!", hash, salt);
    expect(ok).toBe(true);
  });

  it("rejects a wrong password", async () => {
    const { hash, salt } = await hashPassword("correct-password");
    const ok = await verifyPassword("wrong-password", hash, salt);
    expect(ok).toBe(false);
  });

  it("produces unique salts for the same password", async () => {
    const a = await hashPassword("same-password");
    const b = await hashPassword("same-password");
    expect(a.salt).not.toBe(b.salt);
    expect(a.hash).not.toBe(b.hash);
    // Both should still verify.
    expect(await verifyPassword("same-password", a.hash, a.salt)).toBe(true);
    expect(await verifyPassword("same-password", b.hash, b.salt)).toBe(true);
  });
});

/* ─── Session tokens (JWT) ───────────────────────────────────────── */
describe("session tokens", () => {
  it("signs and verifies a token round-trip", async () => {
    const token = await signToken({ sub: "usr_123", email: "test@example.com" }, TEST_SECRET);
    const payload = await verifyToken(token, TEST_SECRET);
    expect(payload).not.toBeNull();
    expect(payload!.sub).toBe("usr_123");
    expect(payload!.email).toBe("test@example.com");
    expect(payload!.exp).toBeGreaterThan(payload!.iat);
  });

  it("rejects a token signed with a different secret", async () => {
    const token = await signToken({ sub: "usr_123", email: "test@example.com" }, TEST_SECRET);
    const payload = await verifyToken(token, "b".repeat(64));
    expect(payload).toBeNull();
  });

  it("rejects a tampered token", async () => {
    const token = await signToken({ sub: "usr_123", email: "test@example.com" }, TEST_SECRET);
    // Flip a character in the payload portion.
    const parts = token.split(".");
    const tampered = `${parts[0]}.${parts[1]!.slice(0, -2)}XX.${parts[2]}`;
    const payload = await verifyToken(tampered, TEST_SECRET);
    expect(payload).toBeNull();
  });

  // ── Security fix #2: alg:none rejection ──
  it("rejects a forged alg:none token", async () => {
    const header = bytesToBase64url(
      new TextEncoder().encode(JSON.stringify({ alg: "none", typ: "JWT" })),
    );
    const payload = bytesToBase64url(
      new TextEncoder().encode(
        JSON.stringify({ sub: "usr_123", email: "evil@hacker.com", iat: 0, exp: 9999999999 }),
      ),
    );
    const forged = `${header}.${payload}.`;
    const result = await verifyToken(forged, TEST_SECRET);
    expect(result).toBeNull();
  });

  it("rejects a token with a non-HS256 algorithm", async () => {
    const header = bytesToBase64url(
      new TextEncoder().encode(JSON.stringify({ alg: "RS256", typ: "JWT" })),
    );
    const payload = bytesToBase64url(
      new TextEncoder().encode(
        JSON.stringify({ sub: "usr_123", email: "evil@hacker.com", iat: 0, exp: 9999999999 }),
      ),
    );
    const forged = `${header}.${payload}.sig`;
    const result = await verifyToken(forged, TEST_SECRET);
    expect(result).toBeNull();
  });
});

/* ── Security fix #3: AUTH_SECRET validation ── */
describe("AUTH_SECRET validation", () => {
  it("refuses to sign a token with a short secret", async () => {
    await expect(signToken({ sub: "x", email: "x@x.com" }, "short")).rejects.toThrow(
      "AUTH_SECRET must be at least 32 characters",
    );
  });

  it("refuses to sign a token with an empty secret", async () => {
    await expect(signToken({ sub: "x", email: "x@x.com" }, "")).rejects.toThrow();
  });

  it("refuses to verify a token with a short secret", async () => {
    const token = await signToken({ sub: "x", email: "x@x.com" }, TEST_SECRET);
    const result = await verifyToken(token, "short");
    expect(result).toBeNull();
  });
});

/* ── Security fix #1: token hashing ── */
describe("token value hashing (SHA-256)", () => {
  it("produces a deterministic SHA-256 hex hash", async () => {
    const a = await hashTokenValue("test-token-123");
    const b = await hashTokenValue("test-token-123");
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it("produces different hashes for different inputs", async () => {
    const a = await hashTokenValue("token-a");
    const b = await hashTokenValue("token-b");
    expect(a).not.toBe(b);
  });
});

/* ─── Base64url helpers ──────────────────────────────────────────── */
describe("base64url helpers", () => {
  it("round-trips an ASCII string (JWT payload use-case)", () => {
    // base64urlToString is used for JWT header/payload which are always ASCII JSON.
    const input = '{"sub":"usr_123","email":"test@example.com"}';
    const encoded = bytesToBase64url(new TextEncoder().encode(input));
    const decoded = base64urlToString(encoded);
    expect(decoded).toBe(input);
  });

  it("produces URL-safe output (no + or /)", () => {
    const encoded = bytesToBase64url(
      new TextEncoder().encode("++//==test==//++"),
    );
    expect(encoded).not.toContain("+");
    expect(encoded).not.toContain("/");
    expect(encoded).not.toContain("=");
  });
});
