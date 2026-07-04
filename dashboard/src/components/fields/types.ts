import type { FieldType } from "@/lib/fieldTypes";

/**
 * Shared field/schema types for the dashboard schema editors.
 *
 * These mirror (but differ from) the backend's `FieldDefinition` in
 * `lib/api-types.ts` — the dashboard versions carry client-only concerns
 * like `cid` (stable client id), `locked`, `primaryKey`, `auto`, `authField`
 * that drive UI behavior but never reach the API.
 */

export interface FieldOpts {
  min?: number;
  max?: number;
  multiple?: boolean;
  target?: string; // relation target collection
  relationType?: "single" | "multiple";
  choices?: string[];
  includeTime?: boolean;
}

export interface Field {
  /** Client-side stable id (regenerated on duplicate, stable across renders). */
  cid: string;
  name: string;
  type: FieldType;
  required: boolean;
  unique: boolean;
  hidden: boolean;
  options: FieldOpts;
  /** Locked rows cannot be edited, removed, moved, or duplicated (id, email, password). */
  locked?: boolean;
  primaryKey?: boolean;
  /** Set on insert / update — never editable (created, updated). */
  auto?: boolean;
  /** Auth-managed column (email, password on type="user"). Visual-only; stripped before submit. */
  authField?: boolean;
  /** Default value applied on insert when the client omits the field. */
  defaultValue?: string;
}

export interface IndexDef {
  cid: string;
  name: string;
  columns: string[];
  unique: boolean;
}

export interface ConstraintDef {
  cid: string;
  columns: string[];
}

export interface SchemaData {
  fields: Field[];
  indexes: IndexDef[];
  constraints: ConstraintDef[];
}

/** Client-side id generator (stable enough for React keys, not cryptographically unique). */
export function uuid(): string {
  return Math.random().toString(36).slice(2, 12) + Date.now().toString(36);
}
