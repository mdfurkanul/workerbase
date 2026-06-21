import { useState } from "react";
import { Save } from "lucide-react";

/**
 * Permission scopes. The semantics match PocketBase-style API rules:
 *
 *   superuser     — only superusers may perform this operation
 *   authenticated — any logged-in user may perform it
 *   public        — anyone, even anonymous requests
 */
export type PermissionScope = "superuser" | "authenticated" | "public";

export type Operation = "read" | "write" | "delete" | "view" | "list";

export type PermissionMap = Record<Operation, PermissionScope>;

export const OPERATIONS: { key: Operation; label: string; hint: string }[] = [
  { key: "view", label: "View", hint: "Read a single record by id" },
  { key: "list", label: "List", hint: "Browse / search the collection" },
  { key: "read", label: "Read", hint: "Read fields on returned records" },
  { key: "write", label: "Write", hint: "Create or update records" },
  { key: "delete", label: "Delete", hint: "Permanently remove records" },
];

const SCOPES: { key: PermissionScope; label: string }[] = [
  { key: "superuser", label: "Superuser only" },
  { key: "authenticated", label: "Anyone with auth" },
  { key: "public", label: "Public (no auth)" },
];

const DEFAULTS: PermissionMap = {
  view: "authenticated",
  list: "authenticated",
  read: "authenticated",
  write: "superuser",
  delete: "superuser",
};

function storageKey(name: string): string {
  return `workerbase.permissions.${name}`;
}

export function loadPermissions(name: string): PermissionMap {
  try {
    const raw = localStorage.getItem(storageKey(name));
    if (raw) return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<PermissionMap>) };
  } catch {
    /* ignore */
  }
  return { ...DEFAULTS };
}

interface Props {
  collectionName: string;
  onSaved?: (perms: PermissionMap) => void;
}

/**
 * Permissions grid — one row per operation, each row picks a scope.
 * Persisted to localStorage as a draft (real persistence lands with API rules).
 */
export default function CollectionSettings({ collectionName, onSaved }: Props) {
  const [perms, setPerms] = useState<PermissionMap>(() => loadPermissions(collectionName));
  const [savedAt, setSavedAt] = useState<number | null>(null);

  function setOp(op: Operation, scope: PermissionScope) {
    setPerms((p) => ({ ...p, [op]: scope }));
  }

  function save() {
    try {
      localStorage.setItem(storageKey(collectionName), JSON.stringify(perms));
    } catch {
      /* ignore */
    }
    setSavedAt(Date.now());
    onSaved?.(perms);
  }

  return (
    <div className="max-w-3xl px-6 py-6 space-y-6">
      {/* Helper banner */}
      <div className="bg-surface border border-line rounded px-4 py-3 text-[13px] text-ink-muted leading-relaxed">
        Each operation below is granted to a scope. <span className="text-ink">Superuser</span> always
        bypasses these rules. Drafts are saved locally until the backend API-rule endpoint ships.
      </div>

      {/* Grid */}
      <section className="bg-surface border border-line rounded overflow-hidden">
        <header className="grid grid-cols-[1.4fr_1fr_1fr_1fr] px-4 py-2.5 hairline-b bg-surface-2 label-mono">
          <span>Operation</span>
          {SCOPES.map((s) => (
            <span key={s.key} className="text-center">{s.label}</span>
          ))}
        </header>
        <div className="divide-y divide-line">
          {OPERATIONS.map((op) => (
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
                      onChange={() => setOp(op.key, s.key)}
                      className="accent-brand w-4 h-4"
                    />
                  </label>
                );
              })}
            </div>
          ))}
        </div>
      </section>

      {/* Summary + save */}
      <div className="flex items-center justify-between pt-4 hairline-t">
        <div className="text-[12px] text-ink-muted">
          {savedAt ? (
            <span>
              Saved <span className="text-ink">{new Date(savedAt).toLocaleTimeString()}</span>
            </span>
          ) : (
            <span>Unsaved changes are stored locally as drafts.</span>
          )}
        </div>
        <button onClick={save} className="btn-primary">
          <Save size={14} /> Save permissions
        </button>
      </div>
    </div>
  );
}
