/**
 * Shared helpers for the external (per-collection) auth router.
 *
 * Mirrors the createToken / consumeToken pattern from superuserRouter.ts
 * but parameterized by collection name so multiple user-type collections
 * can each manage their own verification / password-reset tokens.
 */

import { hashTokenValue } from "../../auth/crypto.js";
import type { TokenType } from "../../db/schema.js";

/**
 * Insert a token row into `_tokens` with collection_ref + record_ref.
 * The token value is stored as a SHA-256 hash — the raw value is returned
 * to the caller once and never persisted.
 */
export async function createCollectionToken(
  db: D1Database,
  collectionName: string,
  recordId: string,
  type: TokenType,
  expiryMs: number,
): Promise<{ id: string; value: string }> {
  const id = crypto.randomUUID();
  // 32-byte random token, base64url-encoded (URL-safe for email links).
  const raw = crypto.getRandomValues(new Uint8Array(32));
  let binary = "";
  for (let i = 0; i < raw.length; i++) binary += String.fromCharCode(raw[i]!);
  const value = btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

  const hashed = await hashTokenValue(value);

  const now = Date.now();
  await db.prepare(
    `INSERT INTO _tokens (id, collection_ref, record_ref, type, value, expires_at, consumed, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 0, ?)`,
  )
    .bind(id, collectionName, recordId, type, hashed, now + expiryMs, now)
    .run();

  return { id, value };
}

/**
 * Look up a token by its SHA-256 hash, validate type/expiry/consumed,
 * mark it consumed, and return the collection_ref + record_ref.
 *
 * Returns null on any failure (not found, wrong type, expired, already used).
 */
export async function consumeCollectionToken(
  db: D1Database,
  rawValue: string,
  expectedType: TokenType,
): Promise<{ collectionRef: string; recordRef: string } | null> {
  const hashed = await hashTokenValue(rawValue);

  const row = await db
    .prepare(
      `SELECT id, collection_ref, record_ref, type, expires_at, consumed
       FROM _tokens WHERE value = ? AND type = ? LIMIT 1`,
    )
    .bind(hashed, expectedType)
    .first<{
      id: string;
      collection_ref: string;
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

  return { collectionRef: row.collection_ref, recordRef: row.record_ref };
}

/**
 * Normalize an email — lowercase + trim — for storage and lookup.
 * External auth collections store emails case-insensitively.
 */
export function normalizeEmail(email: string): string {
  return email.toLowerCase().trim();
}
