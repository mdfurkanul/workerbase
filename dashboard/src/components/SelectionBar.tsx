import { Download, Trash2, X } from "lucide-react";

interface Props {
  count: number;
  onClear: () => void;
  onDelete: () => void;
  onDownload: () => void;
}

/**
 * Floating bulk-action toast. Slides up from the bottom centre whenever at
 * least one row is selected.
 */
export default function SelectionBar({ count, onClear, onDelete, onDownload }: Props) {
  if (count === 0) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 animate-[rise_180ms_cubic-bezier(0.22,1,0.36,1)]"
    >
      <div className="flex items-center gap-2 bg-bg-elev border border-line-strong rounded shadow-2xl pl-4 pr-2 py-2">
        <span className="badge badge-warn font-mono">{count}</span>
        <span className="text-[13px] text-ink mr-2">
          {count === 1 ? "record selected" : "records selected"}
        </span>

        <button
          onClick={onDownload}
          className="btn-ghost text-[12px]"
          title="Download selected records as JSON"
        >
          <Download size={13} /> Download JSON
        </button>

        <button
          onClick={onDelete}
          className="btn-ghost text-[12px] border-err text-err hover:bg-err-bg"
          title="Delete selected records"
        >
          <Trash2 size={13} /> Delete
        </button>

        <button
          onClick={onClear}
          className="btn-icon"
          aria-label="Clear selection"
          title="Clear selection"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
