import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Plus, Search, Loader2, Download } from "lucide-react";
import { DataTable, Cell } from "@/components/Table";
import ColumnPicker from "@/components/ColumnPicker";
import RecordDrawer from "@/components/RecordDrawer";
import SelectionBar from "@/components/SelectionBar";
import Modal from "@/components/Modal";
import { useAuth, canEdit } from "@/hooks/useAuth";
import { type Record as Row, type Collection, type CollectionField } from "@/lib/types";
import { apiClient, getToken } from "@/lib/api-client";
import { collectionAllowsRecordEdits } from "./helpers";

/* ─── Records sub-view ─────────────────────────────────────────────── */
export function RecordsTable({
  collectionName,
  schema,
  collectionType,
  onNewRecord,
}: {
  collectionName: string;
  schema: CollectionField[];
  collectionType: Collection["type"];
  onNewRecord?: () => void;
}) {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
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

  // Visible columns — default to ALL selected on every visit.
  const allColumns = useMemo(
    () => (schema.length ? schema : [{ id: "id", name: "id", type: "text" }] as CollectionField[]),
    [schema],
  );
  const [visible, setVisible] = useState<string[]>(() => allColumns.map((c) => c.name));

  // Re-select all when schema (or collection) changes.
  useEffect(() => {
    setVisible(allColumns.map((c) => c.name));
  }, [allColumns]);

  function handleVisibleChange(next: string[]) {
    setVisible(next);
  }

  // ─── Fetch records from the API ───────────────────────────────────
  const [records, setRecords] = useState<Row[]>([]);
  const [recordsLoading, setRecordsLoading] = useState(true);
  const [recordsError, setRecordsError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [reloadKey, setReloadKey] = useState(0);

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
  }, [collectionName, page, perPage, reloadKey]);

  // Pagination math from the real API total.
  const currentPage = Math.min(page, totalPages);
  const start = total > 0 ? (currentPage - 1) * perPage : 0;
  const end = Math.min(start + perPage, total);
  const pageRows = records;

  const visibleSet = new Set(visible);
  const isBackupsTable = collectionName === "_backups";
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  async function handleDownloadBackup(row: Row) {
    const id = row.id;
    if (!id || typeof id !== "string") return;
    setDownloadingId(id);
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
    } catch {
      // Silently fail — the drawer has a richer error display.
    } finally {
      setDownloadingId(null);
    }
  }

  const columns = allColumns
    .filter((f) => visibleSet.has(f.name))
    .map((f) => ({
      key: f.name,
      header: f.name,
      cell: (r: Row) =>
        f.name === "id" ? (
          <span className="font-mono text-ink-muted">{r.id ?? r[f.name]}</span>
        ) : (
          <Cell value={r[f.name]} fieldType={f.type} />
        ),
    }));

  // Append a download action column for the _backups system table.
  if (isBackupsTable) {
    columns.push({
      key: "__actions",
      header: "Actions",
      cell: (r: Row) => {
        const id = r.id;
        if (!id || typeof id !== "string") return <></>;
        const busy = downloadingId === id;
        return (
          <button
            onClick={(e) => {
              e.stopPropagation();
              void handleDownloadBackup(r);
            }}
            disabled={busy}
            className="btn-ghost text-[11px] py-0.5 px-2"
            title="Download backup JSON"
          >
            {busy ? (
              <Loader2 size={11} className="animate-spin" />
            ) : (
              <Download size={11} />
            )}
            <span className="ml-1">Download</span>
          </button>
        );
      },
    });
  }

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

  async function handleDelete() {
    const ids = Array.from(selectedIds);
    await Promise.all(
      ids.map((id) =>
        apiClient.del(`/api/core/collections/${encodeURIComponent(collectionName)}/records/${encodeURIComponent(id)}`).catch(() => {}),
      ),
    );
    setSelectedIds(new Set());
    setConfirmOpen(false);
    setReloadKey((k) => k + 1);
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

  // Snapshot for the drawer — immediate preview while the record fetch runs.
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
        {canEdit(user) && onNewRecord && (
          <button
            onClick={onNewRecord}
            className="btn-primary text-[12px] ml-auto"
          >
            <Plus size={13} /> New record
          </button>
        )}
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
        schema={allColumns}
        snapshot={drawerSnapshot}
        readOnly={!collectionAllowsRecordEdits(collectionName, collectionType)}
        onClose={() => setDrawerRow(null)}
        onChanged={() => setReloadKey((k) => k + 1)}
      />

      <SelectionBar
        count={selectedIds.size}
        onClear={clearSelection}
        onDelete={
          canEdit(user) && collectionAllowsRecordEdits(collectionName, collectionType)
            ? () => setConfirmOpen(true)
            : undefined
        }
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
export function buildPageList(current: number, total: number): Array<number | "…"> {
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
