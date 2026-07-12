import { describe, it, expect } from "vitest";
import { z } from "zod";
import { DEFAULT_SETTINGS } from "../../../src/core/install/installRouter.js";

/**
 * Phase 1 — Installation flow tests.
 *
 * These are pure unit tests on the install payload schema + the exported
 * default settings map. Full D1 integration coverage will be added when
 * a Workers-pool test harness is wired up.
 */

// Mirror the install payload schema exactly as the router defines it.
const installSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(8).max(256),
  appName: z.string().min(1).max(64).optional(),
  brandColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
});

describe("POST /api/core/install — payload validation", () => {
  // 1. Happy path
  it("accepts a valid install payload", () => {
    const result = installSchema.safeParse({
      email: "admin@workerbase.dev",
      password: "Password123",
      appName: "WorkerBase",
      brandColor: "#F38020",
    });
    expect(result.success).toBe(true);
  });

  // 2. Validation failure — invalid email
  it("rejects an invalid email", () => {
    const result = installSchema.safeParse({
      email: "not-an-email",
      password: "Password123",
    });
    expect(result.success).toBe(false);
  });

  // 3. Validation failure — password too short
  it("rejects a password shorter than 8 chars", () => {
    const result = installSchema.safeParse({
      email: "admin@workerbase.dev",
      password: "short",
    });
    expect(result.success).toBe(false);
  });

  // 4. Edge case — minimal payload (no optional fields)
  it("accepts a minimal payload with only email + password", () => {
    const result = installSchema.safeParse({
      email: "admin@workerbase.dev",
      password: "Password123",
    });
    expect(result.success).toBe(true);
  });

  // 5. Edge case — invalid brand color format
  it("rejects a malformed brand color", () => {
    const result = installSchema.safeParse({
      email: "admin@workerbase.dev",
      password: "Password123",
      brandColor: "orange",
    });
    expect(result.success).toBe(false);
  });

  // 6. Edge case — empty body
  it("rejects an empty object", () => {
    const result = installSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  // 7. Edge case — excessively long email
  it("rejects an email longer than 254 chars", () => {
    const longEmail = "a".repeat(250) + "@x.io";
    const result = installSchema.safeParse({
      email: longEmail,
      password: "Password123",
    });
    expect(result.success).toBe(false);
  });

  // 8. Conflict — password at boundary (exactly 8 chars is valid)
  it("accepts a password of exactly 8 characters", () => {
    const result = installSchema.safeParse({
      email: "admin@workerbase.dev",
      password: "12345678",
    });
    expect(result.success).toBe(true);
  });
});

describe("DEFAULT_SETTINGS", () => {
  // 1. installed flag defaults to false
  it("contains the installed flag defaulting to false", () => {
    expect(DEFAULT_SETTINGS.installed).toBe(false);
  });

  // 2. brand color is Cloudflare orange
  it("uses Cloudflare orange as the default brand color", () => {
    expect(DEFAULT_SETTINGS.brandColor).toBe("#F38020");
  });

  // 3. storage quota is a positive number
  it("exposes a storage quota", () => {
    expect(typeof DEFAULT_SETTINGS.storageQuotaMB).toBe("number");
    expect(DEFAULT_SETTINGS.storageQuotaMB).toBeGreaterThan(0);
  });

  // 4. Every feature that reads from _settings must have a default so
  //    a fresh install doesn't 500 on a missing key.
  it("ships defaults for every feature settings blob", () => {
    const required = ["backups", "logs", "mail", "storage", "rateLimit"];
    for (const key of required) {
      expect(DEFAULT_SETTINGS, `missing default for "${key}"`).toHaveProperty(key);
      expect(DEFAULT_SETTINGS[key]).toBeDefined();
    }
  });

  // 5. backups + logs defaults match the canonical feature defaults
  it("seeds backups and logs defaults that match the feature modules", async () => {
    const { DEFAULT_BACKUPS_SETTINGS } = await import(
      "../../../src/core/backups/backupsRouter.js"
    );
    const { DEFAULT_LOGS_SETTINGS } = await import(
      "../../../src/core/logs/logsRouter.js"
    );
    expect(DEFAULT_SETTINGS.backups).toEqual(DEFAULT_BACKUPS_SETTINGS);
    expect(DEFAULT_SETTINGS.logs).toEqual(DEFAULT_LOGS_SETTINGS);
  });

  // 6. Edge case — date/time defaults are valid enum values
  it("uses valid date/time format defaults", () => {
    expect(typeof DEFAULT_SETTINGS.timezone).toBe("string");
    expect(DEFAULT_SETTINGS.dateTimeFormat).toBe("iso8601");
  });

  // 7. Edge case — appName is a non-empty string
  it("provides a non-empty default appName", () => {
    expect(typeof DEFAULT_SETTINGS.appName).toBe("string");
    expect((DEFAULT_SETTINGS.appName as string).length).toBeGreaterThan(0);
  });
});
