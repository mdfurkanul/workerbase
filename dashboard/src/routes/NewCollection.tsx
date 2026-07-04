import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Plus, Trash2 } from "lucide-react";
import AppShell, { PageHeader } from "@/components/AppShell";
import AuthConfig, { DEFAULT_AUTH_SETTINGS, type AuthSettings } from "@/components/AuthConfig";
import EmailTemplatesEditor, { DEFAULT_TEMPLATES, type EmailTemplates } from "@/components/EmailTemplates";
import { COLLECTION_TYPES, collectionTypeMeta } from "@/lib/collectionTypes";
import type { FieldType } from "@/lib/fieldTypes";
import type { CollectionType } from "@/lib/mockData";
import { collectionNameSchema } from "@/lib/validation";
import { useCollections } from "@/hooks/useCollections";
import {
  AddFieldButton,
  FieldRow,
  MultiSelectColumns,
  uuid,
  type Field,
  type FieldOpts,
  type IndexDef,
  type ConstraintDef,
} from "@/components/fields";

function makeSystemFields(): Field[] {
  return [
    {
      cid: uuid(),
      name: "id",
      type: "text",
      required: true,
      unique: true,
      hidden: false,
      options: {},
      locked: true,
      primaryKey: true,
    },
    {
      cid: uuid(),
      name: "created",
      type: "datetime",
      required: false,
      unique: false,
      hidden: false,
      options: { includeTime: true },
      auto: true,
    },
    {
      cid: uuid(),
      name: "updated",
      type: "datetime",
      required: false,
      unique: false,
      hidden: false,
      options: { includeTime: true },
      auto: true,
    },
  ];
}

/**
 * Auth fields shown when the collection type is "user".
 * These are auto-injected by the backend (`email` column + virtual `password`
 * that hashes into `password_hash`/`password_salt`/`token_key`). Shown locked
 * so the user knows auth collections already include them — must NOT be sent
 * in the create payload (the backend owns them).
 */
function makeAuthFields(): Field[] {
  return [
    {
      cid: uuid(),
      name: "email",
      type: "text",
      required: true,
      unique: true,
      hidden: false,
      options: {},
      locked: true,
      auto: true,
      authField: true,
    },
    {
      cid: uuid(),
      name: "password",
      type: "text",
      required: true,
      unique: false,
      hidden: true,
      options: {},
      locked: true,
      auto: true,
      authField: true,
    },
  ];
}

function blankField(type: FieldType): Field {
  return {
    cid: uuid(),
    name: "",
    type,
    required: false,
    unique: false,
    hidden: false,
    options: {},
  };
}

