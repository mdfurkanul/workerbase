/**
 * String form-value → JSON payload coercion.
 *
 * Both NewRecordPanel (create) and RecordDrawer (edit) need to turn the
 * string values held in form state into the JSON shapes the backend
 * expects. Keep one source of truth so create and edit produce identical
 * payloads for the same field type.
 */

import { wallClockToEpochMs } from "@/lib/dateTimeFormat";

export function coerceForPayload(
  type: string,
  v: string,
  timezone: string | undefined,
): unknown {
  switch (type) {
    case "integer":
      return parseInt(v, 10);
    case "real":
      return parseFloat(v);
    case "bool":
      return v === "true" || v === "1";
    case "datetime": {
      const ms = wallClockToEpochMs(v, timezone);
      return ms ?? v;
    }
    case "date":
      return v.slice(0, 10);
    case "json": {
      try {
        return JSON.parse(v);
      } catch {
        return v; // backend will reject if invalid
      }
    }
    case "files": {
      try {
        const arr = JSON.parse(v);
        return Array.isArray(arr) ? arr : v;
      } catch {
        return v;
      }
    }
    case "password":
    case "text":
    case "email":
    case "url":
    case "phone":
    case "file":
    case "select":
    case "editor":
    case "relation":
    default:
      return v;
  }
}
