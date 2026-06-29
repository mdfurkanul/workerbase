import { useEffect, useState } from "react";
import AppShell, { PageHeader } from "@/components/AppShell";
import { apiClient } from "@/lib/api-client";

interface LogRow {
  id?: string | null;
  level?: string | null;
  method?: string | null;
  path?: string | null;
  status?: number | null;
  duration_ms?: number | null;
  duration?: number | null;
  ip?: string | null;
  user_agent?: string | null;
  error?: string | null;
  created_at?: number | null;
}

interface ExecuteResult {
  ok: boolean;
  columns?: string[];
  rows?: LogRow[];
  rowCount?: number;
  error?: string;
}

const LOGS_QUERY = "SELECT * FROM _logs ORDER BY created_at DESC LIMIT 50";

export default function Logs() {
  const [rows, setRows] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.post<ExecuteResult>("/api/core/sql/execute", {
        sql: LOGS_QUERY,
      });
      if (res.ok) {
        setRows(res.rows ?? []);
      } else {
        setError(res.error ?? "Failed to load logs");
        setRows([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load logs");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <AppShell>
      <PageHeader
        breadcrumbs={[<span>Logs</span>]}
        actions={
          <button onClick={() => void load()} className="btn-ghost text-[12px]">
            Refresh
          </button>
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
                    const level = (e.level ?? "info").toLowerCase();
                    const status = e.status ?? 0;
                    const duration = e.duration_ms ?? e.duration ?? 0;
                    const at = e.created_at
                      ? new Date(e.created_at).toISOString().replace("T", " ").slice(0, 19)
                      : "";
                    return (
                      <div
                        key={e.id ?? i}
                        className="grid grid-cols-[80px_70px_1fr_70px_70px_180px] px-4 py-2 hairline-b last:border-b-0 hover:bg-surface-2"
                      >
                        <span
                          className={
                            level === "error"
                              ? "text-err"
                              : level === "warn"
                                ? "text-warn"
                                : "text-ok"
                          }
                        >
                          ● {level}
                        </span>
                        <span className="text-ink">{e.method ?? ""}</span>
                        <span className="text-ink-muted truncate">{e.path ?? ""}</span>
                        <span className={status >= 400 ? "text-err" : "text-ink"}>{status || ""}</span>
                        <span className="text-ink-faint">{duration}</span>
                        <span className="text-ink-faint">{at}</span>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}
