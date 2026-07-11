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

export interface LogsSummary {
  total: number;
  info: number;
  warn: number;
  error: number;
}

// ─────────────────────────────────────────────────────────────
//  GET /api/core/logs/summary
// ─────────────────────────────────────────────────────────────

export async function apiGetLogsSummary(): Promise<LogsSummary> {
  return apiClient.get<LogsSummary>("/api/core/logs/summary");
}

export interface TimeBucket {
  label: string;
  count: number;
  avgDuration: number;
  maxDuration: number;
  totalDuration: number;
  info: number;
  warn: number;
  error: number;
}

export interface TimeSeriesData {
  range: string;
  buckets: TimeBucket[];
}

// ─────────────────────────────────────────────────────────────
//  GET /api/core/logs/timeseries?range=7d|24h
// ─────────────────────────────────────────────────────────────

export async function apiGetLogsTimeseries(
  range: "7d" | "24h" | "day",
  date?: string,
): Promise<TimeSeriesData> {
  const query: Record<string, unknown> = { range };
  if (date) query.date = date;
  return apiClient.get<TimeSeriesData>("/api/core/logs/timeseries", query);
}
