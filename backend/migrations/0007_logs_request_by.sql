-- Add `request_by` column to `_logs`.
--
-- Records WHO triggered each logged request:
--   - superuser email    (e.g. "admin@workerbase.dev")
--   - collection user    (e.g. "users/abc123")
--   - "anonymous"        (public / unauthenticated / invalid token)
--
-- Nullable so existing rows survive the migration; the logging
-- middleware populates it for every new row going forward.
ALTER TABLE "_logs" ADD COLUMN "request_by" TEXT;
