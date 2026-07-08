import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { usePrefs } from "@/hooks/usePrefs";

interface Column<T> {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  className?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  empty?: ReactNode;
  /** Click handler for the trailing action button on each row. */
  onRowAction?: (row: T) => void;
  /** Currently selected row ids. */
  selectedIds?: Set<string>;
  /** Toggle a single row's selection. */
  onToggleRow?: (id: string) => void;
  /** Toggle all rows on the current page. */
  onToggleAll?: (ids: string[], checked: boolean) => void;
}

export function DataTable<T extends { id: string }>({
  columns,
  rows,
  empty,
  onRowAction,
  selectedIds,
  onToggleRow,
  onToggleAll,
}: DataTableProps<T>) {
  const selectable = !!onToggleRow && !!selectedIds;
  const pageIds = rows.map((r) => r.id);
  const allChecked = selectable && pageIds.length > 0 && pageIds.every((id) => selectedIds.has(id));
  const someChecked = selectable && !allChecked && pageIds.some((id) => selectedIds.has(id));

  return (
    <div className="bg-surface hairline-b border border-line overflow-x-auto">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="hairline-b bg-surface-2">
            <th className="w-10 px-3 py-2 text-left">
              {selectable && onToggleAll ? (
                <input
                  type="checkbox"
                  className="accent-brand"
                  checked={allChecked}
                  ref={(el) => {
                    if (el) el.indeterminate = someChecked;
                  }}
                  onChange={(e) => onToggleAll(pageIds, e.target.checked)}
                  title="Select all on this page"
                />
              ) : (
                <input type="checkbox" className="accent-brand" disabled />
              )}
            </th>
            {columns.map((c) => (
              <th
                key={c.key}
                className={`text-left px-3 py-2 font-semibold text-ink-muted whitespace-nowrap ${c.className ?? ""}`}
              >
                {c.header}
              </th>
            ))}
            <th className="w-10" />
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length + 2} className="text-center text-ink-muted py-10">
                {empty ?? "No records"}
              </td>
            </tr>
          ) : (
            rows.map((row) => {
              const checked = selectable && selectedIds.has(row.id);
              return (
                <tr
                  key={row.id}
                  className={`hairline-b last:border-b-0 transition ${
                    checked ? "bg-brand/10" : "hover:bg-surface-2"
                  }`}
                >
                  <td className="px-3 py-2.5">
                    {selectable && (
                      <input
                        type="checkbox"
                        className="accent-brand"
                        checked={checked}
                        onChange={() => onToggleRow!(row.id)}
                      />
                    )}
                  </td>
                  {columns.map((c) => (
                    <td key={c.key} className={`px-3 py-2.5 align-middle ${c.className ?? ""}`}>
                      {c.cell(row)}
                    </td>
                  ))}
                  <td className="px-2 text-right">
                    <button
                      type="button"
                      onClick={() => onRowAction?.(row)}
                      className="btn-icon"
                      title="Open record"
                      aria-label="Open record"
                    >
                      <ChevronRight size={14} />
                    </button>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}

/** Renders a cell value with sensible formatting: null → N/A, bool → badge, etc. */
export function Cell({
  value,
  fieldType,
}: {
  value: unknown;
  /**
   * Pass `"datetime"` to render numeric (epoch ms/s) or ISO string values
   * through the user's TZ-aware formatter. Pass `"date"` for ISO date strings.
   * Omit for plain values.
   */
  fieldType?: string;
}) {
  const { formatDateTime } = usePrefs();

  if (value === null || value === undefined || value === "") {
    return <span className="text-ink-faint">N/A</span>;
  }

  // Datetime fields — epoch ms, epoch seconds, or ISO string — formatted
  // through the user's prefs so every table renders the same TZ + preset.
  if (fieldType === "datetime") {
    const formatted = formatDateTime(value);
    if (formatted && formatted !== String(value)) {
      return (
        <span className="font-mono text-ink-muted whitespace-nowrap" title={String(value)}>
          {formatted}
        </span>
      );
    }
    return <span className="text-ink">{String(value)}</span>;
  }

  // `date` fields — stored as TEXT (yyyy-MM-dd). Render as-is so users see
  // exactly what they entered; the wall-clock value is the canonical form.
  if (fieldType === "date") {
    return <span className="font-mono text-ink-muted whitespace-nowrap">{String(value)}</span>;
  }

  if (typeof value === "boolean") {
    return value ? (
      <span className="badge badge-ok">true</span>
    ) : (
      <span className="badge badge-muted">false</span>
    );
  }
  if (typeof value === "string" && value.startsWith("http") && value.match(/\.(png|jpe?g|webp|gif)/i)) {
    return (
      <img src={value} alt="" className="w-7 h-7 rounded-full object-cover" />
    );
  }

  // NOTE: we deliberately do NOT auto-detect timestamps from bare numbers.
  // A previous heuristic treated any number < 1e12 as epoch-seconds, which
  // misfired on durations, counts, prices, etc. — a 6ms duration would
  // render as "1 January 1970". Only fields explicitly typed as `datetime`
  // (handled above) get formatted through the TZ-aware formatter.
  return <span className="text-ink">{String(value)}</span>;
}
