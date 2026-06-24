import { useState } from "react";
import { Apple, Check, Github, KeyRound, Lock, Mail, Shield } from "lucide-react";
import Toggle from "@/components/Toggle";

/* ─── Types ──────────────────────────────────────────────────────── */
export interface AuthSettings {
  enabled: boolean;
  emailPassword: boolean;
  emailOTP: boolean;
  oauth: Record<string, boolean>;
  onlyVerified: boolean;
  requirePasswordChange: boolean;
  minPasswordLength: number;
}

export const DEFAULT_AUTH_SETTINGS: AuthSettings = {
  enabled: true,
  emailPassword: true,
  emailOTP: false,
  oauth: { google: false, github: false, microsoft: false, apple: false, facebook: false, discord: false, gitlab: false, twitter: false },
  onlyVerified: false,
  requirePasswordChange: false,
  minPasswordLength: 8,
};

interface OAuthProvider {
  id: string;
  label: string;
  color: string;
}

const OAUTH_PROVIDERS: OAuthProvider[] = [
  { id: "google", label: "Google", color: "#4285F4" },
  { id: "github", label: "GitHub", color: "#fff" },
  { id: "microsoft", label: "Microsoft", color: "#00A4EF" },
  { id: "apple", label: "Apple", color: "#fff" },
  { id: "facebook", label: "Facebook", color: "#1877F2" },
  { id: "discord", label: "Discord", color: "#5865F2" },
  { id: "gitlab", label: "GitLab", color: "#FC6D26" },
  { id: "twitter", label: "X / Twitter", color: "#fff" },
];

/* ─── AuthConfig component ───────────────────────────────────────── */
interface Props {
  settings: AuthSettings;
  onChange: (next: AuthSettings) => void;
}

export default function AuthConfig({ settings, onChange }: Props) {
  function patch(p: Partial<AuthSettings>) {
    onChange({ ...settings, ...p });
  }

  function toggleOAuth(id: string) {
    onChange({
      ...settings,
      oauth: { ...settings.oauth, [id]: !settings.oauth[id] },
    });
  }

  const enabledOAuth = Object.entries(settings.oauth).filter(([, v]) => v).length;

  return (
    <div className="space-y-5">
      {/* Master toggle */}
      <div className="bg-surface border border-line rounded p-4 flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="w-8 h-8 rounded bg-brand/15 text-brand flex items-center justify-center shrink-0">
            <Shield size={16} />
          </span>
          <div>
            <div className="text-[14px] text-ink font-medium">Authentication</div>
            <div className="text-[12px] text-ink-faint mt-0.5">
              Enable sign-in for this collection. Auth columns (email, password_hash,
              password_salt) are auto-managed.
            </div>
          </div>
        </div>
        <Toggle checked={settings.enabled} onChange={(v) => patch({ enabled: v })} />
      </div>

      {!settings.enabled && (
        <div className="text-center py-8 text-[13px] text-ink-faint">
          Authentication is disabled. Records can still be managed via the admin API.
        </div>
      )}

      {settings.enabled && (
        <>
          {/* Password providers */}
          <Section title="Password authentication">
            <ProviderRow
              icon={<Mail size={14} />}
              label="Email / Password"
              hint="Classic email + password sign-in"
              checked={settings.emailPassword}
              onToggle={() => patch({ emailPassword: !settings.emailPassword })}
            />
            <ProviderRow
              icon={<KeyRound size={14} />}
              label="OTP (email)"
              hint="One-time passcode sent to email"
              checked={settings.emailOTP}
              onToggle={() => patch({ emailOTP: !settings.emailOTP })}
            />
          </Section>

          {/* OAuth2 providers */}
          <Section title={`OAuth2 providers · ${enabledOAuth} active`}>
            <div className="grid grid-cols-2 gap-2">
              {OAUTH_PROVIDERS.map((p) => {
                const active = !!settings.oauth[p.id];
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => toggleOAuth(p.id)}
                    className={`flex items-center gap-2.5 p-2.5 rounded border transition text-left ${
                      active
                        ? "border-brand bg-brand/10"
                        : "border-line bg-surface hover:border-ink-faint"
                    }`}
                  >
                    <ProviderDot label={p.label} color={p.color} active={active} />
                    <span className={`text-[13px] flex-1 ${active ? "text-ink" : "text-ink-muted"}`}>
                      {p.label}
                    </span>
                    {active && (
                      <Check size={13} className="text-brand shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>
          </Section>

          {/* Password policy */}
          <Section title="Password policy">
            <div className="space-y-3">
              <PolicyRow
                label="Only verified users can sign in"
                hint="Require email verification before login"
                checked={settings.onlyVerified}
                onToggle={() => patch({ onlyVerified: !settings.onlyVerified })}
              />
              <PolicyRow
                label="Require password change on first login"
                hint="Force users to set a new password after admin-provisioned signup"
                checked={settings.requirePasswordChange}
                onToggle={() => patch({ requirePasswordChange: !settings.requirePasswordChange })}
              />
              <label className="block pt-1">
                <span className="label-mono">Minimum password length</span>
                <input
                  type="number"
                  min="6"
                  max="128"
                  value={settings.minPasswordLength}
                  onChange={(e) => patch({ minPasswordLength: Math.max(6, Math.min(128, Number(e.target.value) || 8)) })}
                  className="field-input mt-1 font-mono text-[13px] max-w-[120px]"
                />
              </label>
            </div>
          </Section>
        </>
      )}
    </div>
  );
}

/* ─── Primitives ──────────────────────────────────────────────────── */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <span className="label-mono">{title}</span>
      <div className="bg-surface border border-line rounded divide-y divide-line">
        {children}
      </div>
    </section>
  );
}

function ProviderRow({
  icon,
  label,
  hint,
  checked,
  onToggle,
}: {
  icon: React.ReactNode;
  label: string;
  hint: string;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3">
      <div className="flex items-center gap-3 min-w-0">
        <span className={`w-7 h-7 rounded flex items-center justify-center shrink-0 ${checked ? "bg-brand/15 text-brand" : "bg-surface-2 text-ink-muted"}`}>
          {icon}
        </span>
        <div className="min-w-0">
          <div className="text-[13px] text-ink">{label}</div>
          <div className="text-[12px] text-ink-faint">{hint}</div>
        </div>
      </div>
      <Toggle checked={checked} onChange={onToggle} />
    </div>
  );
}

function PolicyRow({
  label,
  hint,
  checked,
  onToggle,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3">
      <div className="min-w-0">
        <div className="text-[13px] text-ink">{label}</div>
        <div className="text-[12px] text-ink-faint">{hint}</div>
      </div>
      <Toggle checked={checked} onChange={onToggle} />
    </div>
  );
}

/** Coloured circle with the provider's first letter as a fallback logo. */
function ProviderDot({ label, color, active }: { label: string; color: string; active: boolean }) {
  return (
    <span
      className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
      style={{
        background: active ? color : "var(--surface-2)",
        color: active ? (color === "#fff" ? "var(--bg)" : "#fff") : "var(--ink-muted)",
      }}
    >
      {label[0]?.toUpperCase()}
    </span>
  );
}
