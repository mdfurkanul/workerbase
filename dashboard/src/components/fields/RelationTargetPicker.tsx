import { useCollections } from "@/hooks/useCollections";
import type { FieldOpts } from "./types";

/**
 * Relation target picker — pulls the live collection list from the API.
 *
 * Lists all user-created collections (system tables and views are filtered out
 * since neither is a valid relation target). An optional `excludeName` prop
 * can prevent self-references (e.g. when editing collection X, hide X from
 * the list to avoid parent-child self-loops on the same table).
 */
export function RelationTargetPicker({
  target,
  relationType,
  onPatchOpt,
  excludeName,
}: {
  target?: string;
  relationType?: "single" | "multiple";
  onPatchOpt: (p: Partial<FieldOpts>) => void;
  excludeName?: string;
}) {
  const { collections } = useCollections();
  const options = collections
    .filter((c) => c.source !== "system" && c.type !== "view")
    .filter((c) => c.name !== excludeName)
    .map((c) => c.name)
    .sort((a, b) => a.localeCompare(b));

  return (
    <div className="grid grid-cols-2 gap-2">
      <label className="block">
        <span className="label-mono">Target collection</span>
        <select
          value={target ?? ""}
          onChange={(e) => onPatchOpt({ target: e.target.value })}
          className="field-input mt-1 font-mono text-[13px]"
        >
          <option value="" disabled>
            {options.length === 0 ? "No collections available" : "Select collection…"}
          </option>
          {options.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
          {/* Preserve a previously-selected target that no longer exists. */}
          {target && !options.includes(target) && (
            <option value={target}>{target} (missing)</option>
          )}
        </select>
      </label>
      <label className="block">
        <span className="label-mono">Cardinality</span>
        <select
          value={relationType ?? "single"}
          onChange={(e) =>
            onPatchOpt({ relationType: e.target.value as "single" | "multiple" })
          }
          className="field-input mt-1 text-[13px]"
        >
          <option value="single">Single (1:1)</option>
          <option value="multiple">Multiple (1:N)</option>
        </select>
      </label>
    </div>
  );
}
