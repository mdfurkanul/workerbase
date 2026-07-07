import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Globe, Search } from "lucide-react";
import {
  ALL_TIMEZONES,
  GROUPED_TIMEZONES,
  searchTimezones,
  type TimezoneGroup,
} from "@/lib/dateTimeFormat";

/**
 * Combobox-style timezone picker. Replaces a native `<select>` over ~450
 * IANA zones, which is awkward to filter and visually noisy in a long
 * dropdown.
 *
 * UX:
 *   - Click the input (or press ↓) to open a panel of all zones grouped
 *     by region. The synthetic "Browser default" entry always sits at
 *     the top.
 *   - Type to filter by region, zone, or label (case-insensitive).
 *   - Keyboard: ↑/↓ to move, Enter to select, Esc to close.
 *   - The currently-selected zone is always visible in the panel even
 *     if the query would filter it out — pinned at the top under
 *     "Selected".
 */
export function TimezonePicker({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  // Reset query + highlight whenever the panel opens.
  useEffect(() => {
    if (open) {
      setQuery("");
      setHighlight(0);
    }
  }, [open]);

  // Build the flattened option list and the grouped view. The currently
  // selected zone is always pinned into the visible set under "Selected".
  const { groups, flat } = useMemo(() => {
    const filtered = query.trim() ? searchTimezones(query) : GROUPED_TIMEZONES;

    // Ensure the selected zone is always visible.
    const selectedLabel = labelFor(value);
    const selectedEntry = value
      ? { value, label: selectedLabel }
      : { value: "", label: "Browser default" };

    const selectedGroup: TimezoneGroup = {
      region: "Selected",
      zones: [selectedEntry],
    };

    // If the user has typed a query that doesn't match the selected zone,
    // we still surface it (the "Selected" group is exempt from filtering).
    const g = [selectedGroup, ...filtered];
    const f: { value: string; label: string }[] = [];
    for (const grp of g) f.push(...grp.zones);
    return { groups: g, flat: f };
  }, [query, value]);

  // Keep the highlighted row in view as the user arrows through.
  useEffect(() => {
    if (!open) return;
    const el = listRef.current?.querySelector<HTMLElement>(
      `[data-idx="${highlight}"]`,
    );
    el?.scrollIntoView({ block: "nearest" });
  }, [highlight, open]);

  function pick(zone: string) {
    onChange(zone);
    setOpen(false);
    inputRef.current?.blur();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setHighlight((h) => Math.min(h + 1, flat.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setOpen(true);
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      if (open) {
        e.preventDefault();
        const picked = flat[highlight];
        if (picked) pick(picked.value);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  const displayLabel = value ? labelFor(value) : "Browser default";

  return (
    <div ref={rootRef} className="relative">
      {/* Search / trigger */}
      <div className="flex items-center gap-2">
        <Globe size={14} className="text-ink-muted shrink-0" />
        <div className="relative flex-1">
          <Search
            size={12}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-faint pointer-events-none"
          />
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-expanded={open}
            aria-controls="tz-list"
            autoComplete="off"
            value={open ? query : displayLabel}
            placeholder="Search timezones (e.g. Asia, Europe, Karachi)…"
            disabled={disabled}
            onChange={(e) => {
              setOpen(true);
              setQuery(e.target.value);
              setHighlight(0);
            }}
            onFocus={() => !disabled && setOpen(true)}
            onKeyDown={onKeyDown}
            className="field-input pl-8 font-mono text-[12px] disabled:opacity-60 disabled:cursor-not-allowed"
          />
        </div>
      </div>

      {/* Dropdown */}
      {open && (
        <div
          id="tz-list"
          ref={listRef}
          role="listbox"
          className="absolute z-50 mt-1 left-0 right-0 max-h-[320px] overflow-y-auto bg-bg-elev border border-line-strong rounded shadow-lg"
        >
          {flat.length === 0 ? (
            <div className="px-3 py-4 text-center text-[12px] text-ink-faint">
              No timezones match “{query}”.
            </div>
          ) : (
            groups.map((g) =>
              g.zones.length === 0 ? null : (
                <div key={g.region}>
                  <div className="px-3 py-1.5 hairline-b bg-surface-2 label-mono text-ink-faint sticky top-0">
                    {g.region}
                  </div>
                  {g.zones.map((zone) => {
                    const flatIdx = flat.findIndex(
                      (f) => f.value === zone.value,
                    );
                    const isSelected = zone.value === value;
                    return (
                      <button
                        type="button"
                        key={zone.value || "default"}
                        data-idx={flatIdx}
                        role="option"
                        aria-selected={isSelected}
                        onClick={() => pick(zone.value)}
                        onMouseEnter={() => setHighlight(flatIdx)}
                        className={[
                          "w-full text-left px-3 py-1.5 text-[12px] flex items-center justify-between gap-2 transition",
                          flatIdx === highlight
                            ? "bg-surface-2"
                            : "hover:bg-surface-2",
                        ].join(" ")}
                      >
                        <span className="font-mono text-ink truncate">
                          {zone.label}
                        </span>
                        <span className="text-[11px] text-ink-faint font-mono shrink-0">
                          {zone.value || "browser"}
                        </span>
                        {isSelected && (
                          <Check size={12} className="text-brand shrink-0" />
                        )}
                      </button>
                    );
                  })}
                </div>
              ),
            )
          )}
          {/* Footer */}
          <div className="px-3 py-1.5 hairline-t bg-surface-2 text-[11px] text-ink-faint font-mono sticky bottom-0">
            {ALL_TIMEZONES.length} zones · ↑↓ navigate · Enter select · Esc close
          </div>
        </div>
      )}
    </div>
  );
}

/** Friendly label for an IANA zone — the part after the slash, with underscores → spaces. */
function labelFor(value: string): string {
  if (!value) return "Browser default";
  const slash = value.indexOf("/");
  return slash >= 0 ? value.slice(slash + 1).replace(/_/g, " ") : value;
}
