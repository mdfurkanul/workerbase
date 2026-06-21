import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Plus, Save, Trash2 } from "lucide-react";
import AppShell, { PageHeader } from "@/components/AppShell";
import Modal from "@/components/Modal";
import { useCollections } from "@/hooks/useCollections";
import { buildCollectionUrl } from "@/lib/collectionUrl";
import {
  getEditedSchema,
  markDeleted,
  saveEditedSchema,
} from "@/lib/collectionStore";
import type { CollectionField } from "@/lib/mockData";

type FieldType = "text" | "integer" | "real" | "blob" | "bool" | "date" | "url" | "file";

const TYPE_OPTIONS: FieldType[] = [
  "text",
  "integer",
  "real",
  "blob",
  "bool",
  "date",
  "url",
  "file",
];

/** System columns that shouldn't be edited or removed. */
const PROTECTED = new Set(["id", "created", "updated", "created_at"]);

interface FieldRow extends CollectionField {
  /** Client-side id for stable React keys during edits. */
  _key: string;
  required: boolean;
  unique: boolean;
}

function toRow(f: CollectionField): FieldRow {
  return {
    name: f.name,
    type: (f.type as FieldType) ?? "text",
    required: false,
    unique: false,
    _key: crypto.randomUUID(),
  };
}

function newBlankRow(): FieldRow {
  return {
    name: "",
    type: "text",
    required: false,
    unique: false,
    _key: crypto.randomUUID(),
  };
}

