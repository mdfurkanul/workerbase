import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Clock,
  Download,
  HardDrive,
  RotateCcw,
  Settings2,
  Trash2,
  X,
} from "lucide-react";
import { apiClient, ApiError, getApiBase } from "@/lib/api-client";
import { usePrefs } from "@/hooks/usePrefs";
import { Card } from "./primitives";
import Toggle from "@/components/Toggle";

/* ──────────────────────────────────────────────────────────────
   Types
   ────────────────────────────────────────────────────────────── */

type BackupType = "manual" | "auto";

interface Backup {
  id: string;
  name: string;
  type: BackupType;
  createdAt: string | null;
  sizeBytes: number;
  objectCount: number;
  generatedBy: string | null;
}

interface ListResponse {
  backups: Backup[];
  truncated: boolean;
  cursor?: string;
}

interface BackupsSettings {
  autoEnabled: boolean;
  intervalHours: number;
  maxRetention: number;
  lastAutoAt: number | null;
}

const DEFAULT_SETTINGS: BackupsSettings = {
  autoEnabled: false,
  intervalHours: 24,
  maxRetention: 30,
  lastAutoAt: null,
};

const INTERVAL_OPTIONS: { value: number; label: string }[] = [
  { value: 1, label: "Every hour" },
  { value: 6, label: "Every 6 hours" },
  { value: 12, label: "Every 12 hours" },
  { value: 24, label: "Daily" },
  { value: 168, label: "Weekly" },
];

/* ──────────────────────────────────────────────────────────────
   Helpers
   ────────────────────────────────────────────────────────────── */

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    if (typeof err.detail === "string") return err.detail;
    const d = err.detail as { error?: string; detail?: string } | null;
    return d?.detail ?? d?.error ?? err.message;
  }
  return err instanceof Error ? err.message : fallback;
}

/* ──────────────────────────────────────────────────────────────
   BackupCard — single timeline entry
   ────────────────────────────────────────────────────────────── */

