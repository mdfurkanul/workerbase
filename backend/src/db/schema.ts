import { sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * System control table.
 *
 * `_collections` stores metadata for every dynamically-created collection.
 * The actual tenant data tables (named after `name`) are created via
 * `CREATE TABLE` on D1 using the JSON `schema` definition.
 */
export const collections = sqliteTable("_collections", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  // D1/SQLite: store as a TEXT column with JSON serialization mode.
  schema: text("schema", { mode: "json" }).$type<CollectionField[]>().notNull(),
  listRule: text("list_rule"),
  createRule: text("create_rule"),
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
