import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";

interface FakeCollection {
  name: string;
  type: "base" | "user" | "view";
  rows: number;
}

const SEED: FakeCollection[] = [
  { name: "posts", type: "base", rows: 1240 },
  { name: "members", type: "user", rows: 312 },
  { name: "top_posts", type: "view", rows: 24 },
  { name: "events", type: "base", rows: 88 },
];

/** Mock dashboard — real data wiring lands in a later pass. */
export default function Dashboard() {
  const { user, logout } = useAuth();
  const [clock, setClock] = useState(() => new Date());

  useEffect(() => {
    const c = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(c);
  }, []);

  return (
    <div className="min-h-screen bg-bg">
      {/* Top bar */}
      <header className="hairline-b sticky top-0 bg-bg/95 backdrop-blur z-10">
        <div className="px-6 lg:px-10 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-brand">◆</span>
            <span className="font-display italic text-xl">Workerbase</span>
            <span className="label-mono ml-3 hidden md:inline">Workspace</span>
          </div>
          <div className="flex items-center gap-6">
            <div className="hidden sm:flex items-center gap-2 label-mono">
              <span className="w-1.5 h-1.5 rounded-full bg-brand pulse-dot" />
              <span className="text-brand">Connected</span>
            </div>
            <div className="text-right">
              <div className="text-[13px] text-ink">{user?.email}</div>
              <div className="label-mono">
                {user?.role === "superuser" ? "Superuser" : "Operator"}
              </div>
            </div>
            <button onClick={logout} className="btn-ghost">
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="px-6 lg:px-10 py-10 max-w-7xl">
        {/* Hero */}
        <section className="grid lg:grid-cols-[1.5fr_1fr] gap-8 mb-12">
          <div>
            <span className="label-mono">Overview / 00</span>
            <h1 className="headline text-5xl lg:text-7xl mt-4">
              Good day,
              <br />
              <span className="text-brand">{user?.email.split("@")[0]}</span>.
            </h1>
            <p className="text-ink-muted mt-5 max-w-md text-[15px] leading-relaxed">
              Manage dynamic collections, authentication pools and SQL views —
              all provisioned on the edge.
            </p>
          </div>

          {/* Live readout card */}
          <div className="hairline-l border-l-line pl-6 lg:pl-8 space-y-3">
            <div className="flex items-center justify-between">
              <span className="label-mono">System / live</span>
              <span className="font-mono text-[11px] text-ink">
                {clock.toISOString().slice(11, 19)} UTC
              </span>
            </div>
            <dl className="space-y-2 font-mono text-[12px]">
              {[
                ["D1 latency", "12ms"],
                ["R2 objects", "4,219"],
                ["DO instances", "3"],
                ["Region", "edge-global"],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between">
                  <dt className="text-ink-faint uppercase tracking-wider">{k}</dt>
                  <dd className="text-ink">{v}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        {/* Collections table */}
        <section>
          <div className="flex items-end justify-between mb-5">
            <div>
              <span className="label-mono">Collections / 01</span>
              <h2 className="font-display text-2xl mt-1">All collections</h2>
            </div>
            <button className="btn-ghost">+ New collection</button>
          </div>

          <div className="hairline-t hairline-b">
            <div className="grid grid-cols-[1.6fr_0.8fr_0.6fr_0.4fr] label-mono py-3 hairline-b">
              <span>Name</span>
              <span>Type</span>
              <span>Rows</span>
              <span className="text-right">Open</span>
            </div>
            {SEED.map((c, i) => (
              <Row key={c.name} collection={c} index={i} />
            ))}
          </div>
        </section>

        {/* Superuser callout */}
        {user?.role === "superuser" && (
          <section className="mt-12">
            <div className="hairline-l border-l-brand pl-6 py-2">
              <span className="label-mono text-brand">Superuser</span>
              <h3 className="font-display text-2xl mt-2">
                Provision a new account.
              </h3>
              <p className="text-ink-muted mt-2 text-[14px] max-w-md">
                Only superusers can invite operators. (UI stub — real flow
                pending.)
              </p>
              <Link
                to="/"
                className="inline-block mt-4 font-mono uppercase tracking-widest text-[11px] text-brand hover:underline"
              >
                Open user manager ⟶
              </Link>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

function Row({ collection, index }: { collection: FakeCollection; index: number }) {
  return (
    <div
      className="grid grid-cols-[1.6fr_0.8fr_0.6fr_0.4fr] items-center py-4 hairline-b last:border-b-0 hover:bg-surface/60 transition cursor-pointer rise"
      style={{ ["--i" as string]: index + 2 }}
    >
      <span className="font-mono text-[14px] text-ink">{collection.name}</span>
      <TypeBadge type={collection.type} />
      <span className="font-mono text-[13px] text-ink-muted">
        {collection.rows.toLocaleString()}
      </span>
      <span className="text-right text-ink-faint">⟶</span>
    </div>
  );
}

function TypeBadge({ type }: { type: FakeCollection["type"] }) {
  const map = {
    base: { label: "Base", cls: "text-ink-muted border-line-strong" },
    user: { label: "User", cls: "text-brand border-brand/40" },
    view: { label: "View", cls: "text-ink-muted border-line-strong" },
  } as const;
  const m = map[type];
  return (
    <span
      className={`inline-block px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest border ${m.cls}`}
    >
      {m.label}
    </span>
  );
}
