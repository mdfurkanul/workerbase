import { Card } from "./primitives";

export function CronsForm() {
  const crons = [
    { name: "backups.daily", schedule: "0 3 * * *", last: "2026-06-21 03:00:01" },
    { name: "tokens.sweep", schedule: "*/15 * * * *", last: "2026-06-22 18:45:00" },
    { name: "realtime.gc", schedule: "0 * * * *", last: "2026-06-22 18:00:00" },
  ];
  return (
    <Card title="Scheduled jobs">
      <ul className="divide-y divide-line -mx-4">
        {crons.map((c) => (
          <li key={c.name} className="grid grid-cols-[1fr_auto_auto] gap-3 px-4 py-3 items-center">
            <div>
              <div className="font-mono text-[13px] text-ink">{c.name}</div>
              <div className="text-[12px] text-ink-faint">Last run: {c.last}</div>
            </div>
            <code className="font-mono text-[12px] text-ink-muted">{c.schedule}</code>
            <span className="badge badge-ok">Active</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
