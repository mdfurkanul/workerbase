-- Migration: API tokens table.
--
-- Long-lived, revocable personal access tokens (PATs) used to access
-- the public records API (/api/collections/*) without going through
-- the per-collection user auth flow. Tokens are opaque random strings
-- prefixed with `wbs_`; only the SHA-256 hash is stored here so a DB
-- leak cannot recover usable tokens.

CREATE TABLE IF NOT EXISTS "_apiTokens" (
  "id"               TEXT PRIMARY KEY NOT NULL,
  "name"             TEXT NOT NULL,                     -- user-supplied label
  "token_hash"       TEXT NOT NULL UNIQUE,              -- SHA-256 hex of the raw token
  "prefix"           TEXT NOT NULL,                     -- first 10 chars (sans wbs_) for UI display
  "scopes"           TEXT NOT NULL DEFAULT 'read',      -- 'read' | 'write' | 'admin'
  "collection_scope" TEXT,                              -- NULL = all collections; else restrict to one name
  "created_by"       TEXT NOT NULL,                     -- superuser id
  "created_at"       INTEGER NOT NULL,
  "last_used_at"     INTEGER,
  "expires_at"       INTEGER,                           -- NULL = never expires
  "revoked_at"       INTEGER                            -- NULL = active; set when revoked
);

CREATE INDEX IF NOT EXISTS "_apiTokens_hash_idx"       ON "_apiTokens" ("token_hash");
CREATE INDEX IF NOT EXISTS "_apiTokens_created_by_idx" ON "_apiTokens" ("created_by");
