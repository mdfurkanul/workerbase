import { useEffect, useState } from "react";
import { Loader2, Trash2, X, Check, Pencil, Download } from "lucide-react";
import { apiClient, ApiError, getToken } from "@/lib/api-client";
import { useAuth, canEdit } from "@/hooks/useAuth";
import { usePrefs } from "@/hooks/usePrefs";
import {
  epochMsToWallClock,
  looksLikeEpochSeconds,
} from "@/lib/dateTimeFormat";
import { objectUrl, isImageKey } from "@/lib/api-storage";
import { coerceForPayload } from "@/components/record-fields/coerce";
import { asString } from "@/components/record-fields/types";
import { RecordField } from "@/components/record-fields/RecordField";
import { GeoField, validateGeo } from "@/components/record-fields/GeoField";
import { groupFieldsForForm } from "@/components/record-fields/grouping";
import type { CollectionField } from "@/lib/types";
import Modal from "@/components/Modal";

interface Props {
  open: boolean;
  collectionName: string;
  recordId: string | null;
  schema?: CollectionField[];
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
  if (type === "files") {
    // Stored as a JSON array of keys (or already a JSON string).
    if (typeof value === "string") return value;
    try {
      return JSON.stringify(value);
    } catch {
      return "";
    }
  }
  if (type === "json") {
    // Pretty-print the JSON for editability.
    if (typeof value === "string") {
      // Try to re-format; if it's not parseable, leave as-is.
      try {
        return JSON.stringify(JSON.parse(value), null, 2);
      } catch {
        return value;
      }
    }
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }
  // editor / select / file / relation / text / numbers / etc. — string as-is.
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

    // Surface any errors that the RecordField components have reported.
    const activeErrs = Object.entries(editErrors)
      .filter(([, msg]) => !!msg)
      .reduce<Record<string, string>>((acc, [k, msg]) => {
        acc[k] = msg!;
        return acc;
      }, {});

    // Geo pair validation (lat/lon bounds).
    for (const slot of editSlots) {
      if (slot.kind !== "geo") continue;
      const latKey = `${slot.base}_latitude`;
      const lonKey = `${slot.base}_longitude`;
      const lat = (editValues[latKey] ?? "").trim();
      const lon = (editValues[lonKey] ?? "").trim();
      const g = validateGeo(lat, lon);
      if (g.lat) activeErrs[latKey] = g.lat;
      if (g.lon) activeErrs[lonKey] = g.lon;
    }

    if (Object.keys(activeErrs).length > 0) {
      setEditErrors(activeErrs);
      return;
    }
    setEditErrors({});

