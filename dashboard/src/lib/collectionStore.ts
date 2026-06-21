/**
 * Local-storage-backed overrides for collection metadata.
 *
 * This is a UI-only stand-in for the real `PATCH /api/collections/:name`
 * and `DELETE /api/collections/:name` endpoints. The hook merges these
 * drafts over the JSON-loaded index so the dashboard behaves correctly
 * while the backend is still being wired.
 *
 * Swap out the function bodies for fetch calls once the API lands.
 */

import type { Collection, CollectionField } from "@/lib/mockData";

const DELETED_KEY = "workerbase.deletedCollections";
const SCHEMA_PREFIX = "workerbase.schema.";
const PERMISSIONS_PREFIX = "workerbase.permissions.";
const PINNED_KEY = "workerbase.pinnedCollections";
const COLUMNS_PREFIX = "workerbase.columns.";

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

/* ─── Deleted collections ──────────────────────────────────────────── */
export function getDeletedCollections(): string[] {
  return readJson<string[]>(DELETED_KEY, []);
}

export function isDeleted(name: string): boolean {
  return getDeletedCollections().includes(name);
}

export function markDeleted(name: string): void {
  const list = getDeletedCollections();
  if (!list.includes(name)) {
    list.push(name);
    writeJson(DELETED_KEY, list);
  }
}

export function unmarkDeleted(name: string): void {
  const list = getDeletedCollections().filter((n) => n !== name);
  writeJson(DELETED_KEY, list);
}

/* ─── Edited schemas ───────────────────────────────────────────────── */
function schemaKey(name: string): string {
  return `${SCHEMA_PREFIX}${name}`;
}

export function getEditedSchema(name: string): CollectionField[] | null {
  return readJson<CollectionField[] | null>(schemaKey(name), null);
}

export function saveEditedSchema(name: string, schema: CollectionField[]): void {
  writeJson(schemaKey(name), schema);
}

export function clearEditedSchema(name: string): void {
  try {
    localStorage.removeItem(schemaKey(name));
  } catch {
    /* ignore */
  }
}

/* ─── Merge helper for the hook ────────────────────────────────────── */
export function applyOverrides(collections: Collection[]): Collection[] {
  const deleted = new Set(getDeletedCollections());
  return collections
    .filter((c) => !deleted.has(c.name))
    .map((c) => {
      const edited = getEditedSchema(c.name);
      return edited ? { ...c, schema: edited } : c;
    });
}

/* ─── Permissions (also persisted locally) ─────────────────────────── */
export function loadPermissions<T>(name: string, fallback: T): T {
  return readJson<T>(`${PERMISSIONS_PREFIX}${name}`, fallback);
}

export function savePermissions<T>(name: string, value: T): void {
  writeJson(`${PERMISSIONS_PREFIX}${name}`, value);
}

/* ─── Pinned collections ───────────────────────────────────────────── */
export function getPinnedCollections(): string[] {
  return readJson<string[]>(PINNED_KEY, []);
}

export function isPinned(name: string): boolean {
  return getPinnedCollections().includes(name);
}

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
