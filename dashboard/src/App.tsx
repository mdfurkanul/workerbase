import { useEffect, useState } from "react";

export default function App() {
  const [ready, setReady] = useState(false);
  const [collections, setCollections] = useState<string[]>([]);

  useEffect(() => {
    fetch("/api/collections")
      .then((r) => r.json())
      .then((data: { collections?: Array<{ name: string }> }) => {
        const names = (data.collections ?? []).map((c) => c.name);
        setCollections(names);
      })
      .catch(() => {
        // Backend may not be running yet — surface empty state.
      })
      .finally(() => setReady(true));
  }, []);

  return (
    <main className="min-h-screen flex items-center justify-center p-8">
      <div className="w-full max-w-2xl space-y-6">
        <header className="space-y-2">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">
            WorkerBase
          </p>
          <h1 className="text-4xl font-bold tracking-tight">
            Dynamic collections on the edge.
          </h1>
          <p className="text-muted-foreground">
            Hono + Cloudflare D1/R2/Durable Objects, served from a single
            Worker bundle.
          </p>
        </header>

        <section className="rounded-lg border border-border bg-card p-6 space-y-4">
          <h2 className="text-lg font-semibold">Collections</h2>
          {!ready ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : collections.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No collections yet. POST to <code>/api/collections</code> to
              create one.
            </p>
          ) : (
            <ul className="text-sm space-y-1">
              {collections.map((name) => (
                <li
                  key={name}
                  className="font-mono px-2 py-1 rounded bg-muted text-muted-foreground"
                >
                  {name}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
