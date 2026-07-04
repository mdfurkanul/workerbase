/**
 * Export router.
 *
 * Mounted at `/api/core/export`:
 *   POST /  — accepts { collections, limit?, includeSystem? } and returns
 *             every requested collection's schema + rows as a single JSON
 *             payload. The frontend handles format conversion (JSON/CSV/
 *             XLSX/SQL) so the Worker stays small.
 *
 * The endpoint never writes anything — it's a read-only bulk dump.
 */

import { Hono } from "hono";
import { z } from "zod";
import type { Env } from "../../env.js";
import { requireAuth } from "../../auth/middleware.js";

export const exportRouter = new Hono<{ Bindings: Env }>();

const bodySchema = z.object({
  /** Either the literal "all", or an explicit list of collection names. */
  collections: z.union([z.literal("all"), z.array(z.string().min(1).max(128)).min(1)]),
  /** Cap rows per collection (global default). Number → LIMIT; null → all rows. */
  limit: z.union([z.number().int().min(1).max(1_000_000), z.null()]).optional(),
  /**
   * Per-collection overrides. Keys are collection names; values follow
   * the same shape as `limit` (number → cap, null → no cap). Takes
   * precedence over the global `limit` for that collection.
   *
   * Example: { "posts": 100, "users": null }
   */
  limits: z
    .record(z.string(), z.union([z.number().int().min(1).max(1_000_000), z.null()]))
    .optional(),
  /** Include underscore-prefixed system tables. Default false. */
  includeSystem: z.boolean().optional(),
  /**
   * Optional per-collection column projection. Keys are collection
   * names; values are the column names to include. Columns not in the
   * list are dropped from both `schema` and `rows` in the response.
   * Absent / empty value → all columns.
   *
   * Example: { "posts": ["id", "title"] }
   */
  columns: z.record(z.string(), z.array(z.string().min(1)).default([])).optional(),
});

interface ExportRow {
  [key: string]: unknown;
}

/* ── POST / — bulk dump ──────────────────────────────────────────── */
exportRouter.post("/", requireAuth, async (c) => {
  let body: unknown;
  try {
    const raw = await c.req.text();
    body = raw ? JSON.parse(raw) : {};
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "validation_failed", issues: parsed.error.flatten() }, 400);
  }

  const {
    collections: requested,
    limit = 1000,
    limits: perCollectionLimits,
    includeSystem = false,
  } = parsed.data;
  // null = no LIMIT clause (export every row). number = hard cap.
  const globalLimitClause = limit === null ? null : limit;
  const db = c.env.SYSTEM_DB;

  // Pull the metadata (type, schema) for every collection in one query.
  const metaRows = await db
    .prepare(`SELECT name, type, schema FROM _collections`)
    .all<{ name: string; type: string; schema: string | null }>();
  const metaByName = new Map(
    (metaRows.results ?? []).map((r) => [
      r.name,
      { type: r.type, schema: r.schema },
    ]),
  );

  // Discover physical tables + views from sqlite_master so we capture
  // collections that might exist in D1 without a metadata row.
  const tableRows = await db
    .prepare(`SELECT name, type FROM sqlite_master WHERE type IN ('table','view')`)
    .all<{ name: string; type: string }>();
  const allNames = (tableRows.results ?? [])
    .map((r) => r.name)
    .filter((n) => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(n))
    // Skip sqlite internal tables.
    .filter((n) => !n.startsWith("sqlite_"))
    // Default: skip system tables (underscore-prefixed) unless asked.
    .filter((n) => includeSystem || !n.startsWith("_"));

  // Resolve the final target list.
  const targetNames =
    requested === "all"
      ? allNames.sort()
      : requested.filter((n) => allNames.includes(n));

  if (targetNames.length === 0) {
    return c.json({
      error: "no_collections",
      detail: "None of the requested collections exist.",
    }, 400);
  }

  // For each target, fetch rows + PRAGMA schema as a fallback when no
  // stored schema exists. Run sequentially to keep D1 batch pressure low.
  const out: Array<{
    name: string;
    type: string;
    schema: { name: string; type: string }[];
    rowCount: number;
    rows: ExportRow[];
  }> = [];

  for (const name of targetNames) {
    // Determine schema — prefer stored metadata, fall back to PRAGMA.
    const meta = metaByName.get(name);
    let schema: { name: string; type: string }[] = [];
    if (meta?.schema) {
      try {
        schema = (JSON.parse(meta.schema) as Array<{ name: string; type: string }>).map((f) => ({
          name: f.name,
          type: f.type,
        }));
      } catch {
        schema = [];
      }
    }
    if (schema.length === 0) {
      try {
        const { results } = await db.prepare(`PRAGMA table_info("${name}")`).all();
        schema = (results ?? [])
          .filter((r) => typeof (r as { name?: unknown }).name === "string")
          .map((r) => {
            const row = r as { name: string; type?: string };
            return { name: row.name, type: (row.type || "text").toLowerCase() };
          });
      } catch {
        schema = [];
      }
    }

    const declaredType =
      meta?.type ?? (name.startsWith("_") ? "system" : "base");

    // Apply optional column projection. The requested set is intersected
    // with the live schema (anything not in the schema is dropped —
    // avoids SQL injection via raw column names from the client).
    const requestedCols = parsed.data.columns?.[name];
    const colSet = Array.isArray(requestedCols) && requestedCols.length > 0
      ? new Set(requestedCols)
      : null;
    const projectedSchema = colSet
      ? schema.filter((f) => colSet.has(f.name))
      : schema;

    // Fallback: if the projection requested every live column be dropped
    // (e.g. typo), keep the full schema so the export isn't empty.
    const finalSchema = projectedSchema.length > 0 ? projectedSchema : schema;

    // Build SELECT list. Names are validated against `finalSchema` so they
    // are safe to inline — never interpolate raw user input.
    const selectList = finalSchema.map((f) => `"${f.name}"`).join(", ") || "*";

    // Per-collection limit overrides the global default when present.
    const collectionLimit =
      perCollectionLimits && name in perCollectionLimits
        ? perCollectionLimits[name]
        : globalLimitClause;

    // Fetch rows. Cap by limit unless the caller asked for everything.
    let rows: ExportRow[] = [];
    try {
      if (collectionLimit === null) {
        const res = await db
          .prepare(`SELECT ${selectList} FROM "${name}"`)
          .all<ExportRow>();
        rows = (res.results ?? []) as ExportRow[];
      } else {
        const res = await db
          .prepare(`SELECT ${selectList} FROM "${name}" LIMIT ?`)
          .bind(collectionLimit)
          .all<ExportRow>();
        rows = (res.results ?? []) as ExportRow[];
      }
    } catch {
      // Table might be locked or unreadable — skip but keep going.
      rows = [];
    }

    out.push({
      name,
      type: declaredType,
      schema: finalSchema,
      rowCount: rows.length,
      rows,
    });
  }

  return c.json({
    meta: {
      exportedAt: new Date().toISOString(),
      limit: globalLimitClause,
      limits: perCollectionLimits ?? null,
      includeSystem,
      collectionCount: out.length,
    },
    collections: out,
  });
});