function BackupCard({
  backup,
  newest,
  onRestore,
  onDownload,
  onDelete,
}: {
  backup: Backup;
  newest: boolean;
  onRestore: () => void;
  onDownload: () => void;
  onDelete: () => void;
}) {
  const isNamed = backup.name && backup.name.length > 0;
  const isAuto = backup.type === "auto";
  const { formatDateTime, formatRelative } = usePrefs();

  return (
    <li className="relative flex gap-4">
      {/* Timeline rail */}
      <div className="flex flex-col items-center">
        <span
          className={`mt-1 w-2.5 h-2.5 rounded-full ring-4 ${
            newest
              ? "bg-[var(--brand)] ring-[var(--brand)]/15"
              : isAuto
                ? "bg-ink-muted ring-[var(--surface-2)]"
                : "bg-ink-muted ring-[var(--surface-2)]"
          }`}
        />
        <span className="flex-1 w-px bg-line-strong mt-1" />
      </div>

      {/* Card */}
      <div className="flex-1 bg-surface border border-line rounded p-4 mb-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[14px] font-medium text-ink">
                {isNamed ? backup.name : "(unnamed)"}
              </span>
              {newest && (
                <span className="px-1.5 py-0.5 text-[10px] font-mono uppercase tracking-widest rounded bg-[var(--brand)]/10 text-[var(--brand)] border border-[var(--brand)]/30">
                  Latest
                </span>
              )}
              <span
                className={`px-1.5 py-0.5 text-[10px] font-mono uppercase tracking-widest rounded border ${
                  isAuto
                    ? "bg-ink/5 text-ink-muted border-line-strong"
                    : "bg-ok-bg text-ok border-ok/40"
                }`}
                title={isAuto ? "Created automatically by scheduler" : "Created manually"}
              >
                {isAuto ? "Auto" : "Manual"}
              </span>
            </div>
            <div className="mt-1 flex items-center gap-2 text-[12px] text-ink-muted flex-wrap">
              <Clock size={12} />
              <span>{formatDateTime(backup.createdAt)}</span>
              <span className="text-ink-faint">·</span>
              <span>{formatRelative(backup.createdAt)}</span>
              {backup.generatedBy && (
                <>
                  <span className="text-ink-faint">·</span>
                  <span className="font-mono truncate max-w-[200px]">
                    {backup.generatedBy}
                  </span>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onRestore}
              title="Restore this snapshot"
              className="btn-ghost text-[12px]"
            >
              <RotateCcw size={12} /> Restore
            </button>
            <button
              onClick={onDownload}
              title="Download JSON"
              className="btn-ghost text-[12px]"
            >
              <Download size={12} /> Download
            </button>
            <button
              onClick={onDelete}
              title="Delete backup"
              className="btn-ghost text-[12px] text-err hover:bg-err/10"
            >
              <Trash2 size={12} />
            </button>
          </div>
        </div>

        <div className="mt-3 flex items-center gap-4 text-[12px] text-ink-muted font-mono">
          <span>{formatBytes(backup.sizeBytes)}</span>
          <span className="text-ink-faint">·</span>
          <span>{backup.objectCount} objects</span>
          <span className="text-ink-faint truncate ml-auto" title={backup.id}>
            {backup.id}
          </span>
        </div>
      </div>
    </li>
  );
}

/* ──────────────────────────────────────────────────────────────
   SettingsCard — auto-snapshot configuration
   ────────────────────────────────────────────────────────────── */

function SettingsCard({
  settings,
  onSave,
  saving,
  error,
}: {
  settings: BackupsSettings;
  onSave: (next: BackupsSettings) => void;
  saving: boolean;
  error: string | null;
}) {
  const [draft, setDraft] = useState<BackupsSettings>(settings);
  const { formatDateTime, formatRelative } = usePrefs();

  // Re-sync when the parent's loaded settings change.
  useEffect(() => {
    setDraft(settings);
  }, [settings]);

  const dirty =
    draft.autoEnabled !== settings.autoEnabled ||
    draft.intervalHours !== settings.intervalHours ||
    draft.maxRetention !== settings.maxRetention;

  return (
    <Card title="Automatic snapshots">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[13px] text-ink">Enable automatic snapshots</div>
          <div className="text-[12px] text-ink-faint mt-0.5">
            A scheduler runs hourly and creates a snapshot if the configured
            interval has elapsed since the last automatic one.
          </div>
        </div>
        <Toggle
          checked={draft.autoEnabled}
          onChange={(v) => setDraft((s) => ({ ...s, autoEnabled: v }))}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="block space-y-1.5">
          <span className="label-mono">Frequency</span>
          <select
            value={draft.intervalHours}
            onChange={(e) =>
              setDraft((s) => ({ ...s, intervalHours: parseInt(e.target.value, 10) }))
            }
            className="field-input text-[13px]"
            disabled={!draft.autoEnabled}
          >
            {INTERVAL_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block space-y-1.5">
          <span className="label-mono">Max snapshots to keep</span>
          <input
            type="number"
            min={0}
            max={10000}
            value={draft.maxRetention}
            onChange={(e) => {
              const n = parseInt(e.target.value, 10);
              setDraft((s) => ({
                ...s,
                maxRetention: isNaN(n) ? 0 : Math.max(0, Math.min(10000, n)),
              }));
            }}
            className="field-input font-mono text-[13px]"
          />
          <span className="text-[12px] text-ink-faint block">
            0 = unlimited. Oldest snapshots are pruned on every create.
          </span>
        </label>
      </div>

      {settings.lastAutoAt && (
        <div className="text-[12px] text-ink-faint">
          Last automatic snapshot:{" "}
          <span className="font-mono text-ink-muted">
            {formatDateTime(new Date(settings.lastAutoAt).toISOString())}
          </span>{" "}
          ({formatRelative(new Date(settings.lastAutoAt).toISOString())})
        </div>
      )}

      {error && (
        <div className="text-[12px] text-err font-mono">{error}</div>
      )}

      <div className="flex justify-end pt-2">
        <button
          onClick={() => onSave(draft)}
          disabled={!dirty || saving}
          className="btn-primary disabled:opacity-50"
        >
          <Settings2 size={13} /> {saving ? "Saving…" : "Save settings"}
        </button>
      </div>
    </Card>
  );
}

/* ──────────────────────────────────────────────────────────────
   RestoreDialog — destructive-action confirmation modal
   ────────────────────────────────────────────────────────────── */

function RestoreDialog({
  backup,
  onClose,
  onConfirm,
  busy,
}: {
  backup: Backup;
  onClose: () => void;
  onConfirm: () => void;
  busy: boolean;
}) {
  const expected = (backup.name || "").trim();
  const [typed, setTyped] = useState("");
  const needsType = expected.length > 0;
  const { formatDateTime } = usePrefs();

  return (
    <ModalShell onClose={onClose} title="Restore snapshot">
      <div className="space-y-3 text-[13px] text-ink">
        <div className="flex items-start gap-2 p-3 rounded bg-err/10 border border-err/40 text-ink">
          <AlertTriangle size={16} className="text-err mt-0.5 shrink-0" />
          <div>
            <div className="font-medium">This replaces the entire database.</div>
            <div className="mt-1 text-[12px] text-ink-muted">
              All collections, records, settings, and users created after{" "}
              <span className="font-mono">{formatDateTime(backup.createdAt)}</span>{" "}
              will be lost. The current state cannot be recovered unless you
              take a new backup first.
            </div>
          </div>
        </div>

        <div className="text-[12px] text-ink-muted">
          Snapshot:{" "}
          <span className="font-mono text-ink">
            {expected || backup.id}
          </span>
        </div>

        {needsType && (
          <label className="block space-y-1.5">
            <span className="label-mono">
              Type the snapshot name to confirm
            </span>
            <input
              autoFocus
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={expected}
              className="field-input font-mono text-[12px]"
            />
          </label>
        )}
      </div>

      <div className="mt-5 flex items-center justify-end gap-2">
        <button onClick={onClose} className="btn-ghost text-[12px]" disabled={busy}>
          <X size={12} /> Cancel
        </button>
        <button
          onClick={onConfirm}
          disabled={busy || (needsType && typed !== expected)}
          className="btn-primary disabled:opacity-40 text-[12px]"
        >
          <RotateCcw size={12} /> {busy ? "Restoring…" : "Restore now"}
        </button>
      </div>
    </ModalShell>
  );
}

/* ──────────────────────────────────────────────────────────────
   DeleteDialog — simple destructive confirmation
   ────────────────────────────────────────────────────────────── */

function DeleteDialog({
  backup,
  onClose,
  onConfirm,
  busy,
}: {
  backup: Backup;
  onClose: () => void;
  onConfirm: () => void;
  busy: boolean;
}) {
  const { formatDateTime } = usePrefs();
  return (
    <ModalShell onClose={onClose} title="Delete snapshot">
      <div className="space-y-3 text-[13px] text-ink">
        <p>
          Delete snapshot{" "}
          <span className="font-mono">{backup.name || backup.id}</span> from{" "}
          {formatDateTime(backup.createdAt)}? This cannot be undone.
        </p>
      </div>
      <div className="mt-5 flex items-center justify-end gap-2">
        <button onClick={onClose} className="btn-ghost text-[12px]" disabled={busy}>
          <X size={12} /> Cancel
        </button>
        <button
          onClick={onConfirm}
          disabled={busy}
          className="btn-primary disabled:opacity-40 text-[12px] bg-err border-err hover:bg-err/90"
        >
          <Trash2 size={12} /> {busy ? "Deleting…" : "Delete"}
        </button>
      </div>
    </ModalShell>
  );
}

/* ──────────────────────────────────────────────────────────────
   ModalShell — minimal modal wrapper
   ────────────────────────────────────────────────────────────── */

function ModalShell({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className="bg-surface border border-line-strong rounded-lg shadow-xl w-full max-w-md p-5"
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-[14px] font-medium text-ink">{title}</h3>
          <button
            onClick={onClose}
            className="text-ink-muted hover:text-ink"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────
   Main
   ────────────────────────────────────────────────────────────── */

export function BackupsForm() {
  const [backups, setBackups] = useState<Backup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [settings, setSettings] = useState<BackupsSettings>(DEFAULT_SETTINGS);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);

  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  const [restoreTarget, setRestoreTarget] = useState<Backup | null>(null);
  const [restoreBusy, setRestoreBusy] = useState(false);
  const [restoreError, setRestoreError] = useState<string | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<Backup | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [shadowCleanup, setShadowCleanup] = useState<{
    running: boolean;
    count: number | null;
    error: string | null;
  }>({ running: false, count: null, error: null });

  async function loadBackups() {
    setLoading(true);
    setError(null);
    try {
      const data = await apiClient.get<ListResponse>("/api/core/backups", {
        limit: 500,
      });
      // Already sorted DESC by created_at from the API; keep that order.
      setBackups(data.backups);
    } catch (err) {
      setError(errorMessage(err, "Failed to load backups"));
    } finally {
      setLoading(false);
    }
  }

  async function loadSettings() {
    try {
      const data = await apiClient.get<{ settings: BackupsSettings }>(
        "/api/core/backups/settings",
      );
      setSettings({ ...DEFAULT_SETTINGS, ...data.settings });
    } catch (err) {
      // Non-fatal — fall back to defaults.
      setSettingsError(errorMessage(err, "Failed to load settings"));
    }
  }

  useEffect(() => {
    void loadBackups();
    void loadSettings();
  }, []);

  async function handleCreate() {
    setCreating(true);
    setError(null);
    try {
      await apiClient.post("/api/core/backups", {
        name: newName.trim() || undefined,
      });
      setNewName("");
      await loadBackups();
    } catch (err) {
      setError(errorMessage(err, "Failed to create backup"));
    } finally {
      setCreating(false);
    }
  }

  async function handleSaveSettings(next: BackupsSettings) {
    setSettingsSaving(true);
    setSettingsError(null);
    try {
      const res = await apiClient.patch<{ settings: BackupsSettings }>(
        "/api/core/backups/settings",
        {
          autoEnabled: next.autoEnabled,
          intervalHours: next.intervalHours,
          maxRetention: next.maxRetention,
        },
      );
      setSettings({ ...DEFAULT_SETTINGS, ...res.settings });
    } catch (err) {
      setSettingsError(errorMessage(err, "Failed to save settings"));
    } finally {
      setSettingsSaving(false);
    }
  }

  async function handleDownload(b: Backup) {
    setDownloadingId(b.id);
    try {
      const token = localStorage.getItem("workerbase.token") ?? "";
      const base = getApiBase();
      const url = `${base}/api/core/backups/${encodeURIComponent(b.id)}`;
      const res = await fetch(url, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objUrl;
      a.download = b.id;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objUrl);
    } catch (err) {
      setError(errorMessage(err, "Download failed"));
    } finally {
      setDownloadingId(null);
    }
  }

  async function handleRestoreConfirm() {
    if (!restoreTarget) return;
    setRestoreBusy(true);
    setRestoreError(null);
    try {
      await apiClient.post(
        `/api/core/backups/${encodeURIComponent(restoreTarget.id)}/restore`,
      );
      setRestoreTarget(null);
      await loadBackups();
    } catch (err) {
      setRestoreError(errorMessage(err, "Restore failed — DB unchanged"));
    } finally {
      setRestoreBusy(false);
    }
  }

  async function handleDeleteConfirm() {
    if (!deleteTarget) return;
    setDeleteBusy(true);
    try {
      await apiClient.del(`/api/core/backups/${encodeURIComponent(deleteTarget.id)}`);
      setBackups((cur) => cur.filter((b) => b.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (err) {
      setError(errorMessage(err, "Delete failed"));
    } finally {
      setDeleteBusy(false);
    }
  }

  async function handleCleanupShadows() {
    setShadowCleanup({ running: true, count: null, error: null });
    try {
      const res = await apiClient.post<{ count: number; dropped: string[] }>(
        "/api/core/backups/cleanup-shadows",
      );
      setShadowCleanup({ running: false, count: res.count, error: null });
    } catch (err) {
      setShadowCleanup({
        running: false,
        count: null,
        error: errorMessage(err, "Cleanup failed"),
      });
    }
  }

  return (
    <div className="space-y-6">
      {/* Inline error */}
      {error && (
        <div className="flex items-start gap-2 p-3 rounded bg-err/10 border border-err/40 text-[12px] text-ink">
          <AlertTriangle size={14} className="text-err mt-0.5 shrink-0" />
          <span className="font-mono">{error}</span>
        </div>
      )}

      {/* Two-column layout: settings + create on the left, timeline on the right */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] gap-6 items-start">
        {/* Left column — controls */}
        <div className="space-y-6">
          <SettingsCard
            settings={settings}
            onSave={handleSaveSettings}
            saving={settingsSaving}
            error={settingsError}
          />

          <Card title="Create backup">
            <div className="flex items-end gap-2">
              <label className="flex-1 space-y-1.5">
                <span className="label-mono">Snapshot name (optional)</span>
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  maxLength={120}
                  placeholder="e.g. Pre-launch snapshot"
                  className="field-input text-[13px]"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !creating) void handleCreate();
                  }}
                />
              </label>
              <button
                onClick={handleCreate}
                disabled={creating}
                className="btn-primary disabled:opacity-50"
              >
                <HardDrive size={13} /> {creating ? "Creating…" : "Create snapshot"}
              </button>
            </div>
            <div className="text-[12px] text-ink-faint">
              Captures every table, view, index and trigger (including system tables)
              as a single JSON file in R2. Tagged as <span className="font-mono">Manual</span>.
            </div>
          </Card>
        </div>

        {/* Right column — timeline (sticky, screen-height, internal scroll) */}
        <div className="lg:sticky lg:top-8 lg:h-[calc(100vh-7rem)] flex flex-col bg-surface border border-line rounded">
          <header className="px-4 py-3 hairline-b label-mono flex items-center justify-between gap-2 shrink-0">
            <span>Timeline{backups.length ? ` · ${backups.length}` : ""}</span>
            <div className="flex items-center gap-3">
              {shadowCleanup.count !== null && shadowCleanup.count > 0 && (
                <span className="text-[11px] text-ok normal-case font-normal tracking-normal">
                  Dropped {shadowCleanup.count} shadow table
                  {shadowCleanup.count === 1 ? "" : "s"}
                </span>
              )}
              {shadowCleanup.count === 0 && (
                <span className="text-[11px] text-ink-faint normal-case font-normal tracking-normal">
                  No shadow tables
                </span>
              )}
              {shadowCleanup.error && (
                <span className="text-[11px] text-err normal-case font-normal tracking-normal">
                  {shadowCleanup.error}
                </span>
              )}
              <button
                onClick={handleCleanupShadows}
                disabled={shadowCleanup.running}
                title="Drop leftover _wb_restore_* scratch tables from failed restores"
                className="text-[11px] text-ink-muted hover:text-ink underline-offset-2 hover:underline disabled:opacity-50 normal-case font-normal tracking-normal"
              >
                {shadowCleanup.running ? "Cleaning…" : "Clean shadow tables"}
              </button>
            </div>
          </header>

          <div className="flex-1 overflow-y-auto p-4 min-h-0">
            {loading ? (
              <div className="text-[13px] text-ink-muted">Loading…</div>
            ) : backups.length === 0 ? (
              <div className="text-[13px] text-ink-muted py-6 text-center">
                <Clock size={20} className="mx-auto mb-2 text-ink-faint" />
                No snapshots yet. Create your first backup to start the timeline.
              </div>
            ) : (
              <ul className="flex flex-col">
                {backups.map((b, i) => (
                  <BackupCard
                    key={b.id}
                    backup={b}
                    newest={i === 0}
                    onRestore={() => {
                      setRestoreError(null);
                      setRestoreTarget(b);
                    }}
                    onDownload={() => void handleDownload(b)}
                    onDelete={() => setDeleteTarget(b)}
                  />
                ))}
              </ul>
            )}

            {downloadingId && (
              <div className="mt-3 text-[12px] text-ink-muted">
                Preparing download…
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Restore modal */}
      {restoreTarget && (
        <RestoreDialog
          backup={restoreTarget}
          busy={restoreBusy}
          onClose={() => {
            if (!restoreBusy) {
              setRestoreTarget(null);
              setRestoreError(null);
            }
          }}
          onConfirm={handleRestoreConfirm}
        />
      )}

      {/* Restore error toast */}
      {restoreError && restoreTarget && (
        <div className="fixed bottom-4 right-4 z-[60] max-w-sm p-3 bg-surface border border-err/50 rounded shadow-lg text-[12px] text-ink">
          <div className="flex items-start gap-2">
            <AlertTriangle size={14} className="text-err mt-0.5 shrink-0" />
            <div className="flex-1">
              <div className="font-medium text-err mb-0.5">Restore failed</div>
              <div className="font-mono text-ink-muted break-words">
                {restoreError}
              </div>
              <div className="mt-1 text-ink-faint">
                The database was not modified.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete modal */}
      {deleteTarget && (
        <DeleteDialog
          backup={deleteTarget}
          busy={deleteBusy}
          onClose={() => {
            if (!deleteBusy) setDeleteTarget(null);
          }}
          onConfirm={handleDeleteConfirm}
        />
      )}
    </div>
  );
}
