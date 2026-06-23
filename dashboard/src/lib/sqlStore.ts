/**
 * Persisted SQL snippets — stored locally until a real backend lands.
 * Each entry has a user-supplied title and the SQL body.
 */

export interface SavedQuery {
  id: string;
  title: string;
  sql: string;
  savedAt: number;
}

const KEY = "workerbase.sql.queries";
const SEED_FLAG = "workerbase.sql.seeded";

function readAll(): SavedQuery[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function writeAll(list: SavedQuery[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* ignore */
  }
}

export function listSavedQueries(): SavedQuery[] {
  // Newest first.
  return readAll().sort((a, b) => b.savedAt - a.savedAt);
}

export function saveQuery(title: string, sql: string): SavedQuery {
  const entry: SavedQuery = {
    id: crypto.randomUUID(),
    title: title.trim() || "Untitled query",
    sql,
    savedAt: Date.now(),
  };
  const list = readAll();
  list.push(entry);
  writeAll(list);
  return entry;
}

export function deleteQuery(id: string): void {
  writeAll(readAll().filter((q) => q.id !== id));
}

export function renameQuery(id: string, title: string): void {
  const list = readAll();
  const next = list.map((q) =>
    q.id === id ? { ...q, title: title.trim() || "Untitled query" } : q,
  );
  writeAll(next);
}

/** Seed a handful of starter queries on first visit (idempotent). */
export function seedIfEmpty(): void {
  try {
    if (localStorage.getItem(SEED_FLAG)) return;
  } catch {
    /* ignore */
  }
  const now = Date.now();
  const seeds: SavedQuery[] = [
    {
      id: crypto.randomUUID(),
      title: "All collections",
      sql: "SELECT name, type FROM _collections ORDER BY name;",
      savedAt: now - 5 * 60_000,
    },
    {
      id: crypto.randomUUID(),
      title: "Schema for users",
      sql: "SELECT name, type FROM pragma_table_info('users') ORDER BY cid;",
      savedAt: now - 4 * 60_000,
    },
    {
      id: crypto.randomUUID(),
      title: "Total users",
      sql: "SELECT COUNT(*) AS total FROM _users;",
      savedAt: now - 3 * 60_000,
    },
    {
      id: crypto.randomUUID(),
      title: "Recent users",
      sql: "SELECT id, email, created FROM _users ORDER BY created DESC LIMIT 10;",
      savedAt: now - 2 * 60_000,
    },
    {
      id: crypto.randomUUID(),
      title: "Collections by type",
      sql: "SELECT type, COUNT(*) AS count FROM _collections GROUP BY type ORDER BY count DESC;",
      savedAt: now - 60_000,
    },
  ];
  writeAll(seeds);
  try {
    localStorage.setItem(SEED_FLAG, "1");
  } catch {
    /* ignore */
  }
}

