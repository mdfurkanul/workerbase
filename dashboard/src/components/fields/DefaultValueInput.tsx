import type { Field } from "./types";

/**
 * Shared sentinel values for dynamic date/datetime defaults.
 * Must mirror `DEFAULT_NOW` / `DEFAULT_NOW_ON_UPDATE` in
 * `backend/src/core/collections/validation.ts`.
 */
export const DEFAULT_NOW = "$now";
export const DEFAULT_NOW_ON_UPDATE = "$nowOnUpdate";

/**
 * Type-aware default value input.
 * - bool    → select (true/false/none)
 * - date/datetime → select (empty / on-created / on-updated)
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
        <select
          value={value}
          onChange={(e) => onPatch({ defaultValue: e.target.value || undefined })}
          className="field-input mt-1 text-[13px]"
        >
          <option value="">— empty —</option>
          <option value={DEFAULT_NOW}>On create (set once when row is inserted)</option>
          <option value={DEFAULT_NOW_ON_UPDATE}>On update (refresh on every write)</option>
        </select>
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
