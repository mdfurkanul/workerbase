import { describe, it, expect, beforeEach } from "vitest";
import { Hono } from "hono";
import { corsMiddleware } from "../../src/middleware/cors.js";
import {
  invalidateDeploySettingsCache,
  readDeploySettings,
} from "../../src/core/settings/deploymentSettings.js";
import type { Env } from "../../src/env.js";

/**
 * CORS middleware — covers split-Worker browser preflight + actual
 * requests. Same-origin requests must pass through untouched.
 *
 * The middleware now reads `_settings.deploy.corsOrigins` from D1 before
 * falling back to env vars. Tests inject a mock D1 that returns `null`
 * (no deploy settings stored) so env vars are the source of truth, then
 * pre-seed the in-memory cache to skip the D1 round-trip.
 */

/** Mock D1 — `.prepare(...).bind(...).first()` resolves to null. */
function mockDb() {
  const stmt = {
    bind: () => ({
      first: async () => null,
    }),
  };
  return {
    prepare: () => stmt,
  };
}

/** Build a minimal Hono app with only the CORS middleware + one route. */
function makeApp() {
  const app = new Hono<{ Bindings: Env }>();
  app.use("*", corsMiddleware);
  app.all("/api/ping", (c) => c.json({ ok: true }));
  return app;
}

/** Fetch helper that injects mock env bindings into the Hono context. */
async function fetchApp(
  app: Hono<{ Bindings: Env }>,
  url: string,
  init: RequestInit = {},
  env: Partial<Env> = {},
): Promise<Response> {
  // Pre-warm the deploy-settings cache so the middleware doesn't hit D1.
  // Both the test and the middleware share the module-level cache.
  await readDeploySettings(mockDb() as unknown as D1Database);
  return await app.request(url, init, { SYSTEM_DB: mockDb() as any, ...env } as Env);
}

beforeEach(() => {
  invalidateDeploySettingsCache();
});

describe("corsMiddleware — preflight OPTIONS", () => {
  // 1. Happy path — allowed origin gets full CORS headers + 204
  it("allows a preflight from an explicitly listed origin", async () => {
    const app = makeApp();
    const res = await fetchApp(
      app,
      "https://api.example.com/api/ping",
      {
        method: "OPTIONS",
        headers: {
          Origin: "https://app.example.com",
          "Access-Control-Request-Method": "POST",
          "Access-Control-Request-Headers": "authorization, content-type",
        },
      },
      { CORS_ORIGINS: "https://app.example.com" },
    );
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(
      "https://app.example.com",
    );
    expect(res.headers.get("Access-Control-Allow-Methods")).toContain("POST");
    expect(res.headers.get("Access-Control-Allow-Headers")).toContain(
      "Authorization",
    );
    expect(res.headers.get("Vary")).toContain("Origin");
    expect(res.headers.get("Access-Control-Max-Age")).toBeTruthy();
  });

  // 2. Disallowed origin — 204 (still returns) but no CORS headers
  it("returns 204 with no CORS headers for a disallowed origin", async () => {
    const app = makeApp();
    const res = await fetchApp(
      app,
      "https://api.example.com/api/ping",
      {
        method: "OPTIONS",
        headers: { Origin: "https://evil.example.org" },
      },
      { CORS_ORIGINS: "https://app.example.com" },
    );
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });

  // 3. Falls back to DASHBOARD_URL when CORS_ORIGINS is unset
  it("falls back to DASHBOARD_URL when CORS_ORIGINS is unset", async () => {
    const app = makeApp();
    const res = await fetchApp(
      app,
      "https://api.example.com/api/ping",
      {
        method: "OPTIONS",
        headers: { Origin: "http://localhost:5173" },
      },
      { DASHBOARD_URL: "http://localhost:5173" },
    );
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(
      "http://localhost:5173",
    );
  });

  // 4. Edge — no Origin header (same-origin / non-browser): passthrough, 204
  it("returns 204 with no CORS headers when no Origin is sent", async () => {
    const app = makeApp();
    const res = await fetchApp(
      app,
      "https://api.example.com/api/ping",
      { method: "OPTIONS" },
      { CORS_ORIGINS: "https://app.example.com" },
    );
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });

  // 5. Edge — multiple origins in CORS_ORIGINS, trailing slash normalized
  it("accepts any origin from a comma-separated list and strips trailing slashes", async () => {
    const app = makeApp();
    const res = await fetchApp(
      app,
      "https://api.example.com/api/ping",
      {
        method: "OPTIONS",
        headers: { Origin: "https://staging.example.com/" },
      },
      { CORS_ORIGINS: "https://app.example.com, https://staging.example.com/" },
    );
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(
      "https://staging.example.com",
    );
  });
});

describe("corsMiddleware — actual requests", () => {
  // 1. Happy path — cross-origin GET attaches Allow-Origin and continues
  it("attaches CORS headers on a cross-origin GET and runs downstream", async () => {
    const app = makeApp();
    const res = await fetchApp(
      app,
      "https://api.example.com/api/ping",
      { headers: { Origin: "https://app.example.com" } },
      { CORS_ORIGINS: "https://app.example.com" },
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(
      "https://app.example.com",
    );
  });

  // 2. Same-origin — no CORS headers emitted
  it("emits no CORS headers when no Origin header is present (same-origin)", async () => {
    const app = makeApp();
    const res = await fetchApp(
      app,
      "https://api.example.com/api/ping",
      {},
      { CORS_ORIGINS: "https://app.example.com" },
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });

  // 3. Auth failure scenario — disallowed origin gets no Allow-Origin
  it("attaches no Allow-Origin header for a disallowed origin on actual requests", async () => {
    const app = makeApp();
    const res = await fetchApp(
      app,
      "https://api.example.com/api/ping",
      { headers: { Origin: "https://evil.example.org" } },
      { CORS_ORIGINS: "https://app.example.com" },
    );
    // Downstream still runs; browser will just block the JS from reading it.
    expect(res.status).toBe(200);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });

  // 4. Edge — no CORS config at all: app keeps working for same-origin
  it("works fine with no CORS env at all (single-Worker mode)", async () => {
    const app = makeApp();
    const res = await fetchApp(app, "https://api.example.com/api/ping");
    expect(res.status).toBe(200);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });

  // 5. Edge — POST with JSON body through CORS path
  it("passes through POST requests with Authorization + Content-Type headers", async () => {
    const app = makeApp();
    const res = await fetchApp(
      app,
      "https://api.example.com/api/ping",
      {
        method: "POST",
        headers: {
          Origin: "https://app.example.com",
          "Content-Type": "application/json",
          Authorization: "Bearer test-token",
        },
        body: JSON.stringify({ hi: 1 }),
      },
      { CORS_ORIGINS: "https://app.example.com" },
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(
      "https://app.example.com",
    );
  });
});
