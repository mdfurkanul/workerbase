/**
 * URL helpers for the query-param-driven collection routes.
 *
 * Pattern:
 *   /collections                                   — all collections index
 *   /collections?collections=NAME                  — records table
 *   /collections?collections=NAME&action=new       — new record
 *   /collections?collections=NAME&action=edit      — edit collection schema
 *   /collections?collections=NAME&action=settings  — permissions / settings
 *   /collections?collections=NAME&record=ID        — single record detail
 *
 * Plus optional filters on the records view:
 *   page, perPage, sort, filter, q (search)
 */

export type CollectionAction = "new" | "edit" | "settings";

export interface CollectionUrlOpts {
  action?: CollectionAction;
  record?: string;
  page?: number;
  perPage?: number;
  sort?: string;
  filter?: string;
  q?: string;
}

/** Build a `/collections?...` URL string for the given collection + options. */
export function buildCollectionUrl(name: string, opts: CollectionUrlOpts = {}): string {
  const params = new URLSearchParams();
  params.set("collections", name);
  if (opts.action) params.set("action", opts.action);
  if (opts.record) params.set("record", opts.record);
  if (opts.page && opts.page > 1) params.set("page", String(opts.page));
  if (opts.perPage) params.set("perPage", String(opts.perPage));
  if (opts.sort) params.set("sort", opts.sort);
  if (opts.filter) params.set("filter", opts.filter);
  if (opts.q) params.set("q", opts.q);
  const qs = params.toString();
  return qs ? `/collections?${qs}` : "/collections";
}

/** Parse the active `collections` query-param value (or null). */
export function readSelectedCollection(search: string): string | null {
  const params = new URLSearchParams(search);
  const v = params.get("collections");
  return v && v.length > 0 ? v : null;
}
