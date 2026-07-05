import { Hono } from "hono";
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
