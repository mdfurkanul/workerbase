-- Migration: bootstrap the _users authentication table.
CREATE TABLE IF NOT EXISTS "_users" (
  "id"            TEXT PRIMARY KEY NOT NULL,
  "email"         TEXT NOT NULL UNIQUE,
  "password_hash" TEXT NOT NULL,
  "password_salt" TEXT NOT NULL,
  "token_key"     TEXT NOT NULL DEFAULT '',
  "verified"      INTEGER NOT NULL DEFAULT 0,
  "created_at"    INTEGER NOT NULL,
  "updated_at"    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS "_users_email_idx" ON "_users" ("email");
