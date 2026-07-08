import { useEffect, useState } from "react";
import { Loader2, Trash2, X, Check, Pencil, Download } from "lucide-react";
import { apiClient, ApiError, getToken } from "@/lib/api-client";
import { useAuth, canEdit } from "@/hooks/useAuth";
import { usePrefs } from "@/hooks/usePrefs";
import {
  epochMsToWallClock,
  wallClockToEpochMs,
  looksLikeEpochSeconds,
} from "@/lib/dateTimeFormat";
import Modal from "@/components/Modal";

interface Props {
  open: boolean;
  collectionName: string;
  recordId: string | null;
  schema?: { name: string; type: string }[];
  snapshot?: { key: string; value: unknown }[];
  /** When true, hide Edit/Delete actions (e.g. read-only system tables). */
  readOnly?: boolean;
  onClose: () => void;
  onChanged?: () => void;
}

const PROTECTED_COLS = new Set(["id", "created_at", "updated_at", "rowid", "token_key", "password_hash", "password_salt"]);

/** Convert a raw DB value to the string representation used in edit inputs. */
function valueToString(value: unknown, type: string | undefined, timezone: string | undefined): string {
  if (value === null || value === undefined || value === "") return "";
  if (type === "bool") return value === true || value === 1 ? "true" : "false";
  if (type === "datetime") {
    // Stored as epoch ms (or epoch seconds in collection-system columns).
    const n =
      typeof value === "number"
        ? value
        : typeof value === "string" && /^\d+$/.test(value)
          ? parseInt(value, 10)
          : NaN;
    if (!Number.isNaN(n)) {
      const ms = looksLikeEpochSeconds(n) ? n * 1000 : n;
      return epochMsToWallClock(ms, timezone);
    }
    // Fall through: ISO string or other — let the input parse natively.
    if (typeof value === "string" && /\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(value)) {
      const d = new Date(value);
      if (!Number.isNaN(d.getTime())) return epochMsToWallClock(d.getTime(), timezone);
    }
    return String(value);
  }
  if (type === "date") {
    // Stored as TEXT yyyy-MM-dd — keep the user-typed form.
    return typeof value === "string" ? value.slice(0, 10) : String(value);
  }
  return String(value);
}

