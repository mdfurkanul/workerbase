/**
 * Per-collection JWT helpers.
 *
 * A single AUTH_SECRET (shared with the dashboard superuser tokens) signs
 * collection-scoped tokens.  The `collection` claim distinguishes which
 * user-type collection the token belongs to, so the same secret can serve
 * multiple auth collections without ambiguity.
 *
 * Mirrors the HS256 signing pattern from crypto.ts and rejects alg:none.
 */

import { bytesToBase64url, base64urlToString } from "./crypto.js";

const MIN_SECRET_LENGTH = 32;
const COLLECTION_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

export interface CollectionTokenPayload {
  collection: string; // collection name (e.g. "users", "members")
  recordId: string; // _row_ id in the collection's physical table
  email: string;
  verified: boolean;
  iat: number; // issued at (seconds)
  exp: number; // expiry (seconds)
}

async function importHmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export async function signCollectionToken(
  payload: Omit<CollectionTokenPayload, "iat" | "exp">,
  secret: string,
): Promise<string> {
  if (!secret || secret.length < MIN_SECRET_LENGTH) {
    throw new Error("AUTH_SECRET must be at least 32 characters");
  }
  const now = Math.floor(Date.now() / 1000);
  const full: CollectionTokenPayload = {
    ...payload,
    iat: now,
    exp: now + COLLECTION_TOKEN_TTL_SECONDS,
  };

  const header = { alg: "HS256", typ: "JWT" };
  const headerB64 = bytesToBase64url(new TextEncoder().encode(JSON.stringify(header)));
  const payloadB64 = bytesToBase64url(new TextEncoder().encode(JSON.stringify(full)));
  const signingInput = `${headerB64}.${payloadB64}`;

  const key = await importHmacKey(secret);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signingInput));
  return `${signingInput}.${bytesToBase64url(sig)}`;
}

export async function verifyCollectionToken(
  token: string,
  secret: string,
  expectedCollection?: string,
): Promise<CollectionTokenPayload | null> {
  if (!secret || secret.length < MIN_SECRET_LENGTH) return null;

  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [headerB64, payloadB64, sigB64] = parts as [string, string, string];

  // Reject alg:none and any non-HS256 header.
  let header: { alg?: string; typ?: string };
  try {
    header = JSON.parse(base64urlToString(headerB64));
  } catch {
    return null;
  }
  if (header.alg !== "HS256") return null;

  const signingInput = `${headerB64}.${payloadB64}`;

  let sigBytes: Uint8Array;
  try {
    const binary = atob(sigB64.replace(/-/g, "+").replace(/_/g, "/"));
    sigBytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) sigBytes[i] = binary.charCodeAt(i);
  } catch {
    return null;
  }

  const key = await importHmacKey(secret);
  const ok = await crypto.subtle.verify(
    "HMAC",
    key,
    sigBytes as BufferSource,
    new TextEncoder().encode(signingInput),
  );
  if (!ok) return null;

  let payload: CollectionTokenPayload;
  try {
    payload = JSON.parse(base64urlToString(payloadB64)) as CollectionTokenPayload;
  } catch {
    return null;
  }

  if (typeof payload.exp !== "number" || payload.exp < Math.floor(Date.now() / 1000)) {
    return null;
  }
  if (typeof payload.collection !== "string" || payload.collection.length === 0) return null;
  if (typeof payload.recordId !== "string" || payload.recordId.length === 0) return null;

  if (expectedCollection && payload.collection !== expectedCollection) return null;

  return payload;
}
