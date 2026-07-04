import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";

/**
 * Multi-select dropdown for picking column names — used by the index and
 * constraint editors. Options come from the live field-name list.
 */
export function MultiSelectColumns({
  value,
  options,
  onChange,
}: {
  value: string[];
  options: string[];
  onChange: (cols: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  function toggle(col: string) {
    onChange(value.includes(col) ? value.filter((c) => c !== col) : [...value, col]);
  }

  const label =
    value.length === 0
      ? "Select columns"
      : value.length <= 2
        ? value.join(", ")
        : `${value.length} columns`;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="field-input text-[13px] w-full flex items-center justify-between"
      >
        <span className="truncate">{label}</span>
        <ChevronDown size={12} className="shrink-0 text-ink-faint" />
      </button>
      {open && (
        <div className="absolute z-30 mt-1 w-full max-h-48 overflow-y-auto rounded border border-line bg-surface shadow-lg">
          {options.length === 0 ? (
            <div className="px-2 py-1.5 text-[12px] text-ink-faint italic">
              No columns available
            </div>
          ) : (
            options.map((col) => (
              <button
                key={col}
                type="button"
                onClick={() => toggle(col)}
                className="w-full text-left px-2 py-1.5 hover:bg-surface-2 flex items-center gap-2 text-[12px] font-mono"
              >
                <span
                  className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 ${
                    value.includes(col)
                      ? "bg-brand border-brand text-white"
                      : "border-line"
                  }`}
                >
                  {value.includes(col) && <Check size={10} />}
                </span>
                {col}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
