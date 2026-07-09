/**
 * Group `_latitude` + `_longitude` field pairs into a single geo "slot"
 * for rendering, leaving every other field as a standalone slot.
 *
 * The backend stores `geo` fields as two REAL columns whose names end in
 * `_latitude` and `_longitude`. We pair consecutive fields whose names
 * share the same `<base>` and render ONE `GeoField` for the pair. Lone
 * columns (no sibling) fall back to a normal NumberField render.
 */

import type { CollectionField } from "@/lib/types";

export interface GeoPair {
  kind: "geo";
  /** Base field name (without the `_latitude` / `_longitude` suffix). */
  base: string;
  /** The original `_latitude` field definition. */
  latField: CollectionField;
  /** The original `_longitude` field definition. */
  lonField: CollectionField;
}

export interface SoloField {
  kind: "solo";
  field: CollectionField;
}

export type FieldSlot = GeoPair | SoloField;

/** Walk a flat field list and return a grouped slot list. */
export function groupFieldsForForm(fields: CollectionField[]): FieldSlot[] {
  const slots: FieldSlot[] = [];
  const used = new Set<number>();

  for (let i = 0; i < fields.length; i++) {
    if (used.has(i)) continue;
    const f = fields[i]!;
    const m = /^(.+)_latitude$/.exec(f.name);
    if (m && i + 1 < fields.length) {
      const base = m[1]!;
      const next = fields[i + 1]!;
      if (next.name === `${base}_longitude`) {
        slots.push({ kind: "geo", base, latField: f, lonField: next });
        used.add(i);
        used.add(i + 1);
        continue;
      }
    }
    slots.push({ kind: "solo", field: f });
    used.add(i);
  }

  return slots;
}
