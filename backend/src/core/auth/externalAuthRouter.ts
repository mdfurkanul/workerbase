/**
 * External (per-collection) auth router.
 *
 * Mounted at `/api/collections` so routes become:
 *   POST   /api/collections/:name/auth/register
 *   POST   /api/collections/:name/auth/login
 *   POST   /api/collections/:name/auth/logout
 *   GET    /api/collections/:name/auth/verify-email?token=...
 *   POST   /api/collections/:name/auth/request-password-reset
 *   POST   /api/collections/:name/auth/reset-password
 *   GET    /api/collections/:name/auth/me
 *
 * The `:name` parameter is the collection name (e.g. "users", "members").
 */

import { Hono, type MiddlewareHandler } from "hono";
import { z } from "zod";
import type { Env } from "../../env.js";
import type { AuthConfig, FieldDefinition } from "../../db/schema.js";
import {
  hashPassword,
  verifyPassword,
} from "../../auth/crypto.js";
import {
  signCollectionToken,
  verifyCollectionToken,
  type CollectionTokenPayload,
} from "../../auth/collectionToken.js";
import {
  createCollectionToken,
  consumeCollectionToken,
  normalizeEmail,
} from "./externalAuthHelpers.js";

// ─────────────────────────────────────────────────────────────
//  Constants
// ─────────────────────────────────────────────────────────────

const IDENT = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
const NAME_RE = /^[a-zA-Z][a-zA-Z0-9_]*$/;

const EXPIRY_VERIFICATION_MS = 30 * 60 * 1000; // 30 min
const EXPIRY_PASSWORD_RESET_MS = 30 * 60 * 1000; // 30 min

const DEFAULT_AUTH_CONFIG: AuthConfig = {
  enabled: true,
  emailPassword: true,
  emailOTP: false,
  oauth: {},
  onlyVerified: false,
  requirePasswordChange: false,
  minPasswordLength: 8,
};

// ─────────────────────────────────────────────────────────────
//  Zod validation schemas
// ─────────────────────────────────────────────────────────────

const registerSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(256), // min length enforced dynamically per collection
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
  password: z.string().min(1).max(256), // min length enforced dynamically
});

// ─────────────────────────────────────────────────────────────
//  Helpers
// ─────────────────────────────────────────────────────────────

/** Merge a stored authConfig JSON (possibly partial/null) with defaults. */
function mergeAuthConfig(stored: Partial<AuthConfig> | null | undefined): AuthConfig {
  return { ...DEFAULT_AUTH_CONFIG, ...(stored ?? {}) };
}

/** Validate that a string is a safe SQL identifier. */
function isIdent(s: string): boolean {
  return IDENT.test(s);
}

/**
 * Build the column list + values for an INSERT into the collection's
 * physical table. Only non-system, user-defined fields from `data` are
 * included; system columns (email, password_hash, etc.) are added by the
 * caller via the prepared-statement bind list.
 */
function filterUserDataFields(
  data: Record<string, unknown> | undefined,
  schemaFields: FieldDefinition[],
): Record<string, unknown> {
  if (!data) return {};
  const out: Record<string, unknown> = {};
  for (const field of schemaFields) {
    if (field.system) continue;
    if (field.name in data) {
      out[field.name] = data[field.name];
    }
  }
  return out;
}

// ─────────────────────────────────────────────────────────────
//  Router + middleware
// ─────────────────────────────────────────────────────────────

export const externalAuthRouter = new Hono<{
  Bindings: Env;
  Variables: { authRecord: CollectionTokenPayload | null };
}>();

/**
 * Require a valid collection-scoped JWT in the Authorization header.
 * Validates that the token's `collection` claim matches the `:name` route
 * parameter. On success, attaches the payload to `c.set("authRecord", payload)`.
 */
export const requireCollectionAuth: MiddlewareHandler<{
  Bindings: Env;
  Variables: { authRecord: CollectionTokenPayload | null };
}> = async (c, next) => {
  const header = c.req.header("Authorization") ?? "";
  const m = header.match(/^Bearer\s+(.+)$/i);
  if (!m) {
    return c.json({ error: "missing_bearer_token" }, 401);
  }
  const collectionName = c.req.param("name");
  const payload = await verifyCollectionToken(m[1]!, c.env.AUTH_SECRET, collectionName);
  if (!payload) {
    return c.json({ error: "invalid_or_expired_token" }, 401);
  }
  c.set("authRecord", payload);
  await next();
};

