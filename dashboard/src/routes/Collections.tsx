import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ChevronRight, Plus, Search, Trash2, Loader2 } from "lucide-react";
import AppShell, { PageHeader } from "@/components/AppShell";
import { DataTable, Cell } from "@/components/Table";
import CollectionHeader from "@/components/CollectionHeader";
import CollectionSettings from "@/components/CollectionSettings";
import ColumnPicker from "@/components/ColumnPicker";
import RecordDrawer from "@/components/RecordDrawer";
import SelectionBar from "@/components/SelectionBar";
import SlideOver from "@/components/SlideOver";
import SchemaEditor, { type SchemaData, type Field as SchemaField } from "@/components/SchemaEditor";
import AuthConfig, { DEFAULT_AUTH_SETTINGS, type AuthSettings } from "@/components/AuthConfig";
import EmailTemplatesEditor, { DEFAULT_TEMPLATES, type EmailTemplates } from "@/components/EmailTemplates";
import Modal from "@/components/Modal";
import { useCollections } from "@/hooks/useCollections";
import { type Record as Row, type Collection } from "@/lib/mockData";
import { buildCollectionUrl } from "@/lib/collectionUrl";
import { getVisibleColumns, setVisibleColumns, saveEditedSchema, setEditedName, markDeleted } from "@/lib/collectionStore";
import { apiClient } from "@/lib/api-client";

/**
 * Single router for every collection URL. The sub-view is chosen by
 * query params:
 *
 *   ?collections=NAME                  → records table
 *   ?collections=NAME&action=new       → new record form
 *   ?collections=NAME&action=edit      → edit schema
 *   ?collections=NAME&action=settings  → permissions
 *   ?collections=NAME&record=ID        → record detail
 */
export default function Collections() {
  const [params] = useSearchParams();
  const selected = params.get("collections");

  if (!selected) return <CollectionsIndex />;

  return <CollectionView name={selected} />;
}

