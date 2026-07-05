import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Mail, RotateCcw } from "lucide-react";
import { apiClient, ApiError } from "@/lib/api-client";
import Toggle from "@/components/Toggle";
import { RichTextEditor } from "@/components/RichTextEditor";
import { Field } from "./primitives";

/* ──────────────────────────────────────────────────────────────
   WorkerBase branding watermark — appended to every default email
   body as the footer of the email. Users can edit/remove it but
   it's the recommended default.
   ────────────────────────────────────────────────────────────── */

const WORKERBASE_WATERMARK = `<div style="margin-top:32px;padding-top:16px;border-top:1px solid #e4e4e7;text-align:center;">
  <span style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:11px;color:#a1a1aa;">
    Powered by <strong style="color:#F38020;font-weight:600;">⚡ WorkerBase</strong> — the Cloudflare-native backend
  </span>
</div>`;

/* ──────────────────────────────────────────────────────────────
   Storage keys — one row per template in `_settings`, instead of a
   single bundled `systemEmails` blob. Easier to inspect, easier to
   migrate, smaller diffs.
   ────────────────────────────────────────────────────────────── */

const EMAIL_KEY_PREFIX = "systemEmail_";

function emailKey(id: TemplateId): string {
  return `${EMAIL_KEY_PREFIX}${id}`;
}

/** Old single-blob key — still read for backwards compat on loads. */
const LEGACY_SYSTEM_EMAILS_KEY = "systemEmails";

/* ──────────────────────────────────────────────────────────────
   Types — keep in sync with backend/src/emails/index.ts
   ────────────────────────────────────────────────────────────── */

type TemplateId =
  | "verification"
  | "resetPassword"
  | "magicLink"
  | "welcome"
  | "invitation";

interface SystemEmailConfig {
  subject: string;
  intro: string;
  ctaLabel: string;
  redirectURL: string;
  enabled: boolean;
}

type SystemEmailsSettings = Record<TemplateId, SystemEmailConfig>;

const TEMPLATE_IDS: TemplateId[] = [
  "verification",
  "resetPassword",
  "magicLink",
  "welcome",
  "invitation",
];

const TEMPLATE_META: Record<
  TemplateId,
  {
    label: string;
    shortLabel: string;
    description: string;
    variables: string[];
    defaultSubject: string;
    defaultBody: string; // HTML
    defaultCta: string;
    recipientHint: string;
  }
> = {
  verification: {
    label: "Email verification",
    shortLabel: "Verification",
    description: "Sent when a user signs up and needs to confirm their email address.",
    variables: ["{{appName}}", "{{email}}", "{{actionURL}}", "{{year}}"],
    defaultSubject: "Verify your email",
    defaultBody: `<h2>Verify your email</h2>
<p>Hi there,</p>
<p>Please confirm your email address <strong>{{email}}</strong> to activate your account. Click the button below to verify.</p>
<p style="font-size:12px;color:#71717a;">If you didn't create an account, you can safely ignore this email.</p>
${WORKERBASE_WATERMARK}`,
    defaultCta: "Verify Email",
    recipientHint: "Newly registered user",
  },
  resetPassword: {
    label: "Forgot password",
    shortLabel: "Reset password",
    description: "Sent when a user requests a password reset link.",
    variables: ["{{appName}}", "{{email}}", "{{actionURL}}", "{{year}}"],
    defaultSubject: "Reset your password",
    defaultBody: `<h2>Reset your password</h2>
<p>Hi there,</p>
<p>We received a request to reset the password for <strong>{{email}}</strong>. Click the button below to choose a new one.</p>
<p style="font-size:12px;color:#71717a;">If you didn't request a password reset, you can safely ignore this email.</p>
${WORKERBASE_WATERMARK}`,
    defaultCta: "Reset Password",
    recipientHint: "User requesting reset",
  },
  magicLink: {
    label: "Magic link",
    shortLabel: "Magic link",
    description: "Sent for passwordless email sign-in.",
    variables: ["{{appName}}", "{{email}}", "{{actionURL}}", "{{year}}"],
    defaultSubject: "Your magic sign-in link",
    defaultBody: `<h2>Sign in to {{appName}}</h2>
<p>Hi there,</p>
<p>Click the button below to sign in to your account. This magic link will expire shortly, so use it soon.</p>
<p style="font-size:12px;color:#71717a;">If you didn't request this link, you can safely ignore this email.</p>
${WORKERBASE_WATERMARK}`,
    defaultCta: "Sign In",
    recipientHint: "User signing in",
  },
  welcome: {
    label: "Welcome",
    shortLabel: "Welcome",
    description: "Sent after a user verifies their email or is created by an admin.",
    variables: ["{{appName}}", "{{email}}", "{{year}}"],
    defaultSubject: "Welcome to {{appName}}",
    defaultBody: `<h2>Welcome aboard! 🎉</h2>
<p>Hi there,</p>
<p>Your account <strong>{{email}}</strong> is ready and verified. Welcome to {{appName}} — we're glad to have you.</p>
<p>Here's how to get started:</p>
<ul>
<li>Explore your dashboard</li>
<li>Create your first collection</li>
<li>Invite teammates</li>
</ul>
${WORKERBASE_WATERMARK}`,
    defaultCta: "Get Started",
    recipientHint: "New user",
  },
  invitation: {
    label: "User invitation",
    shortLabel: "Invitation",
    description: "Sent when an admin invites a new user to the project.",
    variables: ["{{appName}}", "{{email}}", "{{actionURL}}", "{{inviterName}}", "{{year}}"],
    defaultSubject: "You're invited to join {{appName}}",
    defaultBody: `<h2>You're invited! ✉️</h2>
<p>Hi there,</p>
<p><strong>{{inviterName}}</strong> has invited <strong>{{email}}</strong> to join {{appName}}. Click the button below to accept your invitation and set up your account.</p>
<p style="font-size:12px;color:#71717a;">If you weren't expecting an invitation, you can safely ignore this email.</p>
${WORKERBASE_WATERMARK}`,
    defaultCta: "Accept Invitation",
    recipientHint: "Invited user",
  },
};

