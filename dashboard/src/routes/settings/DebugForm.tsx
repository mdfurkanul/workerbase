import { Link } from "react-router-dom";
import {
  AlertTriangle,
  Boxes,
  Database,
  Gauge,
  Shield,
} from "lucide-react";
import { APP_VERSION } from "@/lib/types";
import { Card } from "./primitives";

export function DebugForm({ email }: { email?: string }) {
  return (
    <div className="space-y-6">
      <Card title="Diagnostics">
        <div className="grid grid-cols-2 gap-3 text-[13px]">
          <Info2 icon={<Database size={13} />} label="D1 binding" value="DB" />
          <Info2 icon={<Boxes size={13} />} label="R2 binding" value="STORAGE" />
          <Info2 icon={<Shield size={13} />} label="DO namespace" value="REALTIME" />
          <Info2 icon={<Gauge size={13} />} label="Worker version" value={APP_VERSION} />
        </div>
      </Card>
      <Card title="Session">
        <div className="text-[13px] space-y-1.5">
          <div className="flex justify-between"><span className="text-ink-muted">Signed in</span><span className="font-mono">{email ?? "—"}</span></div>
          <div className="flex justify-between"><span className="text-ink-muted">Region</span><span className="font-mono">edge-global</span></div>
          <div className="flex justify-between"><span className="text-ink-muted">Runtime</span><span className="font-mono">cloudflare-workers</span></div>
        </div>
        <div className="pt-3 hairline-t flex items-center justify-between">
          <span className="text-[12px] text-ink-faint inline-flex items-center gap-1">
            <AlertTriangle size={12} className="text-warn" /> Clears all local drafts.
          </span>
          <button
            className="btn-ghost text-[12px] border-err text-err hover:bg-err-bg"
            onClick={() => {
              localStorage.clear();
              window.location.href = "/login";
            }}
          >
            Reset local state
          </button>
        </div>
      </Card>
      <div className="text-[12px] text-ink-faint text-center">
        <Link to="/" className="hover:text-ink">← Back to dashboard</Link>
      </div>
    </div>
  );
}

function Info2({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 bg-surface-2 rounded px-3 py-2">
      <span className="text-ink-muted">{icon}</span>
      <div className="min-w-0">
        <div className="label-mono">{label}</div>
        <div className="font-mono text-ink truncate">{value}</div>
      </div>
    </div>
  );
}
