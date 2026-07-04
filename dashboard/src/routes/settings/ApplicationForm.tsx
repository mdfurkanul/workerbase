import { useState } from "react";
import {
  Gauge,
  Info,
  ListChecks,
  Network,
  Shield,
} from "lucide-react";
import Toggle from "@/components/Toggle";
import ThemeToggle from "@/components/ThemeToggle";
import { Card, Field, SaveBar, StatusPill } from "./primitives";

export function ApplicationForm() {
  const [name, setName] = useState("Workerbase");
  const [url, setUrl] = useState("https://workerbase.dev");
  const [accent, setAccent] = useState("#f38020");

  const [batchApi, setBatchApi] = useState(true);
  const [ipProxy, setIpProxy] = useState(false);
  const [rateLimit, setRateLimit] = useState(true);
  const [superIps, setSuperIps] = useState(false);
  const [hideControls, setHideControls] = useState(false);

  return (
    <div className="space-y-6">
      <Card title="Basics">
        <Field label="Application name" required>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Acme"
            className="field-input"
          />
        </Field>
        <Field label="Application URL" required>
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://your-app.workers.dev"
            className="field-input"
          />
        </Field>
        <Field label="Accent">
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={accent}
              onChange={(e) => setAccent(e.target.value)}
              className="w-10 h-9 p-1 bg-surface border border-line-strong rounded cursor-pointer"
            />
            <input
              value={accent}
              onChange={(e) => setAccent(e.target.value)}
              className="field-input font-mono uppercase max-w-[140px]"
            />
            <span
              className="ml-1 px-3 py-1 rounded text-[12px] font-mono"
              style={{ background: accent, color: "#0d0e10" }}
            >
              Preview
            </span>
          </div>
        </Field>
      </Card>

      <Card title="API & access">
        <div className="divide-y divide-line -my-2">
          <FeatureRow
            icon={<ListChecks size={14} />}
            label="Batch Web API"
            hint="Allow bulk /api/* batch requests"
            on={batchApi}
            onToggle={() => setBatchApi((v) => !v)}
          />
          <FeatureRow
            icon={<Network size={14} />}
            label="IP proxy headers"
            hint="Trust CF-Connecting-IP / X-Forwarded-For"
            on={ipProxy}
            onToggle={() => setIpProxy((v) => !v)}
          />
          <FeatureRow
            icon={<Gauge size={14} />}
            label="Rate limiting"
            hint="Per-IP throttle on auth + collections"
            on={rateLimit}
            onToggle={() => setRateLimit((v) => !v)}
          />
          <FeatureRow
            icon={<Shield size={14} />}
            label="Superuser IPs"
            hint="Restrict superuser endpoints to an allow-list"
            on={superIps}
            onToggle={() => setSuperIps((v) => !v)}
          />
        </div>
      </Card>

      <Card title="Workspace UI">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-2">
            <Info size={14} className="text-ink-muted mt-0.5" />
            <div>
              <div className="text-[13px] text-ink">Hide / lock collection and record controls</div>
              <div className="text-[12px] text-ink-faint mt-0.5">
                Locks schema edits and bulk-delete behind superuser.
              </div>
            </div>
          </div>
          <Toggle checked={hideControls} onChange={setHideControls} label="Hide/lock controls" />
        </div>

        <div className="flex items-center justify-between gap-4 pt-2 hairline-t">
          <div>
            <div className="text-[13px] text-ink">Theme</div>
            <div className="text-[12px] text-ink-faint mt-0.5">
              Light / dark workspace.
            </div>
          </div>
          <ThemeToggle />
        </div>
      </Card>

      <SaveBar />
    </div>
  );
}

function FeatureRow({
  icon,
  label,
  hint,
  on,
  onToggle,
}: {
  icon: React.ReactNode;
  label: string;
  hint: string;
  on: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-3">
      <div className="flex items-center gap-3 min-w-0">
        <span className="w-7 h-7 rounded bg-surface-2 flex items-center justify-center text-ink-muted shrink-0">
          {icon}
        </span>
        <div className="min-w-0">
          <div className="text-[13px] text-ink truncate">{label}</div>
          <div className="text-[12px] text-ink-faint truncate">{hint}</div>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <StatusPill on={on} onClick={onToggle} />
        <Toggle checked={on} onChange={onToggle} label={label} />
      </div>
    </div>
  );
}
