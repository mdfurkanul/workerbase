import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

/**
 * System control table.
 *
 * `_collections` stores metadata for every dynamically-created collection.
 * The actual tenant data tables (named after `name`) are created via
 * `CREATE TABLE` on D1 using the JSON `schema` definition.
 *
 * `type` discriminates how the collection was provisioned:
 *   - "base" : a user-defined custom table built from `schema` fields
 *   - "user" : an auth-purposed table (auth columns auto-injected)
 *   - "view" : a virtual collection backed by the SELECT in `query`
 *
 * `schema` is nullable for "view" collections (no physical columns of their own).
 * `query` is only populated for "view" collections.
 */
export const collections = sqliteTable("_collections", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  type: text("type").$type<CollectionType>().notNull().default("base"),
  schema: text("schema", { mode: "json" }).$type<CollectionField[]>(),
  query: text("query"),
  listRule: text("list_rule"),
  createRule: text("create_rule"),
});

export type CollectionType = "base" | "user" | "view";

/**
 * Authentication users table.
 *
 * Passwords are hashed with PBKDF2 (SHA-256, 100k iterations) and a
 * per-user random salt. The hash + salt are stored as hex strings.
 */
export const users = sqliteTable("_users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  passwordSalt: text("password_salt").notNull(),
  createdAt: integer("created_at").notNull(),
});

export interface CollectionField {
  name: string;
  type: "text" | "integer" | "real" | "blob";
  required?: boolean;
  unique?: boolean;
  default?: string | number | boolean | null;
}

export type Collection = typeof collections.$inferSelect;
export type NewCollection = typeof collections.$inferInsert;
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
