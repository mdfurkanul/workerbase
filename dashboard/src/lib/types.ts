/**
 * Shared TypeScript types for the dashboard UI.
 *
 * The dashboard loads every list from the real API (`/api/core/...`),
 * so this module only holds the lightweight `Collection` / `Record`
 * shapes consumed by route and component code, plus `APP_VERSION`.
 */

export type CollectionType = "base" | "user" | "view";

export interface CollectionField {
  name: string;
  type: string;
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
