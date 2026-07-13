/**
 * Per-type validation for record fields.
 *
 * Each function takes the current string value (the form state shape) and
 * the field definition, and returns an error message or null when valid.
 * Required-check is centralised in `validateField` below so individual
 * helpers only handle type-specific rules.
 */

import type { CollectionField } from "@/lib/types";
import { opt } from "./types";

/** True when the field is "empty" for required-check purposes. */
export function isEmptyValue(field: CollectionField, v: unknown): boolean {
  const s = typeof v === "string" ? v : "";
  if (s.trim() === "") return true;
  // For multiple relations, an empty JSON array '[]' means no selection.
  if (
    field.type === "relation" &&
    opt(field, "relationType") === "multiple" &&
    s.trim() === "[]"
  ) {
    return true;
  }
  // `editor` may emit an empty paragraph — treat that as empty too.
  if (field.type === "editor") {
    return s === "<p></p>" || s === "<p><br></p>" || s === "<br>";
  }
  return false;
}

const RE_INT = /^-?\d+$/;
const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RE_URL = /^https?:\/\/.+$/;
const RE_PHONE = /^[+]?[0-9\s\-()]{4,20}$/;

/** Run all type-appropriate checks; returns an error string or null. */
export function validateField(field: CollectionField, raw: unknown): string | null {
  const value = typeof raw === "string" ? raw : "";

  // Required check first.
  if (field.required && isEmptyValue(field, raw)) {
    return `${field.name} is required`;
  }
  if (isEmptyValue(field, raw)) return null;

  switch (field.type) {
    case "integer":
      if (!RE_INT.test(value)) return `${field.name} must be a whole number`;
      break;
    case "real": {
      const n = Number(value);
      if (Number.isNaN(n)) return `${field.name} must be a valid number`;
      const min = opt<number>(field, "min");
      const max = opt<number>(field, "max");
      if (min !== undefined && n < min) return `${field.name} must be ≥ ${min}`;
      if (max !== undefined && n > max) return `${field.name} must be ≤ ${max}`;
      break;
    }
    case "email":
      if (!RE_EMAIL.test(value)) return `${field.name} must be a valid email address`;
      break;
    case "url":
      if (!RE_URL.test(value)) return `${field.name} must be a valid URL (starting with http:// or https://)`;
      break;
    case "phone":
      if (!RE_PHONE.test(value)) return `${field.name} must be a valid phone number`;
      break;
    case "bool":
      if (!["true", "false", "1", "0"].includes(value.toLowerCase())) {
        return `${field.name} must be true or false`;
      }
      break;
    case "select": {
      const choices = opt<string[]>(field, "choices") ?? [];
      if (choices.length > 0 && !choices.includes(value)) {
        return `${field.name} must be one of: ${choices.join(", ")}`;
      }
      break;
    }
    case "json":
      try {
        JSON.parse(value);
      } catch (e) {
        return `${field.name} is not valid JSON: ${(e as Error).message}`;
      }
      break;
    case "file":
      if (!value) return `${field.name} must reference an uploaded file`;
      break;
    case "files": {
      let arr: unknown = null;
      try {
        arr = JSON.parse(value);
      } catch {
        return `${field.name} must be a JSON array of keys`;
      }
      if (!Array.isArray(arr)) return `${field.name} must be a JSON array of keys`;
      if (field.required && arr.length === 0) return `${field.name} requires at least one file`;
      break;
    }
    case "editor":
      // TipTap emits a safe HTML subset; we only check it's not empty when required.
      break;
    case "relation":
      if (!value) return `${field.name} must reference a record`;
      break;
  }

  return null;
}
