/**
 * Web Crypto-based password hashing + token signing.
 *
 * Uses PBKDF2 (SHA-256, 100k iterations) for passwords and
 * HMAC-SHA-256 for stateless session tokens — both algorithms are
 * available natively in the Cloudflare Workers runtime.
 */

const PBKDF2_ITERATIONS = 100_000;
const PBKDF2_KEYLEN = 32; // 256-bit hash
const SALT_LEN = 16;
export const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

// ---------- base64url helpers ----------
export function bytesToBase64url(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = "";
  for (let i = 0; i < view.byteLength; i++) {
    binary += String.fromCharCode(view[i]!);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function base64urlToString(b64url: string): string {
  const pad = b64url.length % 4 === 0 ? "" : "=".repeat(4 - (b64url.length % 4));
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/") + pad;
  return atob(b64);
}

function hexFromBuffer(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function randomBytes(len: number): Uint8Array {
  const arr = new Uint8Array(len);
  crypto.getRandomValues(arr);
  return arr;
}

// ---------- password hashing ----------
async function importPbkdf2Key(password: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits"],
  );
}

export async function hashPassword(password: string): Promise<{
  hash: string;
  salt: string;
}> {
  const salt = randomBytes(SALT_LEN);
  const key = await importPbkdf2Key(password);
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: salt as BufferSource,
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    key,
    PBKDF2_KEYLEN * 8,
  );
  return { hash: hexFromBuffer(bits), salt: bytesToBase64url(salt) };
}

export async function verifyPassword(
  password: string,
  storedHashHex: string,
  saltB64url: string,
): Promise<boolean> {
  // Reconstruct salt bytes from base64url.
  const saltBinary = atob(saltB64url.replace(/-/g, "+").replace(/_/g, "/"));
  const salt = new Uint8Array(saltBinary.length);
  for (let i = 0; i < saltBinary.length; i++) salt[i] = saltBinary.charCodeAt(i);

  const key = await importPbkdf2Key(password);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: salt as BufferSource, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    key,
    PBKDF2_KEYLEN * 8,
  );
  const candidate = hexFromBuffer(bits);

  // constant-time-ish comparison
  if (candidate.length !== storedHashHex.length) return false;
  let diff = 0;
  for (let i = 0; i < candidate.length; i++) {
    diff |= candidate.charCodeAt(i) ^ storedHashHex.charCodeAt(i);
  }
  return diff === 0;
}

// ---------- session token (HMAC-SHA-256 JWT) ----------
async function importHmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export interface TokenPayload {
  sub: string; // user id
  email: string;
  iat: number; // issued at (seconds)
  exp: number; // expiry (seconds)
}

export async function signToken(payload: Omit<TokenPayload, "iat" | "exp">, secret: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const full: TokenPayload = {
    ...payload,
    iat: now,
    exp: now + TOKEN_TTL_SECONDS,
  };

  const header = { alg: "HS256", typ: "JWT" };
  const headerB64 = bytesToBase64url(new TextEncoder().encode(JSON.stringify(header)));
  const payloadB64 = bytesToBase64url(new TextEncoder().encode(JSON.stringify(full)));
  const signingInput = `${headerB64}.${payloadB64}`;

  const key = await importHmacKey(secret);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signingInput));
  return `${signingInput}.${bytesToBase64url(sig)}`;
}

export async function verifyToken(token: string, secret: string): Promise<TokenPayload | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [headerB64, payloadB64, sigB64] = parts as [string, string, string];
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

  let payload: TokenPayload;
  try {
    payload = JSON.parse(base64urlToString(payloadB64)) as TokenPayload;
  } catch {
    return null;
  }
  if (typeof payload.exp !== "number" || payload.exp < Math.floor(Date.now() / 1000)) {
    return null;
  }
  return payload;
}
