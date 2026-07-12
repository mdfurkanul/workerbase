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
13. [Backups](#11-backups)
14. [Settings](#13-settings)
15. [API Tokens](#14-api-tokens)
16. [Maintenance Notes](#maintenance-notes)

---

## Authentication Model

Two JWT flavors, both signed with the same `AUTH_SECRET` (≥ 32 chars):

| Token           | Audience            | Claims                                   | Bearer header        |
|-----------------|---------------------|------------------------------------------|----------------------|
| Superuser JWT   | `/api/core/*`       | `{ sub, email, role }`                   | `Authorization: Bearer <token>` |
| Collection JWT  | `/api/collections/:name/auth/*` and rule-gated records | `{ collection, recordId, email, verified }` | `Authorization: Bearer <token>` |
| API Token (PAT) | `/api/collections/*` (records API only) | Opaque `wbs_…` string; SHA-256 hashed in `_apiTokens`. Per-token `scopes` (`read` \| `write` \| `admin`) + optional `collectionScope` | `Authorization: Bearer wbs_…` |

Superuser roles hierarchy: `admin` > `editor` > `viewer`.

API tokens bypass per-collection `apiRules` (they are admin-issued) but are gated by the token's scope against the HTTP method:

| HTTP method on `/api/collections/*` | Minimum scope |
|---|---|
| `GET` (list, view) | `read` |
| `POST`, `PATCH` | `write` |
| `DELETE` | `admin` |

Scope hierarchy: `admin` ⊇ `write` ⊇ `read`.

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
- **CORS:** the API supports split-Worker deployments where the dashboard is served from a different origin than the backend. Allowed origins are resolved in this order: `_settings.deploy.corsOrigins` (set from the Settings UI) → `CORS_ORIGINS` env var (comma-separated) → `DASHBOARD_URL` env var. Browsers from listed origins get `Access-Control-Allow-Origin: <origin>` plus `Allow-Methods`/`Allow-Headers` on preflight `OPTIONS` (returns `204`). Same-origin requests pass through with no CORS headers. Auth is bearer-token-in-localStorage (no cookies), so `Access-Control-Allow-Credentials` is intentionally **not** set. Email-link redirects (magic-link, reset-password) resolve via `_settings.deploy.dashboardUrl` → `DASHBOARD_URL` env var → request origin. To configure split-deploy from the UI: sign in → **Settings → Application → Split-Worker deployment**, set **Dashboard URL** + **Allowed CORS origins**, save. The deploy-settings cache is invalidated on every PATCH so changes take effect within seconds without a redeploy.

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
- **Email:** Sends a magic-link email via the Cloudflare Email Service binding (`EMAIL`). The link points to `{origin}/magic-login?token=...` (frontend route). Simulated locally by `wrangler dev` (logged to console + temp files).

### `GET /api/core/superusers/magic-verify`
- **Auth:** None
- **Query:** `token` (string, required)
- **Response 200:** `{ user: {...}, token }`

### `POST /api/core/superusers/forgot-password`
- **Auth:** None
- **Body:** `email` (string, email, ≤ 254, required)
- **Response 200:** `{ success: true }` (always 200)
- **Email:** Sends a password-reset email via the Cloudflare Email Service binding (`EMAIL`). The link points to `{origin}/reset-password?token=...` (frontend route). Simulated locally by `wrangler dev` (logged to console + temp files).

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

### `GET /api/core/superusers/me/prefs`
- **Auth:** Superuser JWT (any role)
- **Purpose:** Read the caller's per-user UI preferences. Stored as JSON in `_superusers.prefs` — currently only `pinnedCollections`. Timezone / date-format settings used to live here but have been promoted to the system-wide `_settings` table (see `/api/core/settings`) so every dashboard user sees the same value.
- **Response 200:** `{ prefs: { pinnedCollections?: string[] } }` (returns `{ prefs: {} }` when unset)

### `PATCH /api/core/superusers/me/prefs`
- **Auth:** Superuser JWT (any role)
- **Purpose:** Merge-update the caller's preferences. Shallow merge — only keys present in the body are overwritten; others are preserved.
- **Body:**

| Field                | Type       | Required | Validation                                |
|----------------------|------------|----------|-------------------------------------------|
| `pinnedCollections`  | `string[]` | ❌       | each 1–64 chars, max 100 items            |

- **Response 200:** `{ prefs: { ...merged } }` (the full post-merge prefs object)
- **Notes:** Unknown keys are silently dropped (forward-compatible). The `pinnedCollections` value replaces — does not append to — the previous list.

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
| `idType`                                                          | ❌       | `"uuid"` (default) \| `"autoincrement"` — controls the `id` column type |
| `idStart`                                                         | ❌       | integer ≥ 1; seeds `sqlite_sequence` so the first record ID starts here (only when `idType="autoincrement"`) |
| `listRule`, `viewRule`, `createRule`, `updateRule`, `deleteRule` | ❌       | strings (rule expressions; see §Auth)  |

**`type=user`** — auth-enabled (gets auth columns auto-injected: `email`, `password_hash`, `password_salt`, `token_key`, `verified`)

| Field                              | Required | Notes                       |
|------------------------------------|----------|-----------------------------|
| `schema` (fieldSchema[])           | ❌       |                             |
| `indexes`, `constraints`           | ❌       |                             |
| `idType`                           | ❌       | `"uuid"` (default) \| `"autoincrement"` |
| `idStart`                          | ❌       | integer ≥ 1 (autoincrement only) |
| `apiRules`                         | ❌       | overrides per-action rules  |
| `authConfig` (record)              | ❌       | e.g. `{ minPasswordLength }`|
| `emailTemplates` (record)          | ❌       |                             |

**`type=view`** — saved SELECT

| Field                                  | Required | Validation                                |
|----------------------------------------|----------|-------------------------------------------|
| `query` (string)                       | ✅       | min 1, ≤ 8192 chars; must be a safe SELECT|
| `listRule`, `viewRule`                 | ❌       |                                           |

- **Response 201:** `{ id, name, type, created_at }`

#### Field default values (date / datetime)

A `date` or `datetime` field's `default` may be one of these sentinel strings instead of a literal:

| `default` value  | Meaning                                                                 |
|------------------|-------------------------------------------------------------------------|
| `""` / undefined | Empty — no automatic value. Client must supply one (or it stays NULL).  |
| `"$now"`         | **On-create.** Set to current unix timestamp on INSERT; never touched on UPDATE. |
| `"$nowOnUpdate"` | **On-update.** Set on INSERT AND refreshed to "now" on every UPDATE.   |

These sentinels are **not** rendered into the SQL `DEFAULT` clause (SQLite cannot re-evaluate it per-update). The admin and public record routers (`backend/src/core/collections/recordsRouter.ts`, `backend/src/core/records/recordsRouter.ts`) inject them at write time via `pickDynamicDefaults()`. Client-supplied values for these columns win on INSERT; on UPDATE the `$nowOnUpdate` value always refreshes.

### `GET /api/core/collections`
- **Auth:** Superuser JWT (any role)
- **Response 200:** `{ collections: [{ id, name, type, source, schema, idType, idStart, count }] }`

> The returned `schema` always includes the auto-managed system columns (`id`, `created_at`, `updated_at`) for `base`/`user` collections, prepended to the user-defined fields. They are filtered out of the stored `_collections.schema` JSON at create time (they're added by DDL) and re-merged on read so the dashboard sees the full table shape.

### `GET /api/core/collections/:name`
- **Auth:** Superuser JWT (any role)
- **Path:** `name` (collection name or `_underscore` system table)
- **Response 200:** `{ collection: { id, name, type, source, schema, idType, idStart, count } }`

> Same system-column merge applies to the single-collection response.

### `PATCH /api/core/collections/:name`
- **Auth:** Superuser JWT — **admin only**
- **Path:** `name`
- **Body:** Same shape as POST but all top-level fields optional (per `type`). Schema changes trigger migration via `diffSchema()` + `applyMigration()`.
- **ID type change:** If `idType` is provided and differs from the current type, the backend drops + recreates the physical table with the new `id` column DDL. This is **refused** (409 `id_type_change_requires_empty_table`) when the table has any records. The `idStart` value can be adjusted independently for autoincrement collections at any time (updates `sqlite_sequence`).
- **Renaming:** If the optional top-level `name` field differs from the path `:name`, the backend runs `ALTER TABLE "old" RENAME TO "new"` (or `DROP VIEW` + `CREATE VIEW` for `type=view`) and updates `_collections.name`. The rename is **refused** (409) when:
  - the target name already exists in `_collections` (`rename_target_exists`)
  - another collection has a `relation` field with `options.targetCollection === oldName`
  - any view query contains the old name as a word-boundary match (`rename_blocked_by_references`)

  The handler never rewrites view queries or relation targets automatically — those must be updated first so the operation stays predictable.
- **Response 200:** `{ id, name, renamedFrom?, type, updated_at, migrations: { applied, errors } }` (`renamedFrom` present only when a rename occurred)
- **Response 409:** `{ error: "rename_target_exists" | "rename_blocked_by_references" | "id_type_change_requires_empty_table", target?, referencedBy?, hint?, detail? }`

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

A valid API token (`Authorization: Bearer wbs_…`) **bypasses** `apiRules` and is
instead gated only by the token's scope (see [Authentication Model](#authentication-model)).
Revoked or expired tokens fall through to the anonymous path.

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

## 11. Backups

File: `backend/src/core/backups/backupsRouter.ts`

Time-travel snapshots of the entire D1 database. Each backup is stored as a single JSON file in R2 under prefix `workerbase_db_backup/`. The filename embeds an ISO timestamp so R2 `list()` returns snapshots in chronological order for free.

A backup captures every `table`, `view`, `index`, and `trigger` from `sqlite_master` (system tables included). Tables include their full DDL, PRAGMA `table_info`, and all rows.

### `POST /api/core/backups`
- **Auth:** Superuser JWT — **admin only**
- **Purpose:** Snapshot the entire database to R2.
- **Body:**

| Field  | Type   | Required | Validation                                  |
|--------|--------|----------|---------------------------------------------|
| `name` | string | ❌       | ≤ 120 chars; `^[a-zA-Z0-9 _\-]*$`           |

- **Behaviour:** Reads `sqlite_master`, fetches PRAGMA + rows for each table, JSON-stringifies, stores at `workerbase_db_backup/{ISO}_{slug-or-uuid}.json`, inserts a manifest row in `_backups` with `type='manual'`, then applies retention.
- **Response 201:** `{ id, key, name, type, createdAt, sizeBytes, objectCount }`
- **Response 413:** `{ error: "backup_too_large", sizeBytes, maxBytes }` — current ceiling is 45 MiB.

### `GET /api/core/backups`
- **Auth:** Superuser JWT (any role)
- **Query:** `limit` (number, default 200, max 500)
- **Response 200:** `{ backups: [{ id, name, type, createdAt, sizeBytes, objectCount, generatedBy }], truncated: false }`
- **Notes:** Reads from the `_backups` manifest (sorted by `created_at DESC`).

### `GET /api/core/backups/settings`
- **Auth:** Superuser JWT (any role)
- **Response 200:** `{ settings: { autoEnabled, intervalHours, maxRetention, lastAutoAt } }`

### `PATCH /api/core/backups/settings`
- **Auth:** Superuser JWT — **admin only**
- **Body:** any subset of:

| Field            | Type    | Validation                                |
|------------------|---------|-------------------------------------------|
| `autoEnabled`    | boolean | —                                         |
| `intervalHours`  | number  | one of `1, 6, 12, 24, 168`                |
| `maxRetention`   | number  | int, 0–10000 (0 = unlimited)              |

(`lastAutoAt` is read-only — only the scheduler updates it.)
- **Response 200:** `{ settings: { ... } }` (full post-patch settings object)

### `GET /api/core/backups/:id`
- **Auth:** Superuser JWT (any role)
- **Path:** `id` — filename without the `workerbase_db_backup/` prefix. Must match `^[a-zA-Z0-9_\-\.]+\.json$` and contain no `..` or `/`.
- **Response 200:** Backup JSON with `Content-Type: application/json` and `Content-Disposition: attachment`.

### `DELETE /api/core/backups/:id`
- **Auth:** Superuser JWT — **admin only**
- **Path:** `id` — as above.
- **Response 200:** `{ success: true }`
- **Response 404:** `{ error: "not_found" }`

### `POST /api/core/backups/:id/restore`
- **Auth:** Superuser JWT — **admin only**
- **Purpose:** Restore the database to the snapshot. Uses the **shadow-swap** pattern so the live DB is never partially overwritten:
  1. **Phase 0:** drop any leftover `_wb_restore_*` shadow tables from a prior failed restore.
  2. **Phase 1:** for each table in the snapshot, create `_wb_restore_<name>` from the stored DDL (or synthesise from PRAGMA) and bulk-insert rows in batches of ≤ 500. Live tables are untouched.
  3. **Phase 1.5:** pre-flight — verify every shadow table exists.
  4. **Phase 2:** single `db.batch()` that for every table issues `DROP TABLE IF EXISTS <name>` then `ALTER TABLE _wb_restore_<name> RENAME TO <name>`, then drops and recreates views / indexes / triggers from stored DDL. D1 batches run in an implicit transaction — any failure rolls back the entire batch.
- **Response 200:** `{ restored: <objectCount>, tables: <n>, swappedAt: <iso> }`
- **Response 500 (any phase):** `{ error, detail, phase }`. The live database is unchanged. Shadow tables may be left in place for inspection; they are cleaned up at the start of the next restore attempt.

### Scheduled handler (Cron Trigger)
- **Trigger:** wrangler `triggers.crons: ["0 * * * *"]` — fires hourly.
- **Behaviour:** Calls `runAutoBackupIfNeeded(env)` exported from `backupsRouter.ts`. If `autoEnabled` and `now - lastAutoAt ≥ intervalHours * 3600_000`, creates a snapshot tagged `type: "auto"`, updates `lastAutoAt`, and applies retention.

---

## 12. Logs

Every API request (`/api/*`) is logged to the `_logs` table by a request-logging middleware in `src/index.ts`. Writes happen in the background via `c.executionCtx.waitUntil(...)` so they never block the response. Level is derived from the response status (`info` < 400, `warn` 400–499, `error` ≥ 500). Retention is configurable via the `/api/core/logs/settings` endpoints below (defaults: 5,000 rows, no age-based pruning).

### `GET /api/core/logs/settings`
- **Auth:** Superuser JWT (any role)
- **Purpose:** Read the log retention configuration stored under `_settings.logs`.
- **Response 200:**
```json
{
  "settings": {
    "retentionLimit": 5000,
    "retentionDays": 0,
    "lastPrunedAt": null
  }
}
```
- `retentionLimit` — max rows to keep. `0` disables the row-count cap. Applied on every insert (oldest rows trimmed).
- `retentionDays` — max age in days. `0` disables time-based pruning. The sweep runs at most once per hour.
- `lastPrunedAt` — epoch-ms of the last time-based sweep (informational).

### `PATCH /api/core/logs/settings`
- **Auth:** Superuser JWT — **admin only**
- **Body:**
```json
{ "retentionLimit": 10000, "retentionDays": 30 }
```
- **Validation:** `retentionLimit` integer 0–1,000,000; `retentionDays` integer 0–3,650. Both optional (merge update).
- **Response 200:** `{ settings: LogsSettings }` (full merged object after update)

### `GET /api/core/logs/timeseries`
- **Auth:** Superuser JWT (any role)
- **Query:**

| Param  | Type | Default | Notes                          |
|--------|------|---------|--------------------------------|
| `range`| enum | `7d`    | `7d` (daily) or `24h` (hourly) |

- **Purpose:** Aggregates request counts + duration stats into time buckets for the logs dashboard bar chart. Gaps are filled with zeros.
- **Response 200:**
```json
{
  "range": "7d",
  "buckets": [
    { "label": "Mon", "count": 120, "avgDuration": 45, "maxDuration": 200 }
  ]
}
```
For `range=24h`, labels are hour strings like `"14:00"`.

### `GET /api/core/logs/summary`
- **Auth:** Superuser JWT (any role)
- **Purpose:** Returns aggregate counts per log level for the bar chart on the logs dashboard.
- **Response 200:** `{ total: number, info: number, warn: number, error: number }`

### `GET /api/core/logs`
- **Auth:** Superuser JWT (any role)
- **Query:**

| Param   | Type   | Default | Notes                                            |
|---------|--------|---------|--------------------------------------------------|
| `page`  | number | 1       | ≥ 1                                              |
| `perPage` | number | 50    | 1–100                                            |
| `level` | enum   | —       | optional filter: `info` \| `warn` \| `error`    |

- **Response 200:** `{ items: LogEntry[], page, perPage, total, totalPages }`

```ts
interface LogEntry {
  id: string;
  level: "info" | "warn" | "error";
  method: string;      // "GET", "POST", ...
  path: string;        // "/api/core/..."
  status: number;
  durationMs: number;
  ip: string | null;
  userAgent: string | null;
  error: string | null;
  createdAt: number;   // unix ms
}
```

### `DELETE /api/core/logs`
- **Auth:** Superuser JWT — **admin only**
- **Behaviour:** Clears all rows from `_logs`.
- **Response 200:** `{ success: true }`

---

## 13. Settings

System-wide key/value store backed by the `_settings` table (one row per key, JSON-encoded values). Used for application config that every signed-in dashboard user should see identically — including timezone and date/time format.

### `GET /api/core/settings`
- **Auth:** Superuser JWT (any role — viewers can read)
- **Purpose:** Returns the full settings blob. Known keys include:
  - `installed` — install-flow sentinel (read-only; cannot be PATCHed)
  - `appName`, `appUrl`, `accentColor`, `batchApi`, `rateLimit` — application basics
  - **`rateLimit`** — `{ enabled: boolean, rules: RateLimitRule[] }` where each rule is `{ id, label, maxRequests, interval, target }`. When enabled, the rate limit middleware checks each `/api/*` request against the rules and returns `429` if a per-IP limit is exceeded. Rule labels support patterns: `*.auth` (path contains keyword), `*.create` (POST to /records or /create), `/api/` (prefix), `/` (catch-all). Response 429: `{ error: "rate_limited", detail, retryAfter }` with `Retry-After` header.
  - `senderName`, `senderEmail`, `smtpHost`, `smtpPort`, `smtpUser`, `smtpPassword`, `smtpSecure` — mail/SMTP
  - `backups` — `{ autoEnabled, intervalHours, maxRetention, lastAutoAt }`
  - `logs` — `{ retentionLimit, retentionDays, lastPrunedAt }` (also exposed via `/api/core/logs/settings`)
  - **`timezone`** — IANA zone (e.g. `"America/New_York"`); empty/undefined means "browser default". Drives every dashboard timestamp via `Intl.DateTimeFormat`.
  - **`dateTimeFormat`** — one of `iso8601`, `compact`, `long`, `us`, `european`, `custom`. Dashboard preset for rendering timestamps.
  - **`customDateTimePattern`** — token template (e.g. `"YYYY-MM-DD HH:mm"`), only consulted when `dateTimeFormat === "custom"`. Tokens: `YYYY`, `YY`, `MMMM`, `MMM`, `MM`, `DD`, `HH`, `hh`, `mm`, `ss`, `a`, `Z`, `z`. Literals wrapped in `[brackets]`.
- **Response 200:** `{ settings: { ...all keys as JSON... } }`

### `PATCH /api/core/settings`
- **Auth:** Superuser JWT — **admin only**
- **Purpose:** Merge-update one or more settings keys. Each value is JSON-encoded and upserted into `_settings`.
- **Body:** any JSON object of `{ key: value }` pairs, except reserved keys (`installed`) which are silently dropped.
- **Response 200:** `{ updated: ["key1", "key2"] }`
- **Notes:** The `timezone` / `dateTimeFormat` / `customDateTimePattern` keys are interpreted by the dashboard as a single logical group. Patches are applied atomically via `db.batch()`. Non-admins (editor/viewer) receive 403.

---

## 14. API Tokens

File: `backend/src/core/apiTokens/apiTokensRouter.ts`

Personal Access Tokens (PATs) for programmatic access to the public records API
(`/api/collections/*`). All endpoints require an **admin** superuser JWT. Tokens
are opaque `wbs_…` strings; only the SHA-256 hash is stored, so the raw value is
returned exactly **once** at creation time.

### `GET /api/core/api-tokens`
- **Auth:** Superuser JWT — **admin only**
- **Response 200:** `{ tokens: ApiTokenMeta[] }` (sorted by `created_at` DESC; never includes `token_hash` or the raw token)

### `GET /api/core/api-tokens/:id`
- **Auth:** Superuser JWT — **admin only**
- **Path:** `id` (UUID)
- **Response 200:** `{ token: ApiTokenMeta }` · 404 if not found

### `POST /api/core/api-tokens`
- **Auth:** Superuser JWT — **admin only**
- **Body:**

| Field            | Type                                | Required | Validation                                            |
|------------------|-------------------------------------|----------|-------------------------------------------------------|
| `name`           | string                              | yes      | 1–80 chars                                            |
| `scopes`         | `"read" \| "write" \| "admin"`      | yes      | enum                                                  |
| `collectionScope`| string                              | no       | 1–64 chars; must match an existing collection name   |
| `expiresInDays`  | number                              | no       | integer 1–3650                                        |

- **Response 201:** `{ token: "wbs_…", tokenMeta: ApiTokenMeta }` — the raw token is returned **only here**; persist it client-side, it cannot be recovered.
- **Errors:** 400 `validation_failed` · 400 `unknown_collection` (bad `collectionScope`) · 403 non-admin role · 401 missing token

### `PATCH /api/core/api-tokens/:id`
- **Auth:** Superuser JWT — **admin only**
- **Body:** any subset of `{ name?, scopes?, collectionScope? }` (same validation as POST)
- **Response 200:** `{ token: ApiTokenMeta }`
- **Errors:** 400 `validation_failed` · 400 `unknown_collection` · 404 `not_found`

### `DELETE /api/core/api-tokens/:id`
- **Auth:** Superuser JWT — **admin only**
- **Query:** `permanent=1` to hard-delete the row; otherwise a soft-revoke (`revoked_at` set).
- **Response 200:** `{ success: true, revoked: true }` (soft) or `{ success: true, permanent: true }` (hard)
- **Errors:** 404 `not_found`. Idempotent — re-revoking an already-revoked token succeeds.

### `ApiTokenMeta` shape

| Field             | Type                | Notes                                         |
|-------------------|---------------------|-----------------------------------------------|
| `id`              | string (UUID)       |                                               |
| `name`            | string              | user-supplied label                           |
| `prefix`          | string              | first 10 chars of the random portion (UI hint)|
| `scopes`          | `"read" \| "write" \| "admin"` |                                       |
| `collection_scope`| string \| null      | NULL = all collections                        |
| `created_by`      | string              | superuser id                                  |
| `created_at`      | integer (ms)        |                                               |
| `last_used_at`    | integer \| null     | updated on each records-API call using token  |
| `expires_at`      | integer \| null     | NULL = never expires                          |
| `revoked_at`      | integer \| null     | set on soft-revoke; NULL = active             |

### Using an API token

```bash
curl -X POST https://<worker>/api/collections/posts/records \
  -H "Authorization: Bearer wbs_<your-token>" \
  -H "Content-Type: application/json" \
  --data-raw '{"title":"Hello"}'
```

The records API recognises the `wbs_` prefix and short-circuits the normal
JWT/rule evaluation, applying only the scope + `collectionScope` checks.

---

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
- `core/apiTokens/apiTokensRouter.ts`
- `core/sql/sqlQueriesRouter.ts`
- `core/storage/storageRouter.ts`
- `core/realtime/realtimeRouter.ts`
- `core/export/exportRouter.ts`
- `core/import/importRouter.ts`
- `core/backups/backupsRouter.ts`
