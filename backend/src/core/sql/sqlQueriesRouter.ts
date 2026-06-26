import { Hono } from "hono";
import { z } from "zod";
import type { Env } from "../../env.js";
import { requireAuth } from "../../auth/middleware.js";

/**
 * Saved SQL queries — CRUD for the SQL console.
 *
 *   GET    /api/sql/queries        — list all (newest first)
 *   GET    /api/sql/queries/:id    — single query
 *   POST   /api/sql/queries        — create
 *   PATCH  /api/sql/queries/:id    — update title / sql / lastRunAt
 *   DELETE /api/sql/queries/:id    — delete
 *
 * All endpoints require a valid superuser session.
 */

const createSchema = z.object({
  title: z.string().min(1).max(200),
  sql: z.string().min(1).max(8192),
});

const patchSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  sql: z.string().min(1).max(8192).optional(),
  lastRunAt: z.number().optional(),
});

export const sqlQueriesRouter = new Hono<{ Bindings: Env }>();

/** GET /api/sql/queries — list all saved queries, newest first. */
sqlQueriesRouter.get("/queries", requireAuth, async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT id, title, sql, created_by, last_run_at, created_at, updated_at
     FROM _sqlQueries ORDER BY updated_at DESC`,
  ).all();
  return c.json({ queries: results });
});

/** GET /api/sql/queries/:id — single saved query. */
sqlQueriesRouter.get("/queries/:id", requireAuth, async (c) => {
  const id = c.req.param("id");
  const row = await c.env.DB.prepare(
    `SELECT id, title, sql, created_by, last_run_at, created_at, updated_at
     FROM _sqlQueries WHERE id = ?`,
  )
    .bind(id)
    .first();
  if (!row) return c.json({ error: "not_found" }, 404);
  return c.json({ query: row });
});

/** POST /api/sql/queries — create a new saved query. */
sqlQueriesRouter.post("/queries", requireAuth, async (c) => {
  const user = c.get("user");

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

  const id = crypto.randomUUID();
  const now = Date.now();

  try {
    await c.env.DB.prepare(
      `INSERT INTO _sqlQueries (id, title, sql, created_by, last_run_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, NULL, ?, ?)`,
    )
      .bind(id, parsed.data.title, parsed.data.sql, user?.sub ?? null, now, now)
      .run();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({ error: "persist_failed", detail: msg }, 500);
  }

  return c.json(
    {
      id,
      title: parsed.data.title,
      sql: parsed.data.sql,
      created_by: user?.sub ?? null,
      last_run_at: null,
      created_at: now,
      updated_at: now,
    },
    201,
  );
});

/** PATCH /api/sql/queries/:id — update title / sql / lastRunAt. */
sqlQueriesRouter.patch("/queries/:id", requireAuth, async (c) => {
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

  // Check existence.
  const existing = await c.env.DB.prepare(
    `SELECT id FROM _sqlQueries WHERE id = ?`,
  )
    .bind(id)
    .first();
  if (!existing) return c.json({ error: "not_found" }, 404);

  // Build SET clause dynamically.
  const sets: string[] = [];
  const values: (string | number | null)[] = [];
  if (parsed.data.title !== undefined) {
    sets.push("title = ?");
    values.push(parsed.data.title);
  }
  if (parsed.data.sql !== undefined) {
    sets.push("sql = ?");
    values.push(parsed.data.sql);
  }
  if (parsed.data.lastRunAt !== undefined) {
    sets.push("last_run_at = ?");
    values.push(parsed.data.lastRunAt);
  }
  sets.push("updated_at = ?");
  values.push(Date.now());

  if (sets.length > 1) {
    values.push(id);
    await c.env.DB.prepare(
      `UPDATE _sqlQueries SET ${sets.join(", ")} WHERE id = ?`,
    )
      .bind(...values)
      .run();
  }

  const row = await c.env.DB.prepare(
    `SELECT id, title, sql, created_by, last_run_at, created_at, updated_at
     FROM _sqlQueries WHERE id = ?`,
  )
    .bind(id)
    .first();

  return c.json({ query: row });
});

/** DELETE /api/sql/queries/:id — permanently delete. */
sqlQueriesRouter.delete("/queries/:id", requireAuth, async (c) => {
  const id = c.req.param("id");

  const result = await c.env.DB.prepare(
    `DELETE FROM _sqlQueries WHERE id = ?`,
  )
    .bind(id)
    .run();

  // D1 doesn't expose affectedRows consistently; just return success.
  return c.json({ success: true });
});
