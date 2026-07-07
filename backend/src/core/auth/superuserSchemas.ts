import { z } from "zod";
import type { SuperuserRole } from "../../db/schema.js";

// ─────────────────────────────────────────────────────────────
//  Zod validation schemas
// ─────────────────────────────────────────────────────────────

export const loginSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(8).max(256),
});

export const magicRequestSchema = z.object({
  email: z.string().email().max(254),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email().max(254),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1).max(512),
  password: z.string().min(8).max(256),
});

export const createSuperuserSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(8).max(256),
  role: z.enum(["admin", "editor", "viewer"]).default("viewer"),
});

export const updateEmailSchema = z.object({
  email: z.string().email().max(254),
});

export const changePasswordSchema = z.object({
  /** Current password — verified if the caller is changing their own. */
  currentPassword: z.string().min(8).max(256).optional(),
  newPassword: z.string().min(8).max(256),
});

export const updateRoleSchema = z.object({
  role: z.enum(["admin", "editor", "viewer"]),
});

/**
 * Date/time format presets consumed by the dashboard. Each maps to an
 * `Intl.DateTimeFormat` option set in `dashboard/src/lib/dateTimeFormat.ts`.
 *
 * NOTE: these presets + the chosen timezone are stored system-wide in the
 * `_settings` table (see `/api/core/settings`), NOT per-user. Every
 * signed-in dashboard user sees the same zone/format. Only `custom` is a
 * real preset value here; the matching pattern lives under the
 * `customDateTimePattern` settings key.
 */
export const DATE_TIME_FORMATS = [
  "iso8601",
  "compact",
  "long",
  "us",
  "european",
  "custom",
] as const;
export type DateTimeFormat = (typeof DATE_TIME_FORMATS)[number];

/**
 * Per-user UI preferences. Intentionally narrow — only genuinely
 * personal UI state lives here. System-wide concerns (timezone, date
 * format) live in `_settings` so every user sees the same value.
 *
 * The shape is intentionally extensible — future prefs (theme, density,
 * saved filters) can be added without a migration or schema change.
 *
 * The PATCH endpoint does a shallow merge, so callers may send any
 * subset of keys.
 */
export const prefsPatchSchema = z.object({
  pinnedCollections: z.array(z.string().min(1).max(64)).max(100).optional(),
});

export interface SuperuserPrefs {
  pinnedCollections?: string[];
}

// ─────────────────────────────────────────────────────────────
//  Helper: coerce a raw DB role string into a valid SuperuserRole.
//  Defends against unexpected values; unknown values fall back to "viewer"
//  (least privilege).
// ─────────────────────────────────────────────────────────────
export function normalizeRole(raw: unknown): SuperuserRole {
  return raw === "admin" || raw === "editor" || raw === "viewer" ? raw : "viewer";
}
