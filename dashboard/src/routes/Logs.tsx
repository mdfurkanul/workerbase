import { useMemo } from "react";
import AppShell, { PageHeader } from "@/components/AppShell";
import { BarChart, Donut, LineChart } from "@/components/charts";
import { LOG_ENTRIES } from "@/lib/mockData";

export default function Logs() {
  // Build a stable, plausible 24h dataset (dummy).
  const series = useMemo(() => {
    const requests: number[] = [];
    const errors: number[] = [];
    // Use a deterministic pseudo-noise so the chart doesn't dance between renders.
    for (let h = 0; h < 24; h++) {
      const peak = Math.exp(-((h - 14) ** 2) / 32) * 220; // afternoon hump
      const base = 40 + ((h * 17) % 23);
      requests.push(Math.round(base + peak));
      errors.push(Math.round(((h * 7) % 5) + (h > 18 ? (h - 18) * 1.4 : 0)));
    }
    const labels = ["00:00", "06:00", "12:00", "18:00", "23:00"];
    const indices = [0, 6, 12, 18, 23];
    return {
      requests,
      errors,
      labels: indices.map((i) => labels[indices.indexOf(i)] ?? `${i}:00`),
      total: requests.reduce((s, v) => s + v, 0),
      totalErrors: errors.reduce((s, v) => s + v, 0),
      peak: Math.max(...requests),
    } as const;
  }, []);

  const statusBreakdown = useMemo(
    () => [
      { label: "2xx", value: 3812, color: "var(--ok)" },
      { label: "3xx", value: 214, color: "var(--brand)" },
      { label: "4xx", value: 421, color: "var(--warn)" },
      { label: "5xx", value: 63, color: "var(--err)" },
    ],
    [],
  );

  const topEndpoints = useMemo(
    () => [
      { label: "GET /api/collections", value: 1240 },
      { label: "POST /api/auth/login", value: 820 },
      { label: "GET /api/collections/users", value: 612 },
      { label: "GET /api/auth/me", value: 488 },
      { label: "POST /api/collections", value: 154 },
    ],
    [],
  );

  const errorRate = ((series.totalErrors / series.total) * 100).toFixed(1);

  return (
    <AppShell>
      <PageHeader breadcrumbs={[<span>Logs</span>]} />

      <div className="flex-1 overflow-y-auto">
        {/* KPI row */}
        <section className="px-6 pt-5 pb-3 grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat label="Requests · 24h" value={series.total.toLocaleString()} hint="vs. yesterday ↓ 4.2%" />
          <Stat
            label="Error rate"
            value={`${errorRate}%`}
            hint={`${series.totalErrors} failed`}
            tone={Number(errorRate) > 2 ? "warn" : "ok"}
          />
          <Stat label="Avg latency" value="18ms" hint="p95: 42ms" />
          <Stat label="Peak rps" value={series.peak.toLocaleString()} hint="at 14:00 UTC" />
        </section>

        {/* Charts grid */}
        <section className="px-6 py-3 grid lg:grid-cols-2 gap-4">
          {/* Requests over time */}
          <Card title="Requests over time" subtitle="requests per hour · last 24h">
            <LineChart data={series.requests} overlay={series.errors} labels={series.labels} />
            <Legend
              items={[
                { label: "Requests", color: "var(--brand)" },
                { label: "Errors", color: "var(--err)" },
              ]}
            />
          </Card>

          {/* Status breakdown donut */}
          <Card title="Status codes" subtitle="share of responses">
            <div className="flex items-center justify-center py-2">
              <Donut data={statusBreakdown} />
            </div>
          </Card>

          {/* Top endpoints bar */}
          <Card title="Top endpoints" subtitle="by request volume">
            <BarChart data={topEndpoints} />
          </Card>

          {/* Latency by endpoint */}
          <Card title="Latency by endpoint" subtitle="median ms · top 5">
            <BarChart
              data={[
                { label: "/api/auth/login", value: 142, color: "var(--err)" },
                { label: "/api/collections", value: 48, color: "var(--warn)" },
                { label: "/api/collections/users", value: 22, color: "var(--brand)" },
                { label: "/api/auth/me", value: 14, color: "var(--ok)" },
                { label: "/api/realtime/*", value: 9, color: "var(--ok)" },
              ]}
            />
          </Card>
        </section>

        {/* Recent logs table */}
        <section className="px-6 py-4">
          <div className="flex items-center justify-between mb-2">
            <span className="label-mono">Recent log entries</span>
            <span className="label-mono text-ink-faint">{LOG_ENTRIES.length} shown</span>
          </div>
          <div className="bg-surface border border-line rounded font-mono text-[12px] overflow-hidden">
            <div className="grid grid-cols-[80px_70px_1fr_70px_70px_180px] px-4 py-2 hairline-b bg-surface-2 label-mono">
              <span>Level</span>
              <span>Method</span>
              <span>Path</span>
              <span>Status</span>
              <span>Ms</span>
              <span>At</span>
            </div>
            <div className="max-h-[320px] overflow-y-auto">
              {LOG_ENTRIES.map((e, i) => (
                <div
                  key={i}
                  className="grid grid-cols-[80px_70px_1fr_70px_70px_180px] px-4 py-2 hairline-b last:border-b-0 hover:bg-surface-2"
                >
                  <span
                    className={
                      e.level === "error"
                        ? "text-err"
                        : e.level === "warn"
                          ? "text-warn"
                          : "text-ok"
                    }
                  >
                    ● {e.level}
                  </span>
                  <span className="text-ink">{e.method}</span>
                  <span className="text-ink-muted truncate">{e.path}</span>
                  <span className={e.status >= 400 ? "text-err" : "text-ink"}>{e.status}</span>
                  <span className="text-ink-faint">{e.duration}</span>
                  <span className="text-ink-faint">{e.at}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}

/* ─── primitives ──────────────────────────────────────────────────── */
function Stat({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "ok" | "warn" | "err" | "neutral";
}) {
  const toneColor =
    tone === "ok" ? "text-ok" : tone === "warn" ? "text-warn" : tone === "err" ? "text-err" : "text-ink-faint";
  return (
    <div className="bg-surface border border-line rounded p-4">
      <div className="flex items-center justify-between">
        <span className="label-mono">{label}</span>
      </div>
      <div className="mt-2 text-2xl font-display">{value}</div>
      {hint && <div className={`mt-0.5 text-[12px] ${toneColor}`}>{hint}</div>}
    </div>
  );
}

function Card({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-surface border border-line rounded p-4 space-y-3">
      <header>
        <h3 className="text-[14px] font-medium text-ink">{title}</h3>
        {subtitle && <p className="text-[12px] text-ink-faint mt-0.5">{subtitle}</p>}
      </header>
      {children}
    </div>
  );
}

function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <ul className="flex items-center gap-4 pt-2">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-1.5 text-[12px] text-ink-muted">
          <span className="w-2.5 h-2.5 rounded-sm" style={{ background: i.color }} />
          {i.label}
        </li>
      ))}
    </ul>
  );
}
