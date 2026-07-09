/**
 * Shared types for the record-field widgets.
 *
 * The parent (NewRecordPanel / RecordDrawer) keeps all editable state in
 * a flat `Record<string, string>` so the existing payload-coercion logic
 * keeps working unchanged. Every widget therefore reads a string `value`
 * and emits a string (or stringifiable form) via `onChange`.
 *
 * Validation errors propagate up through `onErrorChange` so the parent
 * can block the submit button while any field is invalid.
 */

import type { CollectionField } from "@/lib/types";

export interface RecordFieldProps {
  /** Field definition from the collection's stored schema. */
  field: CollectionField;
  /** Current value as a string (post-valueToString). */
  value: unknown;
  /** Emit the new value. Accepts string | string[] for convenience. */
  onChange: (v: unknown) => void;
  /** Surface a validation error (or null when valid) to the parent. */
  onErrorChange: (err: string | null) => void;
  /** All fields on this collection — used by GeoField to find its sibling. */
  allFields?: CollectionField[];
  /** The collection being edited — used by RelationField for the lookup target. */
  collectionName?: string;
  /** Optional override for the label slot (used by GeoField to render the base name). */
  labelOverride?: string;
}

/** Coerce an unknown field value to the string form used by edit widgets. */
export function asString(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

/** Read a typed option off a CollectionField.options bag safely. */
export function opt<T = unknown>(field: CollectionField, key: string): T | undefined {
  const o = field.options as Record<string, unknown> | undefined;
  return o?.[key] as T | undefined;
}
