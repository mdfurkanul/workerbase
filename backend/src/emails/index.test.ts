import { describe, it, expect } from "vitest";
import { renderEmail } from "./index.js";

describe("email template rendering", () => {
  it("replaces {{variables}} in the verification template", () => {
    const html = renderEmail("verification", {
      appName: "WorkerBase",
      email: "admin@workerbase.dev",
      actionURL: "https://app.workerbase.dev/verify?token=abc123",
      year: "2026",
    });
    expect(html).toContain("WorkerBase");
    expect(html).toContain("admin@workerbase.dev");
    expect(html).toContain("https://app.workerbase.dev/verify?token=abc123");
    expect(html).toContain("2026");
    // No unresolved placeholders
    expect(html).not.toContain("{{");
  });

  it("replaces variables in the reset-password template", () => {
    const html = renderEmail("resetPassword", {
      appName: "WorkerBase",
      email: "user@test.com",
      actionURL: "https://app.workerbase.dev/reset?token=xyz",
      year: "2026",
    });
    expect(html).toContain("Reset your password");
    expect(html).toContain("user@test.com");
    expect(html).not.toContain("{{");
  });

  it("replaces variables in the magic-link template", () => {
    const html = renderEmail("magicLink", {
      appName: "WorkerBase",
      email: "user@test.com",
      actionURL: "https://app.workerbase.dev/magic?token=magic123",
      year: "2026",
    });
    expect(html).toContain("Sign in");
    expect(html).toContain("magic123");
    expect(html).not.toContain("{{");
  });

  it("replaces variables in the welcome template", () => {
    const html = renderEmail("welcome", {
      appName: "WorkerBase",
      email: "newuser@test.com",
      actionURL: "https://app.workerbase.dev/verify?token=welcome",
      year: "2026",
    });
    expect(html).toContain("WorkerBase");
    expect(html).not.toContain("{{");
  });

  it("includes Cloudflare orange (#F38020) in every template", () => {
    for (const tmpl of ["verification", "resetPassword", "magicLink", "welcome"] as const) {
      const html = renderEmail(tmpl, {
        appName: "Test",
        email: "t@t.com",
        actionURL: "https://t.com",
        year: "2026",
      });
      expect(html).toContain("#F38020");
    }
  });
});
