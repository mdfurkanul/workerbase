import { Copy } from "lucide-react";
import AppShell, { PageHeader } from "@/components/AppShell";

const ENDPOINTS = [
  { method: "POST", path: "/api/auth/login", desc: "Email + password → session token" },
  { method: "POST", path: "/api/auth/register", desc: "Superuser-provisioned account creation" },
  { method: "GET", path: "/api/auth/me", desc: "Current authenticated user" },
  { method: "POST", path: "/api/collections", desc: "Create a base / user / view collection" },
  { method: "GET", path: "/api/collections", desc: "List all collections" },
  { method: "GET", path: "/api/collections/:name", desc: "Collection metadata" },
  { method: "GET", path: "/api/realtime/:collection", desc: "WebSocket upgrade — per-collection DO" },
];

export default function ApiPreview() {
  const base = "https://workerbase.<your-subdomain>.workers.dev";

  return (
    <AppShell>
      <PageHeader breadcrumbs={[<span>API preview</span>]} />
      <div className="flex-1 overflow-y-auto">
      <div className="max-w-3xl px-6 py-6 space-y-5">
        <div>
          <span className="label-mono">Base URL</span>
          <div className="mt-2 flex items-center gap-2 bg-surface border border-line rounded p-2.5">
            <code className="font-mono text-[13px] text-ink flex-1 truncate">{base}</code>
            <button
              className="btn-icon"
              onClick={() => navigator.clipboard?.writeText(base)}
              title="Copy"
            >
              <Copy size={14} />
            </button>
          </div>
        </div>

        <div>
          <span className="label-mono">Endpoints</span>
          <ul className="mt-2 bg-surface border border-line rounded divide-y divide-line">
            {ENDPOINTS.map((e) => (
              <li key={e.path} className="grid grid-cols-[80px_1fr] gap-3 items-center px-4 py-3">
                <span className={`badge ${e.method === "GET" ? "badge-ok" : "badge-warn"}`}>{e.method}</span>
                <div className="min-w-0">
                  <div className="font-mono text-[13px] text-ink">{e.path}</div>
                  <div className="text-[12px] text-ink-muted">{e.desc}</div>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <span className="label-mono">Example — create collection</span>
          <pre className="mt-2 bg-surface border border-line rounded p-4 text-[12px] font-mono overflow-x-auto text-ink">
{`curl -X POST ${base}/api/collections \\
  -H "Content-Type: application/json" \\
  -d '{
    "type": "base",
    "name": "posts",
    "schema": [
      { "name": "title", "type": "text", "required": true },
      { "name": "views", "type": "integer", "default": 0 }
    ]
  }'`}
          </pre>
        </div>
      </div>
      </div>
    </AppShell>
  );
}
