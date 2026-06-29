-- Add RBAC role column to _superusers.
-- Existing rows default to 'admin' so current superusers keep full access.
ALTER TABLE "_superusers" ADD COLUMN "role" TEXT NOT NULL DEFAULT 'admin';
