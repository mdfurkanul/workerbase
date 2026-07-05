-- Migration: backups manifest table.
-- Reliable metadata store for DB snapshots. R2 holds the actual JSON
-- payloads under prefix `workerbase_db_backup/`; this table is the
-- source of truth for name / type / size / count / created_at so that
-- listing doesn't depend on R2 customMetadata propagation.

CREATE TABLE IF NOT EXISTS "_backups" (
  "id"           TEXT PRIMARY KEY NOT NULL,        -- filename without the workerbase_db_backup/ prefix
  "name"         TEXT NOT NULL DEFAULT '',          -- user-supplied display name
  "type"         TEXT NOT NULL DEFAULT 'manual',    -- 'manual' | 'auto'
  "size_bytes"   INTEGER NOT NULL DEFAULT 0,
  "object_count" INTEGER NOT NULL DEFAULT 0,
  "created_by"   TEXT,
  "created_at"   INTEGER NOT NULL                   -- ms epoch
);

CREATE INDEX IF NOT EXISTS "_backups_created_at_idx" ON "_backups" ("created_at" DESC);