// ─────────────────────────────────────────────────────────────
//  Helper: fetch collection metadata (type='user')
// ─────────────────────────────────────────────────────────────

interface CollectionMeta {
  id: string;
  name: string;
  schema: FieldDefinition[] | null;
  authConfig: AuthConfig;
}

async function fetchUserCollection(
  db: D1Database,
  name: string,
): Promise<CollectionMeta | null> {
  if (!NAME_RE.test(name)) return null;
  const row = await db
    .prepare(
      `SELECT id, name, schema, auth_config FROM _collections WHERE name = ? AND type = 'user' LIMIT 1`,
    )
    .bind(name)
    .first<{ id: string; name: string; schema: string | null; auth_config: string | null }>();
  if (!row) return null;

  let parsedSchema: FieldDefinition[] | null = null;
  if (row.schema) {
    try {
      parsedSchema = JSON.parse(row.schema) as FieldDefinition[];
    } catch {
      parsedSchema = null;
    }
  }

  let storedAuth: Partial<AuthConfig> | null = null;
  if (row.auth_config) {
    try {
      storedAuth = JSON.parse(row.auth_config) as Partial<AuthConfig>;
    } catch {
      storedAuth = null;
    }
  }

  return {
    id: row.id,
    name: row.name,
    schema: parsedSchema,
    authConfig: mergeAuthConfig(storedAuth),
  };
}

// ─────────────────────────────────────────────────────────────
//  POST /:name/auth/register
// ─────────────────────────────────────────────────────────────

externalAuthRouter.post("/:name/auth/register", async (c) => {
  const collectionName = c.req.param("name");

  const meta = await fetchUserCollection(c.env.SYSTEM_DB, collectionName);
  if (!meta) {
    return c.json({ error: "collection_not_found" }, 404);
  }

  if (!meta.authConfig.enabled || !meta.authConfig.emailPassword) {
    return c.json({ error: "auth_disabled" }, 403);
  }

  let body: unknown;
  try {
    const raw = await c.req.text();
    body = raw ? JSON.parse(raw) : {};
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }

  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "validation_failed", issues: parsed.error.flatten() }, 400);
  }

  const { email, password, data } = parsed.data;
  const normalizedEmail = normalizeEmail(email);

  const minLen = meta.authConfig.minPasswordLength ?? DEFAULT_AUTH_CONFIG.minPasswordLength;
  if (password.length < minLen) {
    return c.json(
      { error: "password_too_short", minLength: minLen },
      400,
    );
  }

  // Check for existing record by email.
  const existing = await c.env.SYSTEM_DB.prepare(
    `SELECT id FROM ${collectionName} WHERE email = ? LIMIT 1`,
  )
    .bind(normalizedEmail)
    .first();
  if (existing) {
    return c.json({ error: "email_already_registered" }, 409);
  }

  const { hash, salt } = await hashPassword(password);
  const id = crypto.randomUUID();
  const now = Math.floor(Date.now() / 1000); // columns are INTEGER unixepoch (seconds)

  // Build INSERT with optional user-defined data fields.
  const extraFields = filterUserDataFields(data, meta.schema ?? []);
  const extraColumns = Object.keys(extraFields).filter(isIdent);
  const extraValues = extraColumns.map((col) => extraFields[col]);

  const columnList = [
    "id",
    "email",
    "password_hash",
    "password_salt",
    "verified",
    "token_key",
    "created_at",
    "updated_at",
    ...extraColumns,
  ].join(", ");

  const placeholders = columnList.split(", ").map(() => "?").join(", ");
  const sql = `INSERT INTO ${collectionName} (${columnList}) VALUES (${placeholders})`;

  try {
    await c.env.SYSTEM_DB.prepare(sql)
      .bind(
        id,
        normalizedEmail,
        hash,
        salt,
        0, // verified = false
        crypto.randomUUID(), // token_key
        now,
        now,
        ...extraValues,
      )
      .run();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({ error: "persist_failed", detail: msg }, 500);
  }

  // Create a verification token.
  const { value: verifyTokenValue } = await createCollectionToken(
    c.env.SYSTEM_DB,
    collectionName,
    id,
    "verification",
    EXPIRY_VERIFICATION_MS,
  );

  const url = new URL(c.req.url);
  const verifyURL = `${url.origin}/api/collections/${collectionName}/auth/verify-email?token=${verifyTokenValue}`;

  if (c.env.ENVIRONMENT === "local") {
    console.log(`[dev-only] verification for ${normalizedEmail} (${collectionName}): ${verifyURL}`);
  }

  // Issue a collection JWT.
  const token = await signCollectionToken(
    { collection: collectionName, recordId: id, email: normalizedEmail, verified: false },
    c.env.AUTH_SECRET,
  );

  return c.json(
    {
      record: {
        id,
        email: normalizedEmail,
        verified: false,
        ...(meta.authConfig.requirePasswordChange ? { requirePasswordChange: true } : {}),
      },
      token,
    },
    201,
  );
});

