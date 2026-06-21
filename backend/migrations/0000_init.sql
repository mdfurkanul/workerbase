-- Migration: bootstrap the _collections system control table.
-- Required before the first POST /api/collections call succeeds.
CREATE TABLE IF NOT EXISTS "_collections" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "name" TEXT NOT NULL UNIQUE,
  "type" TEXT NOT NULL DEFAULT 'base',
  "schema" TEXT,
  "query" TEXT,
  "list_rule" TEXT,
  "create_rule" TEXT
);
