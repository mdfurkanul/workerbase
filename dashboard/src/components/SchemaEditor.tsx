import { useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  Copy,
  KeyRound,
  Lock,
  Plus,
  Settings2,
  Trash2,
  X,
} from "lucide-react";
import {
  groupedFieldTypes,
  fieldTypeMeta,
  CATEGORY_LABELS,
  type FieldType,
} from "@/lib/fieldTypes";

/* ─── Types (shared) ──────────────────────────────────────────────── */
export interface FieldOpts {
  min?: number;
  max?: number;
  multiple?: boolean;
  target?: string;
  relationType?: "single" | "multiple";
  choices?: string[];
  includeTime?: boolean;
}

export interface Field {
  cid: string;
  name: string;
  type: FieldType;
  required: boolean;
  unique: boolean;
  hidden: boolean;
  options: FieldOpts;
  locked?: boolean;
  primaryKey?: boolean;
  auto?: boolean;
  defaultValue?: string;
}

export interface IndexDef {
  cid: string;
  name: string;
  columns: string[];
  unique: boolean;
}

export interface ConstraintDef {
  cid: string;
  columns: string[];
}

export interface SchemaData {
  fields: Field[];
  indexes: IndexDef[];
  constraints: ConstraintDef[];
}

function uuid(): string {
  return Math.random().toString(36).slice(2, 12) + Date.now().toString(36);
}

/* ─── SchemaEditor component ──────────────────────────────────────── */
interface Props {
  initialFields: Field[];
  initialIndexes?: IndexDef[];
  initialConstraints?: ConstraintDef[];
  onDataChange?: (data: SchemaData) => void;
}

