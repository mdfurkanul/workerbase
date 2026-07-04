import { useEffect, useState } from "react";
import { apiClient, ApiError } from "@/lib/api-client";
import { Card, Field, SaveBar } from "./primitives";

interface StorageSettings {
  maxFileSizeMB: number;
  allowedTypes: string[];
}
const DEFAULT_STORAGE: StorageSettings = {
  maxFileSizeMB: 50,
  allowedTypes: ["image/*", "application/pdf"],
};

/** Predefined file-type categories. Toggling a checkbox adds/removes its
 *  MIME list as a unit. The custom field is for anything not listed. */
const FILE_CATEGORIES: { label: string; types: string[] }[] = [
  { label: "Images", types: ["image/*"] },
  { label: "PDF", types: ["application/pdf"] },
  {
    label: "Documents",
    types: [
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.oasis.opendocument.text",
      "application/rtf",
    ],
  },
  {
    label: "Spreadsheets",
    types: [
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.oasis.opendocument.spreadsheet",
      "text/csv",
    ],
  },
  { label: "Video", types: ["video/*"] },
  { label: "Audio", types: ["audio/*"] },
  {
    label: "Archives",
    types: [
      "application/zip",
      "application/x-tar",
      "application/gzip",
      "application/x-rar-compressed",
      "application/x-7z-compressed",
    ],
  },
  {
    label: "Text & code",
    types: ["text/plain", "text/markdown", "text/html", "application/json", "application/xml"],
  },
];

/** MIME types covered by the predefined categories — used to separate
 *  category-driven entries from custom ones when rendering the custom field. */
const CATEGORY_MIMES = new Set(FILE_CATEGORIES.flatMap((c) => c.types));

export function StorageForm() {
  const [settings, setSettings] = useState<StorageSettings>(DEFAULT_STORAGE);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiClient
      .get<{ settings: Record<string, unknown> }>(`/api/core/settings`)
      .then((data) => {
        const s = data.settings?.storage;
        if (s && typeof s === "object") {
          const obj = s as Record<string, unknown>;
          // Backward-compat: previous shape stored `allowedTypes` as a
          // comma-separated string. Accept either shape.
          let allowed = DEFAULT_STORAGE.allowedTypes;
          if (Array.isArray(obj.allowedTypes)) {
            allowed = obj.allowedTypes.filter((t): t is string => typeof t === "string");
          } else if (typeof obj.allowedTypes === "string") {
            allowed = obj.allowedTypes
              .split(",")
              .map((t) => t.trim())
              .filter(Boolean);
          }
          setSettings({
            maxFileSizeMB: typeof obj.maxFileSizeMB === "number" ? obj.maxFileSizeMB : DEFAULT_STORAGE.maxFileSizeMB,
            allowedTypes: allowed,
          });
        }
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load storage settings");
      })
      .finally(() => setLoading(false));
  }, []);

  const allowedSet = new Set(settings.allowedTypes);

  // Custom types = anything in the list that isn't part of a known category.
  const customTypes = settings.allowedTypes.filter((t) => !CATEGORY_MIMES.has(t));

  function toggleCategory(types: string[], on: boolean) {
    setSettings((s) => {
      const current = new Set(s.allowedTypes);
      for (const t of types) {
        if (on) current.add(t);
        else current.delete(t);
      }
      return { ...s, allowedTypes: Array.from(current) };
    });
  }

  function setCustomTypes(raw: string) {
    const parsed = raw
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    // Keep all category-driven types and append the parsed custom ones
    // (deduped, preserving order).
    const kept = settings.allowedTypes.filter((t) => CATEGORY_MIMES.has(t));
    const merged = new Set(kept);
    for (const t of parsed) merged.add(t);
    setSettings((s) => ({ ...s, allowedTypes: Array.from(merged) }));
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      await apiClient.patch(`/api/core/settings`, { storage: settings });
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? typeof err.detail === "string"
            ? err.detail
            : (err.detail as { error?: string } | null)?.error ?? err.message
          : err instanceof Error
            ? err.message
            : "Failed to save storage settings";
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
      <Card title="Uploads">
        <Field label="Max file size (MB)">
          <input
            type="number"
            min={1}
            value={settings.maxFileSizeMB}
            onChange={(e) => {
              const n = parseInt(e.target.value, 10);
              setSettings((s) => ({ ...s, maxFileSizeMB: isNaN(n) ? 0 : n }));
            }}
            className="field-input font-mono max-w-[180px]"
          />
        </Field>

        <div>
          <span className="label-mono">Allowed types</span>
          <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-2">
            {FILE_CATEGORIES.map((cat) => {
              const checked = cat.types.every((t) => allowedSet.has(t));
              return (
                <label
                  key={cat.label}
                  className="flex items-center gap-2 cursor-pointer select-none text-[13px] text-ink"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => toggleCategory(cat.types, e.target.checked)}
                    className="accent-[var(--brand)] w-3.5 h-3.5"
                  />
                  <span>{cat.label}</span>
                </label>
              );
            })}
          </div>
        </div>

        <Field
          label="Custom MIME types"
          hint="Comma-separated — e.g. application/x-yaml, image/avif"
        >
          <input
            value={customTypes.join(", ")}
            onChange={(e) => setCustomTypes(e.target.value)}
            placeholder="application/x-yaml, image/avif"
            className="field-input font-mono text-[12px]"
          />
        </Field>
      </Card>
      <SaveBar onSave={handleSave} saving={saving} error={error} />
    </div>
  );
}
