import { groupedFieldTypes, CATEGORY_LABELS } from "@/lib/fieldTypes";

/** Optgroups for the field-type `<select>` dropdown (used in collapsed rows). */
export function FieldTypeOptions() {
  return (
    <>
      {groupedFieldTypes().map((g) => (
        <optgroup key={g.category} label={CATEGORY_LABELS[g.category]}>
          {g.items.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </optgroup>
      ))}
    </>
  );
}
