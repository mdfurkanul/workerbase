import { useEffect, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import AuthLayout from "@/components/AuthLayout";
import Field from "@/components/Field";
import { apiResetPassword } from "@/lib/api-superusers";
import { ApiError, clearToken } from "@/lib/api-client";
import { useFormValidation } from "@/hooks/useFormValidation";
import { z } from "zod";

const resetSchema = z.object({
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(256, "Password must be 256 characters or less"),
  confirm: z.string(),
});

type ResetForm = { password: string; confirm: string };
type Stage = "form" | "done";

export default function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get("token");
  const [stage, setStage] = useState<Stage>("form");
  const [busy, setBusy] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  const {
    values,
    errors,
    touched,
    setValue,
    onBlur,
    validateAll,
  } = useFormValidation<ResetForm>(resetSchema, { password: "", confirm: "" });

  // Cross-field confirmation check layered on top of the zod schema.
  const confirmError =
    touched.confirm && values.confirm !== values.password
      ? "Passwords do not match"
      : undefined;

  const passwordValid = !errors.password && touched.password;
  const isValid = passwordValid && !confirmError && values.confirm.length > 0;

  useEffect(() => {
    if (!token) setApiError("This reset link is missing a token.");
  }, [token]);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setApiError(null);
    if (!token) {
      setApiError("This reset link is invalid.");
      return;
    }
    if (!validateAll() || values.confirm !== values.password) return;
    setBusy(true);
    try {
      await apiResetPassword(token, values.password);
      // Don't auto-sign-in — force a fresh login with the new password.
      clearToken();
      setStage("done");
    } catch (err) {
      if (err instanceof ApiError) {
        setApiError(
          err.status === 401
            ? "This reset link has expired or already been used."
            : err.message,
        );
      } else {
        setApiError("Network error. Is the backend running?");
      }
    } finally {
      setBusy(false);
    }
  }

  if (stage === "done") {
    return (
      <AuthLayout
        label="Reset password"
        title="Password updated."
        footer={
          <Link to="/login" className="text-[13px] text-ink-muted hover:text-brand transition">
            ← Back to sign in
          </Link>
        }
      >
        <div className="space-y-5">
          <p className="text-[14px] text-ink-muted">
            Your password has been changed. Please sign in with your new password.
          </p>
          <Link to="/login" className="btn-primary w-full text-center inline-block">
            Continue to sign in
          </Link>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      label="Reset password"
      title="Choose a new password."
      footer={
        <Link to="/login" className="text-[13px] text-ink-muted hover:text-brand transition">
          ← Back to sign in
        </Link>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        <Field
          label="New password"
          type="password"
          autoComplete="new-password"
          required
          placeholder="••••••••"
          value={values.password}
          onChange={(v) => setValue("password", v)}
          onBlur={() => onBlur("password")}
          error={touched.password ? errors.password : undefined}
          hint="At least 8 characters."
        />
        <Field
          label="Confirm password"
          type="password"
          autoComplete="new-password"
          required
          placeholder="••••••••"
          value={values.confirm}
          onChange={(v) => setValue("confirm", v)}
          onBlur={() => onBlur("confirm")}
          error={confirmError}
        />
        {apiError && (
          <p className="text-err text-[12px] bg-err-bg border border-line-strong rounded px-3 py-2">
            {apiError}
          </p>
        )}
        <button
          type="submit"
          disabled={busy || !isValid || !token}
          className="btn-primary w-full"
        >
          {busy ? "Resetting…" : "Reset password"}
        </button>
      </form>
    </AuthLayout>
  );
}
