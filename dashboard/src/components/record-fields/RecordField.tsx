/**
 * RecordField — type-aware dispatcher for record edit/create forms.
 *
 * One component that picks the right widget for each field type. Used by
 * both NewRecordPanel and RecordDrawer so every form behaves the same.
 *
 * All state in the parent is held as strings (`Record<string, string>`)
 * for backward-compat with the existing payload-coercion logic; this
 * component marshals values into the right shape for each widget and
 * emits string values via onChange.
 *
 * `geo` pairs are NOT handled here — the grouping pass at the call site
 * pairs `_latitude` + `_longitude` into a single GeoField. This
 * dispatcher is for "solo" fields only.
 */

import { useEffect } from "react";
import type { CollectionField } from "@/lib/types";
import { asString, opt } from "./types";
import { validateField } from "./validation";
import { EditorField } from "./EditorField";
import { FileField } from "./FileField";
import { RelationField } from "./RelationField";

interface RecordFieldProps {
  field: CollectionField;
  value: unknown;
  onChange: (v: unknown) => void;
  onErrorChange: (err: string | null) => void;
  error?: string;
  /** Currently stored raw value (for placeholder text in edit mode). */
  placeholderFromCurrent?: unknown;
}

export function RecordField({
  field,
  value,
  onChange,
  onErrorChange,
  error,
  placeholderFromCurrent,
}: RecordFieldProps) {
  const strValue = asString(value);

  // Live-validate on every change so the parent always has a fresh error map.
  useEffect(() => {
    onErrorChange(validateField(field, value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, field.name, field.type, field.required]);

  const requiredMark = field.required ? " *" : "";
  const labelText = (
    <span className="label-mono">
      {field.name}
      {requiredMark}{" "}
      <span className="text-ink-faint normal-case font-normal">· {field.type}</span>
    </span>
  );

  const placeholder =
    placeholderFromCurrent === null || placeholderFromCurrent === undefined
      ? `Enter ${field.type} value`
      : placeholderFromCurrent === ""
        ? "null"
        : String(placeholderFromCurrent);

  function emit(v: string) {
    onChange(v);
  }

  let widget: React.ReactNode;

  switch (field.type) {
    case "bool":
      widget = (
        <select
          value={strValue}
          onChange={(e) => emit(e.target.value)}
          className={`field-input mt-1 ${error ? "border-err" : ""}`}
        >
          <option value="">— unset —</option>
          <option value="true">true</option>
          <option value="false">false</option>
        </select>
      );
      break;

    case "select": {
      const choices = opt<string[]>(field, "choices") ?? [];
      widget = (
        <select
          value={strValue}
          onChange={(e) => emit(e.target.value)}
          className={`field-input mt-1 ${error ? "border-err" : ""}`}
        >
          <option value="">— select —</option>
          {choices.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
          {/* Preserve a previously-selected value if choices changed. */}
          {strValue && choices.length > 0 && !choices.includes(strValue) && (
            <option value={strValue}>{strValue} (not in choices)</option>
          )}
        </select>
      );
      break;
    }

    case "editor":
      widget = (
        <div className="mt-1">
          <EditorField value={strValue} onChange={emit} />
        </div>
      );
      break;

    case "json":
      widget = (
        <textarea
          value={strValue}
          onChange={(e) => emit(e.target.value)}
          placeholder='{ "key": "value" }'
          rows={4}
          spellCheck={false}
          className={`field-input mt-1 font-mono text-[12px] resize-y ${error ? "border-err" : ""}`}
        />
      );
      break;

    case "file":
      widget = <FileField value={strValue} onChange={emit} />;
      break;

    case "files":
      widget = <FileField value={strValue} onChange={emit} multiple />;
      break;

    case "relation": {
      const target = opt<string>(field, "target") ?? "";
      const relationType = opt<"single" | "multiple">(field, "relationType") ?? "single";
      if (!target) {
        widget = (
          <div className="text-warn text-[12px] mt-1">
            Relation has no target collection configured.
          </div>
        );
      } else {
        widget = (
          <RelationField
            target={target}
            relationType={relationType}
            value={strValue}
            onChange={emit}
          />
        );
      }
      break;
    }

    case "integer":
    case "real": {
      const min = opt<number>(field, "min");
      const max = opt<number>(field, "max");
      widget = (
        <input
          type="number"
          step={field.type === "integer" ? 1 : "any"}
          min={min}
          max={max}
          value={strValue}
          onChange={(e) => emit(e.target.value)}
          placeholder={placeholder}
          className={`field-input mt-1 ${error ? "border-err" : ""}`}
        />
      );
      break;
    }

    case "datetime":
    case "date":
      widget = (
        <input
          type={field.type === "datetime" ? "datetime-local" : "date"}
          value={strValue}
          onChange={(e) => emit(e.target.value)}
          className={`field-input mt-1 ${error ? "border-err" : ""}`}
        />
      );
      break;

    case "email":
      widget = (
        <input
          type="email"
          value={strValue}
          onChange={(e) => emit(e.target.value)}
          placeholder={placeholder}
          className={`field-input mt-1 ${error ? "border-err" : ""}`}
        />
      );
      break;

    case "url":
      widget = (
        <input
          type="url"
          value={strValue}
          onChange={(e) => emit(e.target.value)}
          placeholder="https://"
          className={`field-input mt-1 ${error ? "border-err" : ""}`}
        />
      );
      break;

    case "phone":
    case "password":
    case "text":
    default:
      widget = (
        <input
          type={field.type === "password" ? "password" : "text"}
          value={strValue}
          onChange={(e) => emit(e.target.value)}
          placeholder={
            field.type === "password"
              ? "At least 8 characters"
              : placeholder
          }
          className={`field-input mt-1 ${error ? "border-err" : ""}`}
        />
      );
      break;
  }

  return (
    <label className="block">
      {labelText}
      {widget}
      {error && <div className="text-err text-[12px] mt-1">{error}</div>}
    </label>
  );
}