function emptyConfig(): SystemEmailConfig {
  return { subject: "", intro: "", ctaLabel: "", redirectURL: "", enabled: true };
}

/** Returns the per-template defaults so a fresh install still shows real
 *  content in the editor rather than blank fields. */
function defaultSettings(): SystemEmailsSettings {
  const out = {} as SystemEmailsSettings;
  for (const id of TEMPLATE_IDS) {
    const meta = TEMPLATE_META[id];
    out[id] = {
      subject: meta.defaultSubject,
      intro: meta.defaultBody,
      ctaLabel: meta.defaultCta,
      redirectURL: "",
      enabled: true,
    };
  }
  return out;
}

function extractSettings(raw: unknown): SystemEmailsSettings {
  // Start from defaults so every template always has content (the user
  // explicitly asked for non-blank defaults rather than placeholders).
  const out = defaultSettings();
  if (!raw || typeof raw !== "object") return out;
  const root = raw as Record<string, unknown>;

  // Legacy fallback — old installs stored everything under one key.
  const legacy =
    root[LEGACY_SYSTEM_EMAILS_KEY] &&
    typeof root[LEGACY_SYSTEM_EMAILS_KEY] === "object"
      ? (root[LEGACY_SYSTEM_EMAILS_KEY] as Record<string, unknown>)
      : null;

  for (const id of TEMPLATE_IDS) {
    const meta = TEMPLATE_META[id];
    // Prefer the per-template key; fall back to legacy blob; else default.
    const v = root[emailKey(id)] ?? legacy?.[id];
    if (!v || typeof v !== "object") continue;
    const cfg = v as Partial<SystemEmailConfig>;
    out[id] = {
      subject:
        typeof cfg.subject === "string" && cfg.subject.trim()
          ? cfg.subject
          : meta.defaultSubject,
      intro:
        typeof cfg.intro === "string" && cfg.intro.trim()
          ? cfg.intro
          : meta.defaultBody,
      ctaLabel:
        typeof cfg.ctaLabel === "string" && cfg.ctaLabel.trim()
          ? cfg.ctaLabel
          : meta.defaultCta,
      redirectURL: typeof cfg.redirectURL === "string" ? cfg.redirectURL : "",
      enabled: typeof cfg.enabled === "boolean" ? cfg.enabled : true,
    };
  }
  return out;
}

function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    if (typeof err.detail === "string") return err.detail;
    const d = err.detail as { error?: string; detail?: string } | null;
    return d?.detail ?? d?.error ?? err.message;
  }
  return err instanceof Error ? err.message : fallback;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/* ──────────────────────────────────────────────────────────────
   Composer — editor + live preview side-by-side
   ────────────────────────────────────────────────────────────── */

