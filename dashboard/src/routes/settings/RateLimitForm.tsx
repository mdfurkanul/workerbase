import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { apiClient, ApiError } from "@/lib/api-client";
import { Card, SaveBar, StatusPill } from "./primitives";

interface RateLimitRule {
  id: string;
  label: string;
  maxRequests: number;
  interval: number;
  target: string;
}

interface RateLimitConfig {
  enabled: boolean;
  rules: RateLimitRule[];
}

const DEFAULT_RULES: RateLimitRule[] = [
  { id: crypto.randomUUID(), label: "*.auth", maxRequests: 10, interval: 3, target: "all" },
  { id: crypto.randomUUID(), label: "*.create", maxRequests: 20, interval: 5, target: "all" },
  { id: crypto.randomUUID(), label: "/api/", maxRequests: 300, interval: 10, target: "all" },
];

const DEFAULT_CONFIG: RateLimitConfig = { enabled: false, rules: DEFAULT_RULES };

export function RateLimitForm() {
  const [config, setConfig] = useState<RateLimitConfig>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    apiClient
      .get<{ settings: Record<string, unknown> }>(`/api/core/settings`)
      .then((data) => {
        const rl = data.settings?.rateLimit;
        if (rl && typeof rl === "object") {
          const raw = rl as Record<string, unknown>;
          setConfig({
            enabled: !!raw.enabled,
            rules: Array.isArray(raw.rules)
              ? (raw.rules as Record<string, unknown>[]).map((r) => ({
                  id: String(r.id ?? crypto.randomUUID()),
                  label: String(r.label ?? ""),
                  maxRequests: Number(r.maxRequests ?? 10),
                  interval: Number(r.interval ?? 3),
                  target: String(r.target ?? "all"),
                }))
              : DEFAULT_RULES,
          });
        }
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load rate limit settings");
      })
      .finally(() => setLoading(false));
  }, []);

  function toggleEnabled() {
    setConfig((c) => ({ ...c, enabled: !c.enabled }));
  }

  function updateRule(id: string, patch: Partial<RateLimitRule>) {
    setConfig((c) => ({
      ...c,
      rules: c.rules.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    }));
  }

  function addRule() {
    setConfig((c) => ({
      ...c,
      rules: [
        ...c.rules,
        { id: crypto.randomUUID(), label: "", maxRequests: 10, interval: 3, target: "all" },
      ],
    }));
  }

  function removeRule(id: string) {
    setConfig((c) => ({ ...c, rules: c.rules.filter((r) => r.id !== id) }));
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      await apiClient.patch(`/api/core/settings`, { rateLimit: config });
      setSavedAt(Date.now());
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? typeof err.detail === "string"
            ? err.detail
            : (err.detail as { error?: string } | null)?.error ?? err.message
          : err instanceof Error
            ? err.message
            : "Failed to save rate limit settings";
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
      <Card title="Rate limiting">
        {/* Enable toggle */}
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[13px] text-ink">Enable rate limiting</div>
            <div className="text-[12px] text-ink-faint mt-0.5">
              Per-IP request throttling based on path patterns.
            </div>
          </div>
          <StatusPill on={config.enabled} onClick={toggleEnabled} />
        </div>

        {/* Rules table */}
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="hairline-b label-mono text-left">
                <th className="py-2 pr-3 font-normal">Rate limit label</th>
                <th className="py-2 px-3 font-normal">Max requests (per IP)</th>
                <th className="py-2 px-3 font-normal">Interval (seconds)</th>
                <th className="py-2 px-3 font-normal">Targeted users</th>
                <th className="py-2 pl-3 font-normal w-8"></th>
              </tr>
            </thead>
            <tbody>
              {config.rules.map((rule) => (
                <tr key={rule.id} className="hairline-b">
                  <td className="py-2 pr-3">
                    <input
                      value={rule.label}
                      onChange={(e) => updateRule(rule.id, { label: e.target.value })}
                      placeholder="e.g. *.auth or /api/"
                      className="field-input font-mono text-[12px] w-full"
                    />
                  </td>
                  <td className="py-2 px-3">
                    <input
                      type="number"
                      min="1"
                      value={rule.maxRequests}
                      onChange={(e) =>
                        updateRule(rule.id, { maxRequests: parseInt(e.target.value, 10) || 0 })
                      }
                      className="field-input font-mono text-[12px] w-24"
                    />
                  </td>
                  <td className="py-2 px-3">
                    <input
                      type="number"
                      min="1"
                      value={rule.interval}
                      onChange={(e) =>
                        updateRule(rule.id, { interval: parseInt(e.target.value, 10) || 0 })
                      }
                      className="field-input font-mono text-[12px] w-24"
                    />
                  </td>
                  <td className="py-2 px-3">
                    <select
                      value={rule.target}
                      onChange={(e) => updateRule(rule.id, { target: e.target.value })}
                      className="field-input text-[12px] w-full"
                    >
                      <option value="all">All</option>
                      <option value="anonymous">Anonymous</option>
                      <option value="authenticated">Authenticated</option>
                    </select>
                  </td>
                  <td className="py-2 pl-3 text-center">
                    <button
                      type="button"
                      onClick={() => removeRule(rule.id)}
                      title="Delete rule"
                      className="btn-icon h-6 w-6"
                    >
                      <Trash2 size={12} className="text-err" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Add rule */}
        <button
          type="button"
          onClick={addRule}
          className="flex items-center gap-1.5 text-[12px] text-brand hover:underline"
        >
          <Plus size={12} /> Add rate limit rule
        </button>

        {savedAt && !error && (
          <div className="text-[12px] text-ok">
            Saved {new Date(savedAt).toLocaleTimeString()}
          </div>
        )}
      </Card>

      <SaveBar onSave={handleSave} saving={saving} error={error} />
    </div>
  );
}
