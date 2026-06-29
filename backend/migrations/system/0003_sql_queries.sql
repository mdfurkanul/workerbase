-- Migration: create _sqlQueries table for saved SQL console queries.

CREATE TABLE IF NOT EXISTS "_sqlQueries" (
  "id"          TEXT PRIMARY KEY NOT NULL,
  "title"       TEXT NOT NULL,
  "sql"         TEXT NOT NULL,
  "created_by"  TEXT,
  "last_run_at" INTEGER,
  "created_at"  INTEGER NOT NULL,
  "updated_at"  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS "_sqlQueries_created_by_idx" ON "_sqlQueries" ("created_by");
