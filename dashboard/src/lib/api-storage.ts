/**
 * Storage (R2) helpers for the dashboard.
 *
 * Wraps the admin storage endpoints so record-field widgets can upload
 * files and resolve object URLs without re-implementing the multipart
 * plumbing each time.
 *
 *   POST   /api/core/storage/upload   — multipart `file` field → { key, size, contentType }
 *   GET    /api/core/storage/object   — streams the bytes back for a `?key=`
 */

import { apiClient } from "./api-client";

/** Shape returned by POST /api/core/storage/upload. */
export interface UploadedFile {
  /** Full R2 key (e.g. `uploads/2026/07/<uuid>-foo.png`). Store this on the record. */
  key: string;
  /** Size in bytes. */
  size: number;
  /** Best-effort content type. */
  contentType: string;
}

/**
 * Upload a single file via the admin storage endpoint.
 *
 * Uses `apiClient.post` which passes `FormData` through untouched (no
 * JSON content-type), and attaches the bearer token automatically.
 */
export async function uploadFile(file: File): Promise<UploadedFile> {
  const fd = new FormData();
  fd.append("file", file);
  return apiClient.post<UploadedFile>("/api/core/storage/upload", fd);
}

/**
 * Build a URL that streams the object back via GET /api/core/storage/object.
 *
 * The path is same-origin by default; pass `VITE_API_BASE_URL` to point at
 * a remote Worker dev URL.
 */
export function objectUrl(key: string): string {
  const base = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "";
  const prefix = base.endsWith("/") || key.startsWith("/") ? "" : "/";
  return `${base}${prefix}/api/core/storage/object?key=${encodeURIComponent(key)}`;
}

/** Best-effort detection of image content types for inline previews. */
export function isImageKey(key: string, contentType?: string): boolean {
  if (contentType && contentType.startsWith("image/")) return true;
  return /\.(png|jpe?g|webp|gif|svg|avif|bmp)$/i.test(key);
}
