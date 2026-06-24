import { useState } from "react";
import { AtSign, KeyRound, Link2, MailCheck, ShieldCheck } from "lucide-react";

/* ─── Types ──────────────────────────────────────────────────────── */
export type TemplateId = "verification" | "resetPassword" | "confirmEmailChange" | "otp";

export interface EmailTemplate {
  subject: string;
  body: string;
}

export type EmailTemplates = Record<TemplateId, EmailTemplate>;

export const TEMPLATES: {
  id: TemplateId;
  label: string;
  Icon: typeof MailCheck;
  description: string;
  variables: { token: string; hint: string }[];
  defaultSubject: string;
  defaultBody: string;
}[] = [
  {
    id: "verification",
    label: "Email verification",
    Icon: MailCheck,
    description: "Sent on signup / when resending verification",
    variables: [
      { token: "{appName}", hint: "Your app's display name" },
      { token: "{verificationURL}", hint: "Signed link the user must click" },
      { token: "{token}", hint: "Raw verification token" },
      { token: "{email}", hint: "Recipient email address" },
      { token: "{expiresIn}", hint: "Human-readable link expiry" },
    ],
    defaultSubject: "Verify your {appName} account",
    defaultBody: `<div style="font-family:sans-serif;max-width:480px;margin:0 auto">
  <h2>Welcome to {appName}!</h2>
  <p>Please confirm your email address to activate your account.</p>
  <p>
    <a href="{verificationURL}"
       style="display:inline-block;background:#f38020;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600">
      Verify email
    </a>
  </p>
  <p style="color:#999;font-size:12px">This link expires in {expiresIn}.<br>If you didn't create an account, ignore this email.</p>
</div>`,
  },
  {
    id: "resetPassword",
    label: "Password reset",
    Icon: KeyRound,
    description: "Sent when a user requests a password reset",
    variables: [
      { token: "{appName}", hint: "Your app's display name" },
      { token: "{resetURL}", hint: "Signed reset link" },
      { token: "{token}", hint: "Raw reset token" },
      { token: "{email}", hint: "Recipient email" },
      { token: "{expiresIn}", hint: "Link expiry window" },
    ],
    defaultSubject: "Reset your {appName} password",
    defaultBody: `<div style="font-family:sans-serif;max-width:480px;margin:0 auto">
  <h2>Password reset</h2>
  <p>We received a request to reset your {appName} password.</p>
  <p>
    <a href="{resetURL}"
       style="display:inline-block;background:#f38020;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600">
      Reset password
    </a>
  </p>
  <p style="color:#999;font-size:12px">This link expires in {expiresIn}.<br>If you didn't request a reset, ignore this email.</p>
</div>`,
  },
  {
    id: "confirmEmailChange",
    label: "Confirm email change",
    Icon: ShieldCheck,
    description: "Sent when a user updates their email address",
    variables: [
      { token: "{appName}", hint: "Your app's display name" },
      { token: "{confirmURL}", hint: "Signed confirmation link" },
      { token: "{newEmail}", hint: "The new email address" },
      { token: "{oldEmail}", hint: "The previous email" },
      { token: "{token}", hint: "Raw confirmation token" },
    ],
    defaultSubject: "Confirm your new email on {appName}",
    defaultBody: `<div style="font-family:sans-serif;max-width:480px;margin:0 auto">
  <h2>Confirm email change</h2>
  <p>You requested to change your email from <strong>{oldEmail}</strong> to <strong>{newEmail}</strong>.</p>
  <p>
    <a href="{confirmURL}"
       style="display:inline-block;background:#f38020;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600">
      Confirm new email
    </a>
  </p>
  <p style="color:#999;font-size:12px">If you didn't make this change, your account is safe — no action is needed.</p>
</div>`,
  },
  {
    id: "otp",
    label: "OTP (one-time passcode)",
    Icon: AtSign,
    description: "Sent for email OTP authentication",
    variables: [
      { token: "{appName}", hint: "Your app's display name" },
      { token: "{otp}", hint: "The 6-digit one-time passcode" },
      { token: "{email}", hint: "Recipient email" },
      { token: "{expiresIn}", hint: "Code expiry (e.g. 15 min)" },
    ],
    defaultSubject: "Your {appName} login code",
    defaultBody: `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;text-align:center">
  <h2>Your login code</h2>
  <p>Use this code to sign in to {appName}:</p>
  <p style="font-size:32px;font-weight:700;letter-spacing:8px;color:#f38020;margin:20px 0">{otp}</p>
  <p style="color:#999;font-size:12px">This code expires in {expiresIn}.<br>Never share it with anyone.</p>
</div>`,
  },
];

