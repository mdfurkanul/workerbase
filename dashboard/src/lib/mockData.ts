/**
 * Mock data + types for the dashboard UI.
 *
 * The collections index now loads from `public/mock/collections.json`
 * (see `useCollections`). This file keeps the inline records, logs and
 * shared types that aren't yet backed by JSON.
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
  query?: string | null;
  list_rule?: string | null;
  create_rule?: string | null;
}

export interface CollectionsResponse {
  collections: Collection[];
}

/** Static system collections surfaced in the sidebar. */
export const SYSTEM_LINKS: { name: string; type: CollectionType }[] = [
  { name: "_superusers", type: "user" },
  { name: "_externalAuths", type: "base" },
  { name: "logs", type: "base" },
];

export interface Record {
  id: string;
  [key: string]: unknown;
}

export const USERS_RECORDS: Record[] = [
  {
    id: "JJ2YRU30FBG8MqX",
    email: "test3@example.com",
    emailVisibility: false,
    verified: false,
    username: "u_Y6TDdqL63JEG4xu",
    name: "John Doe",
    avatar: null,
    website: null,
    created: "2022-07-02 07:51:26.763Z",
    updated: "2022-07-02 07:51:26.887Z",
  },
  {
    id: "qEooBTHoAGkWUKc",
    email: "test2@example.com",
    emailVisibility: false,
    verified: true,
    username: "u_Gq7dcZKjM9v2Sgv",
    name: null,
    avatar: null,
    website: null,
    created: "2022-07-02 07:51:05.866Z",
    updated: "2022-10-29 22:23:33.038Z",
  },
  {
    id: "eP2jCr1h3NGtsbz",
    email: "test@example.com",
    emailVisibility: false,
    verified: true,
    username: "u_GpYUPiMQEzHCNnt",
    name: "Jane Doe",
    avatar: "https://i.pravatar.cc/40?u=eP2j",
    website: null,
    created: "2022-07-02 07:49:01.218Z",
    updated: "2022-10-29 22:23:42.332Z",
  },
];

export interface LogEntry {
  level: "info" | "warn" | "error";
  method: string;
  path: string;
  status: number;
  duration: number;
  at: string;
}

export const LOG_ENTRIES: LogEntry[] = [
  { level: "info", method: "GET", path: "/api/collections/users/records", status: 200, duration: 14, at: "2026-06-21 18:42:11" },
  { level: "info", method: "POST", path: "/api/collections/posts/records", status: 200, duration: 28, at: "2026-06-21 18:41:48" },
  { level: "info", method: "GET", path: "/api/collections/invoices/records", status: 200, duration: 11, at: "2026-06-21 18:39:02" },
  { level: "warn", method: "GET", path: "/api/collections/missing/records", status: 404, duration: 4, at: "2026-06-21 18:37:14" },
  { level: "info", method: "POST", path: "/api/auth/login", status: 200, duration: 142, at: "2026-06-21 18:31:09" },
  { level: "error", method: "POST", path: "/api/auth/login", status: 401, duration: 18, at: "2026-06-21 18:30:42" },
  { level: "info", method: "GET", path: "/api/collections/payments/records", status: 200, duration: 22, at: "2026-06-21 18:25:00" },
];

export const APP_VERSION = "v0.0.1-beta";
