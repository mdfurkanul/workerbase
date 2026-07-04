import { useEffect, useState } from "react";
import { apiClient, ApiError } from "@/lib/api-client";
import { Card, Field, SaveBar } from "./primitives";

interface MailSettings {
  fromAddress: string;
  fromName: string;
}
const DEFAULT_MAIL: MailSettings = { fromAddress: "", fromName: "" };

export function MailForm() {
  const [settings, setSettings] = useState<MailSettings>(DEFAULT_MAIL);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load existing mail settings on mount.
  useEffect(() => {
    apiClient
      .get<{ settings: Record<string, unknown> }>(`/api/core/settings`)
      .then((data) => {
        const mail = data.settings?.mail;
        if (mail && typeof mail === "object") {
          setSettings({
            fromAddress: String((mail as Record<string, unknown>).fromAddress ?? ""),
            fromName: String((mail as Record<string, unknown>).fromName ?? ""),
          });
        }
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load mail settings");
      })
      .finally(() => setLoading(false));
  }, []);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      await apiClient.patch(`/api/core/settings`, { mail: settings });
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? typeof err.detail === "string"
            ? err.detail
            : (err.detail as { error?: string } | null)?.error ?? err.message
          : err instanceof Error
            ? err.message
            : "Failed to save mail settings";
      setError(msg);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="text-[13px] text-ink-muted">Loading…</div>;
  }

  return (
    <div className="space-y-6">
      <Card title="Sender">
        <Field label="From address" required>
          <input
            value={settings.fromAddress}
            onChange={(e) => setSettings((s) => ({ ...s, fromAddress: e.target.value }))}
            placeholder="no-reply@workerbase.dev"
            className="field-input"
          />
        </Field>
        <Field label="From name">
          <input
            value={settings.fromName}
            onChange={(e) => setSettings((s) => ({ ...s, fromName: e.target.value }))}
            placeholder="Workerbase"
            className="field-input"
          />
        </Field>
      </Card>
      <SaveBar onSave={handleSave} saving={saving} error={error} />
    </div>
  );
}
