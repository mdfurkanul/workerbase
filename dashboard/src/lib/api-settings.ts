/**
 * Application settings API functions.
 *
 * Hits the backend `/api/core/settings` routes via the shared `apiClient`.
 */

import { apiClient } from "./api-client";
import type { AppSettings } from "./api-types";

// ─────────────────────────────────────────────────────────────
//  GET /api/core/settings
// ─────────────────────────────────────────────────────────────

export async function apiGetSettings(): Promise<AppSettings> {
  return apiClient.get<AppSettings>("/api/core/settings");
}

// ─────────────────────────────────────────────────────────────
//  PATCH /api/core/settings
// ─────────────────────────────────────────────────────────────

export async function apiUpdateSettings(
  patch: Partial<AppSettings>,
): Promise<AppSettings> {
  return apiClient.patch<AppSettings>("/api/core/settings", patch);
}
