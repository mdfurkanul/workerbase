import type { Dispatch, SetStateAction } from "react";
import { Plus, Trash2 } from "lucide-react";
import {
  AddFieldButton,
  FieldRow,
  MultiSelectColumns,
  type Field,
  type IndexDef,
  type ConstraintDef,
} from "@/components/fields";
import type { FieldEditor } from "./useFieldEditor";

export function SchemaEditorTab({
  type,
  fields,
  expanded,
  setExpanded,
  indexes,
  constraints,
  fieldNames,
  ops,
}: {
  type: "base" | "user";
  fields: Field[];
  expanded: string | null;
  setExpanded: Dispatch<SetStateAction<string | null>>;
  indexes: IndexDef[];
  constraints: ConstraintDef[];
  fieldNames: string[];
  ops: FieldEditor;
}) {
  return (
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
          <AddFieldButton onAdd={ops.addField} />
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
              onPatch={(p) => ops.patch(f.cid, p)}
              onPatchOpt={(p) => ops.patchOpt(f.cid, p)}
              onRemove={() => ops.removeField(f.cid)}
              onDuplicate={() => ops.duplicateField(f.cid)}
              onMoveUp={() => ops.move(f.cid, -1)}
              onMoveDown={() => ops.move(f.cid, 1)}
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
            <button type="button" onClick={ops.addConstraint} className="btn-ghost text-[12px]">
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
                  onChange={(cols) => ops.patchConstraint(c.cid, cols)}
                />
                <button
                  type="button"
                  onClick={() => ops.removeConstraint(c.cid)}
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
            <button type="button" onClick={ops.addIndex} className="btn-ghost text-[12px]">
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
                  onChange={(e) => ops.patchIndex(i.cid, { name: e.target.value })}
                  placeholder="idx_name"
                  className="field-input font-mono text-[13px]"
                />
                <MultiSelectColumns
                  value={i.columns}
                  options={fieldNames}
                  onChange={(cols) => ops.patchIndex(i.cid, { columns: cols })}
                />
                <label className="text-[12px] text-ink-muted flex items-center gap-1 px-1 cursor-pointer whitespace-nowrap">
                  <input
                    type="checkbox"
                    checked={i.unique}
                    onChange={(e) => ops.patchIndex(i.cid, { unique: e.target.checked })}
                    className="accent-brand"
                  />
                  Unique
                </label>
                <button
                  type="button"
                  onClick={() => ops.removeIndex(i.cid)}
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
  );
}
