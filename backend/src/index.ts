import { Hono } from "hono";
import { serveStatic } from "hono/cloudflare-workers";
import type { Env } from "./env.js";
import {
  superuserAuthRouter,
  collectionsRouter,
  sqlQueriesRouter,
  realtimeRouter,
} from "./core/index.js";

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
 *   /api/core/collections/*   — collection CRUD
 *   /api/core/sql/*           — saved SQL queries
 *   /api/core/realtime/*      — WebSocket upgrades
 */
const core = new Hono<{ Bindings: Env }>();
core.route("/superusers", superuserAuthRouter);
core.route("/collections", collectionsRouter);
core.route("/sql", sqlQueriesRouter);
core.route("/realtime", realtimeRouter);

app.route("/api/core", core);

// Unmatched /api/* must NOT serve the SPA index.html.
app.all("/api/*", (c) => c.json({ error: "not found" }, 404));

// Dashboard assets compiled by Vite into ./public.
app.use("/*", serveStatic({ root: "./public" }));

// SPA fallback for client-side routing.
app.get("/*", serveStatic({ root: "./public", path: "./index.html" }));

export default app;
