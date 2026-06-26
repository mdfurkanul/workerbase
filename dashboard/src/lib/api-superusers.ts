/**
 * Superuser auth API functions.
 *
 * All functions hit the backend `/api/core/superusers/*` routes and use the shared
 * `apiClient` from `api-client.ts`.  Token persistence is handled by the
 * caller — these functions only return the server response.
 */

import { apiClient, setToken } from "./api-client";
import type {
  AuthResponse,
  CreateSuperuserResponse,
  Superuser,
} from "./api-types";

// ─────────────────────────────────────────────────────────────
//  POST /api/core/superusers/login
// ─────────────────────────────────────────────────────────────

export async function apiLogin(
  email: string,
  password: string,
): Promise<AuthResponse> {
  const res = await apiClient.post<AuthResponse>("/api/core/superusers/login", {
    email,
    password,
  });
  setToken(res.token);
  return res;
}

// ─────────────────────────────────────────────────────────────
//  POST /api/core/superusers/magic-request
// ─────────────────────────────────────────────────────────────

export async function apiMagicRequest(
  email: string,
): Promise<{ success: boolean }> {
  return apiClient.post<{ success: boolean }>(
    "/api/core/superusers/magic-request",
    { email },
  );
}

// ─────────────────────────────────────────────────────────────
//  GET /api/core/superusers/magic-verify?token=...
// ─────────────────────────────────────────────────────────────

export async function apiMagicVerify(token: string): Promise<AuthResponse> {
  const res = await apiClient.get<AuthResponse>(
    "/api/core/superusers/magic-verify",
    { token },
  );
  setToken(res.token);
  return res;
}

// ─────────────────────────────────────────────────────────────
//  POST /api/core/superusers/forgot-password
// ─────────────────────────────────────────────────────────────

export async function apiForgotPassword(
  email: string,
): Promise<{ success: boolean }> {
  return apiClient.post<{ success: boolean }>(
    "/api/core/superusers/forgot-password",
    { email },
  );
}

// ─────────────────────────────────────────────────────────────
//  POST /api/core/superusers/reset-password
// ─────────────────────────────────────────────────────────────

export async function apiResetPassword(
  token: string,
  password: string,
): Promise<AuthResponse> {
  const res = await apiClient.post<AuthResponse>(
    "/api/core/superusers/reset-password",
    { token, password },
  );
  setToken(res.token);
  return res;
}

// ─────────────────────────────────────────────────────────────
//  GET /api/core/superusers/me
// ─────────────────────────────────────────────────────────────

export async function apiGetMe(): Promise<{ user: Superuser }> {
  return apiClient.get<{ user: Superuser }>("/api/core/superusers/me");
}

// ─────────────────────────────────────────────────────────────
//  POST /api/core/superusers/create  (superuser-only)
// ─────────────────────────────────────────────────────────────

export async function apiCreateSuperuser(
  email: string,
  password: string,
): Promise<CreateSuperuserResponse> {
  return apiClient.post<CreateSuperuserResponse>(
    "/api/core/superusers/create",
    { email, password },
  );
}