function Composer({
  id,
  config,
  mailFromAddress,
  mailFromName,
  onChange,
  onSave,
  saving,
  dirty,
}: {
  id: TemplateId;
  config: SystemEmailConfig;
  mailFromAddress: string;
  mailFromName: string;
  onChange: (next: SystemEmailConfig) => void;
  onSave: () => void;
  saving: boolean;
  dirty: boolean;
}) {
  const meta = TEMPLATE_META[id];

  const subject = config.subject.trim() || meta.defaultSubject;
  const ctaLabel = config.ctaLabel.trim() || meta.defaultCta;

  const previewHtml = useMemo(
    () => buildPreviewHtml(config.intro, meta, mailFromName),
    [config.intro, meta, mailFromName],
  );

  return (
    <div className="bg-surface border border-line rounded overflow-hidden">
      {/* Composer header — meta + master toggle + save */}
      <header className="px-5 py-3 hairline-b flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[14px] font-medium text-ink">{meta.label}</div>
          <div className="text-[12px] text-ink-muted mt-0.5">{meta.description}</div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono uppercase tracking-widest text-ink-faint">
              {config.enabled ? "Enabled" : "Disabled"}
            </span>
            <Toggle
              checked={config.enabled}
              onChange={(v) => onChange({ ...config, enabled: v })}
            />
          </div>
          <span className="w-px h-5 bg-line-strong inline-block" />
          <button
            onClick={onSave}
            disabled={!dirty || saving}
            className="btn-primary disabled:opacity-40 disabled:cursor-not-allowed text-[12px]"
          >
            {saving ? "Saving…" : dirty ? "Save changes" : "Saved"}
          </button>
        </div>
      </header>

      {/* Email envelope — From / To / Subject */}
      <div className="px-5 py-3 hairline-b space-y-1.5 bg-surface-2/40">
        <div className="grid grid-cols-[80px_1fr] gap-3 items-center">
          <span className="label-mono text-ink-faint">From</span>
          <span className="text-[13px] font-mono text-ink truncate">
            {mailFromName
              ? `${mailFromName} <${mailFromAddress || "no-reply@example.com"}>`
              : mailFromAddress || "no-reply@example.com"}
          </span>
        </div>
        <div className="grid grid-cols-[80px_1fr] gap-3 items-center">
          <span className="label-mono text-ink-faint">To</span>
          <span className="text-[13px] text-ink-muted">
            {meta.recipientHint}{" "}
            <code className="ml-1 px-1 py-0.5 rounded bg-bg-elev border border-line text-[11px] font-mono text-ink">
              {"{{email}}"}
            </code>
          </span>
        </div>
        <div className="grid grid-cols-[80px_1fr] gap-3 items-center pt-1">
          <span className="label-mono text-ink-faint">Subject</span>
          <input
            value={config.subject}
            onChange={(e) => onChange({ ...config, subject: e.target.value })}
            placeholder={meta.defaultSubject}
            className="field-input text-[13px]"
          />
        </div>
      </div>

      {/* Editor + Preview side-by-side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-0">
        {/* LEFT — editor */}
        <div className="px-5 py-4 border-b lg:border-b-0 lg:border-r border-line">
          <div className="flex items-center justify-between mb-2">
            <span className="label-mono">Compose</span>
            <div className="flex flex-wrap items-center gap-1">
              <span className="label-mono text-ink-faint mr-1">Variables</span>
              {meta.variables.map((v) => (
                <code
                  key={v}
                  className="px-1.5 py-0.5 rounded bg-bg-elev border border-line text-[11px] font-mono text-ink"
                >
                  {v}
                </code>
              ))}
            </div>
          </div>
          <RichTextEditor
            value={config.intro}
            onChange={(html) => onChange({ ...config, intro: html })}
            placeholder={meta.defaultBody}
            minHeight={420}
          />
        </div>

        {/* RIGHT — live preview */}
        <div className="px-5 py-4 bg-surface-2/20">
          <div className="flex items-center justify-between mb-2">
            <span className="label-mono">Live preview</span>
            <span className="text-[11px] text-ink-faint">
              Variables filled with sample values
            </span>
          </div>
          <PreviewFrame
            subject={subject}
            ctaLabel={ctaLabel}
            html={previewHtml}
            appName={mailFromName || "WorkerBase"}
          />
        </div>
      </div>

      {/* Footer — CTA + redirect */}
      <div className="px-5 py-4 grid grid-cols-1 md:grid-cols-2 gap-3 bg-surface-2/40">
        <Field
          label="Button label"
          hint={meta.defaultCta ? `Default: ${meta.defaultCta}` : undefined}
        >
          <input
            value={config.ctaLabel}
            onChange={(e) => onChange({ ...config, ctaLabel: e.target.value })}
            placeholder={meta.defaultCta}
            className="field-input text-[13px]"
          />
        </Field>
        <Field
          label="Post-action redirect URL"
          hint="Where the user lands after clicking. Optional."
        >
          <input
            value={config.redirectURL}
            onChange={(e) => onChange({ ...config, redirectURL: e.target.value })}
            placeholder="/admin/welcome"
            className="field-input text-[13px] font-mono"
          />
        </Field>
      </div>
    </div>
  );
}

