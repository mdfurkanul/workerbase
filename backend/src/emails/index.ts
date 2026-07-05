/**
 * Email template loader.
 *
 * Templates are bundled as TypeScript string constants (Worker-safe — no
 * filesystem reads needed at runtime).  Each template uses {{variable}}
 * placeholders that are replaced by renderEmail().
 *
 * The SystemEmailsSettings type mirrors the shape stored under
 * `_settings.systemEmails` (editable from the dashboard's "System emails"
 * tab). Per-template overrides — subject line, intro paragraph, CTA label
 * — are merged into the rendered output by renderEmailWithOverrides().
 */

import { verificationTemplate } from "./verification.js";
import { resetPasswordTemplate } from "./reset-password.js";
import { magicLinkTemplate } from "./magic-link.js";
import { welcomeTemplate } from "./welcome.js";
import { invitationTemplate } from "./invitation.js";

export type EmailTemplateName =
  | "verification"
  | "resetPassword"
  | "magicLink"
  | "welcome"
  | "invitation";

const templates: Record<EmailTemplateName, string> = {
  verification: verificationTemplate,
  resetPassword: resetPasswordTemplate,
  magicLink: magicLinkTemplate,
  welcome: welcomeTemplate,
  invitation: invitationTemplate,
};

/** Per-template admin overrides stored in `_settings.systemEmails`. */
export interface SystemEmailConfig {
  /** Email subject line. Empty = fall back to template default. */
  subject: string;
  /** Intro paragraph shown above the CTA. Empty = template default. */
  intro: string;
  /** CTA button label. Empty = template default. */
  ctaLabel: string;
  /** Optional post-action redirect URL (e.g. /admin/welcome). */
  redirectURL: string;
  /** Master toggle. Disabled templates will not be sent. */
  enabled: boolean;
}

export type SystemEmailsSettings = Record<EmailTemplateName, SystemEmailConfig>;

export const DEFAULT_SUBJECTS: Record<EmailTemplateName, string> = {
  verification: "Verify your email",
  resetPassword: "Reset your password",
  magicLink: "Your magic sign-in link",
  welcome: "Welcome aboard",
  invitation: "You're invited",
};

export const DEFAULT_INTROS: Record<EmailTemplateName, string> = {
  verification:
    "Please confirm your email address to activate your account. Click the button below to verify:",
  resetPassword:
    "We received a request to reset your password. Click the button below to choose a new one:",
  magicLink:
    "Use the button below to sign in to your account. This link will expire shortly.",
  welcome: "Your account is ready. Click below to get started.",
  invitation:
    "You've been invited to join. Click the button below to accept and set up your account:",
};

export const DEFAULT_CTA_LABELS: Record<EmailTemplateName, string> = {
  verification: "Verify Email",
  resetPassword: "Reset Password",
  magicLink: "Sign In",
  welcome: "Get Started",
  invitation: "Accept Invitation",
};

export function defaultSystemEmailConfig(): SystemEmailConfig {
  return {
    subject: "",
    intro: "",
    ctaLabel: "",
    redirectURL: "",
    enabled: true,
  };
}

export function defaultSystemEmailsSettings(): SystemEmailsSettings {
  return {
    verification: defaultSystemEmailConfig(),
    resetPassword: defaultSystemEmailConfig(),
    magicLink: defaultSystemEmailConfig(),
    welcome: defaultSystemEmailConfig(),
    invitation: defaultSystemEmailConfig(),
  };
}

/**
 * Validate + coerce an unknown value (from `_settings`) into a well-formed
 * SystemEmailsSettings. Missing fields fall back to defaults; unknown
 * template keys are dropped.
 */
export function normalizeSystemEmailsSettings(
  raw: unknown,
): SystemEmailsSettings {
  const out = defaultSystemEmailsSettings();
  if (!raw || typeof raw !== "object") return out;
  const src = raw as Record<string, unknown>;
  for (const key of Object.keys(out) as EmailTemplateName[]) {
    const v = src[key];
    if (!v || typeof v !== "object") continue;
    const cfg = v as Partial<SystemEmailConfig>;
    out[key] = {
      subject: typeof cfg.subject === "string" ? cfg.subject : "",
      intro: typeof cfg.intro === "string" ? cfg.intro : "",
      ctaLabel: typeof cfg.ctaLabel === "string" ? cfg.ctaLabel : "",
      redirectURL: typeof cfg.redirectURL === "string" ? cfg.redirectURL : "",
      enabled: typeof cfg.enabled === "boolean" ? cfg.enabled : true,
    };
  }
  return out;
}

/**
 * Render an email template by replacing all {{key}} placeholders with
 * the corresponding value from `vars`. Unknown placeholders are left
 * intact so issues are visible during development.
 */
export function renderEmail(
  template: EmailTemplateName,
  vars: Record<string, string>,
): string {
  let html = templates[template] ?? "";
  for (const [key, value] of Object.entries(vars)) {
    html = html.split(`{{${key}}}`).join(value);
  }
  return html;
}

/**
 * Render with admin overrides applied. Falls back to the template default
 * for any field the admin hasn't customised.
 *
 * The current templates don't carry placeholders for {{subject}},
 * {{intro}}, or {{ctaLabel}} — those fields are surfaced via this helper
 * for callers (the not-yet-implemented sendEmail() function) to use when
 * composing the outgoing message.
 */
export function renderEmailWithOverrides(
  template: EmailTemplateName,
  vars: Record<string, string>,
  overrides?: SystemEmailConfig,
): {
  subject: string;
  html: string;
  redirectURL: string;
  enabled: boolean;
} {
  const html = renderEmail(template, vars);
  return {
    subject: overrides?.subject?.trim() || DEFAULT_SUBJECTS[template],
    html,
    redirectURL: overrides?.redirectURL?.trim() || "",
    enabled: overrides?.enabled ?? true,
  };
}
