/**
 * Rate limit rule pattern matching.
 *
 * Supports PocketBase-style label patterns:
 *
 *   *.auth      → matches any path containing "auth"
 *   *.create    → matches paths ending with /create, or POST to /records
 *   /api/batch  → matches paths starting with /api/batch
 *   /api/       → matches paths starting with /api/
 *   /           → matches everything (catch-all)
 *   <exact>     → exact path match
 */

/**
 * Returns true when the given request path + method matches the rule label.
 */
export function matchRule(label: string, path: string, method: string): boolean {
  const l = label.trim();

  // Catch-all
  if (l === "/" || l === "") return true;

  // Wildcard suffix: *.keyword
  if (l.startsWith("*.")) {
    const keyword = l.slice(2).toLowerCase();

    // *.create → POST to a records endpoint or any path ending with /create
    if (keyword === "create") {
      if (method.toUpperCase() === "POST" && /\/records(?:\/)?$/.test(path)) return true;
      return path.toLowerCase().endsWith("/create");
    }

    // *.auth → any path containing "auth"
    return path.toLowerCase().includes(keyword);
  }

  // Wildcard prefix: /api/*
  if (l.endsWith("/*")) {
    return path.startsWith(l.slice(0, -1));
  }

  // Prefix match (e.g. /api/ matches /api/collections/...)
  if (l.endsWith("/")) {
    return path.startsWith(l);
  }

  // Exact match
  return path === l;
}
