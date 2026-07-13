/**
 * Relation field — pick one (or many) records from a target collection.
 *
 * Storage:
 *   - single   → plain ID string
 *   - multiple → JSON array string ('["id1","id2"]')
 *
 * UI:
 *   - single   → native <select>
 *   - multiple → search input + always-visible scrollable list of records.
 *                 Click to toggle selection. No dropdown open/close state,
 *                 no click-outside listeners — dead simple and reliable.
 */

import { useEffect, useState } from "react";
import { Loader2, Search, X } from "lucide-react";
import { apiListRecords } from "@/lib/api-collections";
import type { RecordRow } from "@/lib/api-types";

interface RelationFieldProps {
  target: string;
  relationType?: "single" | "multiple";
  value: string;
  onChange: (v: string) => void;
}

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
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [records, setRecords] = useState<RecordRow[]>([]);
  const [query, setQuery] = useState("");

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

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErr(null);
    apiListRecords(target, { perPage: 100 })
      .then((res) => {
        if (!cancelled) setRecords(res.items ?? []);
      })
      .catch((e) => {
        if (!cancelled) setErr(e instanceof Error ? e.message : "Failed to load");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [target]);

  const selectedRecords = records.filter((r) => selectedIds.includes(r.id));
  const filtered = query.trim()
    ? records.filter((r) => {
        const hay = `${recordLabel(r)} ${r.id}`.toLowerCase();
        return hay.includes(query.toLowerCase());
      })
    : records;

  function toggle(id: string) {
    if (relationType === "multiple") {
      // Add only — don't toggle off. Use the chip X button to remove.
      if (selectedIds.includes(id)) return;
      onChange(JSON.stringify([...selectedIds, id]));
    } else {
      onChange(id);
    }
  }

  function remove(id: string) {
    if (relationType === "multiple") {
      onChange(JSON.stringify(selectedIds.filter((x) => x !== id)));
    } else {
      onChange("");
    }
  }

  // ── Single: native <select> ───────────────────────────────────────
  if (relationType === "single") {
    return (
      <div className="mt-1">
        {loading && (
          <div className="flex items-center gap-1.5 text-[12px] text-ink-muted">
            <Loader2 size={12} className="animate-spin" /> Loading {target}…
          </div>
        )}
        {err && <div className="text-err text-[12px]">{err}</div>}
        {!loading && !err && (
          <select
            value={selectedIds[0] ?? ""}
            onChange={(e) => onChange(e.target.value)}
            className="field-input"
          >
            <option value="">— select —</option>
            {records.map((r) => (
              <option key={r.id} value={r.id}>{recordLabel(r)}</option>
            ))}
          </select>
        )}
      </div>
    );
  }

  // ── Multiple: chips + search + always-visible list ────────────────
  return (
    <div className="mt-1">
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

      {/* Search filter */}
      <div className="relative mb-1.5">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter records…"
          className="field-input pl-8"
        />
        <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-faint pointer-events-none" />
        {loading && (
          <Loader2 size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 animate-spin text-brand" />
        )}
      </div>

      {err && <div className="text-err text-[12px] mb-1.5">{err}</div>}

      {/* Record list — always visible, no dropdown state */}
      {!loading && !err && (
        <div className="max-h-48 overflow-y-auto rounded border border-line bg-bg-elev">
          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-[12px] text-ink-muted">
              {records.length === 0 ? `No records in ${target}` : "No matches"}
            </div>
          ) : (
            filtered.slice(0, 100).map((r) => {
              const isSel = selectedIds.includes(r.id);
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => toggle(r.id)}
                  className={`flex items-center gap-2 w-full text-left px-3 py-1.5 text-[12px] hover:bg-surface-2 ${
                    isSel ? "text-brand bg-surface-2" : "text-ink"
                  }`}
                >
                  <span className="truncate">{recordLabel(r)}</span>
                  <span className="font-mono text-[10px] text-ink-faint ml-auto">
                    {isSel ? "✓ " : ""}
                    {r.id.slice(0, 8)}
                  </span>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
