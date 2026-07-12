import { useEffect, useState } from "react";
import {
  Info,
  ListChecks,
  Network,
  Shield,
} from "lucide-react";
import { apiClient, ApiError } from "@/lib/api-client";
import Toggle from "@/components/Toggle";
import ThemeToggle from "@/components/ThemeToggle";
import { Card, Field, SaveBar, StatusPill } from "./primitives";

/* ──────────────────────────────────────────────────────────────
   Shape of the application settings we read/write via /api/core/settings.
   ────────────────────────────────────────────────────────────── */

interface DeploySettings {
  dashboardUrl: string;
  corsOrigins: string;
}

interface AppSettings {
  appName: string;
  appUrl: string;
  accentColor: string;
  batchApi: boolean;
  ipProxy: boolean;
  superIps: boolean;
  hideControls: boolean;
  deploy: DeploySettings;
}

const DEFAULTS: AppSettings = {
  appName: "WorkerBase",
  appUrl: "",
  accentColor: "#F38020",
  batchApi: true,
  ipProxy: false,
  superIps: false,
  hideControls: false,
  deploy: { dashboardUrl: "", corsOrigins: "" },
};

function isBool(v: unknown): v is boolean {
  return typeof v === "boolean";
}

/* ──────────────────────────────────────────────────────────────
   Form
   ────────────────────────────────────────────────────────────── */

export function ApplicationForm() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULTS);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiClient
      .get<{ settings: Record<string, unknown> }>(`/api/core/settings`)
      .then((data) => {
        const s = data.settings ?? {};
        const deploy =
          s.deploy && typeof s.deploy === "object"
            ? (s.deploy as Partial<DeploySettings>)
            : {};
        setSettings({
          appName: typeof s.appName === "string" ? s.appName : DEFAULTS.appName,
          appUrl: typeof s.appUrl === "string" ? s.appUrl : DEFAULTS.appUrl,
          accentColor:
            typeof s.accentColor === "string" ? s.accentColor : DEFAULTS.accentColor,
          batchApi: isBool(s.batchApi) ? s.batchApi : DEFAULTS.batchApi,
          ipProxy: isBool(s.ipProxy) ? s.ipProxy : DEFAULTS.ipProxy,
          superIps: isBool(s.superIps) ? s.superIps : DEFAULTS.superIps,
          hideControls: isBool(s.hideControls) ? s.hideControls : DEFAULTS.hideControls,
          deploy: {
            dashboardUrl:
              typeof deploy.dashboardUrl === "string"
                ? deploy.dashboardUrl
                : DEFAULTS.deploy.dashboardUrl,
            corsOrigins:
              typeof deploy.corsOrigins === "string"
                ? deploy.corsOrigins
                : DEFAULTS.deploy.corsOrigins,
          },
        });
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load settings");
      })
      .finally(() => setLoaded(true));
  }, []);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      await apiClient.patch(`/api/core/settings`, {
        appName: settings.appName,
        appUrl: settings.appUrl,
        accentColor: settings.accentColor,
        batchApi: settings.batchApi,
        ipProxy: settings.ipProxy,
        superIps: settings.superIps,
        hideControls: settings.hideControls,
        deploy: settings.deploy,
      });
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? typeof err.detail === "string"
            ? err.detail
            : (err.detail as { error?: string } | null)?.error ?? err.message
          : err instanceof Error
            ? err.message
            : "Failed to save settings";
      setError(msg);
    } finally {
      setSaving(false);
    }
  }

  if (!loaded) {
    return <div className="text-[13px] text-ink-muted">Loading…</div>;
  }

  return (
    <div className="space-y-6">
      <Card title="Basics">
        <Field label="Application name" required>
          <input
            value={settings.appName}
            onChange={(e) => setSettings((s) => ({ ...s, appName: e.target.value }))}
            placeholder="Acme"
            className="field-input"
          />
        </Field>
        <Field label="Application URL" required>
          <input
            value={settings.appUrl}
            onChange={(e) => setSettings((s) => ({ ...s, appUrl: e.target.value }))}
            placeholder="https://your-app.workers.dev"
            className="field-input"
          />
        </Field>
        <Field label="Accent">
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={settings.accentColor}
              onChange={(e) =>
                setSettings((s) => ({ ...s, accentColor: e.target.value }))
              }
              className="w-10 h-9 p-1 bg-surface border border-line-strong rounded cursor-pointer"
            />
            <input
              value={settings.accentColor}
              onChange={(e) =>
                setSettings((s) => ({ ...s, accentColor: e.target.value }))
              }
              className="field-input font-mono uppercase max-w-[140px]"
            />
            <span
              className="ml-1 px-3 py-1 rounded text-[12px] font-mono"
              style={{ background: settings.accentColor, color: "#0d0e10" }}
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
            on={settings.batchApi}
            onToggle={() =>
              setSettings((s) => ({ ...s, batchApi: !s.batchApi }))
            }
          />
          <FeatureRow
            icon={<Network size={14} />}
            label="IP proxy headers"
            hint="Trust CF-Connecting-IP / X-Forwarded-For"
            on={settings.ipProxy}
            onToggle={() => setSettings((s) => ({ ...s, ipProxy: !s.ipProxy }))}
          />
          <FeatureRow
            icon={<Shield size={14} />}
            label="Superuser IPs"
            hint="Restrict superuser endpoints to an allow-list"
            on={settings.superIps}
            onToggle={() => setSettings((s) => ({ ...s, superIps: !s.superIps }))}
          />
        </div>
      </Card>

      <Card title="Workspace UI">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-2">
            <Info size={14} className="text-ink-muted mt-0.5" />
            <div>
              <div className="text-[13px] text-ink">
                Hide / lock collection and record controls
              </div>
              <div className="text-[12px] text-ink-faint mt-0.5">
                Locks schema edits and bulk-delete behind superuser.
              </div>
            </div>
          </div>
          <Toggle
            checked={settings.hideControls}
            onChange={(v) => setSettings((s) => ({ ...s, hideControls: v }))}
            label="Hide/lock controls"
          />
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

      <Card title="Split-Worker deployment">
        <Field
          label="Dashboard URL"
          hint="Where the dashboard is hosted. Used for email-link redirects (magic-link, reset-password). Leave empty to use the DASHBOARD_URL env var."
        >
          <input
            value={settings.deploy.dashboardUrl}
            onChange={(e) =>
              setSettings((s) => ({
                ...s,
                deploy: { ...s.deploy, dashboardUrl: e.target.value },
              }))
            }
            placeholder="https://app.yourapp.com"
            className="field-input"
          />
        </Field>
        <Field
          label="Allowed CORS origins"
          hint="Comma-separated origins permitted to make browser requests to this API. Leave empty to fall back to the Dashboard URL or CORS_ORIGINS env var."
        >
          <input
            value={settings.deploy.corsOrigins}
            onChange={(e) =>
              setSettings((s) => ({
                ...s,
                deploy: { ...s.deploy, corsOrigins: e.target.value },
              }))
            }
            placeholder="https://app.yourapp.com, https://staging.yourapp.com"
            className="field-input"
          />
        </Field>
      </Card>

      <SaveBar onSave={handleSave} saving={saving} error={error} />
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
