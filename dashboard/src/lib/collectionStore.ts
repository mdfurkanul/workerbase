/**
 * Local-storage-backed UI state for collections.
 *
 * The backend (sqlite_master + PRAGMA table_info) is the SINGLE source of
 * truth for the collection list, names, and schemas. Nothing in this file
 * filters, adds, or renames collections. Only genuine per-user UI
 * preferences live here: pinned collections, visible-column choices, and
 * permission-rule drafts.
 */

const PINNED_KEY = "workerbase.pinnedCollections";
const COLUMNS_PREFIX = "workerbase.columns.";
const PERMISSIONS_PREFIX = "workerbase.permissions.";

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

/* ─── Permissions (per-collection, persisted locally) ─────────────── */
export function loadPermissions<T>(name: string, fallback: T): T {
  return readJson<T>(`${PERMISSIONS_PREFIX}${name}`, fallback);
}

export function savePermissions<T>(name: string, value: T): void {
  writeJson(`${PERMISSIONS_PREFIX}${name}`, value);
}

/* ─── Pinned collections ──────────────────────────────────────────── */
//
// Source of truth: `_superusers.prefs.pinnedCollections` on the backend.
// localStorage is used only as a fast cache for instant first paint and
// offline resilience. Writes from the dashboard go through the
// `usePinnedCollections` hook, which calls the backend PATCH endpoint
// and then mirrors the result here.
export function getPinnedCollections(): string[] {
  return readJson<string[]>(PINNED_KEY, []);
}

/** Overwrite the local cache. Called by `usePinnedCollections` after a
 *  backend sync or successful toggle. Mirrors the remote result. */
export function setPinnedCollectionsLocal(names: string[]): void {
  writeJson(PINNED_KEY, names);
}

export function isPinned(name: string): boolean {
  return getPinnedCollections().includes(name);
}

/**
 * @deprecated Use `usePinnedCollections().toggle(name)` instead — this
 *   sync helper only updates localStorage and will NOT propagate to the
 *   backend. Kept for backward compatibility with any consumer that
 *   hasn't migrated yet.
 */
export function togglePinned(name: string): string[] {
  const list = getPinnedCollections();
  const next = list.includes(name)
    ? list.filter((n) => n !== name)
    : [...list, name];
  writeJson(PINNED_KEY, next);
  return next;
}

/* ─── Visible columns per collection ──────────────────────────────── */
function columnsKey(name: string): string {
  return `${COLUMNS_PREFIX}${name}`;
}

/**
 * Returns the list of visible column names for a collection, or `null`
 * when nothing has been stored yet (caller should default to all columns).
 */
export function getVisibleColumns(name: string): string[] | null {
  return readJson<string[] | null>(columnsKey(name), null);
}

export function setVisibleColumns(name: string, columns: string[]): void {
  writeJson(columnsKey(name), columns);
}

export function clearVisibleColumns(name: string): void {
  try {
    localStorage.removeItem(columnsKey(name));
  } catch {
    /* ignore */
  }
}