export default function NewCollection() {
  const navigate = useNavigate();
  const { refresh: refreshCollections } = useCollections();
  const [name, setName] = useState("");
  const [type, setType] = useState<CollectionType>("base");
  const [viewQuery, setViewQuery] = useState("");
  const [fields, setFields] = useState<Field[]>(makeSystemFields);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [indexes, setIndexes] = useState<IndexDef[]>([]);
  const [constraints, setConstraints] = useState<ConstraintDef[]>([]);
  const [tab, setTab] = useState<"schema" | "auth" | "templates" | "rules">("schema");
  const [authSettings, setAuthSettings] = useState<AuthSettings>(DEFAULT_AUTH_SETTINGS);
  const [emailTemplates, setEmailTemplates] = useState<EmailTemplates>(DEFAULT_TEMPLATES);
  const [perms, setPerms] = useState<Record<string, string>>({
    view: "authenticated",
    list: "authenticated",
    read: "authenticated",
    write: "superuser",
    delete: "superuser",
  });

  /* ─── Field ops ─────────────────────────────────────────────────── */
  function addField(t: FieldType) {
    const f = blankField(t);
    setFields((arr) => {
      // Insert before the trailing block of system-managed fields
      // (auto: created/updated, authField: email/password) so they stay at the end.
      // `id` (locked + primaryKey) is a LEADING system field and stays at index 0.
      let insertAt = arr.length;
      for (let i = arr.length - 1; i >= 0; i--) {
        if (arr[i]!.auto || arr[i]!.authField) insertAt = i;
        else break;
      }
      const next = [...arr];
      next.splice(insertAt, 0, f);
      return next;
    });
    setExpanded(f.cid);
  }

  /** Toggle collection type — auto-add/remove locked auth fields for type="user". */
  function handleTypeChange(next: CollectionType) {
    setType(next);
    setFields((arr) => {
      const withoutAuth = arr.filter((f) => !f.authField);
      if (next === "user") return [...withoutAuth, ...makeAuthFields()];
      return withoutAuth;
    });
  }

  function patch(cid: string, p: Partial<Field>) {
    setFields((arr) => arr.map((f) => (f.cid === cid ? { ...f, ...p } : f)));
  }

  function patchOpt(cid: string, p: Partial<FieldOpts>) {
    setFields((arr) =>
      arr.map((f) => (f.cid === cid ? { ...f, options: { ...f.options, ...p } } : f)),
    );
  }

  function removeField(cid: string) {
    setFields((arr) => arr.filter((f) => f.cid !== cid));
    if (expanded === cid) setExpanded(null);
  }

  function duplicateField(cid: string) {
    setFields((arr) => {
      const idx = arr.findIndex((f) => f.cid === cid);
      if (idx < 0) return arr;
      const src = arr[idx]!;
      const copy: Field = {
        ...src,
        cid: uuid(),
        name: `${src.name || "field"}_copy`,
        locked: false,
        primaryKey: false,
        auto: false,
        required: src.required,
        unique: false,
      };
      const next = [...arr];
      next.splice(idx + 1, 0, copy);
      return next;
    });
  }

  function move(cid: string, dir: -1 | 1) {
    setFields((arr) => {
      const idx = arr.findIndex((f) => f.cid === cid);
      const target = idx + dir;
      if (idx < 0 || target < 0 || target >= arr.length) return arr;
      // Don't allow moving above the locked system columns (id).
      const firstEditable = arr.findIndex((f) => !f.locked);
      if (target < firstEditable) return arr;
      // Trailing system-managed fields (auto + authField) don't move, and
      // regular fields can't cross into the trailing block.
      const field = arr[idx]!;
      const targetField = arr[target]!;
      if (field.auto || field.authField || field.locked) return arr;
      if (targetField.auto || targetField.authField) return arr;
      const next = [...arr];
      const [item] = next.splice(idx, 1);
      next.splice(target, 0, item!);
      return next;
    });
  }

  /* ─── Index / constraint ops ────────────────────────────────────── */
  function addIndex() {
    setIndexes((arr) => [
      ...arr,
      { cid: uuid(), name: `idx_${arr.length + 1}`, columns: [], unique: false },
    ]);
  }
  function patchIndex(cid: string, p: Partial<IndexDef>) {
    setIndexes((arr) => arr.map((i) => (i.cid === cid ? { ...i, ...p } : i)));
  }
  function removeIndex(cid: string) {
    setIndexes((arr) => arr.filter((i) => i.cid !== cid));
  }

  function addConstraint() {
    setConstraints((arr) => [...arr, { cid: uuid(), columns: [] }]);
  }
  function patchConstraint(cid: string, columns: string[]) {
    setConstraints((arr) => arr.map((c) => (c.cid === cid ? { ...c, columns } : c)));
  }
  function removeConstraint(cid: string) {
    setConstraints((arr) => arr.filter((c) => c.cid !== cid));
  }

  /* ─── Submit ────────────────────────────────────────────────────── */
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitError(null);

    // Build the payload matching the backend's expected shape.
    const payload: Record<string, unknown> = {
      name,
      type,
      listRule: perms.list ?? "authenticated",
      viewRule: perms.view ?? "authenticated",
      createRule: perms.write ?? "superuser",
      updateRule: perms.write ?? "superuser",
      deleteRule: perms.delete ?? "superuser",
    };

    if (type === "view") {
      payload.query = viewQuery;
    } else {
      // Map the internal Field type to the backend's FieldDefinition shape.
      // Auth fields (email, password) are visual-only — backend auto-injects them.
      // Geo fields expand to two real columns: `<name>_lat` and `<name>_lng`.
      payload.schema = fields
        .filter((f) => f.name && !f.authField)
        .flatMap((f) => {
          if (f.type === "geo") {
            const base = {
              required: f.required,
              unique: false,
              hidden: f.hidden,
              options: {},
            };
            return [
              { id: `${f.cid}_latitude`, name: `${f.name}_latitude`, type: "real", ...base },
              { id: `${f.cid}_longitude`, name: `${f.name}_longitude`, type: "real", ...base },
            ];
          }
          return [{
            id: f.cid,
            name: f.name,
            type: f.type,
            required: f.required,
            unique: f.unique,
            hidden: f.hidden,
            options: f.options,
            ...(f.defaultValue ? { default: f.defaultValue } : {}),
          }];
        });
      payload.indexes = indexes.map((i) => ({
        name: i.name,
        columns: i.columns,
        unique: i.unique,
      }));
      payload.constraints = constraints.map((c) => ({ columns: c.columns }));
    }

    if (type === "user") {
      payload.authConfig = authSettings;
      payload.emailTemplates = emailTemplates;
    }

    setSubmitting(true);
    try {
      const { apiClient } = await import("@/lib/api-client");
      await apiClient.post(`/api/core/collections`, payload);
      await refreshCollections();
      navigate(name ? `/collections?collections=${encodeURIComponent(name)}` : "/collections");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to create collection";
      setSubmitError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  const editableFields = fields.filter((f) => !f.locked);
  const fieldNames = fields.map((f) => f.name).filter(Boolean);

  return (
    <AppShell>
      <PageHeader
        breadcrumbs={[
          <Link to="/collections" className="hover:text-ink">Collections</Link>,
          <span>New</span>,
        ]}
      />

      <div className="flex-1 overflow-y-auto">
        <form onSubmit={handleSubmit} className="max-w-3xl px-6 py-6 space-y-6">
          {/* Identity — name + type on the same row */}
          <section className="space-y-3">
            <span className="label-mono">Identity</span>
            <div className="grid grid-cols-[2fr_1fr] gap-3">
              <label className="block">
                <span className="label-mono">
                  Name <span className="text-err">*</span>
                </span>
                <input
                  required
                  pattern="[a-zA-Z][a-zA-Z0-9_]*"
                  title="Alphanumeric + underscore, leading letter"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="posts"
                  className="field-input mt-1 font-mono"
                />
              </label>
              <label className="block">
                <span className="label-mono">
                  Type <span className="text-err">*</span>
                </span>
                <select
                  value={type}
                  onChange={(e) => handleTypeChange(e.target.value as CollectionType)}
                  className="field-input mt-1"
                >
                  {COLLECTION_TYPES.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <p className="text-[12px] text-ink-faint">
              {collectionTypeMeta(type).description}
            </p>
          </section>

          {/* Tab bar */}
          <div className="flex items-center gap-1 hairline-b">
            <TabBtn active={tab === "schema"} onClick={() => setTab("schema")}>
              Schema
            </TabBtn>
            {type === "user" && (
              <TabBtn active={tab === "auth"} onClick={() => setTab("auth")}>
                Auth
              </TabBtn>
            )}
            {type === "user" && (
              <TabBtn active={tab === "templates"} onClick={() => setTab("templates")}>
                Email templates
              </TabBtn>
            )}
            <TabBtn active={tab === "rules"} onClick={() => setTab("rules")}>
              API rules
            </TabBtn>
          </div>

          {tab === "schema" && (type === "view" ? (
            <section className="space-y-2">
              <span className="label-mono">SQL query</span>
              <textarea
                required
                value={viewQuery}
                onChange={(e) => setViewQuery(e.target.value)}
                placeholder="SELECT id, title FROM posts WHERE views > 100 ORDER BY views DESC"
                rows={5}
                className="field-input font-mono text-[13px]"
              />
              <p className="text-[12px] text-ink-faint">
                Read-only single SELECT. No DDL/DML. Validated server-side.
              </p>
            </section>
          ) : (
            <>
              {/* Schema — fields list */}
              <section className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="label-mono">
                    Schema · {fields.length} fields
                    {type === "user" && (
                      <span className="text-ink-faint normal-case font-normal ml-2">
                        (email &amp; password are auto-managed by the auth system)
                      </span>
                    )}
                  </span>
                  <AddFieldButton onAdd={addField} />
                </div>

                <div className="space-y-2">
                  {fields.map((f, idx) => (
                    <FieldRow
                      key={f.cid}
                      field={f}
                      isFirstEditable={idx === fields.findIndex((x) => !x.locked)}
                      isLast={
                        idx === fields.length - 1 ||
                        (!!fields[idx + 1] && (!!fields[idx + 1]!.auto || !!fields[idx + 1]!.authField))
                      }
                      expanded={expanded === f.cid}
                      onToggleExpand={() =>
                        setExpanded((cur) => (cur === f.cid ? null : f.cid))
                      }
                      onPatch={(p) => patch(f.cid, p)}
                      onPatchOpt={(p) => patchOpt(f.cid, p)}
                      onRemove={() => removeField(f.cid)}
                      onDuplicate={() => duplicateField(f.cid)}
                      onMoveUp={() => move(f.cid, -1)}
                      onMoveDown={() => move(f.cid, 1)}
                    />
                  ))}
                </div>

              </section>

              {/* Advanced — constraints + indexes */}
              <section className="space-y-4 pt-4 hairline-t">
                <span className="label-mono">Advanced</span>

                {/* Constraints */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[13px] text-ink">Unique constraints</span>
                    <button type="button" onClick={addConstraint} className="btn-ghost text-[12px]">
                      <Plus size={12} /> Add
                    </button>
                  </div>
                  {constraints.length === 0 ? (
                    <p className="text-[12px] text-ink-faint">
                      Multi-column uniqueness. e.g. (tenant_id, email).
                    </p>
                  ) : (
                    constraints.map((c) => (
                      <div
                        key={c.cid}
                        className="grid grid-cols-[1fr_auto] gap-2 items-center bg-surface border border-line rounded p-2"
                      >
                        <MultiSelectColumns
                          value={c.columns}
                          options={fieldNames}
                          onChange={(cols) => patchConstraint(c.cid, cols)}
                        />
                        <button
                          type="button"
                          onClick={() => removeConstraint(c.cid)}
                          className="btn-icon"
                          title="Remove constraint"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))
                  )}
                </div>

                {/* Indexes */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[13px] text-ink">Indexes</span>
                    <button type="button" onClick={addIndex} className="btn-ghost text-[12px]">
                      <Plus size={12} /> Add
                    </button>
                  </div>
                  {indexes.length === 0 ? (
                    <p className="text-[12px] text-ink-faint">
                      Speed up common queries — e.g. index on <span className="font-mono">created</span> for sort.
                    </p>
                  ) : (
                    indexes.map((i) => (
                      <div
                        key={i.cid}
                        className="grid grid-cols-[1fr_2fr_auto_auto] gap-2 items-center bg-surface border border-line rounded p-2"
                      >
                        <input
                          value={i.name}
                          onChange={(e) => patchIndex(i.cid, { name: e.target.value })}
                          placeholder="idx_name"
                          className="field-input font-mono text-[13px]"
                        />
                        <MultiSelectColumns
                          value={i.columns}
                          options={fieldNames}
                          onChange={(cols) => patchIndex(i.cid, { columns: cols })}
                        />
                        <label className="text-[12px] text-ink-muted flex items-center gap-1 px-1 cursor-pointer whitespace-nowrap">
                          <input
                            type="checkbox"
                            checked={i.unique}
                            onChange={(e) => patchIndex(i.cid, { unique: e.target.checked })}
                            className="accent-brand"
                          />
                          Unique
                        </label>
                        <button
                          type="button"
                          onClick={() => removeIndex(i.cid)}
                          className="btn-icon"
                          title="Remove index"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </section>
            </>
          ))} {/* end schema tab */}

          {tab === "auth" && type === "user" && (
            <AuthConfig settings={authSettings} onChange={setAuthSettings} />
          )}

          {tab === "templates" && type === "user" && (
            <EmailTemplatesEditor templates={emailTemplates} onChange={setEmailTemplates} />
          )}

          {tab === "rules" && (
            <RulesEditor perms={perms} onChange={setPerms} collectionType={type} />
          )}

          {submitError && (
            <div className="px-3 py-2 rounded bg-err-bg text-err text-[12px] font-mono border border-line-strong">
              {submitError}
            </div>
          )}

          <div className="flex items-center justify-between pt-4 hairline-t">
            <Link to="/collections" className="btn-ghost">
              ← Cancel
            </Link>
            <button type="submit" disabled={submitting} className="btn-primary">
              {submitting ? "Creating…" : (<><Plus size={14} /> Create {collectionTypeMeta(type).label.replace(" Collection", "")}</>)}
            </button>
          </div>
        </form>
      </div>
    </AppShell>
  );
}

/* ─── Tab button ──────────────────────────────────────────────────── */
function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-2.5 text-[13px] font-medium border-b-2 transition ${
        active
          ? "border-brand text-ink"
          : "border-transparent text-ink-muted hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

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

function RulesEditor({
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
