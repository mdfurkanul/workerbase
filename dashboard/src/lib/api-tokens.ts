/**
 * API client for the /api/core/api-tokens/* endpoints.
 *
 * All helpers use the global `apiClient` which auto-attaches the admin
 * superuser JWT. The raw token value is only ever returned from `create`.
 */

import { apiClient } from "./api-client";

export type ApiTokenScope = "read" | "write" | "admin";

export interface ApiTokenMeta {
  id: string;
  name: string;
  /** First 10 chars of the random portion — UI hint only. */
  prefix: string;
  scopes: ApiTokenScope;
  collection_scope: string | null;
  created_by: string;
  created_at: number;
  last_used_at: number | null;
  expires_at: number | null;
  revoked_at: number | null;
}

export interface CreateApiTokenInput {
  name: string;
  scopes: ApiTokenScope;
  collectionScope?: string | null;
  expiresInDays?: number;
}

export interface CreateApiTokenResponse {
  /** Raw `wbs_…` token — shown ONCE, never recoverable. */
  token: string;
  tokenMeta: ApiTokenMeta;
}

export interface UpdateApiTokenInput {
  name?: string;
  scopes?: ApiTokenScope;
  collectionScope?: string | null;
}

export async function apiListTokens(): Promise<ApiTokenMeta[]> {
  const r = await apiClient.get<{ tokens: ApiTokenMeta[] }>(`/api/core/api-tokens`);
  return r.tokens;
}

export async function apiGetToken(id: string): Promise<ApiTokenMeta> {
  const r = await apiClient.get<{ token: ApiTokenMeta }>(`/api/core/api-tokens/${id}`);
  return r.token;
}

export async function apiCreateToken(
  input: CreateApiTokenInput,
): Promise<CreateApiTokenResponse> {
  return apiClient.post<CreateApiTokenResponse>(`/api/core/api-tokens`, input);
}

export async function apiUpdateToken(
  id: string,
  patch: UpdateApiTokenInput,
): Promise<ApiTokenMeta> {
  const r = await apiClient.patch<{ token: ApiTokenMeta }>(
    `/api/core/api-tokens/${id}`,
    patch,
  );
  return r.token;
}

export async function apiRevokeToken(
  id: string,
  opts: { permanent?: boolean } = {},
): Promise<void> {
  const path = opts.permanent
    ? `/api/core/api-tokens/${id}?permanent=1`
    : `/api/core/api-tokens/${id}`;
  await apiClient.del<{ success: boolean }>(path);
}
