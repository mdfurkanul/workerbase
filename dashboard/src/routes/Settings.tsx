import { useState, useEffect, useMemo, useRef } from "react";
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
  Search,
  Shield,
  Upload,
} from "lucide-react";
import AppShell, { PageHeader } from "@/components/AppShell";
import Toggle from "@/components/Toggle";
import ThemeToggle from "@/components/ThemeToggle";
import { useAuth } from "@/hooks/useAuth";
import { useCollections } from "@/hooks/useCollections";
import { APP_VERSION } from "@/lib/mockData";
import { apiClient, ApiError } from "@/lib/api-client";
import {
  exportJSON,
  exportCSV,
  exportSQL,
  exportXLSX,
  type ExportPayload,
} from "@/lib/exportFormats";
import { parseCSVToObjects } from "@/lib/csv";

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

function SaveBar({ onSave, saving, error }: { onSave?: () => void; saving?: boolean; error?: string | null }) {
  return (
    <div className="flex items-center justify-between gap-3 pt-4">
      {error ? (
        <span className="text-[12px] text-err font-mono">{error}</span>
      ) : (
        <span className="text-[12px] text-ink-faint">{saving ? "Saving…" : ""}</span>
      )}
      <button onClick={onSave} disabled={saving} className="btn-primary disabled:opacity-50">
        <Save size={14} /> {saving ? "Saving…" : "Save changes"}
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

/* ─── Mail settings ───────────────────────────────────────────────── */
interface MailSettings {
  fromAddress: string;
  fromName: string;
}
const DEFAULT_MAIL: MailSettings = { fromAddress: "", fromName: "" };

function MailForm() {
  const [settings, setSettings] = useState<MailSettings>(DEFAULT_MAIL);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load existing mail settings on mount.
  useEffect(() => {
    apiClient
      .get<{ settings: Record<string, unknown> }>(`/api/core/settings`)
      .then((data) => {
        const mail = data.settings?.mail;
        if (mail && typeof mail === "object") {
          setSettings({
            fromAddress: String((mail as Record<string, unknown>).fromAddress ?? ""),
            fromName: String((mail as Record<string, unknown>).fromName ?? ""),
          });
        }
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load mail settings");
      })
      .finally(() => setLoading(false));
  }, []);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      await apiClient.patch(`/api/core/settings`, { mail: settings });
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? typeof err.detail === "string"
            ? err.detail
            : (err.detail as { error?: string } | null)?.error ?? err.message
          : err instanceof Error
            ? err.message
            : "Failed to save mail settings";
      setError(msg);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="text-[13px] text-ink-muted">Loading…</div>;
  }

  return (
    <div className="space-y-6">
      <Card title="Sender">
        <Field label="From address" required>
          <input
            value={settings.fromAddress}
            onChange={(e) => setSettings((s) => ({ ...s, fromAddress: e.target.value }))}
            placeholder="no-reply@workerbase.dev"
            className="field-input"
          />
        </Field>
        <Field label="From name">
          <input
            value={settings.fromName}
            onChange={(e) => setSettings((s) => ({ ...s, fromName: e.target.value }))}
            placeholder="Workerbase"
            className="field-input"
          />
        </Field>
      </Card>
      <SaveBar onSave={handleSave} saving={saving} error={error} />
    </div>
  );
}

/* ─── Files storage ───────────────────────────────────────────────── */
/* ─── Files storage ───────────────────────────────────────────────── */
interface StorageSettings {
  maxFileSizeMB: number;
  allowedTypes: string[];
}
const DEFAULT_STORAGE: StorageSettings = {
  maxFileSizeMB: 50,
  allowedTypes: ["image/*", "application/pdf"],
};

/** Predefined file-type categories. Toggling a checkbox adds/removes its
 *  MIME list as a unit. The custom field is for anything not listed. */
const FILE_CATEGORIES: { label: string; types: string[] }[] = [
  { label: "Images", types: ["image/*"] },
  { label: "PDF", types: ["application/pdf"] },
  {
    label: "Documents",
    types: [
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.oasis.opendocument.text",
      "application/rtf",
    ],
  },
  {
    label: "Spreadsheets",
    types: [
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.oasis.opendocument.spreadsheet",
      "text/csv",
    ],
  },
  { label: "Video", types: ["video/*"] },
  { label: "Audio", types: ["audio/*"] },
  {
    label: "Archives",
    types: [
      "application/zip",
      "application/x-tar",
      "application/gzip",
      "application/x-rar-compressed",
      "application/x-7z-compressed",
    ],
  },
  {
    label: "Text & code",
    types: ["text/plain", "text/markdown", "text/html", "application/json", "application/xml"],
  },
];

/** MIME types covered by the predefined categories — used to separate
 *  category-driven entries from custom ones when rendering the custom field. */
const CATEGORY_MIMES = new Set(FILE_CATEGORIES.flatMap((c) => c.types));

function StorageForm() {
  const [settings, setSettings] = useState<StorageSettings>(DEFAULT_STORAGE);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiClient
      .get<{ settings: Record<string, unknown> }>(`/api/core/settings`)
      .then((data) => {
        const s = data.settings?.storage;
        if (s && typeof s === "object") {
          const obj = s as Record<string, unknown>;
          // Backward-compat: previous shape stored `allowedTypes` as a
          // comma-separated string. Accept either shape.
          let allowed = DEFAULT_STORAGE.allowedTypes;
          if (Array.isArray(obj.allowedTypes)) {
            allowed = obj.allowedTypes.filter((t): t is string => typeof t === "string");
          } else if (typeof obj.allowedTypes === "string") {
            allowed = obj.allowedTypes
              .split(",")
              .map((t) => t.trim())
              .filter(Boolean);
          }
          setSettings({
            maxFileSizeMB: typeof obj.maxFileSizeMB === "number" ? obj.maxFileSizeMB : DEFAULT_STORAGE.maxFileSizeMB,
            allowedTypes: allowed,
          });
        }
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load storage settings");
      })
      .finally(() => setLoading(false));
  }, []);

  const allowedSet = new Set(settings.allowedTypes);

  // Custom types = anything in the list that isn't part of a known category.
  const customTypes = settings.allowedTypes.filter((t) => !CATEGORY_MIMES.has(t));

  function toggleCategory(types: string[], on: boolean) {
    setSettings((s) => {
      const current = new Set(s.allowedTypes);
      for (const t of types) {
        if (on) current.add(t);
        else current.delete(t);
      }
      return { ...s, allowedTypes: Array.from(current) };
    });
  }

  function setCustomTypes(raw: string) {
    const parsed = raw
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    // Keep all category-driven types and append the parsed custom ones
    // (deduped, preserving order).
    const kept = settings.allowedTypes.filter((t) => CATEGORY_MIMES.has(t));
    const merged = new Set(kept);
    for (const t of parsed) merged.add(t);
    setSettings((s) => ({ ...s, allowedTypes: Array.from(merged) }));
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      await apiClient.patch(`/api/core/settings`, { storage: settings });
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? typeof err.detail === "string"
            ? err.detail
            : (err.detail as { error?: string } | null)?.error ?? err.message
          : err instanceof Error
            ? err.message
            : "Failed to save storage settings";
      setError(msg);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="text-[13px] text-ink-muted">Loading…</div>;
  }

  return (
    <div className="space-y-6">
      <Card title="Uploads">
        <Field label="Max file size (MB)">
          <input
            type="number"
            min={1}
            value={settings.maxFileSizeMB}
            onChange={(e) => {
              const n = parseInt(e.target.value, 10);
              setSettings((s) => ({ ...s, maxFileSizeMB: isNaN(n) ? 0 : n }));
            }}
            className="field-input font-mono max-w-[180px]"
          />
        </Field>

        <div>
          <span className="label-mono">Allowed types</span>
          <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-2">
            {FILE_CATEGORIES.map((cat) => {
              const checked = cat.types.every((t) => allowedSet.has(t));
              return (
                <label
                  key={cat.label}
                  className="flex items-center gap-2 cursor-pointer select-none text-[13px] text-ink"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => toggleCategory(cat.types, e.target.checked)}
                    className="accent-[var(--brand)] w-3.5 h-3.5"
                  />
                  <span>{cat.label}</span>
                </label>
              );
            })}
          </div>
        </div>

        <Field
          label="Custom MIME types"
          hint="Comma-separated — e.g. application/x-yaml, image/avif"
        >
          <input
            value={customTypes.join(", ")}
            onChange={(e) => setCustomTypes(e.target.value)}
            placeholder="application/x-yaml, image/avif"
            className="field-input font-mono text-[12px]"
          />
        </Field>
      </Card>
      <SaveBar onSave={handleSave} saving={saving} error={error} />
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
/* ─── Export collections ──────────────────────────────────────────── */
type ExportFormat = "json" | "csv" | "xlsx" | "sql";
type ExportScope = "selected" | "all";

