import { useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  Boxes,
  Bug,
  Clock,
  Database,
  Download,
  FileCode2,
  FolderOpen,
  Gauge,
  HardDrive,
  Home,
  Info,
  ListChecks,
  Mail,
  Network,
  Save,
  Shield,
  Upload,
} from "lucide-react";
import AppShell, { PageHeader } from "@/components/AppShell";
import Toggle from "@/components/Toggle";
import ThemeToggle from "@/components/ThemeToggle";
import { useAuth } from "@/hooks/useAuth";
import { APP_VERSION } from "@/lib/mockData";

type SectionId =
  | "application"
  | "mail"
  | "storage"
  | "backups"
  | "crons"
  | "export"
  | "import"
  | "debug";

interface NavItem {
  id: SectionId;
  label: string;
  icon: React.ReactNode;
}
interface NavGroup {
  label: string;
  items: NavItem[];
}

const NAV: NavGroup[] = [
  {
    label: "Application",
    items: [
      { id: "application", label: "Application", icon: <Home size={13} /> },
      { id: "mail", label: "Mail settings", icon: <Mail size={13} /> },
      { id: "storage", label: "Files storage", icon: <FolderOpen size={13} /> },
      { id: "backups", label: "Backups", icon: <HardDrive size={13} /> },
      { id: "crons", label: "Crons", icon: <Clock size={13} /> },
    ],
  },
  {
    label: "Sync",
    items: [
      { id: "export", label: "Export collections", icon: <Download size={13} /> },
      { id: "import", label: "Import collections", icon: <Upload size={13} /> },
    ],
  },
  {
    label: "Debug",
    items: [{ id: "debug", label: "Debug", icon: <Bug size={13} /> }],
  },
];

const LABELS: Record<SectionId, string> = {
  application: "Application",
  mail: "Mail settings",
  storage: "Files storage",
  backups: "Backups",
  crons: "Crons",
  export: "Export collections",
  import: "Import collections",
  debug: "Debug",
};

export default function Settings() {
  const [active, setActive] = useState<SectionId>("application");
  const { user } = useAuth();

  return (
    <AppShell hideSidebar>
      <PageHeader breadcrumbs={[<span>Settings</span>]} />

      {/* Two-panel layout: sub-sidebar + form */}
      <div className="flex-1 grid grid-cols-[220px_1fr] min-h-0">
        <SettingsNav active={active} onSelect={setActive} />

        <section className="overflow-y-auto">
          <div className="max-w-2xl px-8 py-8">
            <Breadcrumb section={active} />

            {active === "application" && <ApplicationForm />}
            {active === "mail" && <MailForm />}
            {active === "storage" && <StorageForm />}
            {active === "backups" && <BackupsForm />}
            {active === "crons" && <CronsForm />}
            {active === "export" && <ExportForm />}
            {active === "import" && <ImportForm />}
            {active === "debug" && <DebugForm email={user?.email} />}
          </div>
        </section>
      </div>
    </AppShell>
  );
}

/* ─── Sub-sidebar ─────────────────────────────────────────────────── */
function SettingsNav({
  active,
  onSelect,
}: {
  active: SectionId;
  onSelect: (s: SectionId) => void;
}) {
  return (
    <aside className="bg-bg-elev hairline-r overflow-y-auto">
      <div className="px-4 pt-4 pb-3">
        <span className="font-display italic text-lg">Settings</span>
      </div>
      <nav className="px-2 pb-4 space-y-4">
        {NAV.map((group) => (
          <div key={group.label}>
            <div className="px-2 pb-1.5">
              <span className="label-mono text-ink-faint">{group.label}</span>
            </div>
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const isActive = item.id === active;
                return (
                  <li key={item.id}>
                    <button
                      onClick={() => onSelect(item.id)}
                      className={[
                        "w-full flex items-center gap-2 px-2 py-1.5 rounded text-[13px] font-mono transition",
                        isActive
                          ? "bg-surface-2 text-ink"
                          : "text-ink-muted hover:bg-surface-2 hover:text-ink",
                      ].join(" ")}
                    >
                      <span className="opacity-80">{item.icon}</span>
                      <span className="truncate">{item.label}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
    </aside>
  );
}

function Breadcrumb({ section }: { section: SectionId }) {
  return (
    <div className="mb-8">
      <div className="label-mono">Settings / {LABELS[section]}</div>
      <h1 className="font-display text-3xl mt-2">{LABELS[section]}</h1>
    </div>
  );
}

/* ─── Reusable form primitives ────────────────────────────────────── */
function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-surface border border-line rounded">
      <header className="px-4 py-3 hairline-b label-mono">{title}</header>
      <div className="p-4 space-y-4">{children}</div>
    </section>
  );
}

function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="label-mono">
        {label}
        {required && <span className="text-err"> *</span>}
      </span>
      {children}
      {hint && <div className="text-[12px] text-ink-faint">{hint}</div>}
    </label>
  );
}

function SaveBar({ onSave }: { onSave?: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 pt-4">
      <span className="text-[12px] text-ink-faint">Drafts are stored locally until the API lands.</span>
      <button onClick={onSave} className="btn-primary">
        <Save size={14} /> Save changes
      </button>
    </div>
  );
}

