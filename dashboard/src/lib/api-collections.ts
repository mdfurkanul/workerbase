/**
 * Collection CRUD + record CRUD API functions.
 *
 * All functions hit the backend `/api/core/collections/*` routes and use the shared
 * `apiClient` from `api-client.ts`.
 */

import { apiClient } from "./api-client";
import type {
  Collection,
  CollectionType,
  ConstraintDefinition,
  FieldDefinition,
  IndexDefinition,
  PaginatedResponse,
  PermissionScope,
  RecordRow,
  AuthConfig,
  EmailTemplates,
} from "./api-types";

// ═══════════════════════════════════════════════════════════════
//  Collection-level endpoints
// ═══════════════════════════════════════════════════════════════

// ─────────────────────────────────────────────────────────────
//  GET /api/core/collections
// ─────────────────────────────────────────────────────────────

export async function apiListCollections(): Promise<{ collections: Collection[] }> {
  return apiClient.get<{ collections: Collection[] }>("/api/core/collections");
}

// ─────────────────────────────────────────────────────────────
//  GET /api/core/collections/:name
// ─────────────────────────────────────────────────────────────

export async function apiGetCollection(
  name: string,
): Promise<{ collection: Collection }> {
  return apiClient.get<{ collection: Collection }>(
    `/api/core/collections/${encodeURIComponent(name)}`,
  );
}

// ─────────────────────────────────────────────────────────────
//  POST /api/core/collections
// ─────────────────────────────────────────────────────────────

export interface CreateCollectionPayload {
  name: string;
  type: CollectionType;
  schema?: FieldDefinition[];
  query?: string;
  indexes?: IndexDefinition[];
  constraints?: ConstraintDefinition[];
  authConfig?: AuthConfig;
  emailTemplates?: EmailTemplates;
  listRule?: PermissionScope;
  viewRule?: PermissionScope;
  createRule?: PermissionScope;
  updateRule?: PermissionScope;
  deleteRule?: PermissionScope;
}

export async function apiCreateCollection(
  data: CreateCollectionPayload,
): Promise<Collection> {
  return apiClient.post<Collection>("/api/core/collections", data);
}

// ─────────────────────────────────────────────────────────────
//  PATCH /api/core/collections/:name
// ─────────────────────────────────────────────────────────────

export type UpdateCollectionPatch = Partial<CreateCollectionPayload>;

export async function apiUpdateCollection(
  name: string,
  patch: UpdateCollectionPatch,
): Promise<Collection> {
  return apiClient.patch<Collection>(
    `/api/core/collections/${encodeURIComponent(name)}`,
    patch,
  );
}

// ─────────────────────────────────────────────────────────────
//  DELETE /api/core/collections/:name
// ─────────────────────────────────────────────────────────────

export async function apiDeleteCollection(
  name: string,
): Promise<{ success: boolean }> {
  return apiClient.del<{ success: boolean }>(
    `/api/core/collections/${encodeURIComponent(name)}`,
  );
}

// ═══════════════════════════════════════════════════════════════
//  Record-level endpoints
// ═══════════════════════════════════════════════════════════════

export interface ListRecordsOptions {
  page?: number;
  perPage?: number;
  filter?: string;
  sort?: string;
}

// ─────────────────────────────────────────────────────────────
//  GET /api/core/collections/:name/records
// ─────────────────────────────────────────────────────────────

export async function apiListRecords(
  name: string,
  opts: ListRecordsOptions = {},
): Promise<PaginatedResponse<RecordRow>> {
  const query: { [key: string]: unknown } = {};
  if (opts.page !== undefined) query.page = opts.page;
  if (opts.perPage !== undefined) query.perPage = opts.perPage;
  if (opts.filter !== undefined) query.filter = opts.filter;
  if (opts.sort !== undefined) query.sort = opts.sort;

  return apiClient.get<PaginatedResponse<RecordRow>>(
    `/api/core/collections/${encodeURIComponent(name)}/records`,
    query,
  );
}

// ─────────────────────────────────────────────────────────────
//  GET /api/core/collections/:name/records/:id
// ─────────────────────────────────────────────────────────────

export async function apiGetRecord(
  name: string,
  id: string,
): Promise<RecordRow> {
  return apiClient.get<RecordRow>(
    `/api/core/collections/${encodeURIComponent(name)}/records/${encodeURIComponent(id)}`,
  );
}

// ─────────────────────────────────────────────────────────────
//  POST /api/core/collections/:name/records
// ─────────────────────────────────────────────────────────────

export async function apiCreateRecord(
  name: string,
  data: RecordRow,
): Promise<RecordRow> {
  return apiClient.post<RecordRow>(
    `/api/core/collections/${encodeURIComponent(name)}/records`,
    data,
  );
}

// ─────────────────────────────────────────────────────────────
//  PATCH /api/core/collections/:name/records/:id
// ─────────────────────────────────────────────────────────────

export async function apiUpdateRecord(
  name: string,
  id: string,
  patch: Partial<RecordRow>,
): Promise<RecordRow> {
  return apiClient.patch<RecordRow>(
    `/api/core/collections/${encodeURIComponent(name)}/records/${encodeURIComponent(id)}`,
    patch,
  );
}

// ─────────────────────────────────────────────────────────────
//  DELETE /api/core/collections/:name/records/:id
// ─────────────────────────────────────────────────────────────

export async function apiDeleteRecord(
  name: string,
  id: string,
): Promise<{ success: boolean }> {
  return apiClient.del<{ success: boolean }>(
    `/api/core/collections/${encodeURIComponent(name)}/records/${encodeURIComponent(id)}`,
  );
}
