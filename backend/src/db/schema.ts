import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

/* ═══════════════════════════════════════════════════════════════════
   Collection type + permission scope
   ═══════════════════════════════════════════════════════════════════ */

export type CollectionType = "base" | "user" | "view";

export type PermissionScope = "superuser" | "authenticated" | "public";

/**
 * Dashboard RBAC roles for `_superusers`.
 *
 *   admin  — full power (manage users, collections, schema, SQL queries)
 *   editor — records CRUD + read everywhere; cannot manage collections,
 *            users, or saved SQL queries
 *   viewer — read-only everywhere
 */
export type SuperuserRole = "admin" | "editor" | "viewer";

/* ═══════════════════════════════════════════════════════════════════
   Field definitions — stored as JSON in _collections.schema
   ═══════════════════════════════════════════════════════════════════ */

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

/** Type-specific options — only the relevant keys are populated per field. */
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

  // Flags
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

  /** Per-type options (min/max, choices, relation target, etc.). */
  options: FieldOptions;
}

/* ═══════════════════════════════════════════════════════════════════
   Index + constraint definitions — JSON in _collections.indexes / .constraints
   ═══════════════════════════════════════════════════════════════════ */

export interface IndexDefinition {
  name: string;
  columns: string[];
  unique: boolean;
}

export interface ConstraintDefinition {
  name?: string;
  columns: string[];
}

/* ═══════════════════════════════════════════════════════════════════
   Auth config — JSON in _collections.authConfig
   ═══════════════════════════════════════════════════════════════════ */

export interface AuthConfig {
  enabled: boolean;
  emailPassword: boolean;
  emailOTP: boolean;
  oauth: Record<string, boolean>;
  onlyVerified: boolean;
  requirePasswordChange: boolean;
  minPasswordLength: number;
}

/* ═══════════════════════════════════════════════════════════════════
   Email templates — JSON in _collections.emailTemplates
   ═══════════════════════════════════════════════════════════════════ */

export type EmailTemplateId =
  | "verification"
  | "resetPassword"
  | "confirmEmailChange"
  | "otp";

export interface EmailTemplate {
  subject: string;
  body: string;
}

export type EmailTemplates = Record<EmailTemplateId, EmailTemplate>;

/* ═══════════════════════════════════════════════════════════════════
   API rules — stored as plain text, interpreted as PermissionScope
   ═══════════════════════════════════════════════════════════════════ */

export interface ApiRules {
  list?: PermissionScope;
  view?: PermissionScope;
  create?: PermissionScope;
  update?: PermissionScope;
  delete?: PermissionScope;
}

/* ═══════════════════════════════════════════════════════════════════
   Drizzle table definitions
   ═══════════════════════════════════════════════════════════════════ */

/* ─── _superusers — dashboard / admin panel access ────────────────── */