function StatusPill({
  on,
  onClick,
}: {
  on: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-mono uppercase tracking-widest border transition ${
        on
          ? "bg-ok-bg text-ok border-ok/40"
          : "bg-surface-2 text-ink-muted border-line-strong"
      }`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${on ? "bg-ok" : "bg-ink-faint"}`} />
      {on ? "Enabled" : "Disabled"}
    </button>
  );
}

/* ─── Application form (the screenshot's main view) ───────────────── */
function ApplicationForm() {
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
        <Field label="Accent" hint="Cloudflare orange is the brand default.">
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

/* ─── Mail settings ───────────────────────────────────────────────── */
function MailForm() {
  return (
    <div className="space-y-6">
      <Card title="SMTP">
        <Field label="Host" required>
          <input placeholder="smtp.cloudflare.com" className="field-input" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Port" required>
            <input placeholder="587" className="field-input font-mono" />
          </Field>
          <Field label="Encryption">
            <select className="field-input">
              <option value="starttls">STARTTLS</option>
              <option value="ssl">SSL/TLS</option>
              <option value="none">None</option>
            </select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Username">
            <input placeholder="apikey" className="field-input" />
          </Field>
          <Field label="Password">
            <input type="password" placeholder="••••••••" className="field-input" />
          </Field>
        </div>
      </Card>
      <Card title="Sender">
        <Field label="From address" required>
          <input placeholder="no-reply@workerbase.dev" className="field-input" />
        </Field>
        <Field label="From name">
          <input placeholder="Workerbase" className="field-input" />
        </Field>
      </Card>
      <SaveBar />
    </div>
  );
}

/* ─── Files storage ───────────────────────────────────────────────── */
function StorageForm() {
  const [provider, setProvider] = useState<"r2" | "local">("r2");
  return (
    <div className="space-y-6">
      <Card title="Provider">
        <Field label="Storage backend">
          <select
            value={provider}
            onChange={(e) => setProvider(e.target.value as "r2" | "local")}
            className="field-input"
          >
            <option value="r2">Cloudflare R2 (recommended)</option>
            <option value="local">Local FS (dev only)</option>
          </select>
        </Field>
        {provider === "r2" && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Account ID" required>
                <input placeholder="abcd1234" className="field-input font-mono" />
              </Field>
              <Field label="Bucket" required>
                <input placeholder="workerbase-storage" className="field-input font-mono" />
              </Field>
            </div>
            <Field label="Access key ID" required>
              <input className="field-input font-mono" />
            </Field>
            <Field label="Secret access key" required>
              <input type="password" className="field-input font-mono" />
            </Field>
          </>
        )}
      </Card>
      <Card title="Uploads">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Max file size (MB)">
            <input type="number" defaultValue={50} className="field-input font-mono" />
          </Field>
          <Field label="Allowed types">
            <input defaultValue="image/*, application/pdf" className="field-input" />
          </Field>
        </div>
      </Card>
      <SaveBar />
    </div>
  );
}

/* ─── Backups ─────────────────────────────────────────────────────── */
function BackupsForm() {
  const [auto, setAuto] = useState(true);
  return (
    <div className="space-y-6">
      <Card title="Schedule">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[13px] text-ink">Automatic backups</div>
            <div className="text-[12px] text-ink-faint mt-0.5">Daily snapshot to R2.</div>
          </div>
          <Toggle checked={auto} onChange={setAuto} />
        </div>
        <Field label="Retention (days)">
          <input type="number" defaultValue={30} className="field-input font-mono" />
        </Field>
        <Field label="Cron expression">
          <input defaultValue="0 3 * * *" className="field-input font-mono" />
        </Field>
      </Card>
      <Card title="One-off snapshot">
        <button className="btn-ghost">
          <HardDrive size={13} /> Create snapshot now
        </button>
      </Card>
      <SaveBar />
    </div>
  );
}

/* ─── Crons ───────────────────────────────────────────────────────── */
function CronsForm() {
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

/* ─── Export ──────────────────────────────────────────────────────── */
function ExportForm() {
  return (
    <Card title="Export collections">
      <p className="text-[13px] text-ink-muted">
        Download every collection schema (and optional data) as a single JSON bundle.
      </p>
      <Field label="Include records">
        <select className="field-input">
          <option value="schema">Schema only</option>
          <option value="all">Schema + all records</option>
          <option value="sample">Schema + 100 sample records</option>
        </select>
      </Field>
      <button className="btn-primary">
        <Download size={14} /> Generate export
      </button>
    </Card>
  );
}

/* ─── Import ──────────────────────────────────────────────────────── */
function ImportForm() {
  return (
    <Card title="Import collections">
      <div className="border-2 border-dashed border-line-strong rounded p-8 text-center">
        <Upload size={28} className="mx-auto text-ink-faint" />
        <p className="mt-3 text-[13px] text-ink">Drop a JSON bundle here</p>
        <p className="text-[12px] text-ink-faint mt-1">or click to browse</p>
        <button className="btn-ghost mt-4">Choose file</button>
      </div>
    </Card>
  );
}

/* ─── SQL console ─────────────────────────────────────────────────── */
// (Moved to its own route: /sql — accessible from the top bar.)

/* ─── Debug ───────────────────────────────────────────────────────── */
function DebugForm({ email }: { email?: string }) {
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
