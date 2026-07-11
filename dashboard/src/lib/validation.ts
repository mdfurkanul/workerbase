import { z } from "zod";

/* ─── Auth schemas ──────────────────────────────────────────────── */
export const emailSchema = z
  .string()
  .email("Enter a valid email address")
  .max(254, "Email must be 254 characters or less");

export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(256, "Password must be 256 characters or less");

export const loginSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
});

/** Email-only schema — used by magic-link and forgot-password forms. */
export const emailOnlySchema = z.object({
  email: emailSchema,
});

/* ─── Collection schemas ────────────────────────────────────────── */
export const collectionNameSchema = z
  .string()
  .min(1, "Name is required")
  .max(64, "Name must be 64 characters or less")
  .regex(
    /^[a-zA-Z][a-zA-Z0-9_]*$/,
    "Must start with a letter; only letters, digits, underscore",
  );

export const fieldNameSchema = z
  .string()
  .min(1, "Field name is required")
  .max(64, "Field name must be 64 characters or less")
  .regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/, "Invalid column name");

/* ─── SQL query schema ──────────────────────────────────────────── */
export const sqlQuerySchema = z.object({
  title: z.string().min(1, "Title is required").max(200, "Title is too long"),
  sql: z.string().min(1, "SQL is required").max(8192, "SQL is too long"),
});

export const sqlBodySchema = z
  .string()
  .min(1, "Query cannot be empty")
  .max(8192, "Query is too long");

/* ─── Generic helpers ───────────────────────────────────────────── */
export type ValidationErrors<T> = Partial<Record<keyof T, string>>;

/**
 * Validate a single field from a Zod object schema.
 * `data` is the full form values object — we run the full schema and
 * return only the first error (if any) for the specified `field`.
 */
export function validateField<T>(
  schema: z.ZodSchema<T>,
  field: keyof T,
  data: unknown,
): string | undefined {
  const result = schema.safeParse(data);
  if (result.success) return undefined;
  const issue = result.error.issues.find((i) => i.path[0] === field);
  return issue?.message;
}

/**
 * Validate an entire form against a Zod schema.
 * Returns a map of `fieldName → errorMessage` (only the first error per field).
 */
export function validateForm<T>(
  schema: z.ZodSchema<T>,
  data: unknown,
): ValidationErrors<T> {
  const result = schema.safeParse(data);
  if (result.success) return {};
  const errors: ValidationErrors<T> = {};
  for (const issue of result.error.issues) {
    const field = issue.path[0] as keyof T;
    if (!errors[field]) errors[field] = issue.message;
  }
  return errors;
}
