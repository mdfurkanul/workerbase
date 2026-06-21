import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ChevronRight, Plus, Search } from "lucide-react";
import AppShell, { PageHeader } from "@/components/AppShell";
import { DataTable, Cell } from "@/components/Table";
import CollectionHeader from "@/components/CollectionHeader";
import CollectionSettings from "@/components/CollectionSettings";
import ColumnPicker from "@/components/ColumnPicker";
import RecordDrawer from "@/components/RecordDrawer";
import EditCollection from "@/routes/EditCollection";
import { useCollections } from "@/hooks/useCollections";
import { USERS_RECORDS, type Record as Row } from "@/lib/mockData";
import { buildCollectionUrl } from "@/lib/collectionUrl";
import { getVisibleColumns, setVisibleColumns } from "@/lib/collectionStore";

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
  const action = params.get("action");
  const recordId = params.get("record");

  if (!selected) return <CollectionsIndex />;

  if (recordId) return <RecordDetail name={selected} id={recordId} />;

  if (action === "new") return <NewRecord name={selected} />;
  if (action === "edit") return <EditCollection name={selected} />;
  if (action === "settings") return <CollectionView name={selected} mode="settings" />;

  return <CollectionView name={selected} mode="records" />;
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
    </AppShell>
  );
}

/* ─── Single collection view (records or settings) ─────────────────── */
function CollectionView({
  name,
  mode,
}: {
  name: string;
  mode: "records" | "settings";
}) {
  const { collections, loading, refresh } = useCollections();
  const collection = collections.find((c) => c.name === name);
  const [tick, setTick] = useState(0);

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
      />
      {mode === "settings" ? (
        <CollectionSettings collectionName={collection.name} />
      ) : (
        <RecordsTable key={tick} collectionName={collection.name} schema={collection.schema} />
      )}
    </AppShell>
  );
}

