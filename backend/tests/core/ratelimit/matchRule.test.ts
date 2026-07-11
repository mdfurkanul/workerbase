import { describe, it, expect } from "vitest";
import { matchRule } from "../../../src/ratelimit/matchRule.js";

describe("matchRule", () => {
  // 1. Catch-all "/" matches everything
  it("matches all paths when label is '/'", () => {
    expect(matchRule("/", "/api/collections/users/records", "GET")).toBe(true);
    expect(matchRule("/", "/anything", "POST")).toBe(true);
    expect(matchRule("/", "/", "GET")).toBe(true);
  });

  // 2. Prefix match — "/api/" matches paths starting with /api/
  it("matches prefix paths for labels ending with /", () => {
    expect(matchRule("/api/", "/api/collections/users", "GET")).toBe(true);
    expect(matchRule("/api/", "/api/", "GET")).toBe(true);
    expect(matchRule("/api/", "/dashboard", "GET")).toBe(false);
  });

  // 3. Wildcard suffix — "*.auth" matches paths containing "auth"
  it("matches paths containing the keyword for *.keyword labels", () => {
    expect(matchRule("*.auth", "/api/collections/users/auth/login", "POST")).toBe(true);
    expect(matchRule("*.auth", "/api/collections/users/auth/register", "POST")).toBe(true);
    expect(matchRule("*.auth", "/api/collections/users/records", "GET")).toBe(false);
  });

  // 4. Wildcard suffix — "*.create" matches POST to /records or paths ending /create
  it("matches POST to /records and /create paths for *.create label", () => {
    expect(matchRule("*.create", "/api/collections/posts/records", "POST")).toBe(true);
    expect(matchRule("*.create", "/api/core/collections/posts/records", "POST")).toBe(true);
    expect(matchRule("*.create", "/some/path/create", "POST")).toBe(true);
    // GET to /records should NOT match *.create
    expect(matchRule("*.create", "/api/collections/posts/records", "GET")).toBe(false);
  });

  // 5. Exact path match
  it("matches exact paths when no wildcard or trailing slash", () => {
    expect(matchRule("/api/batch", "/api/batch", "POST")).toBe(true);
    expect(matchRule("/api/batch", "/api/batch/users", "POST")).toBe(false);
  });

  // 6. Wildcard prefix — "/api/*"
  it("matches paths starting with prefix for labels ending with /*", () => {
    expect(matchRule("/api/*", "/api/collections", "GET")).toBe(true);
    expect(matchRule("/api/*", "/api/", "GET")).toBe(true);
    expect(matchRule("/api/*", "/dashboard", "GET")).toBe(false);
  });

  // 7. Empty label acts as catch-all
  it("treats empty label as catch-all", () => {
    expect(matchRule("", "/anything", "GET")).toBe(true);
  });

  // 8. Case-insensitive keyword matching for *.keyword
  it("matches keywords case-insensitively", () => {
    expect(matchRule("*.AUTH", "/api/users/auth/login", "POST")).toBe(true);
  });
});