/* ─── Collections index (no collection selected) ───────────────────── */
function CollectionsIndex() {
  const { collections, loading, error, refresh } = useCollections();

  return (
    <AppShell>
      <PageHeader
        breadcrumbs={[<span>Collections</span>]}
        actions={
          <Link to="/collections/new" className="btn-primary text-[12px]">
            <Plus size={13} /> New collection
          </Link>
        }
      />
      <div className="flex-1 overflow-y-auto">
      <div className="px-6 py-4">
        {error && (
          <div className="mb-3 px-3 py-2 rounded border border-line-strong bg-err-bg text-err text-[12px] font-mono">
            {error}
          </div>
        )}
        <div className="bg-surface border border-line rounded">
          {loading ? (
            <div className="p-4 space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="h-8 rounded bg-surface-2 animate-pulse"
                  style={{ opacity: 1 - i * 0.1 }}
                />
              ))}
            </div>
          ) : collections.length === 0 ? (
            <div className="p-8 text-center text-ink-muted text-[13px]">
              No collections yet.{" "}
              <Link to="/collections/new" className="text-brand hover:underline">
                Create one →
              </Link>
            </div>
          ) : (
            <ul>
              {collections.map((c) => (
                <li key={c.id ?? c.name}>
                  <Link
                    to={buildCollectionUrl(c.name)}
                    className="flex items-center justify-between px-4 py-2.5 hairline-b last:border-b-0 hover:bg-surface-2 transition"
                  >
                    <span className="font-mono text-[13px] text-ink">{c.name}</span>
                    <ChevronRight size={14} className="text-ink-faint" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
        <button onClick={() => void refresh()} className="btn-ghost mt-3 text-[12px]">
          Refresh
        </button>
      </div>
      </div>
    </AppShell>
  );
}

/* ─── Single collection view (records + slide-over panels) ─────────── */
function CollectionView({ name }: { name: string }) {
  const navigate = useNavigate();
  const { collections, loading, refresh } = useCollections();
  const collection = collections.find((c) => c.name === name);
  const [tick, setTick] = useState(0);
  const editSaveRef = useRef<(() => void) | null>(null);
  const [params, setParams] = useSearchParams();
  const action = params.get("action");

  // Slide-over open state derived from the action query param.
  const slideOpen = action === "edit" || action === "settings" || action === "new";

  function closeSlide() {
    const next = new URLSearchParams(params);
    next.delete("action");
    setParams(next, { replace: true });
  }

  function openSlide(a: "edit" | "settings" | "new") {
    const next = new URLSearchParams(params);
    next.set("action", a);
    setParams(next, { replace: true });
  }

  // Delete state
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTyped, setDeleteTyped] = useState("");
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    try {
      await apiClient.del(`/api/core/collections/${encodeURIComponent(name)}`);
      markDeleted(name);
      void refresh();
      navigate("/collections");
    } catch {
      // If the API fails, fall back to local-only delete
      markDeleted(name);
      void refresh();
      navigate("/collections");
    } finally {
      setDeleting(false);
      setDeleteOpen(false);
      setDeleteTyped("");
    }
  }

  if (loading) {
    return (
      <AppShell>
        <PageHeader breadcrumbs={["Collections", name]} />
        <div className="px-6 py-16 text-center text-ink-muted text-[13px]">
          Loading collection…
        </div>
      </AppShell>
    );
  }

  if (!collection) {
    return (
      <AppShell>
        <PageHeader breadcrumbs={["Collections", name]} />
        <div className="px-6 py-16 text-center text-ink-muted">
          Collection <span className="font-mono text-ink">{name}</span> was not found.
        </div>
      </AppShell>
    );
  }

  function reload() {
    void refresh();
    setTick((t) => t + 1);
  }

  return (
    <AppShell>
      <PageHeader breadcrumbs={[<Link to="/collections" className="hover:text-ink">Collections</Link>, <span className="font-mono">{name}</span>]} />
      <CollectionHeader
        name={collection.name}
        type={collection.type}
        count={collection.count}
        onReload={reload}
        reloading={loading}
        onEdit={() => openSlide("edit")}
        onSettings={() => openSlide("settings")}
        onDelete={name.startsWith("_") || name === "logs" ? undefined : () => setDeleteOpen(true)}
      />
      <RecordsTable
        key={tick}
        collectionName={collection.name}
        schema={collection.schema}
        onNewRecord={() => openSlide("new")}
      />

      {/* Slide-over panels */}
      <SlideOver
        open={slideOpen && action === "edit"}
        title="Edit collection"
        subtitle={collection.name}
        onClose={closeSlide}
        footer={
          <>
            <button onClick={closeSlide} className="btn-ghost">Cancel</button>
            <button
              onClick={() => {
                editSaveRef.current?.();
                closeSlide();
              }}
              className="btn-primary"
            >
              Save changes
            </button>
          </>
        }
      >
        <EditPanel
          collection={collection}
          onSaved={reload}
          registerSave={(fn) => { editSaveRef.current = fn; }}
        />
      </SlideOver>

      <SlideOver
        open={slideOpen && action === "settings"}
        title="Collection settings"
        subtitle={collection.name}
        onClose={closeSlide}
      >
        <CollectionSettings collectionName={collection.name} />
      </SlideOver>

      <SlideOver
        open={slideOpen && action === "new"}
        title="New record"
        subtitle={collection.name}
        onClose={closeSlide}
        footer={
          <>
            <button onClick={closeSlide} className="btn-ghost">Cancel</button>
            <button onClick={closeSlide} className="btn-primary">
              <Plus size={14} /> Create record
            </button>
          </>
        }
      >
        <NewRecordPanel schema={collection.schema} />
      </SlideOver>

      {/* Delete confirmation modal */}
      <Modal
        open={deleteOpen}
        title={<>Delete <span className="font-mono">{name}</span>?</>}
        onClose={() => {
          setDeleteOpen(false);
          setDeleteTyped("");
        }}
        footer={
          <>
            <button
              onClick={() => {
                setDeleteOpen(false);
                setDeleteTyped("");
              }}
              className="btn-ghost"
              disabled={deleting}
            >
              Cancel
            </button>
            <button
              onClick={handleDelete}
              disabled={deleteTyped !== name || deleting}
              className="btn-primary disabled:opacity-50"
              style={{ background: "var(--err)", color: "#fff" }}
            >
              <Trash2 size={14} /> {deleting ? "Deleting…" : "Delete forever"}
            </button>
          </>
        }
      >
        <p>
          This will permanently delete the collection{" "}
          <span className="font-mono text-ink">{name}</span>, its D1 table, and all records.
          This action cannot be undone.
        </p>
        <p className="mt-3">
          To confirm, type the collection name below.
        </p>
        <input
          value={deleteTyped}
          onChange={(e) => setDeleteTyped(e.target.value)}
          placeholder={name}
          className="field-input mt-2 font-mono"
          autoFocus
        />
      </Modal>
    </AppShell>
  );
}