export default function SchemaEditor({
  initialFields,
  initialIndexes = [],
  initialConstraints = [],
  onDataChange,
}: Props) {
  const [fields, setFields] = useState<Field[]>(initialFields);
  const [indexes, setIndexes] = useState<IndexDef[]>(initialIndexes);
  const [constraints, setConstraints] = useState<ConstraintDef[]>(initialConstraints);
  const [expanded, setExpanded] = useState<string | null>(null);

  // Emit changes upward.
  function emit(next: SchemaData) {
    onDataChange?.(next);
  }

  /* ─── Field ops ─────────────────────────────────────────────────── */
  function addField(t: FieldType) {
    const f: Field = {
      cid: uuid(),
      name: "",
      type: t,
      required: false,
      unique: false,
      hidden: false,
      options: {},
    };
    const next = [...fields, f];
    setFields(next);
    setExpanded(f.cid);
    emit({ fields: next, indexes, constraints });
  }

  function patchField(cid: string, p: Partial<Field>) {
    const next = fields.map((f) => (f.cid === cid ? { ...f, ...p } : f));
    setFields(next);
    emit({ fields: next, indexes, constraints });
  }

  function patchOpt(cid: string, p: Partial<FieldOpts>) {
    const next = fields.map((f) =>
      f.cid === cid ? { ...f, options: { ...f.options, ...p } } : f,
    );
    setFields(next);
    emit({ fields: next, indexes, constraints });
  }

  function removeField(cid: string) {
    const next = fields.filter((f) => f.cid !== cid);
    setFields(next);
    if (expanded === cid) setExpanded(null);
    emit({ fields: next, indexes, constraints });
  }

  function duplicateField(cid: string) {
    const idx = fields.findIndex((f) => f.cid === cid);
    if (idx < 0) return;
    const src = fields[idx]!;
    const copy: Field = {
      ...src,
      cid: uuid(),
      name: `${src.name || "field"}_copy`,
      locked: false,
      primaryKey: false,
      auto: false,
      unique: false,
    };
    const next = [...fields];
    next.splice(idx + 1, 0, copy);
    setFields(next);
    emit({ fields: next, indexes, constraints });
  }

  function moveField(cid: string, dir: -1 | 1) {
    const idx = fields.findIndex((f) => f.cid === cid);
    const target = idx + dir;
    if (idx < 0 || target < 0 || target >= fields.length) return;
    const firstEditable = fields.findIndex((f) => !f.locked);
    if (target < firstEditable) return;
    const next = [...fields];
    const [item] = next.splice(idx, 1);
    next.splice(target, 0, item!);
    setFields(next);
    emit({ fields: next, indexes, constraints });
  }

  /* ─── Index / constraint ops ────────────────────────────────────── */
  function addIndex() {
    const next = [...indexes, { cid: uuid(), name: `idx_${indexes.length + 1}`, columns: [], unique: false }];
    setIndexes(next);
    emit({ fields, indexes: next, constraints });
  }
  function patchIndex(cid: string, p: Partial<IndexDef>) {
    const next = indexes.map((i) => (i.cid === cid ? { ...i, ...p } : i));
    setIndexes(next);
    emit({ fields, indexes: next, constraints });
  }
  function removeIndex(cid: string) {
    const next = indexes.filter((i) => i.cid !== cid);
    setIndexes(next);
    emit({ fields, indexes: next, constraints });
  }

  function addConstraint() {
    const next = [...constraints, { cid: uuid(), columns: [] }];
    setConstraints(next);
    emit({ fields, indexes, constraints: next });
  }
  function patchConstraint(cid: string, columns: string[]) {
    const next = constraints.map((c) => (c.cid === cid ? { ...c, columns } : c));
    setConstraints(next);
    emit({ fields, indexes, constraints: next });
  }
  function removeConstraint(cid: string) {
    const next = constraints.filter((c) => c.cid !== cid);
    setConstraints(next);
    emit({ fields, indexes, constraints: next });
  }

  const fieldNames = fields.map((f) => f.name).filter(Boolean);

  return (
    <div className="space-y-6">
      {/* Fields list */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="label-mono">
            Schema · {fields.length} fields
          </span>
          <AddFieldButton onAdd={addField} />
        </div>

        <div className="space-y-2">
          {fields.map((f, idx) => (
            <FieldRow
              key={f.cid}
              field={f}
              isFirstEditable={idx === fields.findIndex((x) => !x.locked)}
              isLast={idx === fields.length - 1}
              expanded={expanded === f.cid}
              onToggleExpand={() => setExpanded((cur) => (cur === f.cid ? null : f.cid))}
              onPatch={(p) => patchField(f.cid, p)}
              onPatchOpt={(p) => patchOpt(f.cid, p)}
              onRemove={() => removeField(f.cid)}
              onDuplicate={() => duplicateField(f.cid)}
              onMoveUp={() => moveField(f.cid, -1)}
              onMoveDown={() => moveField(f.cid, 1)}
            />
          ))}
        </div>

        <p className="text-[12px] text-ink-faint">
          <span className="font-mono text-ink">id</span> is the auto-managed
          primary key and cannot be removed.{" "}
          <span className="font-mono text-ink">created</span> /{" "}
          <span className="font-mono text-ink">updated</span> are optional —
          delete or move them freely.
        </p>
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
              <div key={c.cid} className="grid grid-cols-[1fr_auto] gap-2 items-center bg-surface border border-line rounded p-2">
                <MultiSelectColumns
                  value={c.columns}
                  options={fieldNames}
                  onChange={(cols) => patchConstraint(c.cid, cols)}
                />
                <button type="button" onClick={() => removeConstraint(c.cid)} className="btn-icon" title="Remove">
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
              <div key={i.cid} className="grid grid-cols-[1fr_2fr_auto_auto] gap-2 items-center bg-surface border border-line rounded p-2">
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
                <button type="button" onClick={() => removeIndex(i.cid)} className="btn-icon" title="Remove">
                  <Trash2 size={14} />
                </button>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}

/* ─── Add-field dropdown ──────────────────────────────────────────── */
function AddFieldButton({ onAdd }: { onAdd: (t: FieldType) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const groups = useMemo(() => groupedFieldTypes(), []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return groups;
    return groups
      .map((g) => ({
        ...g,
        items: g.items.filter(
          (m) =>
            m.label.toLowerCase().includes(q) ||
            m.value.toLowerCase().includes(q) ||
            m.description.toLowerCase().includes(q),
        ),
      }))
      .filter((g) => g.items.length > 0);
  }, [groups, query]);

  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen((v) => !v)} className="btn-primary text-[12px]">
        <Plus size={12} /> Add field
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onMouseDown={() => { setOpen(false); setQuery(""); }} />
          <div className="absolute right-0 mt-1 w-[340px] bg-surface border border-line-strong rounded-md shadow-2xl z-40 overflow-hidden">
            <div className="px-2.5 py-2 hairline-b">
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search field types…"
                className="field-input text-[13px]"
              />
            </div>
            <div className="max-h-[360px] overflow-y-auto py-1.5 px-2 space-y-2.5">
              {filtered.length === 0 ? (
                <div className="px-2 py-6 text-center text-[12px] text-ink-faint">
                  No field types match "{query}".
                </div>
              ) : (
                filtered.map((g) => (
                  <div key={g.category}>
                    <div className="px-1.5 pb-1">
                      <span className="label-mono text-ink-faint">{CATEGORY_LABELS[g.category]}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-1">
                      {g.items.map((m) => {
                        const Icon = m.Icon;
                        return (
                          <button
                            key={m.value}
                            type="button"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              onAdd(m.value);
                              setOpen(false);
                              setQuery("");
                            }}
                            className="group flex items-start gap-2 p-2 rounded border border-transparent hover:border-brand hover:bg-brand/10 transition text-left"
                            title={m.description}
                          >
                            <span className="w-7 h-7 rounded bg-surface-2 group-hover:bg-brand group-hover:text-white text-ink-muted flex items-center justify-center shrink-0 transition-colors">
                              <Icon size={13} />
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="text-[12px] font-medium text-ink truncate">{m.label}</div>
                              <div className="text-[10px] text-ink-faint truncate leading-tight">{m.description}</div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* ─── Single field row ────────────────────────────────────────────── */
function FieldRow({
  field,
  isFirstEditable,
  isLast,
  expanded,
  onToggleExpand,
  onPatch,
  onPatchOpt,
  onRemove,
  onDuplicate,
  onMoveUp,
  onMoveDown,
}: {
  field: Field;
  isFirstEditable: boolean;
  isLast: boolean;
  expanded: boolean;
  onToggleExpand: () => void;
  onPatch: (p: Partial<Field>) => void;
  onPatchOpt: (p: Partial<FieldOpts>) => void;
  onRemove: () => void;
  onDuplicate: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const locked = !!field.locked;
  const meta = fieldTypeMeta(field.type);
  const Icon = meta.Icon;

  return (
    <div className={`rounded border ${locked ? "bg-brand-dim/30 border-brand/40" : "bg-surface border-line"}`}>
      <div className="grid grid-cols-[auto_1.4fr_1fr_auto] gap-2 items-center p-2">
        <div className={`w-7 h-7 rounded flex items-center justify-center shrink-0 ${locked ? "bg-brand-dim text-brand" : "bg-surface-2 text-ink-muted"}`}>
          {field.primaryKey ? <KeyRound size={13} /> : <Icon size={13} />}
        </div>
        <input
          required
          disabled={locked}
          pattern="[a-zA-Z_][a-zA-Z0-9_]*"
          placeholder="field_name"
          value={field.name}
          onChange={(e) => onPatch({ name: e.target.value })}
          className="field-input font-mono text-[13px]"
        />
        {locked ? (
          <span className="font-mono text-[12px] text-ink-muted uppercase tracking-widest px-2">
            {field.auto ? "auto" : "primary"} · {field.type}
          </span>
        ) : (
          <div className="flex items-center gap-1.5">
            <select
              value={field.type}
              onChange={(e) => onPatch({ type: e.target.value as FieldType })}
              className="field-input text-[13px] flex-1"
            >
              <FieldTypeOptions />
            </select>
            {field.auto && (
              <span className="badge badge-warn shrink-0" title="Auto-managed by the backend">AUTO</span>
            )}
          </div>
        )}
        <div className="flex items-center gap-0.5 shrink-0">
          {!locked && (
            <>
              <button type="button" onClick={onToggleExpand} className={`btn-icon ${expanded ? "text-brand" : ""}`} title="Field settings">
                <Settings2 size={13} />
              </button>
              <button type="button" onClick={onMoveUp} disabled={isFirstEditable} className="btn-icon disabled:opacity-30 disabled:cursor-not-allowed" title="Move up">
                <ArrowUp size={13} />
              </button>
              <button type="button" onClick={onMoveDown} disabled={isLast} className="btn-icon disabled:opacity-30 disabled:cursor-not-allowed" title="Move down">
                <ArrowDown size={13} />
              </button>
              <button type="button" onClick={onDuplicate} className="btn-icon" title="Duplicate">
                <Copy size={13} />
              </button>
              <button type="button" onClick={onRemove} className="btn-icon" title="Remove">
                <Trash2 size={13} />
              </button>
            </>
          )}
          {locked && (
            <span className="px-2 text-[11px] text-ink-faint font-mono uppercase tracking-widest inline-flex items-center gap-1">
              <Lock size={11} /> system
            </span>
          )}
        </div>
      </div>
      {!locked && !expanded && (
        <div className="px-2 pb-2 -mt-1 flex items-center gap-3 text-[11px] text-ink-faint">
          <label className="inline-flex items-center gap-1 cursor-pointer">
            <input type="checkbox" checked={field.required} onChange={(e) => onPatch({ required: e.target.checked })} className="accent-brand" />
            Required
          </label>
          <label className="inline-flex items-center gap-1 cursor-pointer">
            <input type="checkbox" checked={field.unique} onChange={(e) => onPatch({ unique: e.target.checked })} className="accent-brand" />
            Unique
          </label>
          <label className="inline-flex items-center gap-1 cursor-pointer">
            <input type="checkbox" checked={field.hidden} onChange={(e) => onPatch({ hidden: e.target.checked })} className="accent-brand" />
            Hidden
          </label>
        </div>
      )}
      {!locked && expanded && (
        <div className="px-3 pb-3 pt-1 hairline-t mt-1 space-y-3 bg-bg-elev/60">
          <FieldSettings field={field} onPatch={onPatch} onPatchOpt={onPatchOpt} />
        </div>
      )}
    </div>
  );
}

/* ─── Settings panel ──────────────────────────────────────────────── */
function FieldSettings({
  field,
  onPatch,
  onPatchOpt,
}: {
  field: Field;
  onPatch: (p: Partial<Field>) => void;
  onPatchOpt: (p: Partial<FieldOpts>) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        <ToggleCheck label="Required" checked={field.required} onChange={(v) => onPatch({ required: v })} />
        <ToggleCheck label="Unique" checked={field.unique} onChange={(v) => onPatch({ unique: v })} />
        <ToggleCheck label="Hidden" checked={field.hidden} onChange={(v) => onPatch({ hidden: v })} />
      </div>
      <DefaultValueInput field={field} onPatch={onPatch} />
      {(field.type === "text" || field.type === "editor" || field.type === "phone" || field.type === "url" || field.type === "email") && (
        <div className="grid grid-cols-2 gap-2">
          <NumberInput label="Min length" value={field.options.min} onChange={(v) => onPatchOpt({ min: v })} />
          <NumberInput label="Max length" value={field.options.max} onChange={(v) => onPatchOpt({ max: v })} />
        </div>
      )}
      {(field.type === "integer" || field.type === "real") && (
        <div className="grid grid-cols-2 gap-2">
          <NumberInput label="Min value" value={field.options.min} onChange={(v) => onPatchOpt({ min: v })} />
          <NumberInput label="Max value" value={field.options.max} onChange={(v) => onPatchOpt({ max: v })} />
        </div>
      )}
      {field.type === "date" && (
        <ToggleCheck label="Include time" checked={!!field.options.includeTime} onChange={(v) => onPatchOpt({ includeTime: v })} />
      )}
      {(field.type === "file" || field.type === "files") && (
        <div className="grid grid-cols-2 gap-2">
          <NumberInput label="Max size (MB)" value={field.options.max} onChange={(v) => onPatchOpt({ max: v })} />
          {field.type === "files" && (
            <NumberInput label="Max files" value={field.options.min} onChange={(v) => onPatchOpt({ min: v })} />
          )}
        </div>
      )}
      {field.type === "relation" && (
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="label-mono">Target collection</span>
            <input list="all-collections" value={field.options.target ?? ""} onChange={(e) => onPatchOpt({ target: e.target.value })} placeholder="users" className="field-input mt-1 font-mono text-[13px]" />
            <datalist id="all-collections">
              <option value="users" /><option value="clients" /><option value="posts" /><option value="invoices" />
            </datalist>
          </label>
          <label className="block">
            <span className="label-mono">Cardinality</span>
            <select value={field.options.relationType ?? "single"} onChange={(e) => onPatchOpt({ relationType: e.target.value as "single" | "multiple" })} className="field-input mt-1 text-[13px]">
              <option value="single">Single (1:1)</option>
              <option value="multiple">Multiple (1:N)</option>
            </select>
          </label>
        </div>
      )}
      {field.type === "select" && (
        <ChoiceEditor choices={field.options.choices ?? []} onChange={(choices) => onPatchOpt({ choices })} />
      )}
      {field.type === "geo" && (
        <p className="text-[12px] text-ink-faint">Stores a <span className="font-mono">latitude</span> and <span className="font-mono">longitude</span> pair.</p>
      )}
      {field.type === "json" && (
        <p className="text-[12px] text-ink-faint">Free-form JSON stored as TEXT.</p>
      )}
      {field.type === "bool" && (
        <p className="text-[12px] text-ink-faint">Stored as 0/1 INTEGER.</p>
      )}
    </div>
  );
}

function ToggleCheck({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 px-3 py-2 rounded bg-surface-2 cursor-pointer text-[12px] text-ink">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="accent-brand" />
      {label}
    </label>
  );
}

function NumberInput({ label, value, onChange }: { label: string; value?: number; onChange: (v: number | undefined) => void }) {
  return (
    <label className="block">
      <span className="label-mono">{label}</span>
      <input type="number" value={value ?? ""} onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))} className="field-input mt-1 font-mono text-[13px]" />
    </label>
  );
}

function DefaultValueInput({ field, onPatch }: { field: Field; onPatch: (p: Partial<Field>) => void }) {
  const skip = ["file", "files", "relation", "select", "json", "geo", "editor"];
  if (skip.includes(field.type)) {
    return <div className="flex items-center px-3 py-2 rounded bg-surface-2 text-[11px] text-ink-faint">No default for this type.</div>;
  }
  if (field.type === "bool") {
    return (
      <label className="block">
        <span className="label-mono">Default</span>
        <select value={field.defaultValue ?? ""} onChange={(e) => onPatch({ defaultValue: e.target.value || undefined })} className="field-input mt-1 text-[13px]">
          <option value="">— none —</option>
          <option value="true">true</option>
          <option value="false">false</option>
        </select>
      </label>
    );
  }
  const isNumeric = field.type === "integer" || field.type === "real";
  return (
    <label className="block">
      <span className="label-mono">Default value</span>
      <input type={isNumeric ? "number" : "text"} value={field.defaultValue ?? ""} onChange={(e) => onPatch({ defaultValue: e.target.value || undefined })} placeholder={isNumeric ? "0" : "Enter a default…"} className="field-input mt-1 text-[13px]" />
    </label>
  );
}

function ChoiceEditor({ choices, onChange }: { choices: string[]; onChange: (next: string[]) => void }) {
  const [draft, setDraft] = useState("");
  return (
    <div className="space-y-2">
      <span className="label-mono">Choices</span>
      <div className="flex flex-wrap gap-1">
        {choices.map((c, i) => (
          <span key={`${c}-${i}`} className="inline-flex items-center gap-1 pl-2 pr-1 py-1 rounded bg-surface-2 text-[12px] font-mono">
            {c}
            <button type="button" onClick={() => onChange(choices.filter((_, j) => j !== i))} className="btn-icon w-5 h-5" aria-label={`Remove ${c}`}>
              <X size={10} />
            </button>
          </span>
        ))}
        {choices.length === 0 && <span className="text-[12px] text-ink-faint italic">No choices yet.</span>}
      </div>
      <div className="flex items-center gap-2">
        <input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && draft.trim()) { e.preventDefault(); onChange([...choices, draft.trim()]); setDraft(""); } }} placeholder="Type a choice, press Enter" className="field-input text-[13px] flex-1" />
        <button type="button" onClick={() => { if (!draft.trim()) return; onChange([...choices, draft.trim()]); setDraft(""); }} className="btn-ghost text-[12px]">Add</button>
      </div>
    </div>
  );
}

function FieldTypeOptions() {
  const groups = groupedFieldTypes();
  return (
    <>
      {groups.map((g) => (
        <optgroup key={g.category} label={CATEGORY_LABELS[g.category]}>
          {g.items.map((m) => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
        </optgroup>
      ))}
    </>
  );
}

function MultiSelectColumns({ value, options, onChange }: { value: string[]; options: string[]; onChange: (next: string[]) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative" onBlur={() => setTimeout(() => setOpen(false), 120)}>
      <button type="button" onClick={() => setOpen((v) => !v)} className="field-input text-[12px] font-mono text-left flex items-center justify-between">
        <span className="truncate">{value.length === 0 ? <span className="text-ink-faint">Select columns…</span> : value.join(", ")}</span>
        <ChevronDown size={12} className="text-ink-faint shrink-0" />
      </button>
      {open && (
        <div className="absolute z-30 mt-1 w-full bg-surface border border-line-strong rounded shadow-2xl max-h-48 overflow-y-auto">
          {options.length === 0 ? (
            <div className="px-3 py-2 text-[12px] text-ink-faint">Name your fields first.</div>
          ) : (
            options.map((opt) => {
              const checked = value.includes(opt);
              return (
                <label key={opt} className="flex items-center gap-2 px-3 py-1.5 hover:bg-surface-2 cursor-pointer text-[12px] font-mono">
                  <input type="checkbox" checked={checked} onChange={() => onChange(checked ? value.filter((v) => v !== opt) : [...value, opt])} className="accent-brand" />
                  {opt}
                </label>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
