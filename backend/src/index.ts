import { Hono, type Context } from "hono";
import { serveStatic } from "hono/cloudflare-workers";
import type { Env } from "./env.js";
import {
  superuserAuthRouter,
  externalAuthRouter,
  collectionsRouter,
  sqlQueriesRouter,
  realtimeRouter,
  installRouter,
  storageRouter,
  recordsRouter,
  settingsRouter,
  exportRouter,
  importRouter,
  backupsRouter,
  logsRouter,
  apiTokensRouter,
  recordRequest,
  levelFromStatus,
} from "./core/index.js";
import { runAutoBackupIfNeeded } from "./core/backups/backupsRouter.js";

// Re-export the DO class so Wrangler can locate it via `main`.
export { RealtimeHub } from "./realtime/RealtimeHub.js";

const app = new Hono<{ Bindings: Env }>();

// ── Security headers ──────────────────────────────────────────────
app.use("*", async (c, next) => {
  await next();
  c.header("X-Content-Type-Options", "nosniff");
  c.header("X-Frame-Options", "DENY");
  c.header("Referrer-Policy", "strict-origin-when-cross-origin");
  c.header("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  c.header("Permissions-Policy", "geolocation=(), microphone=(), camera=()");
});

// ── Request logging ───────────────────────────────────────────────
// Only requests against USER-CREATED collections are logged to `_logs`.
// System/admin routes (/api/core/superusers, /api/core/settings,
// /api/core/backups, /api/core/sql, the collections-metadata CRUD itself,
// etc.) and internal underscore-prefixed tables (_settings, _superusers…)
// are intentionally skipped to keep the log focused on actual data access.
//
// Concretely, a row is written when the path matches one of:
//   /api/core/collections/<name>/records/*   (admin records API)
//   /api/collections/<name>/records/*        (public records API)
//   /api/collections/<name>/auth/*           (collection auth API)
// where <name> does NOT start with `_` (so internal tables are excluded).
//
// Trim+persist logic lives in `recordRequest`; the write runs via
// `waitUntil` so the response is never blocked.
app.use("/api/*", async (c, next) => {
  // performance.now() gives sub-ms monotonic timing — Date.now() in the
  // Workers runtime is deliberately coarsened to ~5ms to mitigate
  // Spectre-class timing attacks, so every duration measured with it
  // comes out suspiciously round (0, 5, 10, 15…).
  const startPerf = performance.now();
  // Capture the absolute timestamp at request START — not later inside
  // the waitUntil callback, which fires after the response is already
  // out the door and can lag by several milliseconds.
  const startedAt = Date.now();
  await next();
  const path = new URL(c.req.url).pathname;
  if (!shouldLogPath(path)) return;
  const status = c.res.status ?? 200;
  const durationMs = Math.round((performance.now() - startPerf) * 1000) / 1000;

  // Identify who triggered the request. Auth middleware (requireAuth,
  // optionalAuth, requireCollectionAuth) runs during `await next()` and
  // sets context variables. We read them here — after next() returns —
  // so the identity is available regardless of which router handled it.
  const requestBy = resolveRequestBy(c);

  c.executionCtx.waitUntil(
    recordRequest(c.env, {
      level: levelFromStatus(status),
      method: c.req.method,
      path,
      status,
      durationMs,
      startedAt,
      requestBy,
      ip: c.req.header("CF-Connecting-IP") ?? c.req.header("X-Forwarded-For") ?? null,
      userAgent: c.req.header("User-Agent") ?? null,
      error: null,
    }),
  );
});

/**
 * Resolve the identity of the caller for logging purposes.
 *
 * Checks the Hono context variables set by auth middleware:
 *   - Superuser JWT → `c.get("user")` (TokenPayload with email)
 *   - Collection-auth JWT → `c.get("authRecord")` (CollectionTokenPayload)
 *
 * Falls back to "anonymous" for public routes, unauthenticated requests,
 * or invalid/expired tokens (where no middleware set a variable).
 */
function resolveRequestBy(c: Context): string {
  // Superuser — set by requireAuth / optionalAuth.
  try {
    const user = c.get("user" as never) as
      | { email?: string; sub?: string }
      | undefined;
    if (user?.email) return user.email;
  } catch {
    /* not set */
  }

  // Collection-auth user — set by requireCollectionAuth.
  try {
    const authRecord = c.get("authRecord" as never) as
      | { collection?: string; recordId?: string }
      | undefined;
    if (authRecord?.collection && authRecord?.recordId) {
      return `${authRecord.collection}/${authRecord.recordId}`;
    }
  } catch {
    /* not set */
  }

  return "anonymous";
}

/**
 * Decide whether a request path should be logged to `_logs`.
 *
 * Returns true only for data-access routes on a user-created collection
 * (records CRUD on the admin or public API, and collection-auth flows).
 * Underscore-prefixed names (`_settings`, `_superusers`, …) are treated
 * as internal and excluded.
 */
function shouldLogPath(path: string): boolean {
  // Fast reject: must be under /api/.
  if (!path.startsWith("/api/")) return false;

  // Admin records API: /api/core/collections/<name>/records[/*]
  const admin = path.match(/^\/api\/core\/collections\/([^/]+)\/records(?:\/|$)/);
  if (admin) {
    return !isAdminNamespace(admin[1]!);
  }

  // Public client API: /api/collections/<name>/records[/*] or /auth[/*]
  const pub = path.match(/^\/api\/collections\/([^/]+)\/(?:records|auth)(?:\/|$)/);
  if (pub) {
    return !isAdminNamespace(pub[1]!);
  }

  return false;
}

/** Underscore-prefixed names are internal system tables, not user collections. */
function isAdminNamespace(name: string): boolean {
  return name.startsWith("_");
}

/**
 * All system APIs live under /api/core/*.
 *
 *   /api/core/superusers/*    — superuser auth + management
 *   /api/core/collections/*   — admin collection CRUD + records
 *   /api/core/sql/*           — saved SQL queries
 *   /api/core/realtime/*      — WebSocket upgrades
 *   /api/core/install/*       — first-run install flow
 *   /api/core/storage/*       — R2 file storage (admin)
 *   /api/core/settings/*      — global app settings (admin)
 *   /api/core/export/*        — bulk data export (admin)
 *   /api/core/import/*        — bulk data import (admin)
 *   /api/core/backups/*       — DB snapshot backup + time-travel restore (admin)
 *   /api/core/api-tokens/*    — personal access tokens for the records API (admin)
 */
const core = new Hono<{ Bindings: Env }>();
core.route("/superusers", superuserAuthRouter);
core.route("/collections", collectionsRouter);
core.route("/sql", sqlQueriesRouter);
core.route("/realtime", realtimeRouter);
core.route("/install", installRouter);
core.route("/storage", storageRouter);
core.route("/settings", settingsRouter);
core.route("/export", exportRouter);
core.route("/import", importRouter);
core.route("/backups", backupsRouter);
core.route("/logs", logsRouter);
core.route("/api-tokens", apiTokensRouter);

app.route("/api/core", core);

/**
 * Public client API — Supabase-style.
 *
 *   /api/collections/:name/auth/*     — register, login, verify, reset
 *   /api/collections/:name/records/*  — public/authenticated records
 */
const publicApi = new Hono<{ Bindings: Env }>();
publicApi.route("/", externalAuthRouter);
publicApi.route("/", recordsRouter);

app.route("/api/collections", publicApi);

// Unmatched /api/* must NOT serve the SPA index.html.
app.all("/api/*", (c) => c.json({ error: "not found" }, 404));

// Dashboard assets compiled by Vite into ./public.
app.use("/*", serveStatic({ root: "./public" }));

// SPA fallback for client-side routing.
app.get("/*", serveStatic({ root: "./public", path: "./index.html" }));

// ── Scheduled entry point (Cloudflare Cron Trigger) ────────────────
// Fires hourly per `triggers.crons` in wrangler.jsonc. Checks the
// backups settings to decide whether an automatic snapshot is due.
export default {
  fetch: app.fetch,
  scheduled: async (_event: ScheduledEvent, env: Env, ctx: ExecutionContext) => {
    ctx.waitUntil(
      (async () => {
        try {
          await runAutoBackupIfNeeded(env);
        } catch (err) {
          // Never crash the scheduled handler — log via Workers observability.
          console.error(
            "auto_backup_failed",
            err instanceof Error ? err.message : String(err),
          );
        }
      })(),
    );
  },
};