/** Render a believable email-client-style preview from the editor HTML.
 *  Variables are filled with sample values so the preview looks real. */
function buildPreviewHtml(
  bodyHtml: string,
  meta: (typeof TEMPLATE_META)[TemplateId],
  fromName: string,
): string {
  const appName = fromName || "WorkerBase";
  const body = bodyHtml && bodyHtml.trim().length > 0 ? bodyHtml : meta.defaultBody;

  return body
    .replace(/{{appName}}/g, escapeHtml(appName))
    .replace(/{{email}}/g, "alice@example.com")
    .replace(/{{actionURL}}/g, "#")
    .replace(/{{inviterName}}/g, "Admin")
    .replace(/{{year}}/g, String(new Date().getFullYear()));
}

function PreviewFrame({
  subject,
  ctaLabel,
  html,
  appName,
}: {
  subject: string;
  ctaLabel: string;
  html: string;
  appName: string;
}) {
  return (
    <div className="rounded border border-line bg-bg-elev overflow-hidden">
      {/* Faux inbox row — sender + subject */}
      <div className="px-4 py-2.5 hairline-b bg-surface-2/60 flex items-center gap-3">
        <div
          className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold text-white shrink-0"
          style={{ backgroundColor: "#F38020" }}
        >
          {(appName || "W").charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[12px] text-ink truncate font-medium">{appName}</div>
          <div className="text-[14px] font-medium text-ink truncate">{subject}</div>
        </div>
      </div>
      {/* Rendered email body */}
      <div
        className="overflow-y-auto"
        style={{ maxHeight: 540 }}
      >
        <div className="bg-[#f4f4f5] p-5 flex justify-center">
          <div
            className="prose-preview bg-white rounded max-w-[560px] w-full p-8"
            style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}
            dangerouslySetInnerHTML={{ __html: html }}
          />
        </div>
      </div>
      {/* Faux CTA bar — shows the configured primary action button */}
      <div className="px-4 py-3 hairline-t bg-surface-2/40 flex items-center gap-2">
        <span className="label-mono text-ink-faint">Primary action</span>
        <span
          className="inline-flex items-center px-3 py-1.5 rounded text-[12px] font-semibold text-white"
          style={{ backgroundColor: "#F38020" }}
        >
          {ctaLabel}
        </span>
        <span className="text-[11px] text-ink-faint ml-auto">
          (uses <code className="font-mono">{`{{actionURL}}`}</code>)
        </span>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────
   Main
   ────────────────────────────────────────────────────────────── */

export function SystemEmailsForm() {
  const [initial, setInitial] = useState<SystemEmailsSettings>(defaultSettings);
  const [draft, setDraft] = useState<SystemEmailsSettings>(defaultSettings);
  const [activeId, setActiveId] = useState<TemplateId>("verification");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mailFromAddress, setMailFromAddress] = useState("");
  const [mailFromName, setMailFromName] = useState("");

  useEffect(() => {
    apiClient
      .get<{ settings: Record<string, unknown> }>("/api/core/settings")
      .then((data) => {
        const parsed = extractSettings(data.settings);
        setInitial(parsed);
        setDraft(parsed);
        // Pull the From address + name from `mail` settings.
        const mail = (data.settings?.mail ?? {}) as {
          fromAddress?: string;
          fromName?: string;
        };
        setMailFromAddress(mail.fromAddress ?? "");
        setMailFromName(mail.fromName ?? "");
      })
      .catch((err) => setError(errorMessage(err, "Failed to load system email settings")))
      .finally(() => setLoading(false));
  }, []);

  const dirty = useMemo(() => {
    for (const id of TEMPLATE_IDS) {
      const a = initial[id];
      const b = draft[id];
      if (
        a.subject !== b.subject ||
        a.intro !== b.intro ||
        a.ctaLabel !== b.ctaLabel ||
        a.redirectURL !== b.redirectURL ||
        a.enabled !== b.enabled
      ) {
        return true;
      }
    }
    return false;
  }, [initial, draft]);

  function update(id: TemplateId, next: SystemEmailConfig) {
    setDraft((cur) => ({ ...cur, [id]: next }));
  }

  function resetAll() {
    setDraft(initial);
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      // Patch each template under its own _settings key. Also blank out
      // the legacy `systemEmails` blob if it exists, so there's a single
      // source of truth going forward.
      const patch: Record<string, SystemEmailConfig | null> = {};
      for (const id of TEMPLATE_IDS) {
        patch[emailKey(id)] = draft[id];
      }
      patch[LEGACY_SYSTEM_EMAILS_KEY] = null;
      await apiClient.patch("/api/core/settings", patch);
      setInitial(draft);
    } catch (err) {
      setError(errorMessage(err, "Failed to save system email settings"));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="text-[13px] text-ink-muted">Loading…</div>;
  }

  return (
    <div className="space-y-6">
      {/* Two-panel: template list + composer */}
      <div className="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-6 items-start">
        {/* Template rail */}
        <nav className="bg-surface border border-line rounded p-2 sticky top-4">
          <div className="label-mono text-ink-faint px-2 py-2">Templates</div>
          <ul className="space-y-0.5">
            {TEMPLATE_IDS.map((id) => {
              const isActive = id === activeId;
              const cfg = draft[id];
              const custom =
                cfg.subject.trim() !== "" ||
                cfg.intro.trim() !== "" ||
                cfg.ctaLabel.trim() !== "" ||
                cfg.redirectURL.trim() !== "";
              return (
                <li key={id}>
                  <button
                    onClick={() => setActiveId(id)}
                    className={[
                      "w-full text-left flex items-center gap-2 px-2.5 py-2 rounded text-[12px] transition",
                      isActive
                        ? "bg-surface-2 text-ink"
                        : "text-ink-muted hover:bg-surface-2 hover:text-ink",
                    ].join(" ")}
                  >
                    <Mail
                      size={12}
                      className={isActive ? "text-[var(--brand)]" : undefined}
                    />
                    <span className="truncate flex-1">
                      {TEMPLATE_META[id].shortLabel}
                    </span>
                    {!cfg.enabled && (
                      <span className="text-[9px] uppercase tracking-widest text-ink-faint">
                        off
                      </span>
                    )}
                    {custom && cfg.enabled && (
                      <span
                        className="w-1.5 h-1.5 rounded-full bg-[var(--brand)] shrink-0"
                        title="Customised"
                      />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Composer */}
        <Composer
          id={activeId}
          config={draft[activeId]}
          mailFromAddress={mailFromAddress}
          mailFromName={mailFromName}
          onChange={(next) => update(activeId, next)}
          onSave={handleSave}
          saving={saving}
          dirty={dirty}
        />
      </div>

      {error && (
        <div className="flex items-start gap-2 p-3 rounded bg-err/10 border border-err/40 text-[12px] text-ink">
          <AlertTriangle size={14} className="text-err mt-0.5 shrink-0" />
          <span className="font-mono">{error}</span>
        </div>
      )}

      {/* Slim status row — discard link on the left, status text on the right.
          The primary Save button lives in the composer header next to the
          Enable toggle so it's always visible. */}
      <div className="flex items-center justify-between gap-3 pt-2 text-[12px]">
        {dirty && !saving ? (
          <button
            onClick={resetAll}
            className="text-ink-muted hover:text-ink underline-offset-2 hover:underline flex items-center gap-1"
          >
            <RotateCcw size={12} /> Discard changes
          </button>
        ) : (
          <span className="text-ink-faint">
            {saving ? "Saving…" : dirty ? "Unsaved changes" : "All changes saved"}
          </span>
        )}
      </div>
    </div>
  );
}
