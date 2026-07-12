import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Settings2,
  Trash2,
  X,
} from "lucide-react";
import { apiClient, ApiError } from "@/lib/api-client";
import { usePrefs } from "@/hooks/usePrefs";
import { Card } from "./primitives";

/* ──────────────────────────────────────────────────────────────
   Types
   ────────────────────────────────────────────────────────────── */

interface LogsSettings {
  retentionLimit: number;
  retentionDays: number;
  lastPrunedAt: number | null;
}

interface LogsSummary {
  total: number;
  info: number;
  warn: number;
  error: number;
}

const DEFAULT_SETTINGS: LogsSettings = {
  retentionLimit: 5_000,
  retentionDays: 0,
  lastPrunedAt: null,
};

/* ──────────────────────────────────────────────────────────────
   Helpers
   ────────────────────────────────────────────────────────────── */

function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    if (typeof err.detail === "string") return err.detail;
    const d = err.detail as { error?: string; detail?: string } | null;
    return d?.detail ?? d?.error ?? err.message;
  }
  return err instanceof Error ? err.message : fallback;
}

function formatNumber(n: number): string {
  return new Intl.NumberFormat("en-US").format(n);
}

/* ──────────────────────────────────────────────────────────────
   SettingsCard — retention configuration
   ────────────────────────────────────────────────────────────── */

