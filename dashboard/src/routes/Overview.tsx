import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Activity, ArrowUpRight, Boxes, Database, Server, Users } from "lucide-react";
import AppShell from "@/components/AppShell";
import { APP_VERSION } from "@/lib/types";
import { useCollections } from "@/hooks/useCollections";
import { buildCollectionUrl } from "@/lib/collectionUrl";
import TypeBadge from "@/components/TypeBadge";
import { apiClient } from "@/lib/api-client";
import type { LogEntry } from "@/lib/api-types";

interface LogsResponse {
  items: LogEntry[];
  page: number;
  perPage: number;
  total: number;
  totalPages: number;
}

export default function Overview() {
  const { collections, loading, error, refresh } = useCollections();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [logsLoading, setLogsLoading] = useState(true);

  useEffect(() => {
    setLogsLoading(true);
    apiClient
      .get<LogsResponse>("/api/core/logs", { perPage: 8 })
      .then((r) => setLogs(r.items ?? []))
      .catch(() => setLogs([]))
      .finally(() => setLogsLoading(false));
  }, [collections]);

  const totalRecords = collections.reduce((s, c) => s + (c.count ?? 0), 0);
  const userCollections = collections.filter((c) => c.type === "user").length;
  const views = collections.filter((c) => c.type === "view").length;

  return (
    <AppShell>
      <div className="flex-1 overflow-y-auto">
      <div className="px-6 pt-5 pb-3 flex items-end justify-between">
        <div>
          <span className="label-mono">Overview</span>
          <h1 className="font-display text-3xl mt-1">Workerbase control plane</h1>
          <p className="text-ink-muted text-[14px] mt-1">
            Edge-native collections on Cloudflare D1 + R2 + Durable Objects.{" "}
            <span className="font-mono text-brand">{APP_VERSION}</span>
          </p>
        </div>
        <button
          onClick={() => void refresh()}
          className="btn-ghost text-[12px]"
          disabled={loading}
        >
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>

      <div className="px-6 py-4 grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Collections" value={loading ? "—" : collections.length} icon={<Database size={16} />} />
        <Stat label="Total records" value={loading ? "—" : totalRecords.toLocaleString()} icon={<Boxes size={16} />} />
        <Stat label="Auth pools" value={loading ? "—" : userCollections} icon={<Users size={16} />} />
        <Stat label="Views" value={loading ? "—" : views} icon={<Server size={16} />} />
      </div>

      {error && (
        <div className="mx-6 mb-4 px-3 py-2 rounded border border-line-strong bg-err-bg text-err text-[12px] font-mono">
          Failed to load collections: {error}
        </div>
      )}

      {/* Requests-over-time chart lives on the Logs page */}

      <div className="px-6 py-4 grid lg:grid-cols-[1.5fr_1fr] gap-4">
        {/* Collections index */}
        <section className="bg-surface border border-line rounded">
          <header className="px-4 py-3 hairline-b flex items-center justify-between">
            <span className="label-mono">All collections</span>
            <Link to="/collections/new" className="btn-ghost text-[12px]">
              + New
            </Link>
          </header>
          {loading ? (
            <ListSkeleton />
          ) : (
            <ul>
              {collections.map((c) => (
                <li key={c.id ?? c.name}>
                  <Link
                    to={buildCollectionUrl(c.name)}
                    className="flex items-center justify-between px-4 py-2.5 hairline-b last:border-b-0 hover:bg-surface-2 transition"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <TypeBadge type={c.type} />
                      <span className="font-mono text-[13px] text-ink truncate">{c.name}</span>
                    </div>
                    <div className="flex items-center gap-3 text-[12px] text-ink-muted">
                      <span className="font-mono">{(c.count ?? 0).toLocaleString()} rows</span>
                      <ArrowUpRight size={14} />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Activity feed — driven by the real `_logs` table */}
        <section className="bg-surface border border-line rounded">
          <header className="px-4 py-3 hairline-b flex items-center gap-2">
            <Activity size={14} className="text-brand" />
            <span className="label-mono">Recent activity</span>
            <Link
              to="/logs"
              className="ml-auto text-[11px] text-ink-faint hover:text-ink font-mono uppercase tracking-widest"
            >
              View all
            </Link>
          </header>
          <ul className="px-4 py-2 space-y-2 text-[13px]">
            {logsLoading ? (
              <li className="text-ink-faint text-[12px] py-2">Loading…</li>
            ) : logs.length === 0 ? (
              <li className="text-ink-faint text-[12px] py-2 italic">
                No activity yet — API requests will appear here in real time.
              </li>
            ) : (
              logs.map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-2">
                  <span className="text-ink-muted truncate font-mono text-[12px]">
                    <span className={e.status >= 500 ? "text-err" : e.status >= 400 ? "text-warn" : "text-ink"}>
                      {e.method}
                    </span>{" "}
                    <span className="text-ink-muted">{e.path}</span>
                    <span className="text-ink-faint"> · {e.status}</span>
                  </span>
                  <span className="text-ink-faint text-[11px] whitespace-nowrap">
                    {formatRelative(e.createdAt)}
                  </span>
                </li>
              ))
            )}
          </ul>
        </section>
      </div>
      </div>
    </AppShell>
  );
}

/** Format a unix-ms timestamp as a compact relative string ("3m ago", "2h ago"). */
function formatRelative(ms: number): string {
  const secs = Math.max(1, Math.floor((Date.now() - ms) / 1000));
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function Stat({ label, value, icon }: { label: string; value: string | number; icon: React.ReactNode }) {
  return (
    <div className="bg-surface border border-line rounded p-4">
      <div className="flex items-center justify-between">
        <span className="label-mono">{label}</span>
        <span className="text-ink-faint">{icon}</span>
      </div>
      <div className="mt-2 text-2xl font-display">{value}</div>
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="px-4 py-3 space-y-2">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="h-8 rounded bg-surface-2 animate-pulse"
          style={{ opacity: 1 - i * 0.1 }}
        />
      ))}
    </div>
  );
}
