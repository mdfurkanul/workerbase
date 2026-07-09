/**
 * Personal Access Token (PAT) helpers for the public records API.
 *
 * Tokens are opaque random strings prefixed with `wbs_`. Only the
 * SHA-256 hash is persisted in `_apiTokens`; the raw token is shown to
 * the caller exactly once at mint time and never recoverable.
 *
 * Scope hierarchy: read (1) < write (2) < admin (3). Each HTTP method
 * on `/api/collections/*` requires a minimum scope (see `scopeForMethod`).
 */

import type { ApiTokenScope } from "../db/schema.js";

export const API_TOKEN_PREFIX = "wbs_";
const RANDOM_BYTES = 32; // 256 bits of entropy → ~43 base64url chars
const PREFIX_LEN = 10; // chars of the random portion to keep for UI display

/** Numeric rank for scope comparison — higher = more powerful. */
export const SCOPE_RANK: Record<ApiTokenScope, number> = {
  read: 1,
  write: 2,
  admin: 3,
};

/** True if `have` satisfies the `need` scope (hierarchy: admin ⊇ write ⊇ read). */
export function scopeSatisfies(have: ApiTokenScope, need: ApiTokenScope): boolean {
  return SCOPE_RANK[have] >= SCOPE_RANK[need];
}

/** Minimum scope required to perform an HTTP method on the records API. */
export function scopeForMethod(method: string): ApiTokenScope {
  const m = method.toUpperCase();
  if (m === "GET") return "read";
  if (m === "POST" || m === "PATCH" || m === "PUT") return "write";
  if (m === "DELETE") return "admin";
  return "admin"; // unknown verbs default to safest tier
}

function bytesToBase64url(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function hexFromBuffer(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Mint a fresh token. Returns the raw token (shown once to the caller),
 * its SHA-256 hex hash (for DB storage), and a short prefix for UI display.
 */
export function generateApiToken(): {
  token: string;
  hash: string;
  prefix: string;
} {
  const bytes = new Uint8Array(RANDOM_BYTES);
  crypto.getRandomValues(bytes);
  const random = bytesToBase64url(bytes);
  const token = `${API_TOKEN_PREFIX}${random}`;
  const prefix = random.slice(0, PREFIX_LEN);

  // Hash synchronously-lookalike but SHA-256 is async via subtle.digest.
  // We compute it eagerly below in `hashApiToken`; here we return a promise-free
  // shape for callers that just need the raw value immediately.
  // The hash is filled in by `hashApiToken` before persistence.
  return { token, hash: "", prefix };
}

/** SHA-256 hex hash of a raw token. */
export async function hashApiToken(raw: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
  return hexFromBuffer(buf);
}

/**
 * Convenience: mint a token AND compute its hash in one call.
 * This is what the router uses at create time.
 */
export async function mintApiToken(): Promise<{
  token: string;
  hash: string;
  prefix: string;
}> {
  const draft = generateApiToken();
  const hash = await hashApiToken(draft.token);
  return { token: draft.token, hash, prefix: draft.prefix };
}

/**
 * Extract a candidate raw API token from an `Authorization` header.
 * Returns `null` if the header is absent, malformed, or not a `wbs_` token.
 *
 * NOTE: this intentionally does NOT verify the token; it only parses the
 * header shape. DB lookup + scope checks happen in the router/middleware.
 */
export function parseApiToken(authHeader: string): string | null {
  const m = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  const raw = m[1]!.trim();
  if (!raw.startsWith(API_TOKEN_PREFIX)) return null;
  if (raw.length < API_TOKEN_PREFIX.length + 8) return null; // too short to be real
  return raw;
}
