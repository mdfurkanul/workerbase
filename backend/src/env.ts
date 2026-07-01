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
  /** HMAC secret used to sign/verify session tokens. Set in `.dev.vars`. */
  AUTH_SECRET: string;
  /** Set by wrangler.jsonc `vars` — "local" | "preprod" | "prod". */
  ENVIRONMENT?: string;
}

/** Hono context variable bag carrying the request Env + execution context. */
export interface WorkerContext {
  env: Env;
  ctx: ExecutionContext;
}
