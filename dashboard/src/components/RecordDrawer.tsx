import { useEffect, useState } from "react";
import { Loader2, X } from "lucide-react";

interface DetailEntry {
  key: string;
  value: unknown;
}

interface Props {
  open: boolean;
  /** Collection name + record id used to fetch details. */
  collectionName: string;
  recordId: string | null;
  /** Optional precomputed snapshot shown immediately while loading. */
  snapshot?: DetailEntry[];
  onClose: () => void;
}

/**
 * Right-side slide-in drawer that displays a single record's full details.
 *
 * For now this loads data from a dummy async source (mock + setTimeout) so
 * the UX is identical to the real /api/collections/:name/records/:id call.
 */
export default function RecordDrawer({
  open,
  collectionName,
  recordId,
  snapshot,
  onClose,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState<DetailEntry[] | null>(null);

  // Reset + simulated fetch whenever a new record is opened.
  useEffect(() => {
    if (!open || !recordId) return;
    setLoading(true);
    setDetail(null);

    const cancel = { current: false };
    const timer = setTimeout(() => {
      if (cancel.current) return;
      // Dummy: prefer the snapshot, otherwise synthesize from the id.
      const data =
        snapshot && snapshot.length > 0
          ? snapshot
          : ([
              { key: "id", value: recordId },
              { key: "email", value: `${recordId.toLowerCase()}@example.com` },
              { key: "verified", value: true },
              { key: "created", value: new Date().toISOString() },
              { key: "updated", value: new Date().toISOString() },
            ] as DetailEntry[]);
      setDetail(data);
      setLoading(false);
    }, 400);

    return () => {
      cancel.current = true;
      clearTimeout(timer);
    };
  }, [open, recordId, snapshot]);

  // Esc to close.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        aria-hidden
        className={`fixed inset-0 z-40 transition-opacity duration-200 ${
          open ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        style={{ background: "var(--overlay)" }}
      />

      {/* Panel */}
      <aside
        role="dialog"
        aria-label={`Record ${recordId ?? ""}`}
        aria-modal="true"
        className={`fixed top-0 right-0 z-50 h-full w-full max-w-md bg-bg-elev hairline-l shadow-2xl flex flex-col transition-transform duration-200 ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Header */}
        <header className="px-4 py-3 hairline-b flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="label-mono">Collection · {collectionName}</div>
            <div className="font-mono text-[14px] text-ink truncate mt-0.5">
              {recordId ?? "—"}
            </div>
          </div>
          <button onClick={onClose} className="btn-icon" aria-label="Close drawer">
            <X size={16} />
          </button>
        </header>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 py-4">
          {loading ? (
            <LoadingSkeleton />
          ) : detail ? (
            <dl className="bg-surface border border-line rounded divide-y divide-line">
              {detail.map(({ key, value }) => (
                <div
                  key={key}
                  className="grid grid-cols-[140px_1fr] gap-3 px-3 py-2.5 items-start"
                >
                  <dt className="font-mono text-[12px] text-ink-muted pt-0.5">{key}</dt>
                  <dd className="text-[13px] break-words">
                    <DetailValue value={value} />
                  </dd>
                </div>
              ))}
            </dl>
          ) : (
            <div className="text-center text-ink-muted text-[13px] py-10">
              No record selected.
            </div>
          )}
        </div>

        {/* Footer actions */}
        {detail && !loading && (
          <footer className="px-4 py-3 hairline-t flex items-center justify-end gap-2">
            <button className="btn-ghost text-[12px]">Edit</button>
            <button
              className="btn-ghost text-[12px] border-err text-err hover:bg-err-bg"
              title="Delete record"
            >
              Delete
            </button>
          </footer>
        )}
      </aside>
    </>
  );
}

function DetailValue({ value }: { value: unknown }) {
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
  if (typeof value === "string" && value.startsWith("http")) {
    return (
      <a
        href={value}
        target="_blank"
        rel="noreferrer"
        className="text-brand hover:underline break-all"
      >
        {value}
      </a>
    );
  }
  return <span className="text-ink">{String(value)}</span>;
}

function LoadingSkeleton() {
  return (
    <div className="bg-surface border border-line rounded divide-y divide-line">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="grid grid-cols-[140px_1fr] gap-3 px-3 py-3">
          <div className="h-3 rounded bg-surface-2 animate-pulse" />
          <div
            className="h-3 rounded bg-surface-2 animate-pulse"
            style={{ width: `${60 + ((i * 7) % 30)}%` }}
          />
        </div>
      ))}
      <div className="px-3 py-2 flex items-center gap-2 text-[11px] text-ink-faint">
        <Loader2 size={11} className="animate-spin" />
        <span className="font-mono">fetching /api/collections/.../records/&lt;id&gt;</span>
      </div>
    </div>
  );
}
