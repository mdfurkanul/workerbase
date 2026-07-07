/**
 * Shared TypeScript types for the WorkerBase API.
 *
 * These mirror the backend Drizzle schema defined in
 * `backend/src/db/schema.ts` and the JSON shapes returned by the Hono route
 * handlers under `/api/*`.
 */

// ═══════════════════════════════════════════════════════════════
//  Collection types
// ═══════════════════════════════════════════════════════════════

export type CollectionType = "base" | "user" | "view";

export type FieldType =
  | "text"
  | "editor"
  | "phone"
  | "url"
  | "email"
  | "integer"
  | "real"
  | "bool"
  | "date"
  | "datetime"
  | "file"
  | "files"
  | "relation"
  | "select"
  | "json"
  | "geo";

/** Type-specific field options — only the relevant keys are populated per field type. */
export interface FieldOptions {
  // Text family
  minLength?: number;
  maxLength?: number;
  pattern?: string;

  // Number
  min?: number;
  max?: number;

  // Date
  includeTime?: boolean;

  // File / Files
  maxFileSizeMB?: number;
  maxFiles?: number;
  allowedMimeTypes?: string[];

  // Relation
  targetCollection?: string;
  relationType?: "single" | "multiple";
  cascadeDelete?: boolean;

  // Select
  choices?: { label: string; value: string }[];

  // JSON
  jsonSchema?: object;
}

/** Complete field definition — one entry per column in a collection's schema. */
export interface FieldDefinition {
  /** Stable UUID — survives renames. */
  id: string;
  /** SQL column name (validated: ^[a-zA-Z_][a-zA-Z0-9_]*$). */
  name: string;
  type: FieldType;

  required: boolean;
  unique: boolean;
  hidden: boolean;
  /** System-managed column (id, created, updated) — cannot be removed. */
  system?: boolean;
  /** Auto-set by the backend (created, updated). */
  auto?: boolean;
  /** Primary key (id column only). */
  primaryKey?: boolean;

  /** Default value applied on insert when the client omits the field. */
  default?: string;

  options: FieldOptions;
}

export interface IndexDefinition {
  name: string;
  columns: string[];
  unique: boolean;
}

export interface ConstraintDefinition {
  name?: string;
  columns: string[];
}

export type PermissionScope = "superuser" | "authenticated" | "public";

/**
 * Full collection row — mirrors `_collections` table columns.
 *
 * Timestamps from the backend are Unix epoch millis (D1 INTEGER columns).
 */
export interface Collection {
  id: string;
  name: string;
  type: CollectionType;
  schema: FieldDefinition[] | null;
  indexes?: IndexDefinition[] | null;
  constraints?: ConstraintDefinition[] | null;
  query?: string | null;

  // API rules — one PermissionScope per operation
  listRule?: PermissionScope | null;
  viewRule?: PermissionScope | null;
  createRule?: PermissionScope | null;
  updateRule?: PermissionScope | null;
  deleteRule?: PermissionScope | null;

  // Auth config (type = "user" only)
  authConfig?: AuthConfig | null;

  // Email templates (type = "user" only)
  emailTemplates?: EmailTemplates | null;

  createdAt: number;
  updatedAt: number;
}

// ═══════════════════════════════════════════════════════════════
//  Auth-config + email-template types
// ═══════════════════════════════════════════════════════════════

export interface AuthConfig {
  enabled: boolean;
  emailPassword: boolean;
  emailOTP: boolean;
  oauth: Record<string, boolean>;
  onlyVerified: boolean;
  requirePasswordChange: boolean;
  minPasswordLength: number;
}

export type EmailTemplateId =
  | "verification"
  | "resetPassword"
  | "confirmEmailChange"
  | "otp";

export interface EmailTemplate {
  subject: string;
  body: string;
}

export type EmailTemplates = Partial<Record<EmailTemplateId, EmailTemplate>>;

// ═══════════════════════════════════════════════════════════════
//  Superuser auth types
// ═══════════════════════════════════════════════════════════════

export type SuperuserRole = "admin" | "editor" | "viewer";

export interface Superuser {
  id: string;
  email: string;
  role: SuperuserRole;
  verified: boolean;
  createdAt?: number;
  updatedAt?: number;
}

export interface AuthResponse {
  user: Superuser;
  token: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface CreateSuperuserRequest {
  email: string;
  password: string;
  role?: SuperuserRole;
}

export interface CreateSuperuserResponse {
  user: Superuser;
  verificationURL: string;
}

// ═══════════════════════════════════════════════════════════════
//  Record types
// ═══════════════════════════════════════════════════════════════

/**
 * Generic record row — every column beyond `id` is collection-defined.
 * Use a mapped type / intersection when you need typed columns for a known
 * collection.
 */
export interface RecordRow {
  id: string;
  [key: string]: unknown;
}

export interface PaginatedResponse<T> {
  items: T[];
  page: number;
  perPage: number;
  total: number;
  totalPages: number;
}

// ═══════════════════════════════════════════════════════════════
//  Log types
// ═══════════════════════════════════════════════════════════════

export type LogLevel = "info" | "warn" | "error";

export interface LogEntry {
  id: string;
  level: LogLevel;
  method: string;
  path: string;
  status: number;
  durationMs: number;
  ip?: string | null;
  userAgent?: string | null;
  error?: string | null;
  createdAt: number;
}

// ═══════════════════════════════════════════════════════════════
//  Settings
// ═══════════════════════════════════════════════════════════════

export interface AppSettings {
  appName?: string;
  appUrl?: string;
  accentColor?: string;
  batchApi?: boolean;
  rateLimit?: number;
  senderName?: string;
  senderEmail?: string;
  smtpHost?: string;
  smtpPort?: number;
  smtpUser?: string;
  smtpPassword?: string;
  smtpSecure?: boolean;
  /** System-wide IANA timezone (e.g. "America/New_York"). Empty/undefined = browser default. */
  timezone?: string;
  /** System-wide date/time format preset. */
  dateTimeFormat?:
    | "iso8601"
    | "compact"
    | "long"
    | "us"
    | "european"
    | "custom";
  /** Token template, only consulted when `dateTimeFormat === "custom"`. */
  customDateTimePattern?: string;
  [key: string]: unknown;
}