export const superusers = sqliteTable("_superusers", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  passwordSalt: text("password_salt").notNull(),
  tokenKey: text("token_key").notNull().default(""),
  role: text("role").$type<SuperuserRole>().notNull().default("admin"),
  verified: integer("verified", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

/* ─── _externalAuths — OAuth2 provider links ──────────────────────── */

export const externalAuths = sqliteTable("_externalAuths", {
  id: text("id").primaryKey(),
  collectionRef: text("collection_ref").notNull(),
  recordRef: text("record_ref").notNull(),
  provider: text("provider").notNull(),
  providerId: text("provider_id").notNull(),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  expiresAt: integer("expires_at"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

/* ─── _collections — system control + full metadata ───────────────── */

export const collections = sqliteTable("_collections", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  type: text("type").$type<CollectionType>().notNull().default("base"),

  // Schema — array of FieldDefinition (columns + per-type options + defaults)
  schema: text("schema", { mode: "json" }).$type<FieldDefinition[]>(),

  // Indexes — named D1 indexes
  indexes: text("indexes", { mode: "json" }).$type<IndexDefinition[]>(),

  // Constraints — multi-column unique constraints
  constraints: text("constraints", { mode: "json" }).$type<ConstraintDefinition[]>(),

  // View SQL (only for type = "view")
  query: text("query"),

  // API rules — one PermissionScope per operation
  listRule: text("list_rule").$type<PermissionScope>(),
  viewRule: text("view_rule").$type<PermissionScope>(),
  createRule: text("create_rule").$type<PermissionScope>(),
  updateRule: text("update_rule").$type<PermissionScope>(),
  deleteRule: text("delete_rule").$type<PermissionScope>(),

  // Auth config (type = "user" only)
  authConfig: text("auth_config", { mode: "json" }).$type<AuthConfig>(),

  // Email templates (type = "user" only)
  emailTemplates: text("email_templates", { mode: "json" }).$type<EmailTemplates>(),

  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

/* ─── _settings — global application settings (key-value) ─────────── */

export const settings = sqliteTable("_settings", {
  key: text("key").primaryKey(),
  value: text("value", { mode: "json" }),
  updatedAt: integer("updated_at").notNull(),
});

/* ─── _tokens — password reset / verification / OTP ───────────────── */

export type TokenType = "verification" | "passwordReset" | "emailChange" | "otp";

export const tokens = sqliteTable("_tokens", {
  id: text("id").primaryKey(),
  collectionRef: text("collection_ref").notNull(),
  recordRef: text("record_ref").notNull(),
  type: text("type").$type<TokenType>().notNull(),
  value: text("value").notNull(),
  expiresAt: integer("expires_at").notNull(),
  consumed: integer("consumed", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at").notNull(),
});

/* ─── _db_migrations — tracks dynamic schema changes on tenant tables */

export const dbMigrations = sqliteTable("_db_migrations", {
  id: text("id").primaryKey(),
  collectionName: text("collection_name").notNull(),
  sql: text("sql").notNull(),
  status: text("status").notNull().default("applied"),
  appliedAt: integer("applied_at").notNull(),
});

/* ─── _logs — request log entries ─────────────────────────────────── */

export type LogLevel = "info" | "warn" | "error";

export const logs = sqliteTable("_logs", {
  id: text("id").primaryKey(),
  level: text("level").$type<LogLevel>().notNull().default("info"),
  method: text("method").notNull(),
  path: text("path").notNull(),
  status: integer("status").notNull(),
  durationMs: integer("duration_ms").notNull(),
  ip: text("ip"),
  userAgent: text("user_agent"),
  error: text("error"),
  createdAt: integer("created_at").notNull(),
});

/* ─── _sqlQueries — saved SQL console queries ─────────────────────── */

export const sqlQueries = sqliteTable("_sqlQueries", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  sql: text("sql").notNull(),
  /** Superuser id who created the query. */
  createdBy: text("created_by"),
  /** Last execution timestamp (epoch ms). */
  lastRunAt: integer("last_run_at"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

/* ═══════════════════════════════════════════════════════════════════
   Inferred row types
   ═══════════════════════════════════════════════════════════════════ */

export type Superuser = typeof superusers.$inferSelect;
export type NewSuperuser = typeof superusers.$inferInsert;

export type ExternalAuth = typeof externalAuths.$inferSelect;
export type NewExternalAuth = typeof externalAuths.$inferInsert;

export type Collection = typeof collections.$inferSelect;
export type NewCollection = typeof collections.$inferInsert;

export type Setting = typeof settings.$inferSelect;
export type NewSetting = typeof settings.$inferInsert;

export type Token = typeof tokens.$inferSelect;
export type NewToken = typeof tokens.$inferInsert;

export type DbMigration = typeof dbMigrations.$inferSelect;
export type NewDbMigration = typeof dbMigrations.$inferInsert;

export type Log = typeof logs.$inferSelect;
export type NewLog = typeof logs.$inferInsert;

export type SqlQuery = typeof sqlQueries.$inferSelect;
export type NewSqlQuery = typeof sqlQueries.$inferInsert;
