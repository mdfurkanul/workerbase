import { useEffect, useState } from "react";
import { Lock } from "lucide-react";
import { usePrefs } from "@/hooks/usePrefs";
import {
  CUSTOM_TOKENS,
  FORMAT_PRESETS,
  formatCustom,
  type DateTimeFormat,
} from "@/lib/dateTimeFormat";
import { TimezonePicker } from "@/components/TimezonePicker";
import { Card, Field, SaveBar } from "./primitives";

/**
 * Timezone settings — SYSTEM-WIDE timezone + date/time format.
 *
 * Stored in the `_settings` table (not per-user). Every signed-in
 * dashboard user sees the same value. Only admins can change it; the
 * form is read-only for editors/viewers with a notice explaining why.
 */
export function TimezoneForm() {
  const { prefs, patch, loading, timezone, canEdit } = usePrefs();
  const [draftTz, setDraftTz] = useState<string>(prefs.timezone ?? "");
  const [draftFmt, setDraftFmt] = useState<DateTimeFormat>(
    prefs.dateTimeFormat ?? "iso8601",
  );
  const [draftPattern, setDraftPattern] = useState<string>(
    prefs.customDateTimePattern ?? "YYYY-MM-DD HH:mm",
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  // Re-sync local drafts when the server-loaded prefs arrive after mount.
  // Skipped once the user starts editing (`dirty`) so in-flight edits
  // aren't clobbered by a late response.
  useEffect(() => {
    if (loading || dirty) return;
    setDraftTz(prefs.timezone ?? "");
    setDraftFmt(prefs.dateTimeFormat ?? "iso8601");
    setDraftPattern(prefs.customDateTimePattern ?? "YYYY-MM-DD HH:mm");
  }, [prefs.timezone, prefs.dateTimeFormat, prefs.customDateTimePattern, loading, dirty]);

  function markDirty<T>(setter: (v: T) => void) {
    return (v: T) => {
      if (!canEdit) return; // defense in depth — viewers can't dirty the form
      setDirty(true);
      setter(v);
    };
  }

  async function save() {
    if (!canEdit) return;
    setSaving(true);
    setError(null);
    try {
      await patch({
        timezone: draftTz,
        dateTimeFormat: draftFmt,
        // Only persist the pattern when custom is selected; otherwise
        // clear it so the prefs object stays minimal.
        customDateTimePattern:
          draftFmt === "custom" ? draftPattern : "",
      });
      setDirty(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  // Live preview using the draft values + current time.
  const previewDate = new Date();
  const previewIntl = previewFor(previewDate, draftFmt, draftTz, draftPattern);

  // Hint for which TZ the input will be interpreted in.
  const effectiveTzLabel = draftTz
    ? draftTz.replace(/_/g, " ")
    : `Browser (${safeLocalTz()})`;

  return (
    <div className="space-y-6">
      {!canEdit && (
        <div className="flex items-start gap-2 px-3 py-2 rounded border border-line bg-surface-2 text-[12px] text-ink-muted">
          <Lock size={12} className="text-ink-faint mt-0.5 shrink-0" />
          <div>
            These settings are <span className="font-mono">system-wide</span> —
            every dashboard user sees the same timezone and format. Only
            admins can change them.
          </div>
        </div>
      )}

      <Card title="Timezone">
        <Field
          label="Display & input timezone"
          hint="Used everywhere — Logs, Users, Records, Backups. Also applied when you type datetime values into a record. System-wide."
        >
          <TimezonePicker
            value={draftTz}
            onChange={markDirty(setDraftTz)}
            disabled={!canEdit}
          />
          <div className="text-[11px] text-ink-faint mt-2">
            Effective: <span className="font-mono">{effectiveTzLabel}</span>
            {timezone && (
              <> · saved: <span className="font-mono">{timezone}</span></>
            )}
          </div>
        </Field>
      </Card>

      <Card title="Date & time format">
        <Field
          label="Format preset"
          hint="Pick a preset, or choose Custom to define your own pattern. System-wide."
        >
          <div className="space-y-1.5">
            {FORMAT_PRESETS.map((preset) => (
              <FormatRadio
                key={preset.value}
                label={preset.label}
                example={preset.example}
                checked={draftFmt === preset.value}
                onSelect={() => markDirty(setDraftFmt)(preset.value)}
                disabled={!canEdit}
              />
            ))}
            <FormatRadio
              label="Custom"
              example="Your own token pattern"
              checked={draftFmt === "custom"}
              onSelect={() => markDirty(setDraftFmt)("custom")}
              disabled={!canEdit}
            />
          </div>
        </Field>

        {draftFmt === "custom" && (
          <CustomPatternInput
            value={draftPattern}
            onChange={markDirty(setDraftPattern)}
            disabled={!canEdit}
          />
        )}

        <div className="hairline-t pt-3 mt-2 flex items-center justify-between gap-3">
          <span className="label-mono text-ink-faint">Preview</span>
          <span className="font-mono text-[13px] text-ink truncate" title={previewIntl}>
            {previewIntl || "—"}
          </span>
        </div>
      </Card>

      {canEdit ? (
        <SaveBar
          onSave={save}
          saving={saving}
          error={error ?? (dirty ? undefined : null)}
        />
      ) : null}
    </div>
  );
}

function FormatRadio({
  label,
  example,
  checked,
  onSelect,
  disabled,
}: {
  label: string;
  example: string;
  checked: boolean;
  onSelect: () => void;
  disabled?: boolean;
}) {
  return (
    <label
      className={[
        "flex items-center gap-3 px-3 py-2 rounded border transition",
        disabled
          ? "border-line opacity-70 cursor-not-allowed"
          : "cursor-pointer",
        checked
          ? "border-orange/60 bg-orange/5"
          : "border-line hover:bg-surface-2",
      ].join(" ")}
    >
      <input
        type="radio"
        name="datetime-format"
        checked={checked}
        onChange={onSelect}
        disabled={disabled}
        className="accent-[#f38020]"
      />
      <div className="min-w-0">
        <div className="text-[13px] text-ink">{label}</div>
        <div className="text-[11px] text-ink-faint font-mono truncate">
          {example}
        </div>
      </div>
    </label>
  );
}

function CustomPatternInput({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
}) {
  // Common quick-fill templates surfaced as one-click chips.
  const templates: { label: string; pattern: string }[] = [
    { label: "YYYY-MM-DD HH:mm", pattern: "YYYY-MM-DD HH:mm" },
    { label: "YYYY/MM/DD HH:mm:ss", pattern: "YYYY/MM/DD HH:mm:ss" },
    { label: "DD MMM YYYY, hh:mm a", pattern: "DD MMM YYYY, hh:mm a" },
    { label: "MMMM DD, YYYY [at] hh:mm a", pattern: "MMMM DD, YYYY [at] hh:mm a" },
  ];

  return (
    <div className="mt-3 space-y-2 hairline-t pt-3">
      <Field
        label="Custom pattern"
        hint="Use the tokens below. Wrap literal text in square brackets, e.g. [at]."
      >
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value.slice(0, 128))}
          placeholder="YYYY-MM-DD HH:mm"
          className="field-input font-mono disabled:opacity-60 disabled:cursor-not-allowed"
          spellCheck={false}
          autoComplete="off"
          disabled={disabled}
        />
      </Field>

      <div className="flex flex-wrap gap-1.5">
        {templates.map((t) => (
          <button
            key={t.pattern}
            type="button"
            onClick={() => onChange(t.pattern)}
            disabled={disabled}
            className="px-2 py-1 rounded border border-line text-[11px] font-mono text-ink-muted hover:bg-surface-2 hover:text-ink transition disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-ink-muted"
            title={`Use ${t.pattern}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="rounded border border-line bg-surface-2 p-2.5">
        <div className="label-mono text-ink-faint mb-1.5">Tokens</div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-3 gap-y-1">
          {CUSTOM_TOKENS.map((t) => (
            <div
              key={t.token}
              className="flex items-baseline gap-2 text-[11px] leading-tight"
            >
              <code className="font-mono text-ink">{t.token}</code>
              <span className="text-ink-faint truncate">{t.meaning}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Build a preview string for the current draft values. */
function previewFor(
  date: Date,
  format: DateTimeFormat,
  tz: string,
  pattern: string,
): string {
  if (format === "iso8601") {
    return date.toISOString().replace("T", " ").slice(0, 19);
  }
  if (format === "custom") {
    const p = pattern && pattern.length > 0 ? pattern : "YYYY-MM-DD HH:mm";
    try {
      return formatCustom(date, p, tz && tz.length > 0 ? tz : undefined);
    } catch {
      return p;
    }
  }
  // Map preset → Intl options. Mirrors lib/dateTimeFormat for previews.
  const opts: Intl.DateTimeFormatOptions = {};
  switch (format) {
    case "compact":
      Object.assign(opts, {
        year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit", hour12: false,
      });
      break;
    case "long":
      Object.assign(opts, {
        year: "numeric", month: "long", day: "numeric",
        hour: "numeric", minute: "2-digit", hour12: true,
      });
      break;
    case "us":
      Object.assign(opts, {
        year: "numeric", month: "2-digit", day: "2-digit",
        hour: "numeric", minute: "2-digit", hour12: true,
      });
      break;
    case "european":
      Object.assign(opts, {
        year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit", hour12: false,
      });
      break;
  }
  const tzOpt = tz && tz.length > 0 ? { timeZone: tz } : {};
  try {
    return new Intl.DateTimeFormat(undefined, { ...opts, ...tzOpt }).format(date);
  } catch {
    return new Intl.DateTimeFormat(undefined, opts).format(date);
  }
}

function safeLocalTz(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? "local";
  } catch {
    return "local";
  }
}
