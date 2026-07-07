/**
 * Zod schemas for collection create / patch payloads.
 *
 * These accept the rich camelCase payload shape produced by the
 * dashboard's SchemaEditor.
 */
import { z } from "zod";
import { IDENT, NAME_RE } from "./ddl.js";

/* ── Permissive field schema — accepts everything the editor sends ── */
export const fieldSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1).max(64).regex(IDENT, "invalid column name"),
  type: z.string(),  // accept all type strings (text, email, file, relation, geo, etc.)
  required: z.boolean().optional().default(false),
  unique: z.boolean().optional().default(false),
  hidden: z.boolean().optional().default(false),
  system: z.boolean().optional(),
  auto: z.boolean().optional(),
  primaryKey: z.boolean().optional(),
  default: z.union([z.string(), z.number(), z.boolean(), z.null()]).optional(),
  options: z.record(z.unknown()).optional().default({}),
});

/* ── Index + constraint schemas ── */
export const indexSchema = z.object({
  name: z.string().min(1).max(128),
  columns: z.array(z.string()),
  unique: z.boolean().optional().default(false),
});

export const constraintSchema = z.object({
  name: z.string().optional(),
  columns: z.array(z.string()),
});

/* ── Collection create payload — accepts camelCase (frontend) ── */
export const createBaseSchema = z.object({
  type: z.literal("base"),
  name: z.string().min(1).max(64).regex(NAME_RE),
  schema: z.array(fieldSchema).min(1),
  indexes: z.array(indexSchema).optional(),
  constraints: z.array(constraintSchema).optional(),
  listRule: z.string().optional(),
  viewRule: z.string().optional(),
  createRule: z.string().optional(),
  updateRule: z.string().optional(),
  deleteRule: z.string().optional(),
});

export const createUserSchema = z.object({
  type: z.literal("user"),
  name: z.string().min(1).max(64).regex(NAME_RE),
  schema: z.array(fieldSchema).optional(),
  indexes: z.array(indexSchema).optional(),
  constraints: z.array(constraintSchema).optional(),
  listRule: z.string().optional(),
  viewRule: z.string().optional(),
  createRule: z.string().optional(),
  updateRule: z.string().optional(),
  deleteRule: z.string().optional(),
  authConfig: z.record(z.unknown()).optional(),
  emailTemplates: z.record(z.unknown()).optional(),
});

export const createViewSchema = z.object({
  type: z.literal("view"),
  name: z.string().min(1).max(64).regex(NAME_RE),
  query: z.string().min(1).max(8192),
  listRule: z.string().optional(),
  viewRule: z.string().optional(),
});

export const createCollectionSchema = z.discriminatedUnion("type", [
  createBaseSchema,
  createUserSchema,
  createViewSchema,
]);

/* ── Collection patch payloads (per type) ── */
//
// `name` is optional on every patch shape. When present and different
// from the existing collection name, the PATCH handler runs
// `ALTER TABLE old RENAME TO new` and updates `_collections.name`.
// The handler refuses the rename when another collection references
// the old name (via relation.targetCollection or a view query) — see
// metadataRouter.ts.
export const patchBaseSchema = z.object({
  name: z.string().min(1).max(64).regex(NAME_RE).optional(),
  schema: z.array(fieldSchema).optional(),
  indexes: z.array(indexSchema).optional(),
  constraints: z.array(constraintSchema).optional(),
  listRule: z.string().optional(),
  viewRule: z.string().optional(),
  createRule: z.string().optional(),
  updateRule: z.string().optional(),
  deleteRule: z.string().optional(),
});

export const patchUserSchema = z.object({
  name: z.string().min(1).max(64).regex(NAME_RE).optional(),
  schema: z.array(fieldSchema).optional(),
  indexes: z.array(indexSchema).optional(),
  constraints: z.array(constraintSchema).optional(),
  listRule: z.string().optional(),
  viewRule: z.string().optional(),
  createRule: z.string().optional(),
  updateRule: z.string().optional(),
  deleteRule: z.string().optional(),
  authConfig: z.record(z.unknown()).optional(),
  emailTemplates: z.record(z.unknown()).optional(),
});

export const patchViewSchema = z.object({
  name: z.string().min(1).max(64).regex(NAME_RE).optional(),
  query: z.string().min(1).max(8192),
  listRule: z.string().optional(),
  viewRule: z.string().optional(),
});
