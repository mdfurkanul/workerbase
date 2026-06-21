import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import AuthLayout from "@/components/AuthLayout";
import Field from "@/components/Field";
import { signIn } from "@/lib/dummyAuth";
import { useAuth } from "@/hooks/useAuth";

export default function SignIn() {
  const navigate = useNavigate();
  const { setUser } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    await new Promise((r) => setTimeout(r, 500));
    setUser(signIn(email, password));
    navigate("/");
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
          value={email}
          onChange={setEmail}
        />
        <Field
          label="Password"
          type="password"
          autoComplete="current-password"
          required
          placeholder="••••••••"
          value={password}
          onChange={setPassword}
        />
        <button type="submit" disabled={busy} className="btn-primary w-full">
          {busy ? "Signing in…" : "Sign in"}
        </button>

        <p className="text-[12px] text-ink-faint">
          No public registration. Accounts are provisioned by a superuser.
        </p>
      </form>
    </AuthLayout>
  );
}
