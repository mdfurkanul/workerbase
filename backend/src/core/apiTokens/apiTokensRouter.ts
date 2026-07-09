import { Hono } from "hono";
import { z } from "zod";
import type { Env } from "../../env.js";
import type { ApiTokenScope } from "../../db/schema.js";
import { requireAuth, requireRole } from "../../auth/middleware.js";
import { mintApiToken, hashApiToken } from "../../auth/apiToken.js";

/**
 * API tokens (PATs) — admin CRUD.
 *
 *   GET    /api/core/api-tokens           — list all tokens (no raw values)
 *   GET    /api/core/api-tokens/:id       — single token metadata
 *   POST   /api/core/api-tokens           — mint a new token (returns raw value ONCE)
 *   PATCH  /api/core/api-tokens/:id       — update name / scopes / collectionScope
 *   DELETE /api/core/api-tokens/:id       — revoke (sets revoked_at); ?permanent=1 hard-deletes
 *
 * All endpoints require an admin superuser session.
 */

const scopeSchema = z.enum(["read", "write", "admin"]);

const createSchema = z.object({
  name: z.string().min(1).max(80),
  scopes: scopeSchema,
  collectionScope: z.string().min(1).max(64).optional().nullable(),
  expiresInDays: z.number().int().min(1).max(3650).optional(),
});

const patchSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  scopes: scopeSchema.optional(),
  collectionScope: z.string().min(1).max(64).optional().nullable(),
});

/** Shape we return to clients — never includes `token_hash` or the raw token. */
function strip(row: Record<string, unknown>) {
  const { token_hash, ...rest } = row as { token_hash?: unknown };
  return rest;
}

export const apiTokensRouter = new Hono<{ Bindings: Env }>();

// ─────────────────────────────────────────────────────────────
//  GET /api/core/api-tokens — list
// ─────────────────────────────────────────────────────────────
apiTokensRouter.get("/", requireAuth, requireRole("admin"), async (c) => {
  const { results } = await c.env.SYSTEM_DB.prepare(
    `SELECT id, name, prefix, scopes, collection_scope, created_by,
            created_at, last_used_at, expires_at, revoked_at
       FROM _apiTokens
       ORDER BY created_at DESC`,
  ).all();
  return c.json({ tokens: results });
});

// ─────────────────────────────────────────────────────────────
//  GET /api/core/api-tokens/:id — single
// ─────────────────────────────────────────────────────────────
apiTokensRouter.get("/:id", requireAuth, requireRole("admin"), async (c) => {
  const id = c.req.param("id");
  const row = await c.env.SYSTEM_DB.prepare(
    `SELECT id, name, prefix, scopes, collection_scope, created_by,
            created_at, last_used_at, expires_at, revoked_at
       FROM _apiTokens WHERE id = ?`,
  )
    .bind(id)
    .first();
  if (!row) return c.json({ error: "not_found" }, 404);
  return c.json({ token: row });
});

// ─────────────────────────────────────────────────────────────
//  POST /api/core/api-tokens — create
// ─────────────────────────────────────────────────────────────
apiTokensRouter.post("/", requireAuth, requireRole("admin"), async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "unauthorized" }, 401);

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "validation_failed", issues: parsed.error.flatten() }, 400);
  }

  // If a collectionScope was provided, verify the collection exists.
  if (parsed.data.collectionScope) {
    const exists = await c.env.SYSTEM_DB.prepare(
      `SELECT 1 FROM _collections WHERE name = ?`,
    )
      .bind(parsed.data.collectionScope)
      .first();
    if (!exists) {
      return c.json({ error: "unknown_collection", collectionScope: parsed.data.collectionScope }, 400);
    }
  }

  const { token, hash, prefix } = await mintApiToken();
  const id = crypto.randomUUID();
  const now = Date.now();
  const expiresAt =
    parsed.data.expiresInDays != null
      ? now + parsed.data.expiresInDays * 24 * 60 * 60 * 1000
      : null;

  try {
    await c.env.SYSTEM_DB.prepare(
      `INSERT INTO _apiTokens
         (id, name, token_hash, prefix, scopes, collection_scope, created_by,
          created_at, last_used_at, expires_at, revoked_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, NULL)`,
    )
      .bind(
        id,
        parsed.data.name,
        hash,
        prefix,
        parsed.data.scopes,
        parsed.data.collectionScope ?? null,
        user.sub,
        now,
        expiresAt,
      )
      .run();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({ error: "persist_failed", detail: msg }, 500);
  }

  const meta = {
    id,
    name: parsed.data.name,
    prefix,
    scopes: parsed.data.scopes,
    collection_scope: parsed.data.collectionScope ?? null,
    created_by: user.sub,
    created_at: now,
    last_used_at: null,
    expires_at: expiresAt,
    revoked_at: null,
  };

  // The raw token is returned EXACTLY ONCE.
  return c.json({ token, tokenMeta: meta }, 201);
});

