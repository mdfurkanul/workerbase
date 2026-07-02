/**
 * R2 storage router — mounted at /api/core/storage
 *
 * Endpoints:
 *   POST   /upload          — multipart upload (admin, editor)
 *   GET    /list            — list objects (any authed user)
 *   GET    /object          — fetch single object by ?key= (any authed user)
 *   DELETE /object          — delete object by ?key= or body { key } (admin)
 *   POST   /sign-upload-url — NOT IMPLEMENTED (501)
 *
 * All routes require `requireAuth`. Write routes additionally gate by role.
 */

import { Hono } from "hono";
import { z } from "zod";
import type { Env } from "../../env.js";
import { requireAuth, requireRole } from "../../auth/middleware.js";

/* ═══════════════════════════════════════════════════════════════════
   Constants
   ═══════════════════════════════════════════════════════════════════ */

/** Cloudflare R2 single-op PUT limit is 5 MiB for free tier; multipart is 5 GiB.
 *  We use the documented single-op ceiling of 25 MiB to stay safe with one PUT. */
export const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024; // 25 MiB

/** R2 keys can be up to 1024 characters. */
export const MAX_KEY_LENGTH = 1024;

/** Maximum number of objects returned by /list in one page. */
export const MAX_LIST_LIMIT = 1000;
export const DEFAULT_LIST_LIMIT = 100;

/** Allowed characters in a storage key (after the uploads/ prefix is built). */
const KEY_CHAR_RE = /^[a-zA-Z0-9_\-\/\.]+$/;

/** Original filename — alphanumerics, dash, underscore, dot, space, parens. */
const FILENAME_RE = /^[a-zA-Z0-9_\-\.\s\(\)]+$/;

/* ═══════════════════════════════════════════════════════════════════
   Zod schemas — exported so tests can import them
   ═══════════════════════════════════════════════════════════════════ */

/** Schema for validating a fully-formed storage key (e.g. from query params). */
export const storageKeySchema = z
  .string()
  .min(1, "key_required")
  .max(MAX_KEY_LENGTH, "key_too_long")
  .refine((v) => KEY_CHAR_RE.test(v), "invalid_key_characters")
  .refine((v) => !v.includes(".."), "path_traversal_blocked");

/** Schema for the DELETE /object body ({ key }). */
export const deleteObjectBodySchema = z.object({
  key: storageKeySchema,
});

/** Schema for the /list query params. */
export const listQuerySchema = z.object({
  prefix: z.string().max(MAX_KEY_LENGTH).optional(),
  cursor: z.string().max(MAX_KEY_LENGTH).optional(),
  limit: z
    .union([z.string(), z.number()])
    .optional()
    .transform((v) => {
      if (v === undefined || v === null || v === "") return DEFAULT_LIST_LIMIT;
      const n = typeof v === "number" ? v : parseInt(v, 10);
      if (Number.isNaN(n) || n < 1) return DEFAULT_LIST_LIMIT;
      return Math.min(n, MAX_LIST_LIMIT);
    }),
});

/** Schema for validating the original filename component before it is used in a key. */
export const originalFilenameSchema = z
  .string()
  .min(1, "filename_required")
  .max(255, "filename_too_long")
  .refine((v) => FILENAME_RE.test(v), "invalid_filename")
  .refine((v) => !v.includes(".."), "path_traversal_blocked");

/* ═══════════════════════════════════════════════════════════════════
   Helper functions — exported for unit testing
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Sanitize a user-supplied storage key.
 *
 * Rules:
 *  - Must be non-empty and ≤ 1024 chars.
 *  - Only [a-zA-Z0-9_-/.] allowed.
 *  - Rejects `..` path traversal segments.
 *  - Trims leading/trailing whitespace.
 *
 * Returns the cleaned key, or throws `Error("invalid_key")`.
 */
export function sanitizeKey(input: string): string {
  if (typeof input !== "string") throw new Error("invalid_key");
  const trimmed = input.trim();
  if (trimmed.length === 0) throw new Error("empty_key");
  if (trimmed.length > MAX_KEY_LENGTH) throw new Error("key_too_long");
  if (!KEY_CHAR_RE.test(trimmed)) throw new Error("invalid_key_characters");
  // Reject any `..` segment — covers `/../`, leading `../`, trailing `/..`, bare `..`.
  if (trimmed.includes("..")) throw new Error("path_traversal_blocked");
  return trimmed;
}

/**
 * Build a structured upload key: `uploads/{yyyy}/{mm}/{uuid}-{originalName}`.
 *
 * The original name is sanitized to remove any path components and is
 * validated against `originalFilenameSchema`.
 */
export function buildUploadKey(originalName: string): string {
  const parsed = originalFilenameSchema.safeParse(originalName);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "invalid_filename");
  }
  const safe = parsed.data
    // Strip any path separators a client might sneak in.
    .replace(/[\/\\]+/g, "_")
    .trim();

  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const uuid = crypto.randomUUID();

  return `uploads/${yyyy}/${mm}/${uuid}-${safe}`;
}

