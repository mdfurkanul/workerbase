import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Search, X } from "lucide-react";
import { groupedFieldTypes, type FieldType } from "@/lib/fieldTypes";

/**
 * "Add field" dropdown — categorized list of field types with search.
 * On pick, calls `onAdd(type)` and the parent owns the new field state.
 */
export function AddFieldButton({ onAdd }: { onAdd: (t: FieldType) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const groups = useMemo(() => groupedFieldTypes(), []);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  useEffect(() => {
    if (open) {
      setQuery("");
      // Focus next tick so the input is mounted.
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return groups;
    return groups
      .map((g) => ({
        ...g,
        items: g.items.filter(
          (m) => m.label.toLowerCase().includes(q) || m.description.toLowerCase().includes(q),
        ),
      }))
      .filter((g) => g.items.length > 0);
  }, [query, groups]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="btn-primary text-[12px]"
      >
        <Plus size={12} /> Add field
      </button>
      {open && (
        <>
          {/* Click-away overlay */}
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 w-72 rounded-lg border border-line bg-surface shadow-xl z-40">
            <div className="p-2 border-b border-line">
              <div className="relative">
                <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-ink-faint" />
                <input
                  ref={inputRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search field types…"
                  className="field-input text-[12px] pl-7 pr-7"
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => setQuery("")}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 text-ink-faint hover:text-ink"
                  >
                    <X size={11} />
                  </button>
                )}
              </div>
            </div>
            <div className="max-h-80 overflow-y-auto p-1">
              {filtered.length === 0 ? (
                <div className="px-2 py-3 text-[12px] text-ink-faint italic text-center">
                  No matches
                </div>
              ) : (
                filtered.map((g) => (
                  <div key={g.category} className="mb-1">
                    <div className="px-2 py-1 text-[10px] uppercase tracking-widest text-ink-faint font-semibold">
                      {g.category}
                    </div>
                    {g.items.map((m) => {
                      const Icon = m.Icon;
                      return (
                        <button
                          key={m.value}
                          type="button"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            onAdd(m.value);
                            setOpen(false);
                            setQuery("");
                          }}
                          className="group flex items-start gap-2 p-2 rounded border border-transparent hover:border-brand hover:bg-brand/10 transition text-left w-full"
                          title={m.description}
                        >
                          <span className="w-7 h-7 rounded bg-surface-2 group-hover:bg-brand group-hover:text-white text-ink-muted flex items-center justify-center shrink-0 transition-colors">
                            <Icon size={13} />
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="text-[12px] font-medium text-ink truncate">
                              {m.label}
                            </div>
                            <div className="text-[10px] text-ink-faint truncate leading-tight">
                              {m.description}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