const FORMAT_OPTIONS: { value: ExportFormat; label: string; hint: string }[] = [
  { value: "json", label: "JSON", hint: "Nested object, one key per collection" },
  { value: "csv", label: "CSV", hint: "One .csv per collection (zipped if many)" },
  { value: "xlsx", label: "XLSX", hint: "Excel workbook, one sheet per collection" },
  { value: "sql", label: "SQL", hint: "CREATE TABLE + INSERT statements" },
];

function ExportForm() {
  const { collections } = useCollections();
  const [format, setFormat] = useState<ExportFormat>("json");
  const [scope, setScope] = useState<ExportScope>("selected");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // Per-collection column projections: map<collectionName, Set<columnName> | null>.
  // null/absent = "all columns" (default). Non-null Set = explicit subset.
  const [columnSelection, setColumnSelection] = useState<
    Record<string, Set<string> | null>
  >({});
  // Per-collection row limits: map<collectionName, number | "all">.
  // Absent = use the global default. "all" = no cap.
  const [rowLimits, setRowLimits] = useState<Record<string, number | "all">>({});
  // Which collection is currently expanded to show its column picker.
  const [expandedCol, setExpandedCol] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [limit, setLimit] = useState(1000);
  const [limitMode, setLimitMode] = useState<"custom" | "all">("custom");
  const [includeSystem, setIncludeSystem] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  // Filter the visible collection list.
  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const list = includeSystem
      ? collections
      : collections.filter((c) => c.source !== "system" && !c.name.startsWith("_"));
    if (!q) return list;
    return list.filter((c) => c.name.toLowerCase().includes(q));
  }, [collections, filter, includeSystem]);

  // Drop selections that get filtered out by includeSystem toggling.
  useEffect(() => {
    setSelected((prev) => {
      const next = new Set<string>();
      const valid = new Set(filtered.map((c) => c.name));
      for (const n of prev) if (valid.has(n)) next.add(n);
      return next;
    });
  }, [filtered]);

  const allChecked = filtered.length > 0 && filtered.every((c) => selected.has(c.name));
  const someChecked = !allChecked && filtered.some((c) => selected.has(c.name));

  function toggleAll(on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) filtered.forEach((c) => next.add(c.name));
      else filtered.forEach((c) => next.delete(c.name));
      return next;
    });
  }

  function toggleOne(name: string, on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(name);
      else next.delete(name);
      return next;
    });
    // When a collection is deselected, forget its column projection.
    if (!on) {
      setColumnSelection((prev) => {
        if (!(name in prev)) return prev;
        const next = { ...prev };
        delete next[name];
        return next;
      });
      setExpandedCol((c) => (c === name ? null : c));
    }
  }

  /** Returns the column set for a collection — null means "all" (default). */
  function colsFor(name: string): Set<string> | null {
    return columnSelection[name] ?? null;
  }

  /** Toggle a single column on/off for a collection. */
  function toggleColumn(
    collectionName: string,
    columnName: string,
    on: boolean,
    schema: { name: string }[],
  ) {
    setColumnSelection((prev) => {
      // Expand implicit "all" into an explicit set on first interaction.
      const stored = prev[collectionName];
      const current = stored ? new Set(stored) : new Set(schema.map((f) => f.name));
      if (on) current.add(columnName);
      else current.delete(columnName);
      return { ...prev, [collectionName]: current };
    });
  }

  /** Toggle all columns of a collection on/off. */
  function toggleAllColumns(
    collectionName: string,
    schema: { name: string }[],
    on: boolean,
  ) {
    setColumnSelection((prev) => ({
      ...prev,
      [collectionName]: on ? new Set(schema.map((f) => f.name)) : new Set(),
    }));
  }

  const effectiveTargets =
    scope === "all" ? null : Array.from(selected);

  const canExport =
    !busy &&
    (scope === "all" || (effectiveTargets !== null && effectiveTargets.length > 0)) &&
    // Every selected collection must have at least one column chosen.
    (scope === "all" ||
      (effectiveTargets?.every((name) => {
        const cols = columnSelection[name];
        const schemaCols = collections.find((c) => c.name === name)?.schema ?? [];
        // null = all selected (OK); empty Set = none selected (block).
        return cols === null || cols === undefined || cols.size > 0 || schemaCols.length === 0;
      }) ?? false));

  async function handleExport() {
    if (!canExport) return;
    setBusy(true);
    setError(null);
    setStatus("Fetching data from server…");
    try {
      // Build column projection — only include entries where the user
      // explicitly narrowed a collection (non-null set). null = "all".
      const columns: Record<string, string[]> = {};
      for (const [name, set] of Object.entries(columnSelection)) {
        if (set && set.size > 0) columns[name] = Array.from(set);
      }

      const payload = await apiClient.post<{
        meta: ExportPayload["meta"];
        collections: ExportPayload["collections"];
      }>(`/api/core/export`, {
        collections: scope === "all" ? "all" : effectiveTargets,
        limit: limitMode === "all" ? null : limit,
        includeSystem,
        columns: Object.keys(columns).length > 0 ? columns : undefined,
      });

      setStatus(`Converting to ${format.toUpperCase()}…`);
      switch (format) {
        case "json":
          exportJSON(payload);
          break;
        case "csv":
          exportCSV(payload);
          break;
        case "sql":
          exportSQL(payload);
          break;
        case "xlsx":
          await exportXLSX(payload);
          break;
      }
      setStatus(
        `Exported ${payload.collections.length} collection${
          payload.collections.length === 1 ? "" : "s"
        } as ${format.toUpperCase()}.`,
      );
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : typeof err === "string"
            ? err
            : "Export failed";
      setError(msg);
      setStatus(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card title="Format">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {FORMAT_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setFormat(opt.value)}
              className={`text-left px-3 py-2 rounded border transition ${
                format === opt.value
                  ? "border-brand bg-brand/5 text-ink"
                  : "border-line text-ink-muted hover:bg-surface-2 hover:text-ink"
              }`}
            >
              <div className="font-mono text-[13px]">{opt.label}</div>
              <div className="text-[11px] text-ink-faint mt-0.5">{opt.hint}</div>
            </button>
          ))}
        </div>
      </Card>

      <Card title="Scope">
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 cursor-pointer text-[13px]">
            <input
              type="radio"
              name="export-scope"
              checked={scope === "selected"}
              onChange={() => setScope("selected")}
              className="accent-[var(--brand)]"
            />
            Selected collections
          </label>
          <label className="flex items-center gap-2 cursor-pointer text-[13px]">
            <input
              type="radio"
              name="export-scope"
              checked={scope === "all"}
              onChange={() => setScope("all")}
              className="accent-[var(--brand)]"
            />
            Entire database
          </label>
        </div>

        <div>
          <span className="label-mono">Row limit per collection</span>
          <div className="mt-2 flex items-center gap-4 flex-wrap">
            <label className="flex items-center gap-2 cursor-pointer text-[13px]">
              <input
                type="radio"
                name="export-limit"
                checked={limitMode === "custom"}
                onChange={() => setLimitMode("custom")}
                className="accent-[var(--brand)]"
              />
              Custom limit
            </label>
            <label className="flex items-center gap-2 cursor-pointer text-[13px]">
              <input
                type="radio"
                name="export-limit"
                checked={limitMode === "all"}
                onChange={() => setLimitMode("all")}
                className="accent-[var(--brand)]"
              />
              All rows
            </label>
            {limitMode === "custom" && (
              <input
                type="number"
                min={1}
                max={1000000}
                value={limit}
                onChange={(e) => {
                  const n = parseInt(e.target.value, 10);
                  setLimit(isNaN(n) ? 1 : Math.max(1, Math.min(1_000_000, n)));
                }}
                className="field-input font-mono w-32"
              />
            )}
          </div>
          <div className="text-[12px] text-ink-faint mt-1">
            {limitMode === "all"
              ? "Every row will be exported. Large tables may take a while."
              : "Cap rows per collection. Default 1000."}
          </div>
        </div>

        <label className="flex items-center gap-2 cursor-pointer text-[13px]">
          <input
            type="checkbox"
            checked={includeSystem}
            onChange={(e) => setIncludeSystem(e.target.checked)}
            className="accent-[var(--brand)] w-3.5 h-3.5"
          />
          Include system tables (underscore-prefixed)
        </label>

        {scope === "selected" && (
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="relative flex-1 max-w-sm">
                <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-faint" />
                <input
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  placeholder="Filter collections…"
                  className="field-input pl-7 py-1.5 text-[12px] font-mono"
                />
              </div>
              <button
                type="button"
                onClick={() => toggleAll(!allChecked)}
                className="text-[12px] font-mono text-ink-muted hover:text-ink"
              >
                {allChecked ? "Clear all" : someChecked ? "Select all" : "Select all"}
              </button>
            </div>
            <div className="max-h-72 overflow-y-auto border border-line rounded bg-surface">
              {filtered.length === 0 ? (
                <div className="px-3 py-4 text-[12px] text-ink-faint text-center">
                  {collections.length === 0
                    ? "No collections exist yet."
                    : `No matches for "${filter}".`}
                </div>
              ) : (
                <ul>
                  {filtered.map((c) => {
                    const checked = selected.has(c.name);
                    const expanded = expandedCol === c.name;
                    const cols = colsFor(c.name);
                    const schemaCols = c.schema ?? [];
                    const selectedCount = cols === null ? schemaCols.length : cols.size;
                    const allColsOn = selectedCount === schemaCols.length;
                    const someColsOn = !allColsOn && selectedCount > 0;
                    const noneOn = selectedCount === 0 && schemaCols.length > 0;
                    const colLabel =
                      cols === null
                        ? `${schemaCols.length} col${schemaCols.length === 1 ? "" : "s"}`
                        : `${selectedCount}/${schemaCols.length} col${schemaCols.length === 1 ? "" : "s"}`;
                    return (
                      <li key={c.id ?? c.name} className="hairline-b last:border-b-0">
                        <div className="flex items-center gap-2.5 px-3 py-1.5 hover:bg-surface-2 transition">
                          <label className="flex items-center gap-2.5 cursor-pointer flex-1 min-w-0">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) => toggleOne(c.name, e.target.checked)}
                              className="accent-[var(--brand)] w-3.5 h-3.5"
                            />
                            <span className="font-mono text-[13px] text-ink flex-1 truncate">{c.name}</span>
                          </label>
                          <span className="text-[11px] text-ink-faint font-mono shrink-0">{c.type}</span>
                          {typeof c.count === "number" && (
                            <span className="text-[11px] text-ink-faint font-mono shrink-0">{c.count}</span>
                          )}
                          {checked && schemaCols.length > 0 && (
                            <button
                              type="button"
                              onClick={() => setExpandedCol(expanded ? null : c.name)}
                              className="text-[11px] font-mono px-1.5 py-0.5 rounded border border-line text-ink-muted hover:text-ink hover:bg-surface shrink-0"
                              title="Pick columns to export"
                            >
                              {someColsOn || noneOn ? "● " : ""}{colLabel}
                            </button>
                          )}
                        </div>
                        {checked && expanded && schemaCols.length > 0 && (
                          <div className="px-9 pb-2 pt-1 bg-surface-2/40">
                            <div className="flex items-center justify-between mb-1">
                              <span className="label-mono text-ink-faint">
                                Columns {noneOn && <span className="text-err">· pick at least one</span>}
                              </span>
                              <button
                                type="button"
                                onClick={() => toggleAllColumns(c.name, schemaCols, !allColsOn)}
                                className="text-[11px] font-mono text-ink-muted hover:text-ink"
                              >
                                {allColsOn ? "Clear all" : "Select all"}
                              </button>
                            </div>
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                              {schemaCols.map((f) => {
                                const on = cols === null ? true : cols.has(f.name);
                                return (
                                  <label
                                    key={f.name}
                                    className="flex items-center gap-1.5 cursor-pointer text-[12px] text-ink min-w-0"
                                  >
                                    <input
                                      type="checkbox"
                                      checked={on}
                                      onChange={(e) =>
                                        toggleColumn(c.name, f.name, e.target.checked, schemaCols)
                                      }
                                      className="accent-[var(--brand)] w-3 h-3"
                                    />
                                    <span className="font-mono truncate">{f.name}</span>
                                    <span className="text-ink-faint text-[10px] ml-auto shrink-0">{f.type}</span>
                                  </label>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
            <p className="text-[12px] text-ink-faint">
              {selected.size} collection{selected.size === 1 ? "" : "s"} selected.
            </p>
          </div>
        )}
      </Card>

      {error && (
        <div className="bg-err-bg text-err text-[12px] border border-line-strong rounded px-3 py-2 font-mono">
          {error}
        </div>
      )}
      {status && !error && (
        <div className="text-[12px] text-ink-muted">{status}</div>
      )}

      <button
        onClick={handleExport}
        disabled={!canExport}
        className="btn-primary disabled:opacity-50"
      >
        <Download size={14} /> {busy ? "Working…" : "Generate export"}
      </button>
    </div>
  );
}

/* ─── Import ──────────────────────────────────────────────────────── */

type ImportFormat = "json" | "csv";
type ImportTargetMode = "existing" | "new";
type ImportNewType = "base" | "user";

interface ImportMapping {
  sourceColumn: string;
  targetColumn: string | null;
}

interface ImportResult {
  imported: number;
  collection: string;
  created: boolean;
  errors: string[];
}

function ImportForm() {
  const { collections, refresh } = useCollections();

  // Step state
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);

  // Parsed data
  const [format, setFormat] = useState<ImportFormat>("json");
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [fileName, setFileName] = useState<string>("");
  const [parseError, setParseError] = useState<string | null>(null);
  const [exportCollectionNames, setExportCollectionNames] = useState<string[] | null>(null);
  const [selectedExportCol, setSelectedExportCol] = useState<string>("");

  // Target
  const [targetMode, setTargetMode] = useState<ImportTargetMode>("existing");
  const [existingTarget, setExistingTarget] = useState<string>("");
  const [newName, setNewName] = useState<string>("");
  const [newType, setNewType] = useState<ImportNewType>("base");

  // Mappings
  const [mappings, setMappings] = useState<ImportMapping[]>([]);

  // Result
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement | null>(null);

  /* ── Derived: source columns from parsed rows ── */
  const sourceColumns = useMemo(() => {
    if (rows.length === 0) return [];
    const set = new Set<string>();
    for (const r of rows) {
      for (const k of Object.keys(r)) set.add(k);
    }
    return Array.from(set);
  }, [rows]);

  /* ── Derived: target collection name ── */
  const targetCollection = targetMode === "existing" ? existingTarget : newName;

  /* ── Derived: target columns (existing schema or new from mappings) ── */
  const targetSchema = useMemo<{ name: string; type: string }[]>(() => {
    if (targetMode === "existing") {
      const col = collections.find((c) => c.name === existingTarget);
      return col?.schema ?? [];
    }
    // For new collections, derive from non-null target columns in mappings.
    const mapped = mappings
      .filter((m) => m.targetColumn !== null && m.targetColumn !== "")
      .map((m) => m.targetColumn!)
      .filter((v, i, arr) => arr.indexOf(v) === i);
    return mapped.map((name) => ({ name, type: "text" }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetMode, existingTarget, collections]);

  /* ── Auto-match columns when source or target changes ── */
  useEffect(() => {
    if (sourceColumns.length === 0) return;
    const targetColNames = targetSchema.map((s) => s.name.toLowerCase());
    setMappings(
      sourceColumns.map((src) => {
        const idx = targetColNames.indexOf(src.toLowerCase());
        return {
          sourceColumn: src,
          targetColumn: idx >= 0 ? targetSchema[idx]!.name : null,
        };
      }),
    );
  }, [sourceColumns, targetSchema]);

  /* ── Reset state when picking a new file ── */
  function resetState() {
    setRows([]);
    setFileName("");
    setParseError(null);
    setExportCollectionNames(null);
    setSelectedExportCol("");
    setStep(1);
    setResult(null);
    setError(null);
    setMappings([]);
  }

  /* ── Handle file selection ── */
  function handleFile(file: File) {
    resetState();
    setFileName(file.name);
    const ext = file.name.split(".").pop()?.toLowerCase();
    const fmt: ImportFormat = ext === "csv" ? "csv" : "json";
    setFormat(fmt);

    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? "");
      try {
        if (fmt === "csv") {
          const parsed = parseCSVToObjects(text);
          if (parsed.length === 0) {
            setParseError("CSV file has no data rows.");
            return;
          }
          setRows(parsed);
        } else {
          const json = JSON.parse(text);
          let extracted: Record<string, unknown>[] = [];
          let exportCols: string[] | null = null;

          if (Array.isArray(json)) {
            extracted = json as Record<string, unknown>[];
          } else if (json && typeof json === "object") {
            // Export payload: { collections: [...] }
            if (Array.isArray(json.collections)) {
              exportCols = (json.collections as { name: string }[]).map((c) => c.name);
              if (exportCols.length > 0) {
                const first = (json.collections as { rows: Record<string, unknown>[] }[])[0]!;
                extracted = first.rows ?? [];
                setSelectedExportCol(exportCols[0]!);
              }
            } else if (Array.isArray(json.rows)) {
              extracted = json.rows as Record<string, unknown>[];
            } else if (Array.isArray(json.data)) {
              extracted = json.data as Record<string, unknown>[];
            } else {
              setParseError("JSON must be an array or have a rows/data/collections key.");
              return;
            }
          } else {
            setParseError("JSON root must be an array or object.");
            return;
          }

          if (extracted.length === 0) {
            setParseError("No rows found in the file.");
            return;
          }
          setRows(extracted);
          setExportCollectionNames(exportCols);
        }
        setStep(2);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setParseError(`Failed to parse: ${msg}`);
      }
    };
    reader.onerror = () => setParseError("Failed to read file.");
    reader.readAsText(file);
  }

  /* ── Drag and drop handlers ── */
  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
  }

  /* ── Execute the import ── */
  async function handleImport() {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const payload = {
        format,
        target: {
          mode: targetMode,
          collection: targetCollection,
          ...(targetMode === "new" ? { type: newType } : {}),
        },
        mappings,
        data: rows,
      };
      const res = await apiClient.post<ImportResult>(`/api/core/import`, payload);
      setResult(res);
      setStep(4);
      if (res.imported > 0) {
        await refresh();
      }
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? typeof err.detail === "string"
            ? err.detail
            : (err.detail as { error?: string } | null)?.error ?? err.message
          : err instanceof Error
            ? err.message
            : "Import failed";
      setError(msg);
    } finally {
      setBusy(false);
    }
  }

  /* ── Validation ── */
  const canProceedToMapping =
    rows.length > 0 &&
    (targetMode === "existing"
      ? !!existingTarget
      : newName.length > 0 && /^[a-zA-Z][a-zA-Z0-9_]*$/.test(newName));

  const hasMappedColumns = mappings.some((m) => m.targetColumn !== null && m.targetColumn !== "");

  /* ── Step 1: Upload ── */
  if (step === 1) {
    return (
      <Card title="Import collections">
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onClick={() => inputRef.current?.click()}
          className="border-2 border-dashed border-line-strong rounded p-8 text-center cursor-pointer hover:border-brand hover:bg-surface-2 transition"
        >
          <Upload size={28} className="mx-auto text-ink-faint" />
          <p className="mt-3 text-[13px] text-ink">Drop a .json or .csv file here</p>
          <p className="text-[12px] text-ink-faint mt-1">or click to browse</p>
          <input
            ref={inputRef}
            type="file"
            accept=".json,.csv"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
            }}
          />
        </div>
        {parseError && (
          <div className="bg-err-bg text-err text-[12px] border border-line-strong rounded px-3 py-2 font-mono">
            {parseError}
          </div>
        )}
        <div className="text-[12px] text-ink-faint space-y-1">
          <div>
            <strong>JSON</strong> — array of objects, or an export payload from this app's Export feature.
          </div>
          <div>
            <strong>CSV</strong> — first row is treated as column headers.
          </div>
        </div>
      </Card>
    );
  }

  /* ── Steps 2-4 share the same layout ── */
  return (
    <div className="space-y-6">
      {/* Header bar: file info + reset */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="px-2 py-0.5 rounded bg-surface-2 border border-line text-[11px] font-mono text-ink-muted">
            {format.toUpperCase()}
          </span>
          <span className="font-mono text-[12px] text-ink-muted truncate max-w-[200px]">{fileName}</span>
          <span className="text-[12px] text-ink-faint">{rows.length} rows</span>
        </div>
        <button onClick={resetState} className="btn-ghost text-[12px]">
          <Upload size={12} /> New file
        </button>
      </div>

      {/* Export payload collection selector */}
      {exportCollectionNames && exportCollectionNames.length > 0 && (
        <Card title="Export payload detected">
          <Field label="Collection to import from">
            <select
              value={selectedExportCol}
              onChange={(e) => setSelectedExportCol(e.target.value)}
              className="field-input"
            >
              {exportCollectionNames.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </Field>
          <p className="text-[12px] text-ink-faint">
            Note: only the first selected collection's rows are imported in this version.
          </p>
        </Card>
      )}

      {/* Step 2: Target selection */}
      {step === 2 && (
        <Card title="Target">
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 cursor-pointer text-[13px]">
              <input
                type="radio"
                name="import-target-mode"
                checked={targetMode === "existing"}
                onChange={() => setTargetMode("existing")}
                className="accent-[var(--brand)]"
              />
              Existing collection
            </label>
            <label className="flex items-center gap-2 cursor-pointer text-[13px]">
              <input
                type="radio"
                name="import-target-mode"
                checked={targetMode === "new"}
                onChange={() => setTargetMode("new")}
                className="accent-[var(--brand)]"
              />
              Create new collection
            </label>
          </div>

          {targetMode === "existing" ? (
            <Field label="Collection" required>
              <select
                value={existingTarget}
                onChange={(e) => setExistingTarget(e.target.value)}
                className="field-input"
              >
                <option value="">— Select —</option>
                {collections
                  .filter((c) => c.source !== "system" && !c.name.startsWith("_"))
                  .map((c) => (
                    <option key={c.id ?? c.name} value={c.name}>
                      {c.name} ({c.type})
                    </option>
                  ))}
              </select>
            </Field>
          ) : (
            <>
              <Field label="Collection name" required hint="Letters, digits, underscores. Must start with a letter.">
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="my_collection"
                  className="field-input font-mono"
                />
              </Field>
              <Field label="Type">
                <div className="flex gap-2">
                  {(["base", "user"] as ImportNewType[]).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setNewType(t)}
                      className={`px-3 py-1.5 rounded border text-[13px] font-mono transition ${
                        newType === t
                          ? "border-brand bg-brand/5 text-ink"
                          : "border-line text-ink-muted hover:bg-surface-2 hover:text-ink"
                      }`}
                    >
                      {t === "user" ? "user (auth)" : t}
                    </button>
                  ))}
                </div>
              </Field>
            </>
          )}

          {/* Preview of target schema */}
          {targetMode === "existing" && existingTarget && (
            <div>
              <span className="label-mono">Target schema</span>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {targetSchema.map((s) => (
                  <span key={s.name} className="px-2 py-0.5 rounded bg-surface-2 text-[11px] font-mono text-ink-muted">
                    {s.name}: {s.type}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center justify-between gap-3 pt-2">
            <button onClick={() => setStep(1)} className="btn-ghost text-[12px]">← Back</button>
            <button
              onClick={() => setStep(3)}
              disabled={!canProceedToMapping}
              className="btn-primary disabled:opacity-50"
            >
              Map columns →
            </button>
          </div>
        </Card>
      )}

      {/* Step 3: Column mapping */}
      {step === 3 && (
        <Card title="Column mapping">
          <div className="space-y-2">
            {mappings.map((m, idx) => (
              <div key={m.sourceColumn} className="grid grid-cols-[1fr_1fr] gap-2 items-center">
                <div className="font-mono text-[12px] text-ink truncate">{m.sourceColumn}</div>
                <select
                  value={m.targetColumn ?? "__skip__"}
                  onChange={(e) => {
                    const val = e.target.value;
                    setMappings((prev) =>
                      prev.map((mm, i) =>
                        i === idx
                          ? { ...mm, targetColumn: val === "__skip__" ? null : val }
                          : mm,
                      ),
                    );
                  }}
                  className="field-input text-[12px] py-1"
                >
                  <option value="__skip__">— Skip —</option>
                  {targetSchema.map((s) => (
                    <option key={s.name} value={s.name}>{s.name}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>

          {/* Preview of first mapped row */}
          {rows.length > 0 && (
            <div>
              <span className="label-mono">Preview (first mapped row)</span>
              <div className="mt-2 border border-line rounded bg-surface overflow-x-auto">
                <table className="w-full text-[12px] font-mono">
                  <thead className="bg-surface-2 hairline-b">
                    <tr>
                      {mappings.filter((m) => m.targetColumn).map((m) => (
                        <th key={m.sourceColumn} className="text-left px-2 py-1 text-ink-muted">{m.targetColumn}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="hairline-b">
                      {mappings.filter((m) => m.targetColumn).map((m) => {
                        const val = (rows[0] as Record<string, unknown>)?.[m.sourceColumn];
                        return (
                          <td key={m.sourceColumn} className="px-2 py-1 text-ink">
                            {val === undefined || val === null ? "" : typeof val === "object" ? JSON.stringify(val) : String(val)}
                          </td>
                        );
                      })}
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between gap-3 pt-2">
            <button onClick={() => setStep(2)} className="btn-ghost text-[12px]">← Back</button>
            <button
              onClick={handleImport}
              disabled={!hasMappedColumns || busy}
              className="btn-primary disabled:opacity-50"
            >
              <Upload size={14} /> {busy ? "Importing…" : `Import ${rows.length} rows`}
            </button>
          </div>
        </Card>
      )}

      {/* Step 4: Result */}
      {step === 4 && result && (
        <Card title="Import result">
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-3 text-[13px]">
              <div className="bg-surface-2 rounded px-3 py-2">
                <div className="label-mono">Imported</div>
                <div className="font-mono text-ink text-lg">{result.imported}</div>
              </div>
              <div className="bg-surface-2 rounded px-3 py-2">
                <div className="label-mono">Errors</div>
                <div className={`font-mono text-lg ${result.errors.length > 0 ? "text-err" : "text-ink"}`}>
                  {result.errors.length}
                </div>
              </div>
              <div className="bg-surface-2 rounded px-3 py-2">
                <div className="label-mono">Collection</div>
                <div className="font-mono text-ink text-[13px] truncate">{result.collection}</div>
                {result.created && <span className="text-[11px] text-ok font-mono">created</span>}
              </div>
            </div>

            {result.errors.length > 0 && (
              <div>
                <span className="label-mono">Per-row errors</span>
                <ul className="mt-2 max-h-48 overflow-y-auto border border-line rounded bg-surface text-[12px] font-mono">
                  {result.errors.map((e, i) => (
                    <li key={i} className="px-3 py-1 text-err hairline-b last:border-b-0">{e}</li>
                  ))}
                </ul>
              </div>
            )}

            <button onClick={resetState} className="btn-ghost text-[12px]">
              <Upload size={12} /> Import another file
            </button>
          </div>
        </Card>
      )}

      {/* Error banner (steps 2-4) */}
      {error && (
        <div className="bg-err-bg text-err text-[12px] border border-line-strong rounded px-3 py-2 font-mono">
          {error}
        </div>
      )}
    </div>
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
