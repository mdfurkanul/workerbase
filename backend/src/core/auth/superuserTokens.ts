import { hashTokenValue } from "../../auth/crypto.js";

// Token expiry in milliseconds.
export const EXPIRY_VERIFICATION_MS = 30 * 60 * 1000; // 30 minutes
export const EXPIRY_PASSWORD_RESET_MS = 30 * 60 * 1000; // 30 minutes
export const EXPIRY_MAGIC_LINK_MS = 30 * 60 * 1000; // 30 minutes

// ─────────────────────────────────────────────────────────────
//  Helper: insert a token row into _tokens
// ─────────────────────────────────────────────────────────────

export async function createToken(
  db: D1Database,
  recordRef: string,
  type: "verification" | "passwordReset" | "emailChange" | "otp",
  expiryMs: number,
): Promise<{ id: string; value: string }> {
  const id = crypto.randomUUID();
  // 32-byte random token, base64url-encoded (URL-safe for email links).
  const raw = crypto.getRandomValues(new Uint8Array(32));
  let binary = "";
  for (let i = 0; i < raw.length; i++) binary += String.fromCharCode(raw[i]!);
  const value = btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

  // ── FIX: store SHA-256 hash, not the raw token ──
  const hashed = await hashTokenValue(value);

  const now = Date.now();
  await db.prepare(
    `INSERT INTO _tokens (id, collection_ref, record_ref, type, value, expires_at, consumed, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 0, ?)`,
  )
    .bind(id, "_superusers", recordRef, type, hashed, now + expiryMs, now)
    .run();

  return { id, value };
}

// ─────────────────────────────────────────────────────────────
//  Helper: consume a token (validate type, expiry, not-yet-consumed)
// ─────────────────────────────────────────────────────────────

export async function consumeToken(
  db: D1Database,
  rawValue: string,
  expectedType: "verification" | "passwordReset" | "emailChange" | "otp",
): Promise<{ recordRef: string } | null> {
  // ── FIX: hash the incoming token, look up by hash ──
  const hashed = await hashTokenValue(rawValue);

  const row = await db
    .prepare(
      `SELECT id, record_ref, type, expires_at, consumed FROM _tokens WHERE value = ? AND type = ? LIMIT 1`,
    )
    .bind(hashed, expectedType)
    .first<{
      id: string;
      record_ref: string;
      type: string;
      expires_at: number;
      consumed: number;
    }>();

  if (!row) return null;
  if (row.consumed) return null;
  if (row.expires_at < Date.now()) return null;

  // Mark as consumed so it can't be replayed.
  await db.prepare(`UPDATE _tokens SET consumed = 1 WHERE id = ?`).bind(row.id).run();

  return { recordRef: row.record_ref };
}
