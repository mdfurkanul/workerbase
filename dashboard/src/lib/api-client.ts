/**
 * Typed fetch wrapper for the WorkerBase API.
 *
 * - Attaches `Authorization: Bearer <token>` from localStorage on every request.
 * - Base URL defaults to same-origin ("") but can be overridden via
 *   `VITE_API_BASE_URL` for development against a remote Worker.
 * - Exposes `get`, `post`, `put`, `patch`, `del` helpers that return typed JSON.
 * - Throws `ApiError` (with `{ status, message, detail }`) on non-2xx responses.
 * - On HTTP 401 the stored token is cleared and the user is redirected to /login.
 */

const TOKEN_KEY = "workerbase.token";

/** Read the Vite env var at module load; falls back to same-origin. */
const BASE_URL: string = import.meta.env.VITE_API_BASE_URL ?? "";

/** Error thrown for any non-2xx API response. */
export class ApiError extends Error {
  /** HTTP status code returned by the server. */
  readonly status: number;
  /** Short machine-readable error code from the JSON body (falls back to status text). */
  readonly detail: unknown;

  constructor(status: number, message: string, detail: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
  }
}

/** Retrieve the bearer token from localStorage (or null when absent). */
export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

/** Persist / overwrite the bearer token. */
export function setToken(token: string): void {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    /* ignore quota / privacy-mode errors */
  }
}

/** Remove the bearer token (used on logout / 401). */
export function clearToken(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

// ─────────────────────────────────────────────────────────────
//  Internal helpers
// ─────────────────────────────────────────────────────────────

/** Build an absolute or relative URL from the base + path + query. */
function buildUrl(path: string, query?: Record<string, unknown>): string {
  const prefix = BASE_URL;
  const slash = prefix.endsWith("/") || path.startsWith("/") ? "" : "/";
  const base = `${prefix}${slash}${path}`;

  if (!query) return base;

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue;
    params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}

/** Merge default headers with per-request overrides. */
function buildHeaders(custom?: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/json",
  };

  const token = getToken();
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  if (custom) {
    for (const [key, value] of Object.entries(custom)) {
      headers[key] = value;
    }
  }

  return headers;
}

/** Determine whether a body should be JSON-serialised. */
function prepareBody(
  body: unknown,
  headers: Record<string, string>,
): BodyInit | undefined {
  if (body === undefined) return undefined;

  // FormData / Blob / URLSearchParams / string pass through untouched.
  if (
    typeof body === "string" ||
    body instanceof FormData ||
    body instanceof URLSearchParams ||
    body instanceof Blob ||
    body instanceof ArrayBuffer
  ) {
    return body as BodyInit;
  }

  // Default: JSON-encode and set content-type if not already provided.
  if (!headers["Content-Type"] && !headers["content-type"]) {
    headers["Content-Type"] = "application/json";
  }
  return JSON.stringify(body);
}

/**
 * Core request function.  Throws `ApiError` on non-2xx; returns typed JSON on
 * success.
 */
async function request<T>(
  method: string,
  path: string,
  opts: {
    body?: unknown;
    query?: Record<string, unknown>;
    headers?: Record<string, string>;
    signal?: AbortSignal;
  } = {},
): Promise<T> {
  const url = buildUrl(path, opts.query);
  const headers = buildHeaders(opts.headers);
  const init: RequestInit = {
    method,
    headers,
    signal: opts.signal,
  };

  const payload = prepareBody(opts.body, headers);
  if (payload !== undefined) {
    init.body = payload;
  }

  let res: Response;
  try {
    res = await fetch(url, init);
  } catch (err) {
    // Network failure / CORS / DNS — surface as a 0-status ApiError.
    const msg = err instanceof Error ? err.message : String(err);
    throw new ApiError(0, `network_error: ${msg}`, err);
  }

  if (res.status === 401) {
    clearToken();
    // Guard against redirect loops when already on /login.
    if (!window.location.pathname.startsWith("/login")) {
      window.location.href = "/login";
    }
    // Still throw so the caller can react in-memory.
    throw new ApiError(401, "unauthorized", null);
  }

  // Parse JSON when possible; fall back to raw text.
  let data: unknown = null;
  const contentType = res.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    try {
      data = await res.json();
    } catch {
      data = null;
    }
  } else if (res.status !== 204) {
    try {
      data = await res.text();
    } catch {
      data = null;
    }
  }

  if (!res.ok) {
    const payload = data as { error?: string; detail?: unknown } | null;
    const message = payload?.error ?? `HTTP ${res.status}`;
    throw new ApiError(res.status, message, payload?.detail ?? data);
  }

  return data as T;
}

// ─────────────────────────────────────────────────────────────
//  Public API surface
// ─────────────────────────────────────────────────────────────

export const apiClient = {
  get<T>(
    path: string,
    query?: Record<string, unknown>,
    opts?: { headers?: Record<string, string>; signal?: AbortSignal },
  ): Promise<T> {
    return request<T>("GET", path, { query, ...opts });
  },

  post<T>(
    path: string,
    body?: unknown,
    opts?: { headers?: Record<string, string>; signal?: AbortSignal },
  ): Promise<T> {
    return request<T>("POST", path, { body, ...opts });
  },

  put<T>(
    path: string,
    body?: unknown,
    opts?: { headers?: Record<string, string>; signal?: AbortSignal },
  ): Promise<T> {
    return request<T>("PUT", path, { body, ...opts });
  },

  patch<T>(
    path: string,
    body?: unknown,
    opts?: { headers?: Record<string, string>; signal?: AbortSignal },
  ): Promise<T> {
    return request<T>("PATCH", path, { body, ...opts });
  },

  del<T>(
    path: string,
    opts?: { headers?: Record<string, string>; signal?: AbortSignal },
  ): Promise<T> {
    return request<T>("DELETE", path, opts);
  },
};

export type ApiClient = typeof apiClient;
