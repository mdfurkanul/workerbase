/**
 * Shared TypeScript types for the dashboard UI.
 *
 * The dashboard loads every list from the real API (`/api/core/...`),
 * so this module only holds the lightweight `Collection` / `Record`
 * shapes consumed by route and component code, plus `APP_VERSION`.
 */

export type CollectionType = "base" | "user" | "view";

/** Mirrors the backend FieldDefinition — the stable `id` is what the
 *  migration diff uses to track a field across renames/edits, so it MUST
 *  be preserved end-to-end or PATCH will treat edits as drop+add. */
export interface CollectionField {
  id: string;
  name: string;
  type: string;
  required?: boolean;
  unique?: boolean;
  hidden?: boolean;
  system?: boolean;
  auto?: boolean;
  primaryKey?: boolean;
  default?: string;
  options?: { [k: string]: unknown };
}

export interface Collection {
  id: string;
  name: string;
  type: CollectionType;
  count: number;
  schema: CollectionField[];
  source: "system" | "data";
  query?: string | null;
  list_rule?: string | null;
  create_rule?: string | null;
  idType?: "uuid" | "autoincrement";
  idStart?: number | null;
}

export interface CollectionsResponse {
  collections: Collection[];
}

export interface Record {
  id: string;
  [key: string]: unknown;
}

export interface LogEntry {
  level: "info" | "warn" | "error";
  method: string;
  path: string;
  status: number;
  duration: number;
  at: string;
}

export const APP_VERSION = "v0.0.1-beta";
