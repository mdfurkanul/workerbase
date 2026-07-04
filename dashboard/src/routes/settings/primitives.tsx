import { Save } from "lucide-react";

export function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-surface border border-line rounded">
      <header className="px-4 py-3 hairline-b label-mono">{title}</header>
      <div className="p-4 space-y-4">{children}</div>
    </section>
  );
}

export function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="label-mono">
        {label}
        {required && <span className="text-err"> *</span>}
      </span>
      {children}
      {hint && <div className="text-[12px] text-ink-faint">{hint}</div>}
    </label>
  );
}

export function SaveBar({ onSave, saving, error }: { onSave?: () => void; saving?: boolean; error?: string | null }) {
  return (
    <div className="flex items-center justify-between gap-3 pt-4">
      {error ? (
        <span className="text-[12px] text-err font-mono">{error}</span>
      ) : (
        <span className="text-[12px] text-ink-faint">{saving ? "Saving…" : ""}</span>
      )}
      <button onClick={onSave} disabled={saving} className="btn-primary disabled:opacity-50">
        <Save size={14} /> {saving ? "Saving…" : "Save changes"}
      </button>
    </div>
  );
}

export function StatusPill({
  on,
  onClick,
}: {
  on: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-mono uppercase tracking-widest border transition ${
        on
          ? "bg-ok-bg text-ok border-ok/40"
          : "bg-surface-2 text-ink-muted border-line-strong"
      }`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${on ? "bg-ok" : "bg-ink-faint"}`} />
      {on ? "Enabled" : "Disabled"}
    </button>
  );
}
