-- Migration: bootstrap all system tables.
--
-- This migration creates every _-prefixed system table in one pass so the
-- Worker is fully operational after `wrangler d1 migrations apply`.

-- ─── _superusers — dashboard / admin panel access ───────────────────
CREATE TABLE IF NOT EXISTS "_superusers" (
  "id"            TEXT PRIMARY KEY NOT NULL,
  "email"         TEXT NOT NULL UNIQUE,
  "password_hash" TEXT NOT NULL,
  "password_salt" TEXT NOT NULL,
  "token_key"     TEXT NOT NULL DEFAULT '',
  "verified"      INTEGER NOT NULL DEFAULT 0,
  "role"          TEXT NOT NULL DEFAULT 'admin',
  "prefs"         TEXT,
  "created_at"    INTEGER NOT NULL,
  "updated_at"    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS "_superusers_email_idx" ON "_superusers" ("email");

-- ─── _externalAuths — OAuth2 provider links ──────────────────────────
CREATE TABLE IF NOT EXISTS "_externalAuths" (
  "id"             TEXT PRIMARY KEY NOT NULL,
  "collection_ref" TEXT NOT NULL,
  "record_ref"     TEXT NOT NULL,
  "provider"       TEXT NOT NULL,
  "provider_id"    TEXT NOT NULL,
  "access_token"   TEXT,
  "refresh_token"  TEXT,
  "expires_at"     INTEGER,
  "created_at"     INTEGER NOT NULL,
  "updated_at"     INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS "_externalAuths_provider_idx"
  ON "_externalAuths" ("provider", "provider_id");
CREATE INDEX IF NOT EXISTS "_externalAuths_user_idx"
  ON "_externalAuths" ("collection_ref", "record_ref");

-- ─── _settings — global application settings (key-value) ────────────
CREATE TABLE IF NOT EXISTS "_settings" (
  "key"        TEXT PRIMARY KEY NOT NULL,
  "value"      TEXT,
  "updated_at" INTEGER NOT NULL
);

-- ─── _tokens — password reset / email verification / OTP ────────────
CREATE TABLE IF NOT EXISTS "_tokens" (
  "id"             TEXT PRIMARY KEY NOT NULL,
  "collection_ref" TEXT NOT NULL,
  "record_ref"     TEXT NOT NULL,
  "type"           TEXT NOT NULL,
  "value"          TEXT NOT NULL,
  "expires_at"     INTEGER NOT NULL,
  "consumed"       INTEGER NOT NULL DEFAULT 0,
  "created_at"     INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS "_tokens_lookup_idx"
  ON "_tokens" ("collection_ref", "record_ref", "type");

-- ─── _db_migrations — tracks dynamic schema changes (ALTER TABLE etc.) ─
CREATE TABLE IF NOT EXISTS "_db_migrations" (
  "id"               TEXT PRIMARY KEY NOT NULL,
  "collection_name"  TEXT NOT NULL,
  "sql"              TEXT NOT NULL,
  "status"           TEXT NOT NULL DEFAULT 'applied',
  "applied_at"       INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS "_db_migrations_collection_idx"
  ON "_db_migrations" ("collection_name");

-- ─── _logs — request log entries ────────────────────────────────────
CREATE TABLE IF NOT EXISTS "_logs" (
  "id"           TEXT PRIMARY KEY NOT NULL,
  "level"        TEXT NOT NULL DEFAULT 'info',
  "method"       TEXT NOT NULL,
  "path"         TEXT NOT NULL,
  "status"       INTEGER NOT NULL,
  "duration_ms"  INTEGER NOT NULL,
  "ip"           TEXT,
  "user_agent"   TEXT,
  "error"        TEXT,
  "request_by"   TEXT,
  "created_at"   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS "_logs_created_idx" ON "_logs" ("created_at");
CREATE INDEX IF NOT EXISTS "_logs_level_idx"   ON "_logs" ("level");
