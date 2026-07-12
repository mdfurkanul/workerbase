/**
 * WorkerBase Cloudflare bindings.
 * Bound via wrangler.jsonc — keep these names in sync.
 */
export interface Env {
  /**
   * D1 — the single WorkerBase database. Holds both system tables
   * (underscore-prefixed: _superusers, _tokens, _collections, _logs, …)
   * and user-created collection tables (which must NOT start with `_`).
   */
  SYSTEM_DB: D1Database;
  /** R2 — blob / file storage. */
  STORAGE: R2Bucket;
  /** Durable Objects — one RealtimeHub instance per collection name. */
  REALTIME: DurableObjectNamespace;
  /** Durable Object — single global RateLimiter instance for rate limit counters. */
  RATE_LIMITER: DurableObjectNamespace;
  /**
   * Cloudflare Email Service binding. Simulated locally by `wrangler dev`
   * (email content is logged to console + written to temp files). Optional
   * so the app degrades gracefully when email sending isn't configured.
   */
  EMAIL?: SendEmailBinding;
  /** HMAC secret used to sign/verify session tokens. Set in `.dev.vars`. */
  AUTH_SECRET: string;
  /** Set by wrangler.jsonc `vars` — "local" | "preprod" | "prod". */
  ENVIRONMENT?: string;
  /**
   * Base URL of the dashboard for email links. In local dev this should
   * point at the Vite dev server (e.g. http://localhost:5173) because the
   * Worker's serveStatic can't serve the SPA from wrangler dev. When unset,
   * email links fall back to the request origin (correct for production
   * where the Worker serves the built dashboard).
   */
  DASHBOARD_URL?: string;
  /**
   * Comma-separated list of origins permitted to make cross-origin browser
   * requests to this Worker's API (CORS). Used when the dashboard is
   * deployed to a different origin than the backend (split-Worker mode).
   * If unset, falls back to `DASHBOARD_URL` (so the common case — one
   * dashboard origin — works without an extra var). Same-origin requests
   * pass through untouched regardless of this setting.
   *
   * Example: "https://app.example.com,https://staging.example.com"
   */
  CORS_ORIGINS?: string;
}

/**
 * Cloudflare Email Service `send_email` binding shape.
 * The `.send()` method accepts a message descriptor and resolves to an
 * object containing the assigned `messageId`.
 *
 * @see https://developers.cloudflare.com/email-service/local-development/sending/
 */
export interface SendEmailBinding {
  send(message: EmailMessage): Promise<{ messageId: string }>;
}

/** Message payload accepted by {@link SendEmailBinding.send}. */
export interface EmailMessage {
  to: string;
  from: string;
  subject: string;
  html?: string;
  text?: string;
}

/** Hono context variable bag carrying the request Env + execution context. */
export interface WorkerContext {
  env: Env;
  ctx: ExecutionContext;
}
