import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";

interface SlideOverProps {
  open: boolean;
  title: ReactNode;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  /** Drawer width — default 560. */
  width?: number;
}

/**
 * Wide right-side slide-in drawer for panels (Edit, Settings, New record).
 * Heavier than the RecordDrawer; meant for form-heavy content.
 */
export default function SlideOver({
  open,
  title,
  subtitle,
  onClose,
  children,
  footer,
  width = 560,
}: SlideOverProps) {
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
        aria-modal="true"
        className={`fixed top-0 right-0 z-50 h-full bg-bg-elev hairline-l shadow-2xl flex flex-col transition-transform duration-200 ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
        style={{ width: `min(${width}px, 100vw)` }}
      >
        {/* Header */}
        <header className="px-5 py-3 hairline-b flex items-center justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <div className="text-[15px] font-medium text-ink truncate">{title}</div>
            {subtitle && (
              <div className="label-mono mt-0.5 truncate">{subtitle}</div>
            )}
          </div>
          <button onClick={onClose} className="btn-icon" aria-label="Close">
            <X size={18} />
          </button>
        </header>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <footer className="px-5 py-3 hairline-t flex items-center justify-end gap-2 shrink-0">
            {footer}
          </footer>
        )}
      </aside>
    </>
  );
}
