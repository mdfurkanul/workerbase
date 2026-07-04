import type { Field, FieldOpts } from "./types";
import { ToggleCheck } from "./ToggleCheck";
import { NumberInput } from "./NumberInput";
import { DefaultValueInput } from "./DefaultValueInput";
import { ChoiceEditor } from "./ChoiceEditor";
import { RelationTargetPicker } from "./RelationTargetPicker";

/**
 * Per-field settings panel — rendered when a field row is expanded.
 *
 * Branches on `field.type` to show type-appropriate options:
 * - Common: Required / Unique / Hidden toggles + Default value
 * - Text family: min/max length
 * - Number family: min/max value
 * - Relation: target collection + cardinality
 * - Select: choice editor
 *
 * Behavior notes:
 * - Auto-managed fields (created/updated) show only an "auto-managed" notice.
 * - Geo fields expose only Required (lat/lng inherit it; no default, no
 *   Unique/Hidden).
 */
export function FieldSettings({
  field,
  onPatch,
  onPatchOpt,
}: {
  field: Field;
  onPatch: (p: Partial<Field>) => void;
  onPatchOpt: (p: Partial<FieldOpts>) => void;
}) {
  // Auto-managed fields (created, updated) have no configurable options.
  if (field.auto) {
    return (
      <p className="text-[12px] text-ink-faint italic">
        Auto-managed by the backend — no configurable options.
      </p>
    );
  }

  const isGeo = field.type === "geo";

  return (
    <div className="space-y-3">
      {/* Toggles — geo fields only expose Required */}
      <div className={isGeo ? "grid grid-cols-1 gap-2" : "grid grid-cols-3 gap-2"}>
        <ToggleCheck
          label="Required"
          checked={field.required}
          onChange={(v) => onPatch({ required: v })}
        />
        {!isGeo && (
          <ToggleCheck
            label="Unique"
            checked={field.unique}
            onChange={(v) => onPatch({ unique: v })}
          />
        )}
        {!isGeo && (
          <ToggleCheck
            label="Hidden"
            checked={field.hidden}
            onChange={(v) => onPatch({ hidden: v })}
          />
        )}
      </div>

      {/* Default value — hidden for geo (lat/lng have no default) */}
      {!isGeo && <DefaultValueInput field={field} onPatch={onPatch} />}

      {/* Text family — min/max length */}
      {(field.type === "text" ||
        field.type === "editor" ||
        field.type === "phone" ||
        field.type === "url" ||
        field.type === "email") && (
        <div className="grid grid-cols-2 gap-2">
          <NumberInput
            label="Min length"
            value={field.options.min}
            onChange={(v) => onPatchOpt({ min: v })}
          />
          <NumberInput
            label="Max length"
            value={field.options.max}
            onChange={(v) => onPatchOpt({ max: v })}
          />
        </div>
      )}

      {/* Number family — min/max value */}
      {(field.type === "integer" || field.type === "real") && (
        <div className="grid grid-cols-2 gap-2">
          <NumberInput
            label="Min value"
            value={field.options.min}
            onChange={(v) => onPatchOpt({ min: v })}
          />
          <NumberInput
            label="Max value"
            value={field.options.max}
            onChange={(v) => onPatchOpt({ max: v })}
          />
        </div>
      )}

      {/* Relation — target collection + cardinality */}
      {field.type === "relation" && (
        <RelationTargetPicker
          target={field.options.target}
          relationType={field.options.relationType}
          onPatchOpt={onPatchOpt}
        />
      )}

      {/* Select — choice editor */}
      {field.type === "select" && (
        <ChoiceEditor
          choices={field.options.choices ?? []}
          onChange={(choices) => onPatchOpt({ choices })}
        />
      )}

      {/* JSON helper */}
      {field.type === "json" && (
        <p className="text-[12px] text-ink-faint">
          Free-form JSON stored as TEXT. Validated on read.
        </p>
      )}

      {/* Bool helper */}
      {field.type === "bool" && (
        <p className="text-[12px] text-ink-faint">Stored as a 0/1 INTEGER column.</p>
      )}
    </div>
  );
}
