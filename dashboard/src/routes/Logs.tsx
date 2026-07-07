import { useEffect, useState } from "react";
import AppShell, { PageHeader } from "@/components/AppShell";
import { apiClient } from "@/lib/api-client";
import { usePrefs } from "@/hooks/usePrefs";
import type { LogEntry, LogLevel } from "@/lib/api-types";

interface LogsResponse {
  items: LogEntry[];
  page: number;
  perPage: number;
  total: number;
  totalPages: number;
}

const PER_PAGE = 50;

export default function Logs() {
  const [rows, setRows] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [level, setLevel] = useState<LogLevel | "">("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const { formatDateTime } = usePrefs();

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const query: Record<string, unknown> = { page, perPage: PER_PAGE };
      if (level) query.level = level;
      const res = await apiClient.get<LogsResponse>("/api/core/logs", query);
      setRows(res.items ?? []);
      setTotalPages(res.totalPages ?? 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load logs");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [page, level]);

  return (
    <AppShell>
      <PageHeader
        breadcrumbs={[<span>Logs</span>]}
        actions={
          <div className="flex items-center gap-2">
            <select
              value={level}
              onChange={(e) => {
                setLevel(e.target.value as LogLevel | "");
                setPage(1);
              }}
              className="field-input text-[12px] py-1"
            >
              <option value="">All levels</option>
              <option value="info">info</option>
              <option value="warn">warn</option>
              <option value="error">error</option>
            </select>
            <button onClick={() => void load()} className="btn-ghost text-[12px]">
              Refresh
            </button>
          </div>
        }
      />

      <div className="flex-1 overflow-y-auto">
        <section className="px-6 py-4">
          <div className="flex items-center justify-between mb-2">
            <span className="label-mono">Recent log entries</span>
            <span className="label-mono text-ink-faint">
              {loading ? "loading…" : `${rows.length} shown`}
            </span>
          </div>

          {error ? (
            <div className="bg-err-bg border border-err/40 text-err rounded px-4 py-3 text-[13px] font-mono">
              {error}
            </div>
          ) : (
            <div className="bg-surface border border-line rounded font-mono text-[12px] overflow-hidden">
              <div className="grid grid-cols-[80px_70px_1fr_70px_70px_180px] px-4 py-2 hairline-b bg-surface-2 label-mono">
                <span>Level</span>
                <span>Method</span>
                <span>Path</span>
                <span>Status</span>
                <span>Ms</span>
                <span>At</span>
              </div>
              <div className="max-h-[60vh] overflow-y-auto">
                {rows.length === 0 && !loading ? (
                  <div className="px-4 py-6 text-center text-ink-faint">
                    No log entries.
                  </div>
                ) : (
                  rows.map((e, i) => {
                    const lvl = (e.level ?? "info").toLowerCase();
                    const status = e.status ?? 0;
                    const duration = e.durationMs ?? 0;
                    const at = e.createdAt ? formatDateTime(e.createdAt) : "";
                    return (
                      <div
                        key={e.id ?? i}
                        className="grid grid-cols-[80px_70px_1fr_70px_70px_180px] px-4 py-2 hairline-b last:border-b-0 hover:bg-surface-2"
                      >
                        <span
                          className={
                            lvl === "error"
                              ? "text-err"
                              : lvl === "warn"
                                ? "text-warn"
                                : "text-ok"
                          }
                        >
                          ● {lvl}
                        </span>
                        <span className="text-ink">{e.method ?? ""}</span>
                        <span className="text-ink-muted truncate">{e.path ?? ""}</span>
                        <span className={status >= 400 ? "text-err" : "text-ink"}>
                          {status || ""}
                        </span>
                        <span className="text-ink-faint">{duration}</span>
                        <span className="text-ink-faint">{at}</span>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {totalPages > 1 && (
            <div className="flex items-center justify-end gap-2 mt-3 text-[12px] text-ink-muted">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="btn-icon disabled:opacity-30 disabled:cursor-not-allowed"
                aria-label="Previous page"
              >
                ‹
              </button>
              <span className="font-mono">
                {page} / {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="btn-icon disabled:opacity-30 disabled:cursor-not-allowed"
                aria-label="Next page"
              >
                ›
              </button>
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}
