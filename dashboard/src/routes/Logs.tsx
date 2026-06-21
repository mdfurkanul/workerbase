import AppShell, { PageHeader } from "@/components/AppShell";
import { LOG_ENTRIES } from "@/lib/mockData";

export default function Logs() {
  return (
    <AppShell>
      <PageHeader breadcrumbs={[<span>Logs</span>]} />
      <div className="px-6 py-4">
        <div className="bg-surface border border-line rounded font-mono text-[12px] overflow-hidden">
          <div className="grid grid-cols-[80px_70px_1fr_70px_70px_180px] px-4 py-2 hairline-b bg-surface-2 label-mono">
            <span>Level</span>
            <span>Method</span>
            <span>Path</span>
            <span>Status</span>
            <span>Ms</span>
            <span>At</span>
          </div>
          <div className="max-h-[calc(100vh-220px)] overflow-y-auto">
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
      </div>
    </AppShell>
  );
}
