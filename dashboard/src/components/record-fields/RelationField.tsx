/**
 * Async relation lookup dropdown.
 *
 * Fetches the first page of records from the target collection on first
 * focus and lets the user filter by typing. The stored value is the
 * selected record's `id` (string). For multi-cardinality relations the
 * stored value is a JSON array of ids.
 */

import { useEffect, useRef, useState } from "react";
import { Loader2, Search, X } from "lucide-react";
import { apiListRecords } from "@/lib/api-collections";
import type { RecordRow } from "@/lib/api-types";

interface RelationFieldProps {
  /** Target collection name (from field.options.target). */
  target: string;
  /** Cardinality — defaults to "single". */
  relationType?: "single" | "multiple";
  /** Current value: id (single) or JSON array of ids (multiple). */
  value: string;
  onChange: (v: string) => void;
}

/** Build a human-readable label for a record (prefer email / name / title). */
function recordLabel(r: RecordRow): string {
  const candidates = ["email", "name", "title", "label", "username", "display_name"];
  for (const k of candidates) {
    const v = (r as Record<string, unknown>)[k];
    if (typeof v === "string" && v.trim() !== "") return v;
  }
  return typeof r.id === "string" ? r.id : JSON.stringify(r);
}

export function RelationField({
  target,
  relationType = "single",
  value,
  onChange,
}: RelationFieldProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [records, setRecords] = useState<RecordRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Parse current value into id(s).
  let selectedIds: string[] = [];
  if (relationType === "multiple") {
    try {
      const p = value ? JSON.parse(value) : [];
      selectedIds = Array.isArray(p) ? p.filter((x) => typeof x === "string") : [];
    } catch {
      selectedIds = [];
    }
  } else {
    selectedIds = value ? [value] : [];
  }

  async function loadOnce() {
    if (loaded || loading) return;
    setLoading(true);
    setErr(null);
    try {
      const res = await apiListRecords(target, { perPage: 100 });
      setRecords(res.items ?? []);
      setLoaded(true);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load target records");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (open) loadOnce();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function select(id: string) {
    if (relationType === "multiple") {
      const set = new Set(selectedIds);
      if (set.has(id)) set.delete(id);
      else set.add(id);
      onChange(JSON.stringify(Array.from(set)));
    } else {
      onChange(id);
      setOpen(false);
      setQuery("");
    }
  }

  function remove(id: string) {
    if (relationType === "multiple") {
      onChange(JSON.stringify(selectedIds.filter((x) => x !== id)));
    } else {
      onChange("");
    }
  }

  const selectedRecords = records.filter((r) => selectedIds.includes(r.id));
  const filtered = query.trim()
    ? records.filter((r) => {
        const hay = `${recordLabel(r)} ${r.id}`.toLowerCase();
        return hay.includes(query.toLowerCase());
      })
    : records;

  return (
    <div className="mt-1 relative">
      {/* Selected chips */}
      {selectedRecords.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-1.5">
          {selectedRecords.map((r) => (
            <span
              key={r.id}
              className="inline-flex items-center gap-1 rounded bg-surface-2 border border-line px-2 py-0.5 text-[12px]"
            >
              <span className="truncate max-w-[180px]">{recordLabel(r)}</span>
              <button
                type="button"
                onClick={() => remove(r.id)}
                className="text-ink-muted hover:text-err"
                aria-label="Remove"
              >
                <X size={11} />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder={
            relationType === "multiple" ? "Search to add records…" : "Search target records…"
          }
          className="field-input pl-8"
        />
        <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-faint pointer-events-none" />
        {loading && (
          <Loader2 size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 animate-spin text-brand" />
        )}
      </div>

      {open && !loading && err && (
        <div className="text-err text-[12px] mt-1">{err}</div>
      )}

      {open && loaded && !err && (
        <div className="absolute z-30 mt-1 max-h-56 w-full overflow-y-auto rounded border border-line bg-bg-elev shadow-lg">
          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-[12px] text-ink-muted">
              {records.length === 0 ? "No records in target collection" : "No matches"}
            </div>
          ) : (
            filtered.slice(0, 50).map((r) => {
              const isSel = selectedIds.includes(r.id);
              return (
                <button
                  key={r.id}
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    select(r.id);
                  }}
                  className={`flex items-center justify-between w-full text-left px-3 py-1.5 text-[12px] hover:bg-surface-2 ${
                    isSel ? "text-brand" : "text-ink"
                  }`}
                >
                  <span className="truncate">{recordLabel(r)}</span>
                  <span className="font-mono text-[10px] text-ink-faint ml-2">{r.id.slice(0, 8)}</span>
                </button>
              );
            })
          )}
          {filtered.length > 50 && (
            <div className="px-3 py-1 text-[11px] text-ink-faint border-t border-line">
              Showing first 50 of {filtered.length} matches
            </div>
          )}
        </div>
      )}
    </div>
  );
}