/* ─── Records sub-view ─────────────────────────────────────────────── */
function RecordsTable({
  collectionName,
  schema,
  onNewRecord,
}: {
  collectionName: string;
  schema: { name: string; type: string }[];
  onNewRecord?: () => void;
}) {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const q = params.get("q") ?? "";
  const sort = params.get("sort") ?? "";
  const filter = params.get("filter") ?? "";

  // Pagination — both come from query params so URLs are shareable.
  const page = Math.max(1, parseInt(params.get("page") ?? "1", 10) || 1);
  const perPage = Math.min(
    100,
    Math.max(1, parseInt(params.get("perPage") ?? "20", 10) || 20),
  );

  // Drawer state — purely local; not in the URL.
  const [drawerRow, setDrawerRow] = useState<Row | null>(null);

  // Bulk selection.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Visible columns (per-collection, persisted in localStorage).
  const allColumns = useMemo(
    () => (schema.length ? schema : [{ name: "id", type: "text" }]),
    [schema],
  );
  const [visible, setVisible] = useState<string[]>(() => {
    const stored = getVisibleColumns(collectionName);
    if (stored && stored.length > 0) {
      const known = new Set(allColumns.map((c) => c.name));
      const filtered = stored.filter((n) => known.has(n));
      return filtered.length > 0 ? filtered : allColumns.map((c) => c.name);
    }
    return allColumns.map((c) => c.name);
  });

  function handleVisibleChange(next: string[]) {
    setVisible(next);
    setVisibleColumns(collectionName, next);
  }

  // ─── Fetch records from the API ───────────────────────────────────
  const [records, setRecords] = useState<Row[]>([]);
  const [recordsLoading, setRecordsLoading] = useState(true);
  const [recordsError, setRecordsError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => {
    setRecordsLoading(true);
    setRecordsError(null);
    apiClient
      .get<{
        items: Row[];
        page: number;
        perPage: number;
        total: number;
        totalPages: number;
      }>(`/api/core/collections/${encodeURIComponent(collectionName)}/records?page=${page}&perPage=${perPage}`)
      .then((data) => {
        setRecords(data.items ?? []);
        setTotal(data.total ?? 0);
        setTotalPages(data.totalPages ?? 1);
      })
      .catch((err) => {
        setRecordsError(err instanceof Error ? err.message : "Failed to load records");
        setRecords([]);
        setTotal(0);
        setTotalPages(1);
      })
      .finally(() => setRecordsLoading(false));
  }, [collectionName, page, perPage]);

  // Pagination math from the real API total.
  const currentPage = Math.min(page, totalPages);
  const start = total > 0 ? (currentPage - 1) * perPage : 0;
  const end = Math.min(start + perPage, total);
  const pageRows = records;

  const visibleSet = new Set(visible);
  const columns = allColumns
    .filter((f) => visibleSet.has(f.name))
    .map((f) => ({
      key: f.name,
      header: f.name,
      cell: (r: Row) =>
        f.name === "id" ? (
          <span className="font-mono text-ink-muted">{r.id ?? r[f.name]}</span>
        ) : (
          <Cell value={r[f.name]} />
        ),
    }));

  // ─── Selection handlers ───────────────────────────────────────────
  function toggleRow(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll(ids: string[], checked: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) ids.forEach((id) => next.add(id));
      else ids.forEach((id) => next.delete(id));
      return next;
    });
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  // Selected rows (across all pages, in original order).
  // Selected rows from the current page (for download).
  const selectedRows = useMemo(
    () => records.filter((r) => selectedIds.has(r.id ?? "")),
    [records, selectedIds],
  );

  function handleDownload() {
    if (selectedRows.length === 0) return;
    const payload = JSON.stringify(selectedRows, null, 2);
    const blob = new Blob([payload], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${collectionName}-selected-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function handleDelete() {
    // Note: real record deletion happens via API — this is a UI-only clear.
    setSelectedIds(new Set());
    setConfirmOpen(false);
  }

  function update(p: Record<string, string | null>) {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(p)) {
      if (v === null || v === "") next.delete(k);
      else next.set(k, v);
    }
    navigate(`/collections?${next.toString()}`, { replace: true });
  }

  function goToPage(p: number) {
    update({ page: p > 1 ? String(p) : null });
  }

  function changePerPage(value: number) {
    // Reset to page 1 when changing page size.
    update({ perPage: value === 20 ? null : String(value), page: null });
  }

  // Build a compact list of page numbers around the current page.
  const pageNumbers = buildPageList(currentPage, totalPages);

  // Snapshot for the drawer — immediate preview while the dummy fetch runs.
  const drawerSnapshot = drawerRow
    ? Object.entries(drawerRow).map(([key, value]) => ({ key, value }))
    : undefined;

  return (
    <>
      {/* Filter bar — all filters are query params */}
      <div className="px-6 py-3 hairline-b bg-bg-elev flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" />
          <input
            value={q}
            onChange={(e) => update({ q: e.target.value, page: null })}
            placeholder="Search…"
            className="field-input pl-9"
          />
        </div>
        <input
          value={filter}
          onChange={(e) => update({ filter: e.target.value, page: null })}
          placeholder='filter, e.g. verified:true'
          className="field-input max-w-[220px] font-mono text-[12px]"
        />
        <input
          value={sort}
          onChange={(e) => update({ sort: e.target.value })}
          placeholder="sort, e.g. -created"
          className="field-input max-w-[160px] font-mono text-[12px]"
        />
        <ColumnPicker
          collectionName={collectionName}
          columns={allColumns}
          visible={visible}
          onChange={handleVisibleChange}
        />
        <button
          onClick={onNewRecord}
          className="btn-primary text-[12px] ml-auto"
        >
          <Plus size={13} /> New record
        </button>
      </div>

      <div className="flex-1 overflow-auto px-6 py-4">
        {recordsError ? (
          <div className="bg-err-bg border border-line-strong text-err rounded px-4 py-3 text-[13px] font-mono">
            {recordsError}
          </div>
        ) : recordsLoading ? (
          <div className="flex items-center gap-2 py-8 text-[13px] text-ink-muted">
            <Loader2 size={14} className="animate-spin text-brand" /> Loading records…
          </div>
        ) : (
          <DataTable
            columns={columns}
            rows={pageRows}
            onRowAction={(row) => setDrawerRow(row)}
            selectedIds={selectedIds}
            onToggleRow={toggleRow}
            onToggleAll={toggleAll}
            empty={
              columns.length === 0
                ? "No columns selected — pick at least one from Columns."
                : "No records found."
            }
          />
        )}
      </div>

      {/* Pagination footer */}
      <div className="px-6 py-2.5 hairline-t bg-bg-elev flex items-center justify-between gap-3 text-[12px] text-ink-muted flex-wrap">
        <div>
          {total === 0
            ? "Total: 0"
            : `Showing ${start + 1}–${end} of ${total}`}
        </div>

        <div className="flex items-center gap-3">
          {/* Per-page selector */}
          <label className="flex items-center gap-1.5">
            <span className="label-mono">Per page</span>
            <select
              value={perPage}
              onChange={(e) => changePerPage(Number(e.target.value))}
              className="field-input py-0.5 px-1.5 text-[12px] font-mono w-16"
            >
              {[10, 20, 50, 100].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </label>

          {/* Prev / pages / next */}
          {totalPages > 1 && (
            <nav className="flex items-center gap-1" aria-label="Pagination">
              <button
                onClick={() => goToPage(currentPage - 1)}
                disabled={currentPage === 1}
                className="btn-icon disabled:opacity-30 disabled:cursor-not-allowed"
                aria-label="Previous page"
              >
                ‹
              </button>
              {pageNumbers.map((p, i) =>
                p === "…" ? (
                  <span key={`gap-${i}`} className="px-1 text-ink-faint">…</span>
                ) : (
                  <button
                    key={p}
                    onClick={() => goToPage(p)}
                    className={`min-w-7 h-7 px-2 rounded text-[12px] font-mono transition ${
                      p === currentPage
                        ? "bg-brand text-white"
                        : "text-ink-muted hover:bg-surface-2 hover:text-ink"
                    }`}
                  >
                    {p}
                  </button>
                ),
              )}
              <button
                onClick={() => goToPage(currentPage + 1)}
                disabled={currentPage === totalPages}
                className="btn-icon disabled:opacity-30 disabled:cursor-not-allowed"
                aria-label="Next page"
              >
                ›
              </button>
            </nav>
          )}
        </div>
      </div>

      <RecordDrawer
        open={drawerRow !== null}
        collectionName={collectionName}
        recordId={drawerRow?.id ?? null}
        snapshot={drawerSnapshot}
        onClose={() => setDrawerRow(null)}
      />

      <SelectionBar
        count={selectedIds.size}
        onClear={clearSelection}
        onDelete={() => setConfirmOpen(true)}
        onDownload={handleDownload}
      />

      <Modal
        open={confirmOpen}
        title={`Delete ${selectedIds.size} ${selectedIds.size === 1 ? "record" : "records"}?`}
        onClose={() => setConfirmOpen(false)}
        footer={
          <>
            <button onClick={() => setConfirmOpen(false)} className="btn-ghost">
              Cancel
            </button>
            <button
              onClick={handleDelete}
              className="btn-primary"
              style={{ background: "var(--err)", color: "#fff" }}
            >
              Delete {selectedIds.size > 0 ? selectedIds.size : ""} record{selectedIds.size === 1 ? "" : "s"}
            </button>
          </>
        }
      >
        <p>
          You are about to permanently delete{" "}
          <span className="font-mono text-ink">{selectedIds.size}</span>{" "}
          {selectedIds.size === 1 ? "record" : "records"} from{" "}
          <span className="font-mono text-ink">{collectionName}</span>. This cannot be undone.
        </p>
      </Modal>
    </>
  );
}

/** Build a compact page list with ellipses for large page counts. */
function buildPageList(current: number, total: number): Array<number | "…"> {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  const out: Array<number | "…"> = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  if (start > 2) out.push("…");
  for (let p = start; p <= end; p++) out.push(p);
  if (end < total - 1) out.push("…");
  out.push(total);
  return out;
}

/* ─── SlideOver panel: edit collection (name + full schema editor) ── */
function EditPanel({
  collection,
  onSaved,
  registerSave,
}: {
  collection: Collection;
  onSaved: () => void;
  registerSave: (fn: () => void) => void;
}) {
  const [name, setName] = useState(collection.name);
  const [authSettings, setAuthSettings] = useState<AuthSettings>(DEFAULT_AUTH_SETTINGS);
  const [emailTemplates, setEmailTemplates] = useState<EmailTemplates>(DEFAULT_TEMPLATES);
  const [editTab, setEditTab] = useState<"schema" | "auth" | "templates">("schema");
  const schemaData = useRef<SchemaData>({
    fields: collection.schema.map((f, i) => ({
      cid: `existing_${i}`,
      name: f.name,
      type: (f.type as SchemaField["type"]) ?? "text",
      required: false,
      unique: false,
      hidden: false,
      options: {},
      locked: ["id", "created", "updated", "created_at"].includes(f.name),
      primaryKey: f.name === "id",
      auto: f.name === "created" || f.name === "updated",
    })),
    indexes: [],
    constraints: [],
  });

  function handleSave() {
    const data = schemaData.current;
    // Persist schema overrides (only fields with names).
    const cleanSchema = data.fields
      .filter((f) => f.name)
      .map((f) => ({ name: f.name, type: f.type }));
    saveEditedSchema(collection.name, cleanSchema);
    // Persist name override (if changed).
    if (name !== collection.name) {
      setEditedName(collection.name, name);
    }
    onSaved();
  }

  registerSave(handleSave);

  return (
    <div className="px-5 py-5 space-y-5">
      {/* Name */}
      <section className="space-y-2">
        <span className="label-mono">Collection name</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          pattern="[a-zA-Z][a-zA-Z0-9_]*"
          className="field-input font-mono"
          placeholder="collection_name"
        />
      </section>

      {/* Tab bar — Schema | Auth | Email templates (auth collections only) */}
      {collection.type === "user" && (
        <div className="flex items-center gap-1 hairline-b">
          <button
            type="button"
            onClick={() => setEditTab("schema")}
            className={`px-3 py-2 text-[13px] font-medium border-b-2 transition ${
              editTab === "schema" ? "border-brand text-ink" : "border-transparent text-ink-muted hover:text-ink"
            }`}
          >
            Schema
          </button>
          <button
            type="button"
            onClick={() => setEditTab("auth")}
            className={`px-3 py-2 text-[13px] font-medium border-b-2 transition ${
              editTab === "auth" ? "border-brand text-ink" : "border-transparent text-ink-muted hover:text-ink"
            }`}
          >
            Auth
          </button>
          <button
            type="button"
            onClick={() => setEditTab("templates")}
            className={`px-3 py-2 text-[13px] font-medium border-b-2 transition ${
              editTab === "templates" ? "border-brand text-ink" : "border-transparent text-ink-muted hover:text-ink"
            }`}
          >
            Email templates
          </button>
        </div>
      )}

      {/* Schema editor */}
      {collection.type !== "user" || editTab === "schema" ? (
        <SchemaEditor
          initialFields={schemaData.current.fields}
          initialIndexes={schemaData.current.indexes}
          initialConstraints={schemaData.current.constraints}
          onDataChange={(data) => {
            schemaData.current = data;
          }}
        />
      ) : null}

      {/* Auth config (auth collections only) */}
      {collection.type === "user" && editTab === "auth" && (
        <AuthConfig settings={authSettings} onChange={setAuthSettings} />
      )}

      {/* Email templates (auth collections only) */}
      {collection.type === "user" && editTab === "templates" && (
        <EmailTemplatesEditor templates={emailTemplates} onChange={setEmailTemplates} />
      )}
    </div>
  );
}

/* ─── SlideOver panel: new record ─────────────────────────────────── */
function NewRecordPanel({
  schema,
}: {
  schema: { name: string; type: string }[];
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const fields = schema.filter(
    (f) => f.name !== "id" && f.name !== "created" && f.name !== "updated",
  );

  return (
    <div className="px-5 py-5 space-y-4">
      {fields.length === 0 ? (
        <p className="text-[13px] text-ink-muted">
          This collection has no editable fields yet.
        </p>
      ) : (
        fields.map((f) => (
          <label key={f.name} className="block">
            <span className="label-mono">
              {f.name}{" "}
              <span className="text-ink-faint normal-case font-normal">· {f.type}</span>
            </span>
            <input
              value={values[f.name] ?? ""}
              onChange={(e) =>
                setValues((v) => ({ ...v, [f.name]: e.target.value }))
              }
              placeholder={`Enter ${f.type} value`}
              className="field-input mt-1"
            />
          </label>
        ))
      )}
    </div>
  );
}
