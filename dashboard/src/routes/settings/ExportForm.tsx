import { useEffect, useMemo, useState } from "react";
import { Download, Search } from "lucide-react";
import { useCollections } from "@/hooks/useCollections";
import { apiClient } from "@/lib/api-client";
import {
  exportJSON,
  exportCSV,
  exportSQL,
  exportXLSX,
  type ExportPayload,
} from "@/lib/exportFormats";
import { Card } from "./primitives";

export type ExportFormat = "json" | "csv" | "xlsx" | "sql";
export type ExportScope = "selected" | "all";

export const FORMAT_OPTIONS: { value: ExportFormat; label: string; hint: string }[] = [
  { value: "json", label: "JSON", hint: "Nested object, one key per collection" },
  { value: "csv", label: "CSV", hint: "One .csv per collection (zipped if many)" },
  { value: "xlsx", label: "XLSX", hint: "Excel workbook, one sheet per collection" },
  { value: "sql", label: "SQL", hint: "CREATE TABLE + INSERT statements" },
];

export function ExportForm() {
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

  /** Get the per-collection row limit. Absent = default 1000. */
  function rowLimitFor(name: string): number | "all" | undefined {
    return rowLimits[name];
  }

  /** Set the per-collection row limit. */
  function setRowLimit(name: string, value: number | "all") {
    setRowLimits((prev) => ({ ...prev, [name]: value }));
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

      // Build the per-collection limits payload for selected-scope exports.
      // null = no cap; number = explicit cap. Collections absent from the
      // map fall back to the global `limit`.
      const limitsPayload: Record<string, number | null> = {};
      if (scope === "selected" && effectiveTargets) {
        for (const name of effectiveTargets) {
          const v = rowLimits[name];
          if (v === "all") limitsPayload[name] = null;
          else if (typeof v === "number") limitsPayload[name] = v;
        }
      }

      const payload = await apiClient.post<{
        meta: ExportPayload["meta"];
        collections: ExportPayload["collections"];
      }>(`/api/core/export`, {
        collections: scope === "all" ? "all" : effectiveTargets,
        limit: scope === "all" ? (limitMode === "all" ? null : limit) : limitMode === "all" ? null : limit,
        limits: scope === "selected" ? limitsPayload : undefined,
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

        {scope === "all" && (
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
        )}

        {scope === "selected" && (
          <div className="text-[12px] text-ink-faint">
            Row limits are set per collection — expand a collection to change its limit.
            Collections without an explicit limit use the default of 1000.
          </div>
        )}

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

                            {/* Per-collection row limit */}
                            <div className="mt-3 pt-3 hairline-t">
                              <div className="flex items-center gap-3 flex-wrap">
                                <span className="label-mono text-ink-faint">Row limit</span>
                                <label className="flex items-center gap-1.5 cursor-pointer text-[12px]">
                                  <input
                                    type="radio"
                                    name={`limit-${c.name}`}
                                    checked={rowLimitFor(c.name) !== "all"}
                                    onChange={() => setRowLimit(c.name, 1000)}
                                    className="accent-[var(--brand)] w-3 h-3"
                                  />
                                  Custom
                                </label>
                                {rowLimitFor(c.name) !== "all" && (
                                  <input
                                    type="number"
                                    min={1}
                                    max={1000000}
                                    value={rowLimitFor(c.name) ?? 1000}
                                    onChange={(e) => {
                                      const n = parseInt(e.target.value, 10);
                                      setRowLimit(c.name, isNaN(n) ? 1 : Math.max(1, Math.min(1_000_000, n)));
                                    }}
                                    className="field-input font-mono w-28 py-1 text-[12px]"
                                  />
                                )}
                                <label className="flex items-center gap-1.5 cursor-pointer text-[12px]">
                                  <input
                                    type="radio"
                                    name={`limit-${c.name}`}
                                    checked={rowLimitFor(c.name) === "all"}
                                    onChange={() => setRowLimit(c.name, "all")}
                                    className="accent-[var(--brand)] w-3 h-3"
                                  />
                                  All rows
                                </label>
                                {typeof c.count === "number" && (
                                  <span className="text-[11px] text-ink-faint font-mono ml-auto">
                                    {c.count.toLocaleString()} in table
                                  </span>
                                )}
                              </div>
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