// ─────────────────────────────────────────────────────────────
//  POST /:name/auth/login
// ─────────────────────────────────────────────────────────────

externalAuthRouter.post("/:name/auth/login", async (c) => {
  const collectionName = c.req.param("name");

  const meta = await fetchUserCollection(c.env.SYSTEM_DB, collectionName);
  if (!meta) {
    return c.json({ error: "collection_not_found" }, 404);
  }

  let body: unknown;
  try {
    const raw = await c.req.text();
    body = raw ? JSON.parse(raw) : {};
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }

  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "validation_failed", issues: parsed.error.flatten() }, 400);
  }

  const { email, password } = parsed.data;
  const normalizedEmail = normalizeEmail(email);

  const row = await c.env.SYSTEM_DB.prepare(
    `SELECT id, email, password_hash, password_salt, verified FROM ${collectionName} WHERE email = ? LIMIT 1`,
  )
    .bind(normalizedEmail)
    .first<{
      id: string;
      email: string;
      password_hash: string;
      password_salt: string;
      verified: number;
    }>();

  if (!row) {
    return c.json({ error: "invalid_credentials" }, 401);
  }

  const ok = await verifyPassword(password, row.password_hash, row.password_salt);
  if (!ok) {
    return c.json({ error: "invalid_credentials" }, 401);
  }

  if (meta.authConfig.onlyVerified && row.verified !== 1) {
    return c.json({ error: "email_not_verified" }, 403);
  }

  const token = await signCollectionToken(
    {
      collection: collectionName,
      recordId: row.id,
      email: row.email,
      verified: row.verified === 1,
    },
    c.env.AUTH_SECRET,
  );

  return c.json({
    record: {
      id: row.id,
      email: row.email,
      verified: row.verified === 1,
    },
    token,
  });
});

// ─────────────────────────────────────────────────────────────
//  POST /:name/auth/logout
// ─────────────────────────────────────────────────────────────

externalAuthRouter.post("/:name/auth/logout", requireCollectionAuth, async (c) => {
  // JWT is stateless — client discards the token.
  return c.json({ success: true });
});

// ─────────────────────────────────────────────────────────────
//  GET /:name/auth/verify-email?token=...
// ─────────────────────────────────────────────────────────────

externalAuthRouter.get("/:name/auth/verify-email", async (c) => {
  const collectionName = c.req.param("name");

  const tokenValue = c.req.query("token");
  if (!tokenValue) {
    return c.json({ error: "missing_token" }, 400);
  }

  const result = await consumeCollectionToken(c.env.SYSTEM_DB, tokenValue, "verification");
  if (!result) {
    return c.json({ error: "invalid_or_expired_token" }, 401);
  }

  if (result.collectionRef !== collectionName) {
    return c.json({ error: "token_collection_mismatch" }, 400);
  }

  const now = Math.floor(Date.now() / 1000);
  await c.env.SYSTEM_DB.prepare(
    `UPDATE ${collectionName} SET verified = 1, updated_at = ? WHERE id = ?`,
  )
    .bind(now, result.recordRef)
    .run();

  return c.json({ success: true });
});

// ─────────────────────────────────────────────────────────────
//  POST /:name/auth/request-password-reset
// ─────────────────────────────────────────────────────────────