// ─────────────────────────────────────────────────────────────
//  PATCH /api/core/api-tokens/:id — update metadata
// ─────────────────────────────────────────────────────────────
apiTokensRouter.patch("/:id", requireAuth, requireRole("admin"), async (c) => {
  const id = c.req.param("id");

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "validation_failed", issues: parsed.error.flatten() }, 400);
  }

  const existing = await c.env.SYSTEM_DB.prepare(
    `SELECT id, revoked_at FROM _apiTokens WHERE id = ?`,
  )
    .bind(id)
    .first<{ id: string; revoked_at: number | null }>();
  if (!existing) return c.json({ error: "not_found" }, 404);

  if (parsed.data.collectionScope) {
    const exists = await c.env.SYSTEM_DB.prepare(
      `SELECT 1 FROM _collections WHERE name = ?`,
    )
      .bind(parsed.data.collectionScope)
      .first();
    if (!exists) {
      return c.json({ error: "unknown_collection", collectionScope: parsed.data.collectionScope }, 400);
    }
  }

  const sets: string[] = [];
  const values: (string | number | null)[] = [];
  if (parsed.data.name !== undefined) {
    sets.push("name = ?");
    values.push(parsed.data.name);
  }
  if (parsed.data.scopes !== undefined) {
    sets.push("scopes = ?");
    values.push(parsed.data.scopes);
  }
  if (parsed.data.collectionScope !== undefined) {
    sets.push("collection_scope = ?");
    values.push(parsed.data.collectionScope ?? null);
  }

  if (sets.length > 0) {
    values.push(id);
    await c.env.SYSTEM_DB.prepare(
      `UPDATE _apiTokens SET ${sets.join(", ")} WHERE id = ?`,
    )
      .bind(...values)
      .run();
  }

  const row = await c.env.SYSTEM_DB.prepare(
    `SELECT id, name, prefix, scopes, collection_scope, created_by,
            created_at, last_used_at, expires_at, revoked_at
       FROM _apiTokens WHERE id = ?`,
  )
    .bind(id)
    .first();
  return c.json({ token: row });
});

// ─────────────────────────────────────────────────────────────
//  DELETE /api/core/api-tokens/:id — revoke (or hard-delete)
// ─────────────────────────────────────────────────────────────
apiTokensRouter.delete("/:id", requireAuth, requireRole("admin"), async (c) => {
  const id = c.req.param("id");
  const permanent = c.req.query("permanent") === "1";

  const existing = await c.env.SYSTEM_DB.prepare(
    `SELECT id, revoked_at FROM _apiTokens WHERE id = ?`,
  )
    .bind(id)
    .first<{ id: string; revoked_at: number | null }>();
  if (!existing) return c.json({ error: "not_found" }, 404);

  if (permanent) {
    await c.env.SYSTEM_DB.prepare(`DELETE FROM _apiTokens WHERE id = ?`)
      .bind(id)
      .run();
    return c.json({ success: true, permanent: true });
  }

  // Soft revoke — set revoked_at if not already set.
  if (existing.revoked_at == null) {
    await c.env.SYSTEM_DB.prepare(
      `UPDATE _apiTokens SET revoked_at = ? WHERE id = ?`,
    )
      .bind(Date.now(), id)
      .run();
  }
  return c.json({ success: true, revoked: true });
});

// ─────────────────────────────────────────────────────────────
//  Exported helpers — used by the records API to resolve tokens
// ─────────────────────────────────────────────────────────────

/**
 * Look up an API token by its raw value. Returns the row + whether it is
 * currently usable. Performs no scope decision — the caller checks scope.
 */
export async function resolveApiToken(
  db: D1Database,
  rawToken: string,
): Promise<{
  id: string;
  name: string;
  scopes: ApiTokenScope;
  collectionScope: string | null;
  prefix: string;
} | null> {
  const hash = await hashApiToken(rawToken);
  const row = await db
    .prepare(
      `SELECT id, name, prefix, scopes, collection_scope, revoked_at, expires_at
         FROM _apiTokens WHERE token_hash = ?`,
    )
    .bind(hash)
    .first<{
      id: string;
      name: string;
      prefix: string;
      scopes: string;
      collection_scope: string | null;
      revoked_at: number | null;
      expires_at: number | null;
    }>();
  if (!row) return null;

  // Revoked or expired → treat as invalid.
  if (row.revoked_at != null) return null;
  if (row.expires_at != null && row.expires_at < Date.now()) return null;

  return {
    id: row.id,
    name: row.name,
    prefix: row.prefix,
    scopes: row.scopes as ApiTokenScope,
    collectionScope: row.collection_scope,
  };
}

/** Stamp `last_used_at` on a token (fire-and-forget via waitUntil). */
export function touchApiToken(db: D1Database, id: string): Promise<void> {
  return db
    .prepare(`UPDATE _apiTokens SET last_used_at = ? WHERE id = ?`)
    .bind(Date.now(), id)
    .run()
    .then(() => undefined)
    .catch(() => undefined);
}

export { strip as _stripApiTokenRow };