export default function EditCollection({ name }: { name: string }) {
  const navigate = useNavigate();
  const { collections, loading, refresh } = useCollections();
  const collection = collections.find((c) => c.name === name);

  const [rows, setRows] = useState<FieldRow[]>([]);
  const [dirty, setDirty] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Initialise rows from override-or-base schema on (first) load.
  useEffect(() => {
    if (!collection) return;
    const edited = getEditedSchema(name);
    const source = edited ?? collection.schema;
    setRows(source.map(toRow));
    setDirty(false);
    setSavedAt(edited ? Date.now() : null);
  }, [name, collection]);

  function patch(key: string, patch: Partial<FieldRow>) {
    setRows((rs) => rs.map((r) => (r._key === key ? { ...r, ...patch } : r)));
    setDirty(true);
  }

  function addRow() {
    setRows((rs) => [...rs, newBlankRow()]);
    setDirty(true);
  }

  function removeRow(key: string) {
    setRows((rs) => rs.filter((r) => r._key !== key));
    setDirty(true);
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    // Validate.
    const seen = new Set<string>();
    for (const r of rows) {
      if (!r.name) {
        setError("Every column needs a name.");
        return;
      }
      if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(r.name)) {
        setError(`Invalid column name: "${r.name}". Use letters, digits, underscore; must start with a letter or underscore.`);
        return;
      }
      if (seen.has(r.name)) {
        setError(`Duplicate column name: "${r.name}".`);
        return;
      }
      seen.add(r.name);
    }

    const cleaned: CollectionField[] = rows.map(({ _key: _k, ...rest }) => rest);
    saveEditedSchema(name, cleaned);
    setDirty(false);
    setSavedAt(Date.now());
    void refresh();
  }

  /* ─── Delete-collection flow ─── */
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmTyped, setConfirmTyped] = useState("");

  function doDelete() {
    if (confirmTyped !== name) return;
    markDeleted(name);
    void refresh();
    navigate("/collections");
  }

  if (loading) {
    return (
      <AppShell>
        <PageHeader breadcrumbs={["Collections", name, "Edit"]} />
        <div className="px-6 py-16 text-center text-ink-muted text-[13px]">Loading…</div>
      </AppShell>
    );
  }

  if (!collection) {
    return (
      <AppShell>
        <PageHeader breadcrumbs={["Collections", name, "Edit"]} />
        <div className="px-6 py-16 text-center text-ink-muted">
          Collection <span className="font-mono text-ink">{name}</span> was not found.
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <PageHeader
        breadcrumbs={[
          <Link to="/collections" className="hover:text-ink">Collections</Link>,
          <Link to={buildCollectionUrl(name)} className="font-mono hover:text-ink">{name}</Link>,
          <span>Edit</span>,
        ]}
      />

      <form onSubmit={handleSubmit} className="max-w-3xl px-6 py-6 space-y-6">
        {/* Identity (read-only) */}
        <section className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="label-mono">Name</span>
            <input value={collection.name} disabled className="field-input mt-1 font-mono opacity-70" />
          </label>
          <label className="block">
            <span className="label-mono">Type</span>
            <input value={collection.type} disabled className="field-input mt-1 font-mono opacity-70 capitalize" />
          </label>
        </section>

        {/* Columns */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="label-mono">Columns ({rows.length})</span>
            <button type="button" onClick={addRow} className="btn-ghost text-[12px]">
              <Plus size={12} /> Add column
            </button>
          </div>

          {error && (
            <div className="px-3 py-2 rounded bg-err-bg text-err text-[12px] font-mono border border-line-strong">
              {error}
            </div>
          )}

          {/* Header row */}
          <div className="grid grid-cols-[2fr_1fr_auto_auto_auto] gap-2 items-center px-2 label-mono">
            <span>Name</span>
            <span>Type</span>
            <span className="text-center">Required</span>
            <span className="text-center">Unique</span>
            <span className="w-8" />
          </div>

          <div className="space-y-2">
            {rows.length === 0 && (
              <div className="px-3 py-4 text-center text-[13px] text-ink-faint bg-surface border border-line rounded">
                No columns. Click “Add column”.
              </div>
            )}
            {rows.map((r) => {
              const locked = PROTECTED.has(r.name);
              return (
                <div
                  key={r._key}
                  className="grid grid-cols-[2fr_1fr_auto_auto_auto] gap-2 items-center bg-surface border border-line rounded p-2"
                >
                  <input
                    disabled={locked}
                    required
                    pattern="[a-zA-Z_][a-zA-Z0-9_]*"
                    placeholder="column_name"
                    value={r.name}
                    onChange={(e) => patch(r._key, { name: e.target.value })}
                    className="field-input font-mono text-[13px]"
                  />
                  <select
                    disabled={locked}
                    value={r.type}
                    onChange={(e) => patch(r._key, { type: e.target.value as FieldType })}
                    className="field-input text-[13px]"
                  >
                    {TYPE_OPTIONS.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                  <label className="flex items-center justify-center gap-1 px-2 text-[12px] text-ink-muted cursor-pointer">
                    <input
                      type="checkbox"
                      disabled={locked}
                      checked={r.required}
                      onChange={(e) => patch(r._key, { required: e.target.checked })}
                      className="accent-brand"
                    />
                  </label>
                  <label className="flex items-center justify-center gap-1 px-2 text-[12px] text-ink-muted cursor-pointer">
                    <input
                      type="checkbox"
                      disabled={locked}
                      checked={r.unique}
                      onChange={(e) => patch(r._key, { unique: e.target.checked })}
                      className="accent-brand"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => removeRow(r._key)}
                    disabled={locked}
                    className="btn-icon disabled:opacity-30 disabled:cursor-not-allowed"
                    title={locked ? "Protected column" : "Remove column"}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              );
            })}
          </div>

          <p className="text-[12px] text-ink-faint">
            System columns (<span className="font-mono">id, created, updated</span>) are managed automatically.
          </p>
        </section>

        {/* Save bar */}
        <div className="flex items-center justify-between pt-4 hairline-t">
          <div className="text-[12px] text-ink-muted">
            {dirty ? (
              <span className="text-warn">Unsaved changes</span>
            ) : savedAt ? (
              <span>Saved at {new Date(savedAt).toLocaleTimeString()}</span>
            ) : (
              <span>Changes are stored locally as drafts until the API lands.</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Link to={buildCollectionUrl(name)} className="btn-ghost">
              <ArrowLeft size={14} /> Cancel
            </Link>
            <button type="submit" className="btn-primary" disabled={!dirty}>
              <Save size={14} /> Save changes
            </button>
          </div>
        </div>
      </form>

      {/* Danger zone */}
      <section className="max-w-3xl mx-6 mb-10 border border-line-strong rounded">
        <header className="px-4 py-3 hairline-b bg-err-bg">
          <span className="label-mono text-err">Danger zone</span>
        </header>
        <div className="px-4 py-4 flex items-center justify-between gap-4">
          <div>
            <div className="text-[14px] text-ink">Delete this collection</div>
            <div className="text-[12px] text-ink-muted mt-1">
              Removes the table and all of its records. This cannot be undone.
            </div>
          </div>
          <button
            type="button"
            onClick={() => setConfirmOpen(true)}
            className="btn-ghost text-[12px] border-err text-err hover:bg-err-bg"
          >
            <Trash2 size={13} /> Delete collection
          </button>
        </div>
      </section>

      {/* Confirm modal */}
      <Modal
        open={confirmOpen}
        title={<>Delete <span className="font-mono">{name}</span>?</>}
        onClose={() => {
          setConfirmOpen(false);
          setConfirmTyped("");
        }}
        footer={
          <>
            <button
              onClick={() => {
                setConfirmOpen(false);
                setConfirmTyped("");
              }}
              className="btn-ghost"
            >
              Cancel
            </button>
            <button
              onClick={doDelete}
              disabled={confirmTyped !== name}
              className="btn-primary disabled:opacity-50"
              style={{ background: "var(--err)", color: "#fff" }}
            >
              <Trash2 size={14} /> Delete forever
            </button>
          </>
        }
      >
        <p>
          You are about to permanently delete{" "}
          <span className="font-mono text-ink">{name}</span> and every record inside it.
        </p>
        <p className="mt-3">
          To confirm, type the collection name below.
        </p>
        <input
          value={confirmTyped}
          onChange={(e) => setConfirmTyped(e.target.value)}
          placeholder={name}
          className="field-input mt-2 font-mono"
          autoFocus
        />
      </Modal>
    </AppShell>
  );
}
