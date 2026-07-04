import {
  ArrowDown,
  ArrowUp,
  Copy,
  KeyRound,
  Lock,
  Settings2,
  Trash2,
} from "lucide-react";
import { fieldTypeMeta, type FieldType } from "@/lib/fieldTypes";
import type { Field, FieldOpts } from "./types";
import { FieldSettings } from "./FieldSettings";
import { FieldTypeOptions } from "./FieldTypeOptions";
import { GeoSubFields } from "./GeoSubFields";

/**
 * Single field row — renders the collapsed row with name/type/actions, an
 * optional quick-toggle row, an expanded settings panel, and (for geo type)
 * the visual lat/lng sub-fields.
 *
 * Locking hierarchy:
 * - `locked`   → fully read-only (id, email, password). No actions, no settings.
 * - `auto`     → settings gear / move / duplicate / delete all hidden
 *                (created, updated). Quick-toggle row hidden. Settings panel
 *                shows an "auto-managed" notice.
 * - otherwise  → full edit affordances.
 */
export function FieldRow({
  field,
  isFirstEditable,
  isLast,
  expanded,
  onToggleExpand,
  onPatch,
  onPatchOpt,
  onRemove,
  onDuplicate,
  onMoveUp,
  onMoveDown,
}: {
  field: Field;
  isFirstEditable: boolean;
  isLast: boolean;
  expanded: boolean;
  onToggleExpand: () => void;
  onPatch: (p: Partial<Field>) => void;
  onPatchOpt: (p: Partial<FieldOpts>) => void;
  onRemove: () => void;
  onDuplicate: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const locked = !!field.locked;
  const meta = fieldTypeMeta(field.type);
  const Icon = meta.Icon;

  return (
    <div
      className={`rounded border ${
        locked ? "bg-brand-dim/30 border-brand/40" : "bg-surface border-line"
      }`}
    >
      {/* Main row */}
      <div className="grid grid-cols-[auto_1.4fr_1fr_auto] gap-2 items-center p-2">
        {/* Drag handle / type icon */}
        <div
          className={`w-7 h-7 rounded flex items-center justify-center shrink-0 ${
            locked ? "bg-brand-dim text-brand" : "bg-surface-2 text-ink-muted"
          }`}
        >
          {field.primaryKey ? <KeyRound size={13} /> : <Icon size={13} />}
        </div>

        {/* Name */}
        <input
          required
          disabled={locked}
          pattern="[a-zA-Z_][a-zA-Z0-9_]*"
          placeholder="field_name"
          value={field.name}
          onChange={(e) => onPatch({ name: e.target.value })}
          className="field-input font-mono text-[13px]"
        />

        {/* Type display / select — auto + locked fields show static label */}
        {locked || field.auto ? (
          <span className="font-mono text-[12px] text-ink-muted uppercase tracking-widest px-2">
            {field.authField
              ? "auth"
              : field.auto
                ? "auto"
                : "primary"}{" "}
            · {field.type}
          </span>
        ) : (
          <div className="flex items-center gap-1.5">
            <select
              value={field.type}
              onChange={(e) => onPatch({ type: e.target.value as FieldType })}
              className="field-input text-[13px] flex-1"
            >
              <FieldTypeOptions />
            </select>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex items-center gap-0.5 shrink-0">
          {!locked && !field.auto && (
            <button
              type="button"
              onClick={onToggleExpand}
              className={`btn-icon ${expanded ? "text-brand" : ""}`}
              title="Field settings"
              aria-label="Field settings"
            >
              <Settings2 size={13} />
            </button>
          )}
          {!locked && !field.auto && (
            <>
              <button
                type="button"
                onClick={onMoveUp}
                disabled={isFirstEditable}
                className="btn-icon disabled:opacity-30 disabled:cursor-not-allowed"
                title="Move up"
              >
                <ArrowUp size={13} />
              </button>
              <button
                type="button"
                onClick={onMoveDown}
                disabled={isLast}
                className="btn-icon disabled:opacity-30 disabled:cursor-not-allowed"
                title="Move down"
              >
                <ArrowDown size={13} />
              </button>
              <button
                type="button"
                onClick={onDuplicate}
                className="btn-icon"
                title="Duplicate"
              >
                <Copy size={13} />
              </button>
              <button
                type="button"
                onClick={onRemove}
                className="btn-icon"
                title="Remove"
              >
                <Trash2 size={13} />
              </button>
            </>
          )}
          {locked && (
            <span className="px-2 text-[11px] text-ink-faint font-mono uppercase tracking-widest inline-flex items-center gap-1">
              <Lock size={11} /> system
            </span>
          )}
          {field.auto && !locked && (
            <span className="px-2 text-[11px] text-ink-faint font-mono uppercase tracking-widest inline-flex items-center gap-1">
              <Lock size={11} /> auto
            </span>
          )}
        </div>
      </div>

      {/* Quick-toggle row (collapsed, non-locked, non-auto) */}
      {!locked && !field.auto && !expanded && (
        <div className="px-2 pb-2 -mt-1 flex items-center gap-3 text-[11px] text-ink-faint">
          <label className="inline-flex items-center gap-1 cursor-pointer">
            <input
              type="checkbox"
              checked={field.required}
              onChange={(e) => onPatch({ required: e.target.checked })}
              className="accent-brand"
            />
            Required
          </label>
          {field.type !== "geo" && (
            <label className="inline-flex items-center gap-1 cursor-pointer">
              <input
                type="checkbox"
                checked={field.unique}
                onChange={(e) => onPatch({ unique: e.target.checked })}
                className="accent-brand"
              />
              Unique
            </label>
          )}
          {field.type !== "geo" && (
            <label className="inline-flex items-center gap-1 cursor-pointer">
              <input
                type="checkbox"
                checked={field.hidden}
                onChange={(e) => onPatch({ hidden: e.target.checked })}
                className="accent-brand"
              />
              Hidden
            </label>
          )}
        </div>
      )}

      {/* Expanded settings panel */}
      {!locked && expanded && (
        <div className="px-3 pb-3 pt-1 hairline-t mt-1 space-y-3 bg-bg-elev/60">
          <FieldSettings field={field} onPatch={onPatch} onPatchOpt={onPatchOpt} />
        </div>
      )}

      {/* Geolocation compound field — show lat / lng sub-rows */}
      {field.type === "geo" && !locked && <GeoSubFields />}
    </div>
  );
}