function SettingsCard({
  settings,
  summary,
  onSave,
  saving,
  error,
}: {
  settings: LogsSettings;
  summary: LogsSummary | null;
  onSave: (next: LogsSettings) => void;
  saving: boolean;
  error: string | null;
}) {
  const [draft, setDraft] = useState<LogsSettings>(settings);
  const { formatDateTime, formatRelative } = usePrefs();

  useEffect(() => {
    setDraft(settings);
  }, [settings]);

  const dirty = draft.retentionDays !== settings.retentionDays;

  return (
    <Card title="Retention">
      <div className="space-y-1.5">
        <span className="label-mono">Maximum age (days)</span>
        <input
          type="number"
          min={0}
          max={3650}
          value={draft.retentionDays}
          onChange={(e) => {
            const n = parseInt(e.target.value, 10);
            setDraft((s) => ({
              ...s,
              retentionDays: isNaN(n) ? 0 : Math.max(0, Math.min(3650, n)),
            }));
          }}
          className="field-input font-mono text-[13px]"
        />
        <span className="text-[12px] text-ink-faint block">
          0 = disabled. Entries older than this are pruned automatically (the
          time-based sweep runs at most once per hour).
        </span>
      </div>

      {summary && (
        <div className="flex items-center gap-4 text-[12px] text-ink-muted font-mono flex-wrap">
          <span>
            <span className="text-ink-faint">Total:</span>{" "}
            {formatNumber(summary.total)}
          </span>
          <span className="text-ok">info {formatNumber(summary.info)}</span>
          <span className="text-warn">warn {formatNumber(summary.warn)}</span>
          <span className="text-err">error {formatNumber(summary.error)}</span>
        </div>
      )}

      {settings.lastPrunedAt && (
        <div className="text-[12px] text-ink-faint">
          Last age-based prune:{" "}
          <span className="font-mono text-ink-muted">
            {formatDateTime(new Date(settings.lastPrunedAt).toISOString())}
          </span>{" "}
          ({formatRelative(new Date(settings.lastPrunedAt).toISOString())})
        </div>
      )}

      {error && <div className="text-[12px] text-err font-mono">{error}</div>}

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
   DangerCard — delete all logs
   ────────────────────────────────────────────────────────────── */

function DangerCard({
  onPurge,
  purging,
  total,
}: {
  onPurge: () => void;
  purging: boolean;
  total: number;
}) {
  return (
    <Card title="Danger zone">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[13px] text-ink">Delete all log entries</div>
          <div className="text-[12px] text-ink-faint mt-0.5">
            Permanently clears every row in <span className="font-mono">_logs</span>.
            This cannot be undone.
          </div>
        </div>
        <button
          onClick={onPurge}
          disabled={purging || total === 0}
          className="btn-primary disabled:opacity-50 bg-err border-err hover:bg-err/90 whitespace-nowrap"
        >
          <Trash2 size={13} /> {purging ? "Deleting…" : "Delete all"}
        </button>
      </div>
    </Card>
  );
}

/* ──────────────────────────────────────────────────────────────
   ConfirmDialog — purge confirmation
   ────────────────────────────────────────────────────────────── */

function ConfirmDialog({
  count,
  onClose,
  onConfirm,
  busy,
}: {
  count: number;
  onClose: () => void;
  onConfirm: () => void;
  busy: boolean;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div className="bg-surface border border-line-strong rounded-lg shadow-xl w-full max-w-md p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-[14px] font-medium text-ink">Delete all logs</h3>
          <button
            onClick={onClose}
            disabled={busy}
            className="text-ink-muted hover:text-ink"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex items-start gap-2 p-3 rounded bg-err/10 border border-err/40 text-[12px] text-ink">
          <AlertTriangle size={14} className="text-err mt-0.5 shrink-0" />
          <div>
            About to delete{" "}
            <span className="font-mono">{formatNumber(count)}</span> log
            entr{count === 1 ? "y" : "ies"}. Retention settings will continue
            to apply to new requests after this.
          </div>
        </div>

        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            disabled={busy}
            className="btn-ghost text-[12px]"
          >
            <X size={12} /> Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={busy}
            className="btn-primary disabled:opacity-40 text-[12px] bg-err border-err hover:bg-err/90"
          >
            <Trash2 size={12} /> {busy ? "Deleting…" : "Delete all"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────
   Main
   ────────────────────────────────────────────────────────────── */

export function LogsForm() {
  const [settings, setSettings] = useState<LogsSettings>(DEFAULT_SETTINGS);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);

  const [summary, setSummary] = useState<LogsSummary | null>(null);
  const [purging, setPurging] = useState(false);
  const [purgeError, setPurgeError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  async function loadSettings() {
    try {
      const data = await apiClient.get<{ settings: LogsSettings }>(
        "/api/core/logs/settings",
      );
      setSettings({ ...DEFAULT_SETTINGS, ...data.settings });
    } catch (err) {
      setSettingsError(errorMessage(err, "Failed to load settings"));
    }
  }

  async function loadSummary() {
    try {
      const data = await apiClient.get<LogsSummary>("/api/core/logs/summary");
      setSummary(data);
    } catch {
      // Non-fatal.
    }
  }

  useEffect(() => {
    void loadSettings();
    void loadSummary();
  }, []);

  async function handleSave(next: LogsSettings) {
    setSettingsSaving(true);
    setSettingsError(null);
    try {
      const res = await apiClient.patch<{ settings: LogsSettings }>(
        "/api/core/logs/settings",
        {
          retentionDays: next.retentionDays,
        },
      );
      setSettings({ ...DEFAULT_SETTINGS, ...res.settings });
    } catch (err) {
      setSettingsError(errorMessage(err, "Failed to save settings"));
    } finally {
      setSettingsSaving(false);
    }
  }

  async function handlePurgeConfirm() {
    setPurging(true);
    setPurgeError(null);
    try {
      await apiClient.del("/api/core/logs");
      setConfirmOpen(false);
      await loadSummary();
    } catch (err) {
      setPurgeError(errorMessage(err, "Failed to delete logs"));
    } finally {
      setPurging(false);
    }
  }

  return (
    <div className="space-y-6">
      {purgeError && (
        <div className="flex items-start gap-2 p-3 rounded bg-err/10 border border-err/40 text-[12px] text-ink">
          <AlertTriangle size={14} className="text-err mt-0.5 shrink-0" />
          <span className="font-mono">{purgeError}</span>
        </div>
      )}

      <SettingsCard
        settings={settings}
        summary={summary}
        onSave={handleSave}
        saving={settingsSaving}
        error={settingsError}
      />

      <DangerCard
        onPurge={() => setConfirmOpen(true)}
        purging={purging}
        total={summary?.total ?? 0}
      />

      {confirmOpen && summary && (
        <ConfirmDialog
          count={summary.total}
          onClose={() => !purging && setConfirmOpen(false)}
          onConfirm={handlePurgeConfirm}
          busy={purging}
        />
      )}
    </div>
  );
}
