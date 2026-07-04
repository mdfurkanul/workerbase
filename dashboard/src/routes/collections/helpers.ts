/**
 * System tables are read-only in the collection view. Their records are
 * managed exclusively through dedicated admin pages:
 *
 *   `_superusers` → /users  (proper password hashing, role assignment,
 *                            token-key rotation via the superusers API)
 *   `_tokens`     → managed by the auth flows (magic-link / reset)
 *   `_logs`       → append-only by the request logger
 *   etc.
 *
 * Attempting to add/edit a system-table row through the generic records
 * endpoint would skip hashing, salting, and bookkeeping — so we hide the
 * affordances entirely and point users at the right tool.
 */
export function collectionAllowsRecordEdits(name: string, type: string): boolean {
  // System tables are managed via dedicated admin pages.
  // Views are read-only (saved SELECT) — no insert/update/delete on rows.
  return !name.startsWith("_") && type !== "view";
}
