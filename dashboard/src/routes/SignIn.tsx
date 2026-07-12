import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import AuthLayout from "@/components/AuthLayout";
import Field from "@/components/Field";
import { apiLogin } from "@/lib/api-superusers";
import { ApiError } from "@/lib/api-client";
import { useAuth } from "@/hooks/useAuth";
import { useFormValidation } from "@/hooks/useFormValidation";
import { loginSchema } from "@/lib/validation";

type LoginForm = { email: string; password: string };

export default function SignIn() {
  const navigate = useNavigate();
  const { setUser } = useAuth();
  const [busy, setBusy] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  const {
    values,
    errors,
    touched,
    setValue,
    onBlur,
    validateAll,
  } = useFormValidation<LoginForm>(loginSchema, { email: "admin@workerbase.dev", password: "Password123" });

  const isValid = Object.values(errors).every((e) => !e) && touched.email && touched.password;

  // Auto-mark fields as touched on mount (dev convenience with prefilled values).
  useEffect(() => {
    onBlur("email");
    onBlur("password");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setApiError(null);
    if (!validateAll()) return;
    setBusy(true);
    try {
      const res = await apiLogin(values.email, values.password);
      setUser(res.user);
      navigate("/");
    } catch (err) {
      if (err instanceof ApiError) {
        setApiError(err.status === 401 ? "Invalid email or password." : err.message);
      } else {
        setApiError("Network error. Is the backend running on :8787?");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout
      label="Sign in"
      title="Welcome back."
      footer={
        <div className="flex items-center justify-between text-[13px]">
          <Link to="/magic-login" className="text-ink-muted hover:text-brand transition">
            Magic link
          </Link>
          <Link to="/forgot-password" className="text-ink-muted hover:text-brand transition">
            Forgot password?
          </Link>
        </div>
      }
    >
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
        />
        <Field
          label="Password"
          type="password"
          autoComplete="current-password"
          required
          placeholder="••••••••"
          value={values.password}
          onChange={(v) => setValue("password", v)}
          onBlur={() => onBlur("password")}
          error={touched.password ? errors.password : undefined}
        />
        {apiError && (
          <p className="text-err text-[12px] bg-err-bg border border-line-strong rounded px-3 py-2">
            {apiError}
          </p>
        )}
        <button
          type="submit"
          disabled={busy || !isValid}
          className="btn-primary w-full"
        >
          {busy ? "Signing in…" : "Sign in"}
        </button>

        <p className="text-[12px] text-ink-faint">
          No public registration. Accounts are provisioned by a superuser.{" "}
          <Link
            to="/setup"
            className="text-ink-muted hover:text-brand transition underline-offset-2 hover:underline"
          >
            Configure backend URL
          </Link>
        </p>
      </form>
    </AuthLayout>
  );
}