/* ─── Records sub-view ─────────────────────────────────────────────── */
function RecordsTable({
  collectionName,
  schema,
}: {
  collectionName: string;
  schema: { name: string; type: string }[];
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

  // Visible columns (per-collection, persisted in localStorage).
  const allColumns = useMemo(
    () => (schema.length ? schema : [{ name: "id", type: "text" }]),
    [schema],
  );
  const [visible, setVisible] = useState<string[]>(() => {
    const stored = getVisibleColumns(collectionName);
    if (stored && stored.length > 0) {
      // Filter to columns that still exist in the schema.
      const known = new Set(allColumns.map((c) => c.name));
      const filtered = stored.filter((n) => known.has(n));
      return filtered.length > 0 ? filtered : allColumns.map((c) => c.name);
    }
    return allColumns.map((c) => c.name);
  });

  function handleVisibleChange(next: string[]) {
    setVisible(next);
    // Always persist (even when empty) so the user's choice survives reload.
    setVisibleColumns(collectionName, next);
  }

  // For the demo only `users` is seeded with rows.
  const rows: Row[] = useMemo(() => {
    if (collectionName === "users") return USERS_RECORDS;
    return [];
  }, [collectionName]);

  const filteredRows = useMemo(() => {
    let r = rows;
    if (q.trim()) {
      const needle = q.toLowerCase();
      r = r.filter((row) => JSON.stringify(row).toLowerCase().includes(needle));
    }
    return r;
  }, [rows, q]);

  // Pagination math.
  const total = filteredRows.length;
  const pageCount = Math.max(1, Math.ceil(total / perPage));
  const currentPage = Math.min(page, pageCount);
  const start = (currentPage - 1) * perPage;
  const end = Math.min(start + perPage, total);
  const pageRows = filteredRows.slice(start, end);

  const visibleSet = new Set(visible);
  const columns = allColumns
    .filter((f) => visibleSet.has(f.name))
    .map((f) => ({
      key: f.name,
      header: f.name,
      cell: (r: Row) =>
        f.name === "id" ? (
          <span className="font-mono text-ink-muted">{r.id}</span>
        ) : (
          <Cell value={r[f.name]} />
        ),
    }));

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
  const pageNumbers = buildPageList(currentPage, pageCount);

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
        <Link
          to={buildCollectionUrl(collectionName, { action: "new" })}
          className="btn-primary text-[12px] ml-auto"
        >
          <Plus size={13} /> New record
        </Link>
      </div>

      <div className="flex-1 overflow-auto px-6 py-4">
        <DataTable
          columns={columns}
          rows={pageRows}
          onRowAction={(row) => setDrawerRow(row)}
          empty={
            columns.length === 0
              ? "No columns selected — pick at least one from Columns."
              : collectionName === "users"
                ? "No records match your filters"
                : "No records yet (mock)"
          }
        />
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
          {pageCount > 1 && (
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
                disabled={currentPage === pageCount}
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

/* ─── New record sub-view ──────────────────────────────────────────── */
function NewRecord({ name }: { name: string }) {
  const navigate = useNavigate();
  const { collections, loading } = useCollections();
  const collection = collections.find((c) => c.name === name);
  const [values, setValues] = useState<Record<string, string>>({});

  if (loading) {
    return (
      <AppShell>
        <PageHeader
          breadcrumbs={[
            <Link to="/collections" className="hover:text-ink">Collections</Link>,
            <Link to={buildCollectionUrl(name)} className="font-mono hover:text-ink">{name}</Link>,
            <span>New record</span>,
          ]}
        />
        <div className="px-6 py-16 text-center text-ink-muted text-[13px]">Loading…</div>
      </AppShell>
    );
  }

  if (!collection) {
    return (
      <AppShell>
        <PageHeader breadcrumbs={["Collections", name, "New"]} />
        <div className="px-6 py-16 text-center text-ink-muted">Collection not found.</div>
      </AppShell>
    );
  }

  const fields = collection.schema.filter(
    (f) => f.name !== "id" && f.name !== "created" && f.name !== "updated",
  );

  return (
    <AppShell>
      <PageHeader
        breadcrumbs={[
          <Link to="/collections" className="hover:text-ink">Collections</Link>,
          <Link to={buildCollectionUrl(name)} className="font-mono hover:text-ink">{name}</Link>,
          <span>New record</span>,
        ]}
      />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          navigate(buildCollectionUrl(name));
        }}
        className="max-w-2xl px-6 py-6 space-y-4"
      >
        <span className="label-mono">Record values</span>
        <div className="space-y-3">
          {fields.map((f) => (
            <label key={f.name} className="block">
              <span className="label-mono">
                {f.name} <span className="text-ink-faint normal-case font-normal">· {f.type}</span>
              </span>
              <input
                value={values[f.name] ?? ""}
                onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
                placeholder={`Enter ${f.type} value`}
                className="field-input mt-1"
              />
            </label>
          ))}
        </div>
        <div className="pt-4 hairline-t flex items-center justify-between">
          <Link to={buildCollectionUrl(name)} className="btn-ghost">Cancel</Link>
          <button type="submit" className="btn-primary">
            <Plus size={14} /> Create record
          </button>
        </div>
      </form>
    </AppShell>
  );
}

/* ─── Record detail sub-view ───────────────────────────────────────── */
function RecordDetail({ name, id }: { name: string; id: string }) {
  const record = name === "users" ? USERS_RECORDS.find((r) => r.id === id) : undefined;

  return (
    <AppShell>
      <PageHeader
        breadcrumbs={[
          <Link to="/collections" className="hover:text-ink">Collections</Link>,
          <Link to={buildCollectionUrl(name)} className="font-mono hover:text-ink">{name}</Link>,
          <span className="font-mono">{id}</span>,
        ]}
      />
      <div className="max-w-2xl px-6 py-6 space-y-4">
        {!record ? (
          <div className="bg-surface border border-line rounded p-6 text-center text-ink-muted text-[13px]">
            No record loaded for <span className="font-mono text-ink">{id}</span>. (Mock — real data pending.)
          </div>
        ) : (
          <dl className="bg-surface border border-line rounded divide-y divide-line">
            {Object.entries(record).map(([k, v]) => (
              <div key={k} className="grid grid-cols-[160px_1fr] gap-4 px-4 py-3">
                <dt className="font-mono text-[12px] text-ink-muted">{k}</dt>
                <dd className="text-[13px]">
                  {v === null || v === undefined ? (
                    <span className="text-ink-faint">N/A</span>
                  ) : typeof v === "boolean" ? (
                    v ? <span className="badge badge-ok">true</span> : <span className="badge badge-muted">false</span>
                  ) : typeof v === "string" && v.startsWith("http") ? (
                    <a href={v} target="_blank" rel="noreferrer" className="text-brand hover:underline break-all">{v}</a>
                  ) : (
                    <span className="break-all">{String(v)}</span>
                  )}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </AppShell>
  );
}
