import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import AuthLayout from "@/components/AuthLayout";
import Field from "@/components/Field";
import { apiMagicRequest } from "@/lib/api-superusers";
import { ApiError } from "@/lib/api-client";
import { useFormValidation } from "@/hooks/useFormValidation";
import { loginSchema } from "@/lib/validation";

type Stage = "request" | "sent";
type EmailForm = { email: string; password: string };

export default function MagicLogin() {
  const [stage, setStage] = useState<Stage>("request");
  const [busy, setBusy] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  const {
    values,
    errors,
    touched,
    setValue,
    onBlur,
    validateAll,
  } = useFormValidation<EmailForm>(loginSchema, { email: "", password: "" });

  const emailValid = !errors.email && touched.email;

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

  return (
    <AuthLayout
      label="Magic link"
      title={stage === "request" ? "Sign in by email." : "Check your inbox."}
      footer={
        <Link to="/login" className="text-[13px] text-ink-muted hover:text-brand transition">
          ← Back to sign in
        </Link>
      }
    >
      {stage === "request" ? (
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
            Check the backend console log (local dev only) for the link.
          </p>
        </div>
      )}
    </AuthLayout>
  );
}
