import type { CollectionType } from "@/lib/types";

/* ─── API Rules editor ────────────────────────────────────────────── */
const OPERATIONS = [
  { key: "view", label: "View", hint: "Read a single record by id" },
  { key: "list", label: "List", hint: "Browse / search the collection" },
  { key: "read", label: "Read", hint: "Read fields on returned records" },
  { key: "write", label: "Write", hint: "Create or update records" },
  { key: "delete", label: "Delete", hint: "Permanently remove records" },
] as const;

const SCOPES = [
  { key: "superuser", label: "Superuser only" },
  { key: "authenticated", label: "Anyone with auth" },
  { key: "public", label: "Public (no auth)" },
] as const;

export function RulesEditor({
  perms,
  onChange,
  collectionType,
}: {
  perms: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
  collectionType: CollectionType;
}) {
  // Views are read-only — hide write/delete operations.
  const ops = collectionType === "view"
    ? OPERATIONS.filter((o) => o.key === "view" || o.key === "list" || o.key === "read")
    : OPERATIONS;

  return (
    <section className="space-y-4">
      <div className="bg-surface border border-line rounded px-4 py-3 text-[13px] text-ink-muted leading-relaxed">
        Each operation is granted to a scope. <span className="text-ink">Superuser</span> always
        bypasses these rules. Rules are stored as part of the collection definition and applied
        to every API request.
      </div>

      <div className="bg-surface border border-line rounded overflow-hidden">
        {/* Header */}
        <div className="grid grid-cols-[1.4fr_1fr_1fr_1fr] px-4 py-2.5 hairline-b bg-surface-2 label-mono">
          <span>Operation</span>
          {SCOPES.map((s) => (
            <span key={s.key} className="text-center">{s.label}</span>
          ))}
        </div>

        {/* Rows */}
        <div className="divide-y divide-line">
          {ops.map((op) => (
            <div
              key={op.key}
              className="grid grid-cols-[1.4fr_1fr_1fr_1fr] px-4 py-3 items-center"
            >
              <div>
                <div className="text-[14px] text-ink font-medium">{op.label}</div>
                <div className="text-[12px] text-ink-faint">{op.hint}</div>
              </div>
              {SCOPES.map((s) => {
                const checked = perms[op.key] === s.key;
                return (
                  <label
                    key={s.key}
                    className="flex items-center justify-center cursor-pointer"
                    title={s.label}
                  >
                    <input
                      type="radio"
                      name={`op-${op.key}`}
                      checked={checked}
                      onChange={() => onChange({ ...perms, [op.key]: s.key })}
                      className="accent-brand w-4 h-4"
                    />
                  </label>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Summary preview */}
      <div className="bg-surface border border-line rounded p-4">
        <span className="label-mono">Preview · curl examples</span>
        <pre className="mt-2 text-[12px] font-mono text-ink-muted overflow-x-auto leading-relaxed">
{`# List (scope: ${perms.list})
curl ${"https://…"}/api/collections/${"{name}"}/records${perms.list === "public" ? "" : `  # ${perms.list}`}

# View (scope: ${perms.view})
curl ${"https://…"}/api/collections/${"{name}"}/records/${"{id}"}${perms.view === "public" ? "" : `  # ${perms.view}`}

# Write (scope: ${perms.write})
curl -X POST ${"https://…"}/api/collections/${"{name}"}/records ${perms.write === "public" ? "# public" : `# ${perms.write}`}`}
        </pre>
      </div>
    </section>
  );
}
