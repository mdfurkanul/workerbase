import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";

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
}

export function DataTable<T extends { id: string }>({
  columns,
  rows,
  empty,
  onRowAction,
}: DataTableProps<T>) {
  return (
    <div className="bg-surface hairline-b border border-line overflow-x-auto">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="hairline-b bg-surface-2">
            <th className="w-10 px-3 py-2 text-left">
              <input type="checkbox" className="accent-brand" />
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
            rows.map((row) => (
              <tr
                key={row.id}
                className="hairline-b last:border-b-0 hover:bg-surface-2 transition"
              >
                <td className="px-3 py-2.5">
                  <input type="checkbox" className="accent-brand" />
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
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

/** Renders a cell value with sensible formatting: null → N/A, bool → badge, etc. */
export function Cell({ value }: { value: unknown }) {
  if (value === null || value === undefined || value === "") {
    return <span className="text-ink-faint">N/A</span>;
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
  return <span className="text-ink">{String(value)}</span>;
}
