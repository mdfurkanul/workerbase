-- Migration: bootstrap the _collections system control table.
-- Required before the first POST /api/collections call succeeds.
CREATE TABLE IF NOT EXISTS "_collections" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "name" TEXT NOT NULL UNIQUE,
  "type" TEXT NOT NULL DEFAULT 'base',
  "schema" TEXT,
  "query" TEXT,
  "list_rule" TEXT,
  "create_rule" TEXT,
  "indexes" TEXT,
  "constraints" TEXT,
  "view_rule" TEXT,
  "update_rule" TEXT,
  "delete_rule" TEXT,
  "auth_config" TEXT,
  "email_templates" TEXT,
  "created_at" INTEGER NOT NULL DEFAULT 0,
  "updated_at" INTEGER NOT NULL DEFAULT 0
);
