import { Hono } from "hono";
import { serveStatic } from "hono/cloudflare-workers";
import type { Env } from "./env.js";
import { collectionsRouter } from "./routes/collections.js";
import { realtimeRouter } from "./routes/realtime.js";
import { authRouter } from "./routes/auth.js";

// Re-export the DO class so Wrangler can locate it via `main`.
export { RealtimeHub } from "./realtime/RealtimeHub.js";

const app = new Hono<{ Bindings: Env }>();

/**
 * Route registration order is critical:
 *   1. /api/*        — API surface, never falls through to the SPA.
 *   2. unmatched API — hard 404 so it doesn't bleed into the dashboard.
 *   3. /*            — dashboard static assets emitted by Vite into ./public.
 */
const api = new Hono<{ Bindings: Env }>();
api.route("/auth", authRouter);
api.route("/collections", collectionsRouter);
api.route("/realtime", realtimeRouter);

app.route("/api", api);

// Unmatched /api/* must NOT serve the SPA index.html.
app.all("/api/*", (c) => c.json({ error: "not found" }, 404));

// Dashboard assets compiled by Vite into ./public.
app.use("/*", serveStatic({ root: "./public" }));

// SPA fallback for client-side routing.
app.get("/*", serveStatic({ root: "./public", path: "./index.html" }));

export default app;