/* ═══════════════════════════════════════════════════════════════════
   Router
   ═══════════════════════════════════════════════════════════════════ */

export const storageRouter = new Hono<{ Bindings: Env }>();

/* ── POST /upload — multipart/form-data file upload ──────────────── */
storageRouter.post(
  "/upload",
  requireAuth,
  requireRole("admin", "editor"),
  async (c) => {
    let form: FormData;
    try {
      form = await c.req.formData();
    } catch {
      return c.json({ error: "invalid_form_data" }, 400);
    }

    const file = form.get("file");
    if (!file || !(file instanceof File)) {
      return c.json({ error: "no_file_provided" }, 400);
    }

    // Size guard — check before streaming to R2.
    if (file.size > MAX_FILE_SIZE_BYTES) {
      return c.json(
        { error: "file_too_large", maxBytes: MAX_FILE_SIZE_BYTES },
        413,
      );
    }

    // Build a safe key from the original filename.
    let key: string;
    try {
      key = buildUploadKey(file.name);
    } catch (err) {
      const code = err instanceof Error ? err.message : "invalid_filename";
      return c.json({ error: code }, 400);
    }

    const contentType =
      file.type && file.type.length > 0 ? file.type : "application/octet-stream";

    try {
      await c.env.STORAGE.put(key, file.stream(), {
        httpMetadata: { contentType },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return c.json({ error: "r2_upload_failed", detail: msg }, 500);
    }

    return c.json(
      { key, size: file.size, contentType },
      201,
    );
  },
);

/* ── GET /list — paginate R2 objects ─────────────────────────────── */
storageRouter.get("/list", requireAuth, async (c) => {
  const parsed = listQuerySchema.safeParse({
    prefix: c.req.query("prefix") ?? undefined,
    cursor: c.req.query("cursor") ?? undefined,
    limit: c.req.query("limit") ?? undefined,
  });
  if (!parsed.success) {
    return c.json({ error: "validation_failed", issues: parsed.error.flatten() }, 400);
  }

  const { prefix, cursor, limit } = parsed.data;

  try {
    const result = await c.env.STORAGE.list({
      prefix,
      cursor,
      limit,
    });

    const objects = result.objects.map((o) => ({
      key: o.key,
      size: o.size,
      etag: o.etag,
      uploaded: o.uploaded?.toISOString() ?? null,
      httpMetadata: o.httpMetadata ?? null,
    }));

    return c.json({
      objects,
      truncated: result.truncated,
      cursor: result.truncated ? result.cursor : undefined,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({ error: "r2_list_failed", detail: msg }, 500);
  }
});

/* ── GET /object — stream a single R2 object by ?key= ───────────── */
storageRouter.get("/object", requireAuth, async (c) => {
  const rawKey = c.req.query("key");
  if (!rawKey) {
    return c.json({ error: "key_required" }, 400);
  }

  let key: string;
  try {
    key = sanitizeKey(rawKey);
  } catch (err) {
    const code = err instanceof Error ? err.message : "invalid_key";
    return c.json({ error: code }, 400);
  }

  let obj: R2ObjectBody | null;
  try {
    obj = await c.env.STORAGE.get(key);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({ error: "r2_get_failed", detail: msg }, 500);
  }

  if (!obj) {
    return c.json({ error: "not_found" }, 404);
  }

  const contentType =
    obj.httpMetadata?.contentType ?? "application/octet-stream";

  return new Response(obj.body, {
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(obj.size),
      ETag: obj.etag,
    },
  });
});

/* ── DELETE /object — remove a single R2 object ─────────────────── */
storageRouter.delete(
  "/object",
  requireAuth,
  requireRole("admin"),
  async (c) => {
    // Accept key from query param OR JSON body.
    let keyInput: string | undefined = c.req.query("key");

    if (!keyInput) {
      // Fall back to JSON body.
      let body: unknown;
      try {
        const raw = await c.req.text();
        body = raw ? JSON.parse(raw) : {};
      } catch {
        return c.json({ error: "invalid_json" }, 400);
      }

      const parsed = deleteObjectBodySchema.safeParse(body);
      if (!parsed.success) {
        return c.json(
          { error: "validation_failed", issues: parsed.error.flatten() },
          400,
        );
      }
      keyInput = parsed.data.key;
    }

    let key: string;
    try {
      key = sanitizeKey(keyInput);
    } catch (err) {
      const code = err instanceof Error ? err.message : "invalid_key";
      return c.json({ error: code }, 400);
    }

    try {
      await c.env.STORAGE.delete(key);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return c.json({ error: "r2_delete_failed", detail: msg }, 500);
    }

    return c.json({ success: true });
  },
);

/* ── POST /sign-upload-url — presigned upload URL (TODO) ─────────── */
storageRouter.post(
  "/sign-upload-url",
  requireAuth,
  requireRole("admin", "editor"),
  async (c) => {
    // TODO: Implement R2 presigned URL generation once the Workers R2
    // binding exposes `createMultipartUpload` or a signed-URL helper in
    // the runtime. For now the basic POST /upload endpoint covers the
    // common case.
    return c.json({ error: "not_implemented" }, 501);
  },
);