export const DEFAULT_TEMPLATES: EmailTemplates = TEMPLATES.reduce(
  (acc, t) => {
    acc[t.id] = { subject: t.defaultSubject, body: t.defaultBody };
    return acc;
  },
  {} as EmailTemplates,
);

/* ─── Component ───────────────────────────────────────────────────── */
interface Props {
  templates: EmailTemplates;
  onChange: (next: EmailTemplates) => void;
}

export default function EmailTemplatesEditor({ templates, onChange }: Props) {
  const [active, setActive] = useState<TemplateId>("verification");

  function patchTemplate(id: TemplateId, patch: Partial<EmailTemplate>) {
    onChange({ ...templates, [id]: { ...templates[id], ...patch } });
  }

  const current = TEMPLATES.find((t) => t.id === active)!;

  return (
    <div className="space-y-4">
      {/* Template selector tabs */}
      <div className="flex items-center gap-1 flex-wrap">
        {TEMPLATES.map((t) => {
          const Icon = t.Icon;
          const isActive = t.id === active;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setActive(t.id)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded border text-[12px] transition ${
                isActive
                  ? "border-brand bg-brand/15 text-brand"
                  : "border-line bg-surface text-ink-muted hover:border-ink-faint hover:text-ink"
              }`}
            >
              <Icon size={12} />
              {t.label}
            </button>
          );
        })}
      </div>

      <p className="text-[12px] text-ink-faint">{current.description}</p>

      {/* Subject */}
      <label className="block">
        <span className="label-mono">Subject</span>
        <input
          value={templates[active].subject}
          onChange={(e) => patchTemplate(active, { subject: e.target.value })}
          className="field-input mt-1 text-[13px]"
          placeholder="Email subject"
        />
      </label>

      {/* Body */}
      <label className="block">
        <span className="label-mono">Body (HTML)</span>
        <textarea
          value={templates[active].body}
          onChange={(e) => patchTemplate(active, { body: e.target.value })}
          rows={12}
          spellCheck={false}
          className="field-input mt-1 font-mono text-[12px] leading-relaxed resize-y"
          placeholder="<div>...</div>"
        />
      </label>

      {/* Variable chips — click to insert */}
      <div className="space-y-2">
        <span className="label-mono">Available variables — click to copy</span>
        <div className="flex flex-wrap gap-1.5">
          {current.variables.map((v) => (
            <button
              key={v.token}
              type="button"
              onClick={() => navigator.clipboard?.writeText(v.token)}
              className="group inline-flex items-center gap-1.5 px-2 py-1 rounded bg-surface-2 border border-line hover:border-brand transition text-[12px]"
              title={v.hint}
            >
              <code className="font-mono text-brand">{v.token}</code>
              <span className="text-[10px] text-ink-faint group-hover:text-ink-muted">{v.hint}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Preview */}
      <div className="space-y-2">
        <span className="label-mono">Preview</span>
        <div className="bg-surface border border-line rounded overflow-hidden">
          <div className="px-3 py-2 hairline-b bg-surface-2">
            <span className="text-[12px] font-mono text-ink-muted">
              Subject:{" "}
              <span className="text-ink">{templates[active].subject}</span>
            </span>
          </div>
          <iframe
            title="Email preview"
            className="w-full bg-white"
            style={{ minHeight: "200px", border: "none" }}
            srcDoc={templates[active].body
              .replace(/\{appName\}/g, "Workerbase")
              .replace(/\{otp\}/g, "829 471")
              .replace(/\{verificationURL\}/g, "https://app.workerbase.dev/verify?token=abc123")
              .replace(/\{resetURL\}/g, "https://app.workerbase.dev/reset?token=abc123")
              .replace(/\{confirmURL\}/g, "https://app.workerbase.dev/confirm?token=abc123")
              .replace(/\{token\}/g, "abc123")
              .replace(/\{email\}/g, "user@example.com")
              .replace(/\{newEmail\}/g, "new@example.com")
              .replace(/\{oldEmail\}/g, "old@example.com")
              .replace(/\{expiresIn\}/g, "30 minutes")}
          />
        </div>
      </div>
    </div>
  );
}
