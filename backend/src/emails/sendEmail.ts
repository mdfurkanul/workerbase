/**
 * Email delivery — backed by the Cloudflare Email Service `send_email`
 * binding (`env.EMAIL`).
 *
 * In local development, `wrangler dev` simulates the binding: emails are
 * not actually delivered; instead the content is logged to the wrangler
 * console and saved to temp files (see the Cloudflare docs for details).
 * When deployed (or when `remote: true` is set on the binding), real
 * emails flow through the Email Service.
 *
 * Sender details (`fromAddress`, `fromName`) are read from the `_settings`
 * table (`settings.mail`). If no sender is configured we fall back to a
 * sensible default so flows are still testable locally.
 */

import type { Env } from "../env.js";
import {
  type EmailTemplateName,
  type SystemEmailConfig,
  renderEmailWithOverrides,
  normalizeSystemEmailsSettings,
} from "./index.js";

/** Shape of the `mail` setting stored in `_settings`. */
interface MailSettings {
  fromAddress?: string;
  fromName?: string;
}

const DEFAULT_FROM_ADDRESS = "no-reply@workerbase.dev";
const DEFAULT_FROM_NAME = "Workerbase";
const DEFAULT_APP_NAME = "Workerbase";

export interface SendEmailOptions {
  to: string;
  template: EmailTemplateName;
  /** Placeholder vars for the email template (e.g. actionURL, email). */
  vars: Record<string, string>;
  /** Per-template admin overrides from `_settings.systemEmails`. */
  overrides?: SystemEmailConfig;
}

/**
 * Read the `mail` + `systemEmails` settings from `_settings` and send an
 * email via the Cloudflare Email Service binding.
 *
 * - If the binding is absent (not configured), falls back to console logging.
 * - If the template is disabled via overrides, the call is a no-op.
 * - Never throws — email failures are caught + logged so auth flows don't
 *   break when email delivery is unavailable.
 */
export async function sendEmail(env: Env, opts: SendEmailOptions): Promise<void> {
  const settings = await readSettings(env);
  const mail = (settings.mail as MailSettings | undefined) ?? {};
  const systemEmails = normalizeSystemEmailsSettings(settings.systemEmails);
  const overrides = opts.overrides ?? systemEmails[opts.template];

  const appName = String(settings.appName ?? DEFAULT_APP_NAME);
  const year = String(new Date().getFullYear());

  const { subject, html, enabled } = renderEmailWithOverrides(
    opts.template,
    { ...opts.vars, appName, email: opts.vars.email ?? "", year },
    overrides,
  );

  if (!enabled) {
    return;
  }

  const fromName = (mail.fromName ?? DEFAULT_FROM_NAME).trim() || DEFAULT_FROM_NAME;
  const fromAddress = (mail.fromAddress ?? DEFAULT_FROM_ADDRESS).trim() || DEFAULT_FROM_ADDRESS;
  const from = fromName ? `${fromName} <${fromAddress}>` : fromAddress;

  // No binding configured — log so flows remain testable.
  if (!env.EMAIL) {
    if (env.ENVIRONMENT === "local") {
      console.log(
        `[email:fallback] to=${opts.to} from=${from} subject=${subject}\n` +
          `actionURL=${opts.vars.actionURL ?? "(none)"}`,
      );
    }
    return;
  }

  try {
    await env.EMAIL.send({
      to: opts.to,
      from,
      subject,
      html,
    });
  } catch (err) {
    // Email delivery is best-effort — never crash auth flows over it.
    console.error(
      "email_send_failed",
      err instanceof Error ? err.message : String(err),
    );
  }
}

/**
 * Load the full `_settings` table into a plain object.
 * Values are JSON-parsed when possible.
 */
async function readSettings(env: Env): Promise<Record<string, unknown>> {
  const { results } = await env.SYSTEM_DB.prepare(
    `SELECT key, value FROM _settings`,
  ).all<{ key: string; value: string | null }>();

  const out: Record<string, unknown> = {};
  for (const row of results ?? []) {
    if (!row.key) continue;
    out[row.key] = row.value == null ? null : safeParse(row.value);
  }
  return out;
}

function safeParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}
