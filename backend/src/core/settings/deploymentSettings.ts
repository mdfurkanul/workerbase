/**
 * Deployment-origin settings — the dashboard URL + CORS allow-list.
 *
 * These are read on every request by the CORS middleware and on every
 * auth email send, so they need to be cheap. Two-layer resolution:
 *   1. `_settings` in D1 (configurable from the Settings UI)
 *   2. env vars (`CORS_ORIGINS` / `DASHBOARD_URL`) — deploy-time fallback
 *
 * The D1 read is cached in-memory for `CACHE_TTL_MS` (30s) so hot loops
 * don't pay a round-trip per request. A `Symbol`-keyed module-level
 * cache survives across requests within the same isolate.
 */
import type { Env } from "../../env.js";

const DEPLOY_SETTINGS_KEY = "deploy";
const CACHE_TTL_MS = 30_000;

interface DeploySettings {
  dashboardUrl: string;
  corsOrigins: string;
}

interface CacheEntry {
  at: number;
  value: DeploySettings;
}

// Module-level cache. One per Worker isolate.
let cache: CacheEntry | null = null;

function empty(): DeploySettings {
  return { dashboardUrl: "", corsOrigins: "" };
}

/** Read the deploy settings from D1, cached for CACHE_TTL_MS. */
export async function readDeploySettings(
  db: D1Database,
): Promise<DeploySettings> {
  const now = Date.now();
  if (cache && now - cache.at < CACHE_TTL_MS) {
    return cache.value;
  }

  let parsed: Partial<DeploySettings> = {};
  try {
    const row = await db
      .prepare(`SELECT value FROM _settings WHERE key = ?`)
      .bind(DEPLOY_SETTINGS_KEY)
      .first<{ value: string | null }>();
    if (row?.value) parsed = JSON.parse(row.value) as Partial<DeploySettings>;
  } catch {
    // _settings missing or corrupt — fall through to env-only resolution.
  }

  const value: DeploySettings = {
    dashboardUrl:
      typeof parsed.dashboardUrl === "string" ? parsed.dashboardUrl : "",
    corsOrigins:
      typeof parsed.corsOrigins === "string" ? parsed.corsOrigins : "",
  };
  cache = { at: now, value };
  return value;
}

/** Invalidate the in-memory cache — call after a PATCH to _settings.deploy. */
export function invalidateDeploySettingsCache(): void {
  cache = null;
}

/**
 * Resolve the dashboard base URL — used for email-link redirects.
 * Precedence: `_settings.dashboardUrl` → `env.DASHBOARD_URL` → request origin.
 */
export async function resolveDashboardUrl(
  db: D1Database,
  env: Env,
  requestOrigin: string,
): Promise<string> {
  const settings = await readDeploySettings(db);
  return (
    settings.dashboardUrl ||
    env.DASHBOARD_URL?.replace(/\/$/, "") ||
    requestOrigin
  );
}

/**
 * Resolve the list of allowed CORS origins.
 * Precedence: `_settings.corsOrigins` → `env.CORS_ORIGINS` → `env.DASHBOARD_URL`.
 * Returns a Set of normalized origins (no trailing slashes).
 */
export async function resolveCorsOrigins(
  db: D1Database,
  env: Env,
): Promise<Set<string>> {
  const settings = await readDeploySettings(db);
  const raw =
    settings.corsOrigins || env.CORS_ORIGINS || env.DASHBOARD_URL || "";
  const list = raw
    .split(",")
    .map((s) => s.trim().replace(/\/$/, ""))
    .filter((s) => s.length > 0);
  return new Set(list);
}
