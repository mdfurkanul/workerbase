import type { Dispatch, SetStateAction } from "react";
import type { FieldType } from "@/lib/fieldTypes";
import type { CollectionType } from "@/lib/types";
import {
  uuid,
  type Field,
  type FieldOpts,
  type IndexDef,
  type ConstraintDef,
} from "@/components/fields";
import { blankField, makeAuthFields } from "./fieldFactories";

/**
 * Encapsulates all field/index/constraint mutation logic for the
 * NewCollection form. The host component still owns the state values
 * (so it can read them for submit); this hook owns the handlers.
 */
export function useFieldEditor(opts: {
  fields: Field[];
  setFields: Dispatch<SetStateAction<Field[]>>;
  expanded: string | null;
  setExpanded: Dispatch<SetStateAction<string | null>>;
  setType: Dispatch<SetStateAction<CollectionType>>;
  indexes: IndexDef[];
  setIndexes: Dispatch<SetStateAction<IndexDef[]>>;
  constraints: ConstraintDef[];
  setConstraints: Dispatch<SetStateAction<ConstraintDef[]>>;
}) {
  const { fields, setFields, expanded, setExpanded, setType, setIndexes, setConstraints } = opts;

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

  return {
    addField,
    handleTypeChange,
    patch,
    patchOpt,
    removeField,
    duplicateField,
    move,
    addIndex,
    patchIndex,
    removeIndex,
    addConstraint,
    patchConstraint,
    removeConstraint,
  };
}

export type FieldEditor = ReturnType<typeof useFieldEditor>;
