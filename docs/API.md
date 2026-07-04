# WorkerBase API Reference

> Complete catalog of every backend HTTP/WebSocket endpoint.
> **Keep this file in sync** whenever an endpoint is added, removed, or has its
> parameters, validation, auth, or behavior changed. See
> [Maintenance Notes](#maintenance-notes) at the bottom.

Base URL (local): `http://localhost:8787`
Base URL (prod):  your Cloudflare Worker URL

---

## Table of Contents
1. [Authentication Model](#authentication-model)
2. [Conventions](#conventions)
3. [Installation Flow](#1-installation-flow)
4. [Superuser Auth & Management](#2-superuser-auth--management)
5. [Collections Admin](#3-collections-admin)
6. [Public Records API](#4-public-records-api)
7. [External (Collection) Auth API](#5-external-collection-auth-api)
8. [SQL Queries](#6-sql-queries)
9. [Storage (R2)](#7-storage-r2)
10. [Realtime (WebSocket)](#8-realtime-websocket)
11. [Export](#9-export)
12. [Import](#10-import)
13. [Maintenance Notes](#maintenance-notes)

---

## Authentication Model

Two JWT flavors, both signed with the same `AUTH_SECRET` (≥ 32 chars):

| Token           | Audience            | Claims                                   | Bearer header        |
|-----------------|---------------------|------------------------------------------|----------------------|
| Superuser JWT   | `/api/core/*`       | `{ sub, email, role }`                   | `Authorization: Bearer <token>` |
| Collection JWT  | `/api/collections/:name/auth/*` and rule-gated records | `{ collection, recordId, email, verified }` | `Authorization: Bearer <token>` |

Superuser roles hierarchy: `admin` > `editor` > `viewer`.

Rule system for public records API (`apiRules` per collection):

| Rule value      | Meaning                                              |
|-----------------|------------------------------------------------------|
| `"public"`      | Anyone (anonymous allowed)                            |
| `"authenticated"` | Collection JWT required; on PATCH/DELETE the caller may only act on **their own** record |
| `"superuser"`   | Superuser JWT required                                |
| _undefined_     | Deny by default (403)                                |

---

## Conventions

- **Body parsing:** send raw JSON via `c.req.text()` then `JSON.parse`. For curl use `--data-raw` (not `-d`) to avoid bash `!` escaping.
- **Content-Type:** `application/json` unless noted (storage upload is `multipart/form-data`).
- **Error shape:** `{ error: string }` with appropriate HTTP status (400 / 401 / 403 / 404 / 409 / 422 / 500).
- **Pagination shape:** `{ items, page, perPage, total, totalPages }`.

---

## 1. Installation Flow

File: `backend/src/core/install/installRouter.ts`

### `GET /api/core/install/status`
- **Auth:** None
- **Purpose:** Check whether the instance has been installed.
- **Response 200:** `{ installed: boolean }`

### `POST /api/core/install`
- **Auth:** None — first-run only. Returns `403` once any superuser exists.
- **Body:**

| Field        | Type   | Required | Validation                    |
|--------------|--------|----------|-------------------------------|
| `email`      | string | ✅       | email format, ≤ 254 chars     |
| `password`   | string | ✅       | min 8, ≤ 256 chars            |
| `appName`    | string | ❌       | min 1, ≤ 64 chars             |
| `brandColor` | string | ❌       | regex `^#[0-9a-fA-F]{6}$`     |

- **Response 201:** `{ installed: true, user: {...}, token: string }`

### `GET /api/core/install/seed`
- **Auth:** Superuser JWT (any role)
- **Purpose:** Idempotent settings seeder (run after upgrades).
- **Response 200:** `{ success: true }`

---

## 2. Superuser Auth & Management

File: `backend/src/core/auth/superuserRouter.ts`

### `POST /api/core/superusers/login`
- **Auth:** None
- **Body:**

| Field      | Type   | Required | Validation                |
|------------|--------|----------|---------------------------|
| `email`    | string | ✅       | email format, ≤ 254 chars |
| `password` | string | ✅       | min 8, ≤ 256 chars        |

- **Response 200:** `{ user: { id, email, role, verified }, token }`

### `POST /api/core/superusers/magic-request`
- **Auth:** None
- **Body:** `email` (string, email, ≤ 254, required)
- **Response 200:** `{ success: true }` (always 200 — never reveals if email exists)

### `GET /api/core/superusers/magic-verify`
- **Auth:** None
- **Query:** `token` (string, required)
- **Response 200:** `{ user: {...}, token }`

### `POST /api/core/superusers/forgot-password`
- **Auth:** None
- **Body:** `email` (string, email, ≤ 254, required)
- **Response 200:** `{ success: true }` (always 200)

### `POST /api/core/superusers/reset-password`
- **Auth:** None
- **Body:**

| Field      | Type   | Required | Validation         |
|------------|--------|----------|--------------------|
| `token`    | string | ✅       | min 1, ≤ 512 chars |
| `password` | string | ✅       | min 8, ≤ 256 chars |

- **Response 200:** `{ user: {...}, token }`

### `GET /api/core/superusers/me`
- **Auth:** Superuser JWT (any role)
- **Response 200:** `{ user: { id, email, role, verified, createdAt, updatedAt } }`

### `POST /api/core/superusers/create`
- **Auth:** Superuser JWT — **admin only**
- **Body:**

| Field      | Type   | Required | Validation                              |
|------------|--------|----------|-----------------------------------------|
| `email`    | string | ✅       | email format, ≤ 254 chars               |
| `password` | string | ✅       | min 8, ≤ 256 chars                      |
| `role`     | enum   | ❌       | `admin` \| `editor` \| `viewer` (default `viewer`) |

- **Response 201:** `{ user: {...}, verificationURL }`

### `GET /api/core/superusers/list`
- **Auth:** Superuser JWT — **admin only**
- **Response 200:** `{ users: [...] }`

### `GET /api/core/superusers/:id`
- **Auth:** Superuser JWT — **admin only**
- **Path:** `id` (UUID)
- **Response 200:** `{ user: {...} }`

### `PATCH /api/core/superusers/:id/email`
- **Auth:** Superuser JWT — **admin only**
- **Path:** `id` (UUID)
- **Body:** `email` (string, email, ≤ 254, required)
- **Response 200:** `{ user: { id, email, updated_at } }`

### `PATCH /api/core/superusers/:id/password`
- **Auth:** Superuser JWT (any role — owner or admin)
- **Path:** `id` (UUID)
- **Body:**

| Field             | Type   | Required | Validation               |
|-------------------|--------|----------|--------------------------|
| `currentPassword` | string | ⚠️       | min 8, ≤ 256; required when changing own password |
| `newPassword`     | string | ✅       | min 8, ≤ 256 chars       |

- **Response 200:** `{ success: true }`

### `PATCH /api/core/superusers/:id/role`
- **Auth:** Superuser JWT — **admin only** (prevents last-admin demotion)
- **Path:** `id` (UUID)
- **Body:** `role` (enum: `admin`|`editor`|`viewer`, required)
- **Response 200:** `{ user: { id, role, updated_at } }`

### `DELETE /api/core/superusers/:id`
- **Auth:** Superuser JWT — **admin only** (blocks self-deletion + last-admin deletion)
- **Path:** `id` (UUID)
- **Response 200:** `{ success: true }`

### `POST /api/core/superusers/bootstrap`
- **Auth:** None — disabled after the first superuser exists (returns 403).
- **Body:**

| Field      | Type   | Required | Validation                              |
|------------|--------|----------|-----------------------------------------|
| `email`    | string | ✅       | email format, ≤ 254 chars               |
| `password` | string | ✅       | min 8, ≤ 256 chars                      |
| `role`     | enum   | ❌       | `admin` \| `editor` \| `viewer` (default `viewer`) |

- **Response 201:** `{ user: {...}, token }`

---

## 3. Collections Admin

File: `backend/src/core/collections/collectionsRouter.ts`

### `POST /api/core/collections`
- **Auth:** Superuser JWT — **admin only**
- **Body** (discriminated union on `type`):

**Common:**

| Field   | Type   | Required | Validation                                              |
|---------|--------|----------|---------------------------------------------------------|
| `type`  | enum   | ✅       | `base` \| `user` \| `view`                              |
| `name`  | string | ✅       | min 1, ≤ 64 chars, regex `^[a-zA-Z][a-zA-Z0-9_]*$`      |

**`type=base`** — plain data table

| Field                                                            | Required | Notes                                  |
|------------------------------------------------------------------|----------|----------------------------------------|
| `schema` (fieldSchema[])                                          | ✅       | min 1 item; defines columns            |
| `indexes` (`{ name, columns[], unique? }[]`)                     | ❌       |                                        |
| `constraints` (`{ name?, columns[] }[]`)                         | ❌       |                                        |
| `listRule`, `viewRule`, `createRule`, `updateRule`, `deleteRule` | ❌       | strings (rule expressions; see §Auth)  |

**`type=user`** — auth-enabled (gets auth columns auto-injected: `email`, `password_hash`, `password_salt`, `token_key`, `verified`)

| Field                              | Required | Notes                       |
|------------------------------------|----------|-----------------------------|
| `schema` (fieldSchema[])           | ❌       |                             |
| `indexes`, `constraints`           | ❌       |                             |
| `apiRules`                         | ❌       | overrides per-action rules  |
| `authConfig` (record)              | ❌       | e.g. `{ minPasswordLength }`|
| `emailTemplates` (record)          | ❌       |                             |

**`type=view`** — saved SELECT

| Field                                  | Required | Validation                                |
|----------------------------------------|----------|-------------------------------------------|
| `query` (string)                       | ✅       | min 1, ≤ 8192 chars; must be a safe SELECT|
| `listRule`, `viewRule`                 | ❌       |                                           |

- **Response 201:** `{ id, name, type, created_at }`

### `GET /api/core/collections`
- **Auth:** Superuser JWT (any role)
- **Response 200:** `{ collections: [{ id, name, type, source, schema, count }] }`

### `GET /api/core/collections/:name`
- **Auth:** Superuser JWT (any role)
- **Path:** `name` (collection name or `_underscore` system table)
- **Response 200:** `{ collection: { id, name, type, source, schema, count } }`

### `PATCH /api/core/collections/:name`
- **Auth:** Superuser JWT — **admin only**
- **Path:** `name`
- **Body:** Same shape as POST but all top-level fields optional (per `type`). Schema changes trigger migration via `diffSchema()` + `applyMigration()`.
- **Response 200:** `{ id, name, type, updated_at, migrations: { applied, errors } }`

### `DELETE /api/core/collections/:name`
- **Auth:** Superuser JWT — **admin only** (blocks system tables)
- **Path:** `name`
- **Response 200:** `{ success: true }`

### `GET /api/core/collections/:name/records`
- **Auth:** Superuser JWT (any role)
- **Path:** `name`
- **Query:**

| Field     | Type   | Default | Validation       |
|-----------|--------|---------|------------------|
| `page`    | number | 1       | min 1            |
| `perPage` | number | 20      | min 1, max 100   |

- **Response 200:** `{ items, page, perPage, total, totalPages }`

### `POST /api/core/collections/:name/records`
- **Auth:** Superuser JWT — **admin or editor**
- **Path:** `name`
- **Body:** Record fields matching the collection's schema. For `type=user`, `password` is virtual and auto-hashed.
- **Response 201:** `{ record }`

### `PATCH /api/core/collections/:name/records/:id`
- **Auth:** Superuser JWT — **admin or editor**
- **Path:** `name`, `id` (UUID)
- **Body:** Partial record fields. For `type=user`, `password` is virtual and rotates `token_key`.
- **Response 200:** `{ record }`

### `DELETE /api/core/collections/:name/records/:id`
- **Auth:** Superuser JWT — **admin or editor**
- **Path:** `name`, `id` (UUID) — blocks deletion from `_superusers`
- **Response 200:** `{ success: true }`

---

## 4. Public Records API

File: `backend/src/core/records/recordsRouter.ts`

All endpoints below are governed by the corresponding `apiRules` entry on the
collection. Anonymous → 401, insufficient rule → 403, no rule → 403.

### `GET /api/collections/:name/records`
- **Auth:** `listRule`
- **Query:** `page` (≥1, default 1), `perPage` (1–100, default 20)
- **Response 200:** `{ items, page, perPage, total, totalPages }`

### `POST /api/collections/:name/records`
- **Auth:** `createRule`
- **Body:** Record fields (filtered to schema; system columns blocked).
- **Response 201:** `{ record }`

### `GET /api/collections/:name/records/:id`
- **Auth:** `viewRule`
- **Path:** `name`, `id` (UUID)
- **Response 200:** `{ record }` (system columns hidden)

### `PATCH /api/collections/:name/records/:id`
- **Auth:** `updateRule` — for `authenticated`, only own record (`token.recordId === id`)
- **Body:** Partial record fields (filtered; system columns blocked)
- **Response 200:** `{ record }`

### `DELETE /api/collections/:name/records/:id`
- **Auth:** `deleteRule` — for `authenticated`, only own record; system tables protected
- **Response 200:** `{ success: true }`

---

## 5. External (Collection) Auth API

File: `backend/src/core/auth/externalAuthRouter.ts`
All routes require the target collection to have `type="user"` and auth enabled.

### `POST /api/collections/:name/auth/register`
- **Auth:** None
- **Body:**

| Field      | Type   | Required | Validation                                                       |
|------------|--------|----------|------------------------------------------------------------------|
| `email`    | string | ✅       | email format, ≤ 254 chars                                        |
| `password` | string | ✅       | min 1, ≤ 256; **effective min** = collection `authConfig.minPasswordLength` |
| `data`     | record | ❌       | user-defined fields                                              |

- **Response 201:** `{ record: { _row_, email, verified }, token }`

### `POST /api/collections/:name/auth/login`
- **Auth:** None
- **Body:** `email` (email, ≤ 254, required), `password` (string, 1–256, required)
- **Response 200:** `{ record: { _row_, email, verified }, token }`

### `POST /api/collections/:name/auth/logout`
- **Auth:** Collection JWT (`requireCollectionAuth`)
- **Response 200:** `{ success: true }` (stateless — client discards token)

### `GET /api/collections/:name/auth/verify-email`
- **Auth:** None
- **Query:** `token` (string, required)
- **Response 200:** `{ success: true }`

### `POST /api/collections/:name/auth/request-password-reset`
- **Auth:** None
- **Body:** `email` (string, email, ≤ 254, required)
- **Response 200:** `{ success: true }` (always 200)

### `POST /api/collections/:name/auth/reset-password`
- **Auth:** None
- **Body:**

| Field      | Type   | Required | Validation                                          |
|------------|--------|----------|-----------------------------------------------------|
| `token`    | string | ✅       | min 1, ≤ 512 chars                                  |
| `password` | string | ✅       | min 1, ≤ 256; effective min = `authConfig.minPasswordLength` |

- **Response 200:** `{ success: true }` (rotates `token_key` → invalidates old sessions)

### `GET /api/collections/:name/auth/me`
- **Auth:** Collection JWT (`requireCollectionAuth`)
- **Response 200:** `{ record: { _row_, email, verified, created, updated } }`

---

## 6. SQL Queries

File: `backend/src/core/sql/sqlQueriesRouter.ts`

### `GET /api/core/sql/queries`
- **Auth:** Superuser JWT (any role)
- **Response 200:** `{ queries: [{ id, title, sql, created_by, last_run_at, created_at, updated_at }] }`

### `GET /api/core/sql/queries/:id`
- **Auth:** Superuser JWT (any role)
- **Path:** `id` (UUID)
- **Response 200:** `{ query: {...} }`

### `POST /api/core/sql/queries`
- **Auth:** Superuser JWT — **admin or editor**
- **Body:**

| Field   | Type   | Required | Validation         |
|---------|--------|----------|--------------------|
| `title` | string | ✅       | min 1, ≤ 200 chars |
| `sql`   | string | ✅       | min 1, ≤ 8192 chars|

- **Response 201:** `{ id, title, sql, created_by, last_run_at, created_at, updated_at }`

### `PATCH /api/core/sql/queries/:id`
- **Auth:** Superuser JWT — **admin or editor**
- **Body:** `title` (1–200), `sql` (1–8192), `lastRunAt` (number) — all optional
- **Response 200:** `{ query: {...} }`

### `DELETE /api/core/sql/queries/:id`
- **Auth:** Superuser JWT — **admin or editor**
- **Response 200:** `{ success: true }`

### `POST /api/core/sql/execute`
- **Auth:** Superuser JWT (any role)
- **Body:** `sql` (string, 1–8192, required; must be safe SELECT or PRAGMA)
- **Response 200:** `{ ok, columns, rows, rowCount, error? }`

---

## 7. Storage (R2)

File: `backend/src/core/storage/storageRouter.ts`

### `POST /api/core/storage/upload`
- **Auth:** Superuser JWT — **admin or editor**
- **Body:** `multipart/form-data`, field `file` (File, ≤ **25 MiB**)
- **Response 201:** `{ key, size, contentType }` — key format: `uploads/{yyyy}/{mm}/{uuid}-{filename}`

### `GET /api/core/storage/list`
- **Auth:** Superuser JWT (any role)
- **Query:**

| Field    | Type   | Required | Default | Validation        |
|----------|--------|----------|---------|-------------------|
| `prefix` | string | ❌       | —       | ≤ 1024 chars      |
| `cursor` | string | ❌       | —       | ≤ 1024 chars      |
| `limit`  | number | ❌       | 100     | 1–1000            |

- **Response 200:** `{ objects: [{ key, size, etag, uploaded, httpMetadata }], truncated, cursor? }`

### `GET /api/core/storage/object`
- **Auth:** Superuser JWT (any role)
- **Query:** `key` (string, 1–1024, required; path-traversal validated)
- **Response 200:** Binary stream + `Content-Type`, `Content-Length`, `ETag` headers

### `DELETE /api/core/storage/object`
- **Auth:** Superuser JWT — **admin only**
- **Query or Body:** `key` (string, 1–1024, required)
- **Response 200:** `{ success: true }`

### `POST /api/core/storage/sign-upload-url`
- **Auth:** Superuser JWT — **admin or editor**
- **Status:** ⛔ **Not implemented** — returns 501 `{ error: "not_implemented" }`

---

## 8. Realtime (WebSocket)

File: `backend/src/core/realtime/realtimeRouter.ts`

### `GET /api/core/realtime/:collection`
- **Auth:** None (WebSocket upgrade)
- **Path:** `collection` (regex `^[a-zA-Z][a-zA-Z0-9_]*$`)
- **Headers:** `Upgrade: websocket` required
- **Behavior:** Forwards to a per-collection Durable Object that broadcasts change events.
- **Response:** WebSocket handshake (101 Switching Protocols)

---

## Security Features
- `AUTH_SECRET` enforced ≥ 32 chars
- Reset/magic tokens hashed (SHA-256) before storage
- JWT `alg:none` rejected
- Security headers on every response
- Path-traversal protection on R2 keys
- Parameterized SQL everywhere (no string interpolation of user input)
- System tables (`_underscore`) protected from public deletion
- Sensitive URL logging gated behind `ENVIRONMENT === "local"`

---

## 9. Export

File: `backend/src/core/export/exportRouter.ts`

### `POST /api/core/export`
- **Auth:** Superuser JWT (any role)
- **Purpose:** Bulk dump of collection schema + rows as JSON. Frontend handles format conversion (JSON/CSV/XLSX/SQL).
- **Body:**

| Field             | Type                      | Required | Default | Validation                          |
|-------------------|---------------------------|----------|---------|-------------------------------------|
| `collections`     | `"all"` or string[]       | ✅       | —       | min 1 item if array                 |
| `limit`           | number                    | ❌       | 1000    | int, 1–100000                       |
| `includeSystem`   | boolean                   | ❌       | false   |                                     |

- **Response 200:** `{ meta: { exportedAt, limit, includeSystem, collectionCount }, collections: [{ name, type, schema, rowCount, rows }] }`

---

## 10. Import

File: `backend/src/core/import/importRouter.ts`

### `POST /api/core/import`
- **Auth:** Superuser JWT — **admin only**
- **Purpose:** Bulk-insert parsed rows into an existing or newly created collection. Frontend handles file parsing (JSON/CSV) and sends structured data.
- **Body:**

| Field             | Type                                                         | Required | Validation                                     |
|-------------------|--------------------------------------------------------------|----------|------------------------------------------------|
| `format`          | `"json"` \| `"csv"`                                          | ✅       |                                                |
| `target`          | object                                                       | ✅       |                                                |
| `target.mode`     | `"existing"` \| `"new"`                                      | ✅       |                                                |
| `target.collection` | string                                                    | ✅       | regex `^[a-zA-Z][a-zA-Z0-9_]*$`, 1–64 chars    |
| `target.type`     | `"base"` \| `"user"`                                         | ❌       | only used when `mode="new"`; default `"base"`  |
| `mappings`        | `{ sourceColumn: string, targetColumn: string \| null }[]`  | ✅       | min 1; `null` = skip column                    |
| `data`            | `Record<string, unknown>[]`                                  | ✅       | min 1 row                                      |

- **Behavior:**
  - `mode="new"`: creates the table via DDL (same path as `POST /api/core/collections`). For `type="user"`, auth columns are auto-injected.
  - `mode="existing"`: fetches metadata, skips DDL.
  - Applies column mappings per row: `sourceColumn` value written to `targetColumn`. `targetColumn === null` skips that column.
  - Blank rows (all mapped values empty) are skipped.
  - Per-row errors are collected but do not abort the batch.
- **Response 200:** `{ imported: number, collection: string, created: boolean, format: string, errors: string[] }`

---

## Maintenance Notes

> **When adding, removing, or modifying ANY endpoint, update this file in the same commit.**

Sections to keep in sync:
- New router file → add a new numbered section + ToC entry
- New endpoint → add row under the right section with full param/validation/auth table
- Removed endpoint → delete its row
- Changed validation (Zod schema, query defaults) → update the param table
- Changed auth middleware (`requireAuth` / `requireRole` / `requireCollectionAuth` / rule gating) → update the **Auth** row
- New JWT type or rule value → update [Authentication Model](#authentication-model)

Source-of-truth router files (under `backend/src/`):
- `core/install/installRouter.ts`
- `core/auth/superuserRouter.ts`
- `core/auth/externalAuthRouter.ts`
- `core/collections/collectionsRouter.ts`
- `core/records/recordsRouter.ts`
- `core/sql/sqlQueriesRouter.ts`
- `core/storage/storageRouter.ts`
- `core/realtime/realtimeRouter.ts`
- `core/export/exportRouter.ts`
- `core/import/importRouter.ts`
