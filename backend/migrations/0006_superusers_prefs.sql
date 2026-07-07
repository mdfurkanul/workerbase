-- Add per-user UI preferences column to _superusers.
-- Stored as a JSON TEXT blob; nullable so existing rows default to "no prefs".
-- Currently holds: { pinnedCollections: string[] } — designed to grow
-- (theme, density, saved filters, etc.) without further migrations.
ALTER TABLE "_superusers" ADD COLUMN "prefs" TEXT;
