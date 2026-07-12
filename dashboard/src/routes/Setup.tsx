import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import AuthLayout from "@/components/AuthLayout";
import Field from "@/components/Field";
import { getApiBase, setApiBase } from "@/lib/api-client";

/**
 * First-run setup page — lets the user point the dashboard at a backend
 * running on a different origin (split-Worker deployment).
 *
 * The dashboard's api-client resolves the backend URL in this order:
 *   1. `workerbase.apiBase` in localStorage (set by this page)
 *   2. `VITE_API_BASE_URL` baked in at build time
 *   3. empty → same-origin (single-Worker mode)
 *
 * On first load with no base configured and a cross-origin deploy, the
 * dashboard can't even reach `/api/core/install/status`. This page fixes
 * that by asking for the URL up front, testing it, then persisting it.
 */
export default function Setup() {
  const navigate = useNavigate();
  const [url, setUrl] = useState(getApiBase());
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<
    { ok: true; installed: boolean } | { ok: false; message: string } | null
  >(null);

  function normalizeUrl(raw: string): string {
    return raw.trim().replace(/\/+$/, "");
  }

  async function testConnection(rawUrl: string): Promise<void> {
    const normalized = normalizeUrl(rawUrl);
    if (!normalized) {
      setTestResult({ ok: false, message: "Enter a backend URL." });
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      // Hit a public, auth-free endpoint to verify reachability.
      const res = await fetch(
        `${normalized}/api/core/install/status`,
        { headers: { Accept: "application/json" } },
      );
      if (!res.ok) {
        setTestResult({ ok: false, message: `HTTP ${res.status}` });
        return;
      }
      const data = (await res.json()) as { installed?: boolean };
      setTestResult({ ok: true, installed: !!data.installed });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setTestResult({
        ok: false,
        message: msg.includes("Failed to fetch")
          ? "Unreachable or blocked by CORS."
          : msg,
      });
    } finally {
      setTesting(false);
    }
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const normalized = normalizeUrl(url);
    setApiBase(normalized);
    // Go to login (or install flow if not yet installed) — the api-client
    // will pick up the new base on the next request.
    navigate("/login", { replace: true });
  }

  function handleClear() {
    setApiBase("");
    setUrl("");
    setTestResult(null);
    navigate("/login", { replace: true });
  }

  return (
    <AuthLayout
      label="Setup"
      title={
        <>
          Connect to your <br />
          backend
        </>
      }
      footer={
        <button
          type="button"
          onClick={handleClear}
          className="text-[12px] text-ink-faint hover:text-ink underline-offset-2 hover:underline"
        >
          Use same origin (single-Worker mode)
        </button>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        <Field
          label="Backend URL"
          placeholder="https://api.yourapp.workers.dev"
          value={url}
          onChange={setUrl}
          hint="The Cloudflare Worker that serves the API. Leave empty for same-origin deploys where the dashboard and backend share one Worker."
        />

        {testResult && (
          <div
            className={`flex items-start gap-2 p-3 rounded text-[12px] ${
              testResult.ok
                ? "bg-ok-bg text-ok border border-ok/40"
                : "bg-err/10 text-err border border-err/40"
            }`}
          >
            {testResult.ok ? (
              <>
                <CheckCircle2 size={14} className="mt-0.5 shrink-0" />
                <span>
                  Connected.{" "}
                  {testResult.installed
                    ? "Instance is already installed — sign in."
                    : "Instance not installed yet — create the first admin next."}
                </span>
              </>
            ) : (
              <>
                <XCircle size={14} className="mt-0.5 shrink-0" />
                <span className="font-mono break-words">{testResult.message}</span>
              </>
            )}
          </div>
        )}

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void testConnection(url)}
            disabled={testing || !normalizeUrl(url)}
            className="btn-ghost text-[13px] disabled:opacity-50"
          >
            {testing ? (
              <>
                <Loader2 size={13} className="animate-spin" /> Testing…
              </>
            ) : (
              "Test connection"
            )}
          </button>
          <button
            type="submit"
            className="btn-primary flex-1"
            disabled={!normalizeUrl(url)}
          >
            Save & continue
          </button>
        </div>
      </form>
    </AuthLayout>
  );
}
