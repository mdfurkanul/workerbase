import type { ReactNode } from "react";
import { FileText } from "lucide-react";

/* ─── Page header ──────────────────────────────────────────────────── */
export function PageHeader({
  breadcrumbs,
  actions,
}: {
  breadcrumbs: ReactNode[];
  actions?: ReactNode;
}) {
  return (
    <div className="px-6 py-3 hairline-b flex items-center justify-between gap-4 bg-bg-elev">
      <nav className="flex items-center gap-2 text-[14px] min-w-0">
        {breadcrumbs.map((b, i) => (
          <span key={i} className="flex items-center gap-2 min-w-0">
            {i > 0 && <span className="text-ink-faint">/</span>}
            <span className={i === breadcrumbs.length - 1 ? "text-ink truncate" : "text-ink-muted truncate"}>{b}</span>
          </span>
        ))}
      </nav>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}

/* ─── Empty-state placeholder ──────────────────────────────────────── */
export function EmptyState({
  icon,
  title,
  hint,
}: {
  icon: ReactNode;
  title: string;
  hint?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-12 h-12 rounded-full bg-surface-2 flex items-center justify-center text-ink-muted mb-3">
        {icon}
      </div>
      <h3 className="text-[15px] font-medium text-ink">{title}</h3>
      {hint && <p className="text-[13px] text-ink-muted mt-1 max-w-sm">{hint}</p>}
    </div>
  );
}

/* re-export for convenience */
export { FileText };
