import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import AuthLayout from "@/components/AuthLayout";
import Field from "@/components/Field";
import { apiMagicRequest, apiMagicVerify } from "@/lib/api-superusers";
import { ApiError } from "@/lib/api-client";
import { useAuth } from "@/hooks/useAuth";
import { useFormValidation } from "@/hooks/useFormValidation";
import { emailOnlySchema } from "@/lib/validation";

type Stage = "request" | "sent" | "verifying";
type EmailForm = { email: string };

export default function MagicLogin() {
  const [params] = useSearchParams();
  const token = params.get("token");
  const navigate = useNavigate();
  const { setUser } = useAuth();

  // "verifying" stage is active when a token is present in the URL —
  // the landing-from-email flow. Without a token we show the request form.
  const [stage, setStage] = useState<Stage>(token ? "verifying" : "request");
  const [busy, setBusy] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  const {
    values,
    errors,
    touched,
    setValue,
    onBlur,
    validateAll,
  } = useFormValidation<EmailForm>(emailOnlySchema, { email: "" });

  const emailValid = !errors.email && touched.email;

  // Auto-verify when the page is opened from a magic link (?token=...).
  // The ref guard prevents React StrictMode's double-effect-invoke from
  // triggering two API calls. We intentionally don't use a `cancelled`
  // flag because StrictMode's simulated unmount sets it to true before
  // the fetch resolves, which would skip the navigate("/") call and
  // leave the page stuck on "Verifying…".
  const verified = useRef(false);
  useEffect(() => {
    if (!token || verified.current) return;
    verified.current = true;
    (async () => {
      try {
        const res = await apiMagicVerify(token);
        setUser(res.user);
        navigate("/");
      } catch (err) {
        setStage("request");
        setApiError(
          err instanceof ApiError && err.status === 401
            ? "This magic link has expired or already been used."
            : err instanceof Error
              ? err.message
              : "Unable to verify magic link.",
        );
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setApiError(null);
    if (!validateAll()) return;
    setBusy(true);
    try {
      await apiMagicRequest(values.email);
      setStage("sent");
    } catch (err) {
      setApiError(err instanceof ApiError ? err.message : "Network error.");
    } finally {
      setBusy(false);
    }
  }

  const title =
    stage === "verifying"
      ? "Signing you in…"
      : stage === "request"
        ? "Sign in by email."
        : "Check your inbox.";

  return (
    <AuthLayout
      label="Magic link"
      title={title}
      footer={
        <Link to="/login" className="text-[13px] text-ink-muted hover:text-brand transition">
          ← Back to sign in
        </Link>
      }
    >
      {stage === "verifying" ? (
        <div className="space-y-5">
          <p className="text-[14px] text-ink-muted">Verifying your magic link…</p>
          {apiError && (
            <p className="text-err text-[12px] bg-err-bg border border-line-strong rounded px-3 py-2">
              {apiError}
            </p>
          )}
        </div>
      ) : stage === "request" ? (
        <form onSubmit={handleSubmit} className="space-y-5">
          <Field
            label="Email"
            type="email"
            autoComplete="email"
            required
            placeholder="you@domain.com"
            value={values.email}
            onChange={(v) => setValue("email", v)}
            onBlur={() => onBlur("email")}
            error={touched.email ? errors.email : undefined}
            hint="We'll email a one-time link. Expires in 15 minutes."
          />
          {apiError && (
            <p className="text-err text-[12px] bg-err-bg border border-line-strong rounded px-3 py-2">
              {apiError}
            </p>
          )}
          <button
            type="submit"
            disabled={busy || !emailValid}
            className="btn-primary w-full"
          >
            {busy ? "Sending…" : "Send magic link"}
          </button>
        </form>
      ) : (
        <div className="space-y-5">
          <p className="text-[14px] text-ink-muted">
            A signed link is on its way to{" "}
            <span className="font-mono text-brand">{values.email}</span>.
          </p>
          <p className="text-[12px] text-ink-faint">
            For security we don't disclose whether the email is registered.
          </p>
        </div>
      )}
    </AuthLayout>
  );
}