    setSaving(true);
    try {
      const payload: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(editValues)) {
        const fieldDef = schema.find((f) => f.name === k);
        const type = fieldDef?.type ?? "text";
        const raw = (v ?? "").trim();
        // Preserve empty string clears for datetime (existing behavior),
        // skip empties for everything else.
        if (raw === "" && type !== "datetime") continue;
        if (raw === "") {
          payload[k] = "";
        } else {
          payload[k] = coerceForPayload(type, raw, timezone);
        }
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
  const editableFields: CollectionField[] = schema.length
    ? schema.filter((f) => !PROTECTED_COLS.has(f.name))
    : record
      ? Object.keys(record)
          .filter((k) => !PROTECTED_COLS.has(k))
          .map((k) => ({ id: k, name: k, type: "text" }))
      : [];
  const editSlots = groupFieldsForForm(editableFields);

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
              /* ── Edit mode — type-aware widgets pre-filled with current values ── */
              <div className="space-y-3">
                {editSlots.map((slot) => {
                  if (slot.kind === "geo") {
                    const latKey = `${slot.base}_latitude`;
                    const lonKey = `${slot.base}_longitude`;
                    const lat = editValues[latKey] ?? "";
                    const lon = editValues[lonKey] ?? "";
                    const gErr = validateGeo(lat, lon);
                    return (
                      <GeoField
                        key={`geo-${slot.base}`}
                        label={slot.base}
                        required={slot.latField.required || slot.lonField.required}
                        lat={lat}
                        lon={lon}
                        onLatChange={(v) => {
                          setEditValues((ev) => ({ ...ev, [latKey]: v }));
                          setEditErrors((ee) => ({ ...ee, [latKey]: gErr.lat ?? "" }));
                        }}
                        onLonChange={(v) => {
                          setEditValues((ev) => ({ ...ev, [lonKey]: v }));
                          setEditErrors((ee) => ({ ...ee, [lonKey]: gErr.lon ?? "" }));
                        }}
                        errorLat={editErrors[latKey] || undefined}
                        errorLon={editErrors[lonKey] || undefined}
                      />
                    );
                  }
                  const f = slot.field;
                  const currentVal = record[f.name];
                  return (
                    <RecordField
                      key={f.id ?? f.name}
                      field={f}
                      value={editValues[f.name] ?? ""}
                      onChange={(v) => {
                        setEditValues((ev) => ({
                          ...ev,
                          [f.name]: typeof v === "string" ? v : String(v),
                        }));
                        setEditErrors((ee) => ({ ...ee, [f.name]: "" }));
                      }}
                      onErrorChange={(err) => {
                        setEditErrors((ee) => {
                          const next = { ...ee };
                          if (err) next[f.name] = err;
                          else delete next[f.name];
                          return next;
                        });
                      }}
                      error={editErrors[f.name] || undefined}
                      placeholderFromCurrent={currentVal}
                    />
                  );
                })}
              </div>
            ) : (
              /* ── Read mode ── */
              <ReadModeList record={record} schema={schema} formatDateTime={formatDateTime} />
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

/**
 * Read-mode record list. Walks record entries in stored order, grouping
 * `<base>_latitude` + `<base>_longitude` pairs into a single "geo" row
 * (lat, lon) instead of two separate lines.
 */
function ReadModeList({
  record,
  schema,
  formatDateTime,
}: {
  record: Record<string, unknown>;
  schema: CollectionField[];
  formatDateTime: (input: unknown) => string;
}) {
  const entries = Object.entries(record);
  const rows: { key: string; label: string; value: unknown; type?: string; options?: { [k: string]: unknown } }[] = [];

  const used = new Set<number>();
  for (let i = 0; i < entries.length; i++) {
    if (used.has(i)) continue;
    const [key, value] = entries[i]!;
    const m = /^(.+)_latitude$/.exec(key);
    if (m && i + 1 < entries.length) {
      const base = m[1]!;
      const [nextKey, nextVal] = entries[i + 1]!;
      if (nextKey === `${base}_longitude`) {
        rows.push({
          key: base,
          label: base,
          value: `${asString(value)}, ${asString(nextVal)}`,
          type: "geo",
        });
        used.add(i);
        used.add(i + 1);
        continue;
      }
    }
    const fieldDef = schema.find((f) => f.name === key);
    rows.push({
      key,
      label: key,
      value,
      type: fieldDef?.type,
      options: fieldDef?.options,
    });
  }

  return (
    <dl className="bg-surface border border-line rounded divide-y divide-line">
      {rows.map((r) => (
        <div key={r.key} className="grid grid-cols-[140px_1fr] gap-3 px-3 py-2.5 items-start">
          <dt className="font-mono text-[12px] text-ink-muted pt-0.5">
            {r.label}
            {r.type && r.type !== "geo" && (
              <span className="block text-[10px] text-ink-faint normal-case">{r.type}</span>
            )}
          </dt>
          <dd className="text-[13px] break-words">
            <DetailValue
              value={r.value}
              fieldType={r.type}
              fieldOptions={r.options}
              formatDateTime={formatDateTime}
            />
          </dd>
        </div>
      ))}
    </dl>
  );
}

function DetailValue({
  value,
  fieldType,
  fieldOptions,
  formatDateTime,
}: {
  value: unknown;
  fieldType?: string;
  fieldOptions?: { [k: string]: unknown };
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

  if (fieldType === "bool") {
    const isTrue = value === true || value === 1 || value === "true" || value === "1";
    return isTrue ? (
      <span className="badge badge-ok">true</span>
    ) : (
      <span className="badge badge-muted">false</span>
    );
  }

  if (fieldType === "select") {
    return <span className="badge badge-info">{String(value)}</span>;
  }

  if (fieldType === "editor") {
    // TipTap emits a safe HTML subset on save. Render it directly.
    return (
      <div
        className="prose-rte break-words"
        dangerouslySetInnerHTML={{ __html: String(value) }}
      />
    );
  }

  if (fieldType === "json") {
    let pretty = "";
    try {
      pretty = JSON.stringify(
        typeof value === "string" ? JSON.parse(value) : value,
        null,
        2,
      );
    } catch {
      pretty = String(value);
    }
    return <pre className="font-mono text-[12px] whitespace-pre-wrap break-words">{pretty}</pre>;
  }

  if (fieldType === "file") {
    const key = String(value);
    if (isImageKey(key)) {
      return (
        <a href={objectUrl(key)} target="_blank" rel="noreferrer" className="inline-block">
          <img src={objectUrl(key)} alt={key} className="w-16 h-16 rounded object-cover border border-line" />
        </a>
      );
    }
    return (
      <a
        href={objectUrl(key)}
        target="_blank"
        rel="noreferrer"
        className="font-mono text-[12px] text-brand hover:underline break-all"
      >
        {key}
      </a>
    );
  }

  if (fieldType === "files") {
    let keys: string[] = [];
    try {
      const parsed = typeof value === "string" ? JSON.parse(value) : value;
      keys = Array.isArray(parsed) ? parsed.filter((k) => typeof k === "string") : [];
    } catch {
      keys = [];
    }
    if (keys.length === 0) return <span className="text-ink-faint">N/A</span>;
    return (
      <div className="flex flex-col gap-1">
        {keys.map((k, i) =>
          isImageKey(k) ? (
            <a key={`${k}-${i}`} href={objectUrl(k)} target="_blank" rel="noreferrer">
              <img src={objectUrl(k)} alt={k} className="w-16 h-16 rounded object-cover border border-line" />
            </a>
          ) : (
            <a
              key={`${k}-${i}`}
              href={objectUrl(k)}
              target="_blank"
              rel="noreferrer"
              className="font-mono text-[12px] text-brand hover:underline break-all"
            >
              {k}
            </a>
          ),
        )}
      </div>
    );
  }

  if (fieldType === "relation") {
    const target =
      typeof fieldOptions?.target === "string" ? fieldOptions.target : "?";
    return (
      <span className="font-mono text-[12px] text-ink">
        {target}#{String(value)}
      </span>
    );
  }

  if (fieldType === "geo") {
    return <span className="font-mono text-ink">{String(value)}</span>;
  }

  // Default rendering for everything else.
  if (typeof value === "number") {
    return <span className="font-mono text-ink">{value}</span>;
  }
  if (typeof value === "string" && value.startsWith("http") && value.match(/\.(png|jpe?g|webp|gif)/i)) {
    return <img src={value} alt="" className="w-10 h-10 rounded object-cover" />;
  }
  return <span className="break-all">{String(value)}</span>;
}
