/**
 * Email template loader.
 *
 * Templates are bundled as TypeScript string constants (Worker-safe — no
 * filesystem reads needed at runtime).  Each template uses {{variable}}
 * placeholders that are replaced by renderEmail().
 */

import { verificationTemplate } from "./verification.js";
import { resetPasswordTemplate } from "./reset-password.js";
import { magicLinkTemplate } from "./magic-link.js";
import { welcomeTemplate } from "./welcome.js";

export type EmailTemplateName =
  | "verification"
  | "resetPassword"
  | "magicLink"
  | "welcome";

const templates: Record<EmailTemplateName, string> = {
  verification: verificationTemplate,
  resetPassword: resetPasswordTemplate,
  magicLink: magicLinkTemplate,
  welcome: welcomeTemplate,
};

/**
 * Render an email template by replacing all {{key}} placeholders with
 * the corresponding value from `vars`.  Unknown placeholders are left
 * intact so issues are visible during development.
 */
export function renderEmail(
  template: EmailTemplateName,
  vars: Record<string, string>,
): string {
  let html = templates[template] ?? "";
  for (const [key, value] of Object.entries(vars)) {
    // Use split/join for global replacement without regex special-char issues.
    html = html.split(`{{${key}}}`).join(value);
  }
  return html;
}
