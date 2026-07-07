import { describe, it, expect } from "vitest";
import {
  levelFromStatus,
  LOG_RETENTION_LIMIT,
} from "../../../src/core/logs/logsRouter.js";

/**
 * Logs router — pure-helper unit tests.
 *
 * The HTTP-layer behaviour (pagination, level filter, 401 on missing
 * bearer) is exercised end-to-end via the wrangler-pool harness; the
 * surface here is the deterministic status → level classifier and the
 * retention constant.
 */

describe("levelFromStatus", () => {
  // 1. Happy path — 2xx → info
  it("classifies 2xx as info", () => {
    expect(levelFromStatus(200)).toBe("info");
    expect(levelFromStatus(201)).toBe("info");
    expect(levelFromStatus(204)).toBe("info");
  });

  // 2. Happy path — 3xx → info (redirects aren't warnings)
  it("classifies 3xx as info", () => {
    expect(levelFromStatus(301)).toBe("info");
    expect(levelFromStatus(304)).toBe("info");
  });

  // 3. Validation/warn — 4xx → warn
  it("classifies 4xx as warn", () => {
    expect(levelFromStatus(400)).toBe("warn");
    expect(levelFromStatus(401)).toBe("warn");
    expect(levelFromStatus(403)).toBe("warn");
    expect(levelFromStatus(404)).toBe("warn");
    expect(levelFromStatus(422)).toBe("warn");
  });

  // 4. Error — 5xx → error
  it("classifies 5xx as error", () => {
    expect(levelFromStatus(500)).toBe("error");
    expect(levelFromStatus(502)).toBe("error");
    expect(levelFromStatus(503)).toBe("error");
  });

  // 5. Edge case — boundary values
  it("puts the boundaries at the right place (399 info, 400 warn, 499 warn, 500 error)", () => {
    expect(levelFromStatus(399)).toBe("info");
    expect(levelFromStatus(400)).toBe("warn");
    expect(levelFromStatus(499)).toBe("warn");
    expect(levelFromStatus(500)).toBe("error");
  });
});

describe("LOG_RETENTION_LIMIT", () => {
  // 1. Happy path — exported as a sane positive integer
  it("is a positive integer", () => {
    expect(typeof LOG_RETENTION_LIMIT).toBe("number");
    expect(LOG_RETENTION_LIMIT).toBeGreaterThan(0);
    expect(Number.isInteger(LOG_RETENTION_LIMIT)).toBe(true);
  });

  // 2. Edge case — large enough not to lose recent context
  it("is at least 1000 (typical traffic for diagnostics)", () => {
    expect(LOG_RETENTION_LIMIT).toBeGreaterThanOrEqual(1000);
  });
});