export default function RecordDrawer({
  open,
  collectionName,
  recordId,
  schema = [],
  snapshot,
  readOnly = false,
  onClose,
  onChanged,
}: Props) {
  const { user } = useAuth();
  const allowEdit = canEdit(user) && !readOnly;
  const { timezone, formatDateTime } = usePrefs();
  const [record, setRecord] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editValues, setEditValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editErrors, setEditErrors] = useState<Record<string, string>>({});
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTyped, setDeleteTyped] = useState("");

  // Fetch the real record from the API when the drawer opens.
  useEffect(() => {
    if (!open || !recordId) return;
    setLoading(true);
    setError(null);
    setEditMode(false);
    setDeleteOpen(false);
    setDeleteTyped("");
    apiClient
      .get<{ record: Record<string, unknown> }>(
        `/api/core/collections/${encodeURIComponent(collectionName)}/records/${encodeURIComponent(recordId)}`,
      )
      .then((data) => {
        const r = data.record ?? null;
        setRecord(r);
        // Pre-fill edit values from the fetched record.
        if (r) {
          const ev: Record<string, string> = {};
          for (const [k, v] of Object.entries(r)) {
            if (!PROTECTED_COLS.has(k)) {
              const fieldDef = schema.find((f) => f.name === k);
              ev[k] = valueToString(v, fieldDef?.type, timezone);
            }
          }
          setEditValues(ev);
        }
      })
      .catch(() => {
        if (snapshot) {
          const r: Record<string, unknown> = {};
          for (const { key, value } of snapshot) r[key] = value;
          setRecord(r);
          const ev: Record<string, string> = {};
          for (const [k, v] of Object.entries(r)) {
            if (!PROTECTED_COLS.has(k)) {
              const fieldDef = schema.find((f) => f.name === k);
              ev[k] = valueToString(v, fieldDef?.type, timezone);
            }
          }
          setEditValues(ev);
        } else {
          setRecord(null);
        }
      })
      .finally(() => setLoading(false));
  }, [open, recordId, collectionName, snapshot, schema, timezone]);

  // Esc to close.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { onClose(); setEditMode(false); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  async function handleDelete() {
    if (!recordId) return;
    if (!allowEdit) return; // defense in depth — viewer cannot delete
    setSaving(true);
    try {
      await apiClient.del(`/api/core/collections/${encodeURIComponent(collectionName)}/records/${encodeURIComponent(recordId)}`);
      onChanged?.();
      setDeleteOpen(false);
      setDeleteTyped("");
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete");
    } finally {
      setSaving(false);
    }
  }

  /**
   * Download a backup JSON file. Only shown for the `_backups` system
   * table. Uses the raw `fetch` API (not `apiClient`) because the
   * response is a binary blob, not JSON — `apiClient` parses JSON
   * responses only.
   */
  async function handleDownloadBackup() {
    const id = record?.id;
    if (!id || typeof id !== "string") return;
    setSaving(true);
    try {
      const token = getToken();
      const base = import.meta.env.VITE_API_BASE_URL ?? "";
      const res = await fetch(
        `${base}/api/core/backups/${encodeURIComponent(id)}`,
        { headers: token ? { Authorization: `Bearer ${token}` } : undefined },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objUrl;
      a.download = id;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Download failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveEdit() {
    if (!recordId) return;
    if (!allowEdit) return; // defense in depth — viewer cannot save edits
    setError(null);

    // Validate each field by type.
    const errs: Record<string, string> = {};
    for (const [k, v] of Object.entries(editValues)) {
      const raw = (v ?? "").trim();
      if (raw === "") continue;
      const fieldDef = schema.find((f) => f.name === k);
      switch (fieldDef?.type) {
        case "integer":
          if (!/^-?\d+$/.test(raw)) errs[k] = `${k} must be a whole number`;
          break;
        case "real":
          if (isNaN(Number(raw))) errs[k] = `${k} must be a valid number`;
          break;
        case "email":
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)) errs[k] = `${k} must be a valid email`;
          break;
        case "url":
          if (!/^https?:\/\/.+/.test(raw)) errs[k] = `${k} must be a valid URL (http:// or https://)`;
          break;
        case "bool":
          if (!["true", "false", "1", "0"].includes(raw.toLowerCase())) errs[k] = `${k} must be true or false`;
          break;
      }
    }
    if (Object.keys(errs).length > 0) {
      setEditErrors(errs);
      return;
    }
    setEditErrors({});

    setSaving(true);
    try {
      const payload: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(editValues)) {
        const fieldDef = schema.find((f) => f.name === k);
        const raw = (v ?? "").trim();
        if (fieldDef?.type === "integer") payload[k] = parseInt(raw, 10);
        else if (fieldDef?.type === "real") payload[k] = parseFloat(raw);
        else if (fieldDef?.type === "bool") payload[k] = raw === "true";
        else if (fieldDef?.type === "datetime") {
          // User typed a wall-clock value in their TZ; convert to epoch ms.
          // Empty string is preserved as-is so the user can clear the field.
          if (raw === "") payload[k] = "";
          else {
            const ms = wallClockToEpochMs(raw, timezone);
            payload[k] = ms ?? raw; // fall back to raw string if unparseable
          }
        }
        else if (fieldDef?.type === "date") {
          payload[k] = raw.slice(0, 10); // normalise to yyyy-MM-dd
        }
        else payload[k] = v;
      }
      await apiClient.patch(
        `/api/core/collections/${encodeURIComponent(collectionName)}/records/${encodeURIComponent(recordId)}`,
        payload,
      );
      onChanged?.();
      setEditMode(false);
      onClose();
    } catch (err) {
      if (err instanceof ApiError) {
        const body = err.detail as
          | { fieldErrors?: Record<string, string>; detail?: string }
          | string
          | null;
        if (body && typeof body === "object" && body.fieldErrors) {
          setEditErrors(body.fieldErrors);
          const count = Object.keys(body.fieldErrors).length;
          setError(
            `${count} field${count === 1 ? "" : "s"} failed validation — see inline errors.`,
          );
        } else {
          const detail =
            typeof body === "string" ? body : body?.detail ?? err.message;
          setError(detail ?? "Failed to save");
        }
      } else {
        setError(err instanceof Error ? err.message : "Failed to save");
      }
    } finally {
      setSaving(false);
    }
  }

  // Compute editable fields from schema (or from record keys).
  const editableKeys = schema.length
    ? schema.filter((f) => !PROTECTED_COLS.has(f.name)).map((f) => f.name)
    : record ? Object.keys(record).filter((k) => !PROTECTED_COLS.has(k)) : [];

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={() => { onClose(); setEditMode(false); }}
        aria-hidden
        className={`fixed inset-0 z-40 transition-opacity duration-200 ${
          open ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        style={{ background: "var(--overlay)" }}
      />

      {/* Panel */}
      <aside
        role="dialog"
        aria-label={`Record ${recordId ?? ""}`}
        aria-modal="true"
        className={`fixed top-0 right-0 z-50 h-full w-full max-w-md bg-bg-elev hairline-l shadow-2xl flex flex-col transition-transform duration-200 ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Header */}
        <header className="px-4 py-3 hairline-b flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="label-mono">Collection · {collectionName}</div>
            <div className="font-mono text-[14px] text-ink truncate mt-0.5">
              {recordId ?? "—"}
            </div>
          </div>
          <button onClick={() => { onClose(); setEditMode(false); }} className="btn-icon" aria-label="Close">
            <X size={16} />
          </button>
        </header>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 py-4">
          {error && (
            <div className="mb-3 bg-err-bg text-err text-[12px] border border-line-strong rounded px-3 py-2 font-mono">
              {error}
            </div>
          )}
          {loading ? (
            <div className="flex items-center gap-2 text-[13px] text-ink-muted py-8">
              <Loader2 size={14} className="animate-spin text-brand" /> Loading record…
            </div>
          ) : record ? (
            editMode ? (
              /* ── Edit mode — inputs pre-filled with current values ── */
              <div className="space-y-3">
                {editableKeys.map((key) => {
                  const fieldDef = schema.find((f) => f.name === key);
                  const currentVal = record[key];
                  const fieldErr = editErrors[key];
                  return (
                    <label key={key} className="block">
                      <span className="label-mono">
                        {key}{" "}
                        <span className="text-ink-faint normal-case font-normal">· {fieldDef?.type ?? "text"}</span>
                      </span>
                      {fieldDef?.type === "bool" ? (
                        <select
                          value={editValues[key] ?? ""}
                          onChange={(e) => { setEditValues((ev) => ({ ...ev, [key]: e.target.value })); setEditErrors((ee) => ({ ...ee, [key]: "" })); }}
                          className={`field-input mt-1 ${fieldErr ? "border-err" : ""}`}
                        >
                          <option value="">— unset —</option>
                          <option value="true">true</option>
                          <option value="false">false</option>
                        </select>
                      ) : (
                        <input
                          type={
                            fieldDef?.type === "integer" || fieldDef?.type === "real"
                              ? "number"
                              : fieldDef?.type === "datetime"
                                ? "datetime-local"
                                : fieldDef?.type === "date"
                                  ? "date"
                                  : "text"
                          }
                          value={editValues[key] ?? ""}
                          onChange={(e) => { setEditValues((ev) => ({ ...ev, [key]: e.target.value })); setEditErrors((ee) => ({ ...ee, [key]: "" })); }}
                          placeholder={currentVal === null ? "null" : String(currentVal)}
                          className={`field-input mt-1 ${fieldErr ? "border-err" : ""}`}
                        />
                      )}
                      {fieldErr && <div className="text-err text-[12px] mt-1">{fieldErr}</div>}
                    </label>
                  );
                })}
              </div>
            ) : (
              /* ── Read mode ── */
              <dl className="bg-surface border border-line rounded divide-y divide-line">
                {Object.entries(record).map(([key, value]) => {
                  const fieldDef = schema.find((f) => f.name === key);
                  return (
                    <div key={key} className="grid grid-cols-[140px_1fr] gap-3 px-3 py-2.5 items-start">
                      <dt className="font-mono text-[12px] text-ink-muted pt-0.5">{key}</dt>
                      <dd className="text-[13px] break-words">
                        <DetailValue value={value} fieldType={fieldDef?.type} formatDateTime={formatDateTime} />
                      </dd>
                    </div>
                  );
                })}
              </dl>
            )
          ) : (
            <div className="text-center text-ink-muted text-[13px] py-10">
              No record selected.
            </div>
          )}
        </div>

        {/* Footer */}
        {record && !loading && (
          <footer className="px-4 py-3 hairline-t flex items-center justify-end gap-2">
            {editMode ? (
              <>
                <button onClick={() => setEditMode(false)} className="btn-ghost text-[12px]">Cancel</button>
                <button
                  onClick={handleSaveEdit}
                  disabled={saving}
                  className="btn-primary text-[12px]"
                >
                  {saving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} Save changes
                </button>
              </>
            ) : (
              <>
                {collectionName === "_backups" && record?.id && (
                  <button
                    onClick={handleDownloadBackup}
                    disabled={saving}
                    className="btn-ghost text-[12px]"
                    title="Download backup JSON"
                  >
                    {saving ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />} Download
                  </button>
                )}
                {allowEdit && (
                  <button
                    onClick={() => setEditMode(true)}
                    className="btn-ghost text-[12px]"
                  >
                    <Pencil size={12} /> Edit
                  </button>
                )}
                {allowEdit && (
                  <button
                    onClick={() => setDeleteOpen(true)}
                    className="btn-ghost text-[12px] border-err text-err hover:bg-err-bg"
                  >
                    <Trash2 size={12} /> Delete
                  </button>
                )}
              </>
            )}
          </footer>
        )}
      </aside>

      {/* Custom delete confirmation modal */}
      <Modal
        open={deleteOpen}
        title="Delete record?"
        onClose={() => { setDeleteOpen(false); setDeleteTyped(""); }}
        footer={
          <>
            <button
              onClick={() => { setDeleteOpen(false); setDeleteTyped(""); }}
              className="btn-ghost"
              disabled={saving}
            >
              Cancel
            </button>
            <button
              onClick={handleDelete}
              disabled={saving || deleteTyped !== "delete"}
              className="btn-primary"
              style={{ background: "var(--err)", color: "#fff" }}
            >
              {saving ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />} Delete record
            </button>
          </>
        }
      >
        <p>
          You are about to permanently delete this record from{" "}
          <span className="font-mono text-ink">{collectionName}</span>.
          This action cannot be undone.
        </p>
        <p className="mt-3">To confirm, type <strong className="font-mono text-ink">delete</strong> below:</p>
        <input
          value={deleteTyped}
          onChange={(e) => setDeleteTyped(e.target.value)}
          placeholder="delete"
          className="field-input mt-2 font-mono"
          autoFocus
        />
      </Modal>
    </>
  );
}

function DetailValue({
  value,
  fieldType,
  formatDateTime,
}: {
  value: unknown;
  fieldType?: string;
  formatDateTime: (input: unknown) => string;
}) {
  if (value === null || value === undefined || value === "") {
    return <span className="text-ink-faint">N/A</span>;
  }
  if (fieldType === "datetime") {
    const formatted = formatDateTime(value);
    if (formatted && formatted !== String(value)) {
      return (
        <span className="font-mono text-ink break-all" title={String(value)}>
          {formatted}
        </span>
      );
    }
    return <span className="break-all">{String(value)}</span>;
  }
  if (typeof value === "boolean") {
    return value ? (
      <span className="badge badge-ok">true</span>
    ) : (
      <span className="badge badge-muted">false</span>
    );
  }
  if (typeof value === "number") {
    return <span className="font-mono text-ink">{value}</span>;
  }
  if (typeof value === "string" && value.startsWith("http") && value.match(/\.(png|jpe?g|webp|gif)/i)) {
    return <img src={value} alt="" className="w-10 h-10 rounded object-cover" />;
  }
  return <span className="break-all">{String(value)}</span>;
}
