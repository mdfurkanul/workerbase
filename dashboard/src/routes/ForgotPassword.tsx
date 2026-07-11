import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import AuthLayout from "@/components/AuthLayout";
import Field from "@/components/Field";
import { apiForgotPassword } from "@/lib/api-superusers";
import { ApiError } from "@/lib/api-client";
import { useFormValidation } from "@/hooks/useFormValidation";
import { emailOnlySchema } from "@/lib/validation";

type Stage = "request" | "sent";
type EmailForm = { email: string };

export default function ForgotPassword() {
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
  } = useFormValidation<EmailForm>(emailOnlySchema, { email: "" });

  const emailValid = !errors.email && touched.email;

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setApiError(null);
    if (!validateAll()) return;
    setBusy(true);
    try {
      await apiForgotPassword(values.email);
      setStage("sent");
    } catch (err) {
      setApiError(err instanceof ApiError ? err.message : "Network error.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout
      label="Forgot password"
      title={stage === "request" ? "Reset your password." : "Check your inbox."}
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
            hint="We'll send a recovery link. Expires in 30 minutes."
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
            {busy ? "Sending…" : "Send recovery link"}
          </button>
        </form>
      ) : (
        <div className="space-y-5">
          <p className="text-[14px] text-ink-muted">
            If an account exists for{" "}
            <span className="font-mono text-brand">{values.email}</span>, a reset link
            is on its way.
          </p>
          <p className="text-[12px] text-ink-faint">
            For security we don't disclose whether the email is registered.
          </p>
        </div>
      )}
    </AuthLayout>
  );
}
