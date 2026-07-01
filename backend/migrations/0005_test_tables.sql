-- 0005_test_tables.sql
-- Replace the sample `members` collection with a seeded `test_tables`
-- collection so every deploy (local / preprod / prod) starts with a
-- predictable example table.
--
-- Idempotent: DROP IF EXISTS guards make this safe to re-run and safe
-- on fresh databases where `members` was never created.

DROP TABLE IF EXISTS "members";
DROP TABLE IF EXISTS "test_tables";

CREATE TABLE "test_tables" (
  "id"         TEXT PRIMARY KEY,
  "email"      TEXT,
  "age"        INTEGER,
  "created_at" INTEGER,
  "updated_at" INTEGER
);

-- Seed one sample row so the table isn't empty on first deploy.
INSERT INTO "test_tables" (id, email, age, created_at, updated_at)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'sample@workerbase.dev',
  42,
  0,
  0
);
