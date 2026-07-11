-- Migration: add ID type + start configuration to _collections.
--
-- Collections can now choose between:
--   id_type = 'uuid'          (default, existing behavior — TEXT PRIMARY KEY with crypto.randomUUID())
--   id_type = 'autoincrement' (INTEGER PRIMARY KEY AUTOINCREMENT, optional id_start seeds sqlite_sequence)
ALTER TABLE "_collections" ADD COLUMN "id_type" TEXT NOT NULL DEFAULT 'uuid';
ALTER TABLE "_collections" ADD COLUMN "id_start" INTEGER;
