import type { Field } from "./types";

/**
 * Type-aware default value input.
 * - bool  → select (true/false/none)
 * - date/datetime → datetime-local input
 * - integer/real → number input
 * - everything else → text input
 */
export function DefaultValueInput({
  field,
  onPatch,
}: {
  field: Field;
  onPatch: (p: Partial<Field>) => void;
}) {
  const t = field.type;
  const value = field.defaultValue ?? "";

  if (t === "bool") {
    return (
      <label className="block">
        <span className="label-mono">Default</span>
        <select
          value={value}
          onChange={(e) => onPatch({ defaultValue: e.target.value || undefined })}
          className="field-input mt-1 text-[13px]"
        >
          <option value="">— none —</option>
          <option value="true">true</option>
          <option value="false">false</option>
        </select>
      </label>
    );
  }

  if (t === "date" || t === "datetime") {
    return (
      <label className="block">
        <span className="label-mono">Default ({t})</span>
        <input
          type="datetime-local"
          value={value}
          onChange={(e) => onPatch({ defaultValue: e.target.value || undefined })}
          className="field-input mt-1 text-[13px]"
        />
      </label>
    );
  }

  if (t === "integer" || t === "real") {
    return (
      <label className="block">
        <span className="label-mono">Default</span>
        <input
          type="number"
          value={value}
          onChange={(e) => onPatch({ defaultValue: e.target.value || undefined })}
          className="field-input mt-1 text-[13px]"
        />
      </label>
    );
  }

  return (
    <label className="block">
      <span className="label-mono">Default</span>
      <input
        value={value}
        onChange={(e) => onPatch({ defaultValue: e.target.value || undefined })}
        placeholder="(none)"
        className="field-input mt-1 text-[13px]"
      />
    </label>
  );
}
