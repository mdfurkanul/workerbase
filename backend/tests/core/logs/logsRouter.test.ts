import { describe, it, expect } from "vitest";
import {
  levelFromStatus,
  DEFAULT_LOGS_SETTINGS,
  LOGS_SETTINGS_KEY,
  type LogsSettings,
} from "../../../src/core/logs/logsRouter.js";

/**
 * Logs router — pure-helper unit tests.
 *
 * The HTTP-layer behaviour (pagination, level filter, 401 on missing
 * bearer) is exercised end-to-end via the wrangler-pool harness; the
 * surface here is the deterministic status → level classifier and the
 * default settings constants.
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

describe("DEFAULT_LOGS_SETTINGS", () => {
  // 1. Happy path — sensible defaults populated
  it("ships with sane defaults", () => {
    expect(DEFAULT_LOGS_SETTINGS.retentionLimit).toBeGreaterThan(0);
    expect(DEFAULT_LOGS_SETTINGS.retentionDays).toBeGreaterThanOrEqual(0);
    expect(DEFAULT_LOGS_SETTINGS.lastPrunedAt).toBeNull();
  });

  // 2. Edge case — retention limit large enough for diagnostics
  it("defaults retentionLimit to at least 1000", () => {
    expect(DEFAULT_LOGS_SETTINGS.retentionLimit).toBeGreaterThanOrEqual(1000);
  });

  // 3. Edge case — retentionDays defaults to 0 (disabled)
  it("defaults retentionDays to 0 (off)", () => {
    expect(DEFAULT_LOGS_SETTINGS.retentionDays).toBe(0);
  });

  // 4. Settings key is stable string
  it("uses 'logs' as the settings key", () => {
    expect(LOGS_SETTINGS_KEY).toBe("logs");
  });

  // 5. Type sanity — LogsSettings has the expected shape
  it("exposes the LogsSettings shape", () => {
    const s: LogsSettings = { ...DEFAULT_LOGS_SETTINGS };
    expect(typeof s.retentionLimit).toBe("number");
    expect(typeof s.retentionDays).toBe("number");
    expect(s.lastPrunedAt === null || typeof s.lastPrunedAt === "number").toBe(true);
  });
});
