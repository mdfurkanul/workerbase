import { useEffect, useRef, useState } from "react";
import { Check, Columns3, Search, X } from "lucide-react";

interface ColumnDef {
  name: string;
  type?: string;
}

interface Props {
  collectionName: string;
  columns: ColumnDef[];
  /** Currently visible column names (in original schema order). */
  visible: string[];
  onChange: (next: string[]) => void;
}

/**
 * Dropdown that lets the user toggle which columns appear in the table.
 * Visibility state is owned by the parent (persisted per collection).
 */
export default function ColumnPicker({
  collectionName,
  columns,
  visible,
  onChange,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on outside click + Esc.
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const visibleSet = new Set(visible);
  const filtered = columns.filter((c) =>
    c.name.toLowerCase().includes(query.trim().toLowerCase()),
  );

  function toggle(name: string) {
    if (visibleSet.has(name)) {
      onChange(visible.filter((n) => n !== name));
    } else {
      // Preserve the schema order when adding back.
      const next = columns.map((c) => c.name).filter((n) => visibleSet.has(n) || n === name);
      onChange(next);
    }
  }

  function selectAll() {
    onChange(columns.map((c) => c.name));
  }

  function clear() {
    onChange([]);
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="btn-ghost text-[12px]"
        title="Choose columns to display"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <Columns3 size={13} />
        Columns
        {visible.length < columns.length && (
          <span className="ml-1 px-1.5 py-0.5 rounded bg-surface-2 text-[10px] text-ink-muted font-mono">
            {visible.length}/{columns.length}
          </span>
        )}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-1 w-64 bg-surface border border-line-strong rounded shadow-2xl z-30"
        >
          {/* Header */}
          <div className="px-3 py-2 hairline-b flex items-center justify-between">
            <span className="label-mono">Columns</span>
            <button
              onClick={() => setOpen(false)}
              className="btn-icon"
              aria-label="Close"
            >
              <X size={14} />
            </button>
          </div>

          {/* Search */}
          <div className="p-2 hairline-b">
            <div className="relative">
              <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-faint" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Find column"
                className="field-input pl-7 py-1.5 text-[12px]"
                autoFocus
              />
            </div>
          </div>

          {/* Bulk actions */}
          <div className="px-3 py-2 hairline-b flex items-center justify-between text-[11px]">
            <button onClick={selectAll} className="font-mono uppercase tracking-widest text-ink-muted hover:text-ink">
              Select all
            </button>
            <button onClick={clear} className="font-mono uppercase tracking-widest text-ink-muted hover:text-ink">
              Clear
            </button>
          </div>

          {/* List */}
          <ul className="max-h-64 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <li className="px-3 py-3 text-[12px] text-ink-faint text-center">
                No columns match “{query}”.
              </li>
            ) : (
              filtered.map((c) => {
                const checked = visibleSet.has(c.name);
                return (
                  <li key={c.name}>
                    <label className="flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-surface-2 transition">
                      <span
                        className={`w-4 h-4 rounded-sm border flex items-center justify-center shrink-0 transition ${
                          checked
                            ? "bg-brand border-brand text-white"
                            : "border-line-strong"
                        }`}
                        aria-hidden
                      >
                        {checked && <Check size={11} strokeWidth={3} />}
                      </span>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggle(c.name)}
                        className="sr-only"
                      />
                      <span className="font-mono text-[12px] text-ink truncate">{c.name}</span>
                      {c.type && (
                        <span className="ml-auto text-[10px] font-mono uppercase tracking-widest text-ink-faint">
                          {c.type}
                        </span>
                      )}
                    </label>
                  </li>
                );
              })
            )}
          </ul>

          {/* Footer */}
          <div className="px-3 py-2 hairline-t text-[11px] text-ink-faint font-mono">
            {collectionName} · {visible.length}/{columns.length} shown
          </div>
        </div>
      )}
    </div>
  );
}