externalAuthRouter.post("/:name/auth/request-password-reset", async (c) => {
  const collectionName = c.req.param("name");

  const meta = await fetchUserCollection(c.env.SYSTEM_DB, collectionName);
  if (!meta) {
    // Don't leak — return 200 anyway.
    return c.json({ success: true });
  }

  let body: unknown;
  try {
    const raw = await c.req.text();
    body = raw ? JSON.parse(raw) : {};
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }

  const parsed = requestPasswordResetSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "validation_failed", issues: parsed.error.flatten() }, 400);
  }

  const normalizedEmail = normalizeEmail(parsed.data.email);

  const row = await c.env.SYSTEM_DB.prepare(
    `SELECT id, email FROM ${collectionName} WHERE email = ? LIMIT 1`,
  )
    .bind(normalizedEmail)
    .first<{ id: string; email: string }>();

  // Always return 200 — never leak whether the email exists.
  if (!row) {
    return c.json({ success: true });
  }

  const { value } = await createCollectionToken(
    c.env.SYSTEM_DB,
    collectionName,
    row.id,
    "passwordReset",
    EXPIRY_PASSWORD_RESET_MS,
  );

  const url = new URL(c.req.url);
  const resetURL = `${url.origin}/api/collections/${collectionName}/auth/reset-password?token=${value}`;

  if (c.env.ENVIRONMENT === "local") {
    console.log(`[dev-only] password-reset for ${row.email} (${collectionName}): ${resetURL}`);
  }

  return c.json({ success: true });
});

// ─────────────────────────────────────────────────────────────
//  POST /:name/auth/reset-password
// ─────────────────────────────────────────────────────────────

externalAuthRouter.post("/:name/auth/reset-password", async (c) => {
  const collectionName = c.req.param("name");

  const meta = await fetchUserCollection(c.env.SYSTEM_DB, collectionName);
  if (!meta) {
    return c.json({ error: "collection_not_found" }, 404);
  }

  let body: unknown;
  try {
    const raw = await c.req.text();
    body = raw ? JSON.parse(raw) : {};
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }

  const parsed = resetPasswordSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "validation_failed", issues: parsed.error.flatten() }, 400);
  }

  const { token, password } = parsed.data;

  const minLen = meta.authConfig.minPasswordLength ?? DEFAULT_AUTH_CONFIG.minPasswordLength;
  if (password.length < minLen) {
    return c.json({ error: "password_too_short", minLength: minLen }, 400);
  }

  const result = await consumeCollectionToken(c.env.SYSTEM_DB, token, "passwordReset");
  if (!result) {
    return c.json({ error: "invalid_or_expired_token" }, 401);
  }

  if (result.collectionRef !== collectionName) {
    return c.json({ error: "token_collection_mismatch" }, 400);
  }

  const { hash, salt } = await hashPassword(password);
  const now = Math.floor(Date.now() / 1000);

  // Rotate token_key so existing sessions are invalidated.
  await c.env.SYSTEM_DB.prepare(
    `UPDATE ${collectionName} SET password_hash = ?, password_salt = ?, token_key = ?, updated_at = ? WHERE id = ?`,
  )
    .bind(hash, salt, crypto.randomUUID(), now, result.recordRef)
    .run();

  return c.json({ success: true });
});

// ─────────────────────────────────────────────────────────────
//  GET /:name/auth/me
// ─────────────────────────────────────────────────────────────

externalAuthRouter.get("/:name/auth/me", requireCollectionAuth, async (c) => {
  const collectionName = c.req.param("name");
  const authRecord = c.get("authRecord");
  if (!authRecord) {
    return c.json({ error: "unauthorized" }, 401);
  }

  const row = await c.env.SYSTEM_DB.prepare(
    `SELECT id, email, verified, created_at, updated_at FROM ${collectionName} WHERE id = ? LIMIT 1`,
  )
    .bind(authRecord.recordId)
    .first<{
      id: string;
      email: string;
      verified: number;
      created_at: number;
      updated_at: number;
    }>();

  if (!row) {
    return c.json({ error: "record_not_found" }, 404);
  }

  return c.json({
    record: {
      id: row.id,
      email: row.email,
      verified: row.verified === 1,
      created_at: row.created_at,
      updated_at: row.updated_at,
    },
  });
});
