/**
 * Logs API functions.
 *
 * Hits the backend `/api/core/logs` route via the shared `apiClient`.
 */

import { apiClient } from "./api-client";
import type { LogEntry, LogLevel, PaginatedResponse } from "./api-types";

export interface ListLogsOptions {
  page?: number;
  perPage?: number;
  level?: LogLevel;
}

// ─────────────────────────────────────────────────────────────
//  GET /api/core/logs?page=1&perPage=50&level=error
// ─────────────────────────────────────────────────────────────

export async function apiListLogs(
  opts: ListLogsOptions = {},
): Promise<PaginatedResponse<LogEntry>> {
  const query: Record<string, unknown> = {};
  if (opts.page !== undefined) query.page = opts.page;
  if (opts.perPage !== undefined) query.perPage = opts.perPage;
  if (opts.level !== undefined) query.level = opts.level;

  return apiClient.get<PaginatedResponse<LogEntry>>("/api/core/logs", query);
}
