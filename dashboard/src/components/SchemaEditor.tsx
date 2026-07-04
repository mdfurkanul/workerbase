import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { FieldType } from "@/lib/fieldTypes";
import {
  AddFieldButton,
  FieldRow,
  MultiSelectColumns,
  uuid,
  type Field,
  type FieldOpts,
  type IndexDef,
  type ConstraintDef,
  type SchemaData,
} from "@/components/fields";

/* ─── SchemaEditor component ────────────────────────────────────────
 * Reusable schema editor used by the EditPanel for existing collections.
 * (NewCollection.tsx has its own inline editor that shares the same
 *  field primitives via the @/components/fields barrel.)
 *
 * Re-exports shared types for legacy import sites.
 * ─────────────────────────────────────────────────────────────────── */
export type { Field, FieldOpts, IndexDef, ConstraintDef, SchemaData };

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
    const next = [...fields];
    // Insert before the trailing block of system-managed fields
    // (auto: created/updated, authField: email/password) so they stay at the end.
    // `id` (locked + primaryKey) is a LEADING system field and stays at index 0.
    let insertAt = next.length;
    for (let i = next.length - 1; i >= 0; i--) {
      if (next[i]!.auto || next[i]!.authField) insertAt = i;
      else break;
    }
    next.splice(insertAt, 0, f);
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
    // Trailing system-managed fields (auto + authField) don't move, and
    // regular fields can't cross into the trailing block.
    const field = fields[idx]!;
    const targetField = fields[target]!;
    if (field.auto || field.authField || field.locked) return;
    if (targetField.auto || targetField.authField) return;
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
              isLast={
                idx === fields.length - 1 ||
                (!!fields[idx + 1] && (!!fields[idx + 1]!.auto || !!fields[idx + 1]!.authField))
              }
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
