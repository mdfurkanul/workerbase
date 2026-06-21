import { Link } from "react-router-dom";
import { Activity, ArrowUpRight, Boxes, Database, Server, Users } from "lucide-react";
import AppShell from "@/components/AppShell";
import { APP_VERSION } from "@/lib/mockData";
import { useCollections } from "@/hooks/useCollections";
import { buildCollectionUrl } from "@/lib/collectionUrl";
import TypeBadge from "@/components/TypeBadge";

export default function Overview() {
  const { collections, loading, error, refresh } = useCollections();

  const totalRecords = collections.reduce((s, c) => s + (c.count ?? 0), 0);
  const userCollections = collections.filter((c) => c.type === "user").length;
  const views = collections.filter((c) => c.type === "view").length;

  return (
    <AppShell>
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

        {/* Activity feed */}
        <section className="bg-surface border border-line rounded">
          <header className="px-4 py-3 hairline-b flex items-center gap-2">
            <Activity size={14} className="text-brand" />
            <span className="label-mono">Recent activity</span>
          </header>
          <ul className="px-4 py-2 space-y-2 text-[13px]">
            {[
              ["post", "created in", "posts", "2m ago"],
              ["user", "signed in to", "members", "11m ago"],
              ["migration", "applied to", "D1", "1h ago"],
              ["view", "refreshed", "top_posts", "3h ago"],
            ].map(([verb, prep, target, when], i) => (
              <li key={i} className="flex items-center justify-between gap-2">
                <span className="text-ink-muted truncate">
                  <span className="font-mono text-ink">{verb}</span> {prep}{" "}
                  <span className="font-mono text-brand">{target}</span>
                </span>
                <span className="text-ink-faint text-[11px] whitespace-nowrap">{when}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </AppShell>
  );
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
