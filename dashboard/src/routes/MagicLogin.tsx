import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import AuthLayout from "@/components/AuthLayout";
import Field from "@/components/Field";
import { completeMagicLogin } from "@/lib/dummyAuth";
import { useAuth } from "@/hooks/useAuth";

type Stage = "request" | "sent";

export default function MagicLogin() {
  const navigate = useNavigate();
  const { setUser } = useAuth();
  const [email, setEmail] = useState("");
  const [stage, setStage] = useState<Stage>("request");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    await new Promise((r) => setTimeout(r, 500));
    setBusy(false);
    setStage("sent");
  }

  function enterNow() {
    setUser(completeMagicLogin(email));
    navigate("/");
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
            value={email}
            onChange={setEmail}
            hint="We’ll email a one-time link. Expires in 15 minutes."
          />
          <button type="submit" disabled={busy} className="btn-primary w-full">
            {busy ? "Sending…" : "Send magic link"}
          </button>
        </form>
      ) : (
        <div className="space-y-5">
          <p className="text-[14px] text-ink-muted">
            A signed link is on its way to{" "}
            <span className="font-mono text-brand">{email}</span>.
          </p>
          <button onClick={enterNow} className="btn-primary w-full">
            Enter workspace
          </button>
        </div>
      )}
    </AuthLayout>
  );
}
