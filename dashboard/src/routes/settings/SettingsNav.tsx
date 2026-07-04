import { LABELS, NAV, type SectionId } from "./types";

export function SettingsNav({
  active,
  onSelect,
}: {
  active: SectionId;
  onSelect: (s: SectionId) => void;
}) {
  return (
    <aside className="bg-bg-elev hairline-r overflow-y-auto">
      <div className="px-4 pt-4 pb-3">
        <span className="font-display italic text-lg">Settings</span>
      </div>
      <nav className="px-2 pb-4 space-y-4">
        {NAV.map((group) => (
          <div key={group.label}>
            <div className="px-2 pb-1.5">
              <span className="label-mono text-ink-faint">{group.label}</span>
            </div>
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const isActive = item.id === active;
                return (
                  <li key={item.id}>
                    <button
                      onClick={() => onSelect(item.id)}
                      className={[
                        "w-full flex items-center gap-2 px-2 py-1.5 rounded text-[13px] font-mono transition",
                        isActive
                          ? "bg-surface-2 text-ink"
                          : "text-ink-muted hover:bg-surface-2 hover:text-ink",
                      ].join(" ")}
                    >
                      <span className="opacity-80">{item.icon}</span>
                      <span className="truncate">{item.label}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
    </aside>
  );
}

export function Breadcrumb({ section }: { section: SectionId }) {
  return (
    <div className="mb-8">
      <div className="label-mono">Settings / {LABELS[section]}</div>
      <h1 className="font-display text-3xl mt-2">{LABELS[section]}</h1>
    </div>
  );
}
