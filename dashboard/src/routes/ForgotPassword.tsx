import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import AuthLayout from "@/components/AuthLayout";
import Field from "@/components/Field";

type Stage = "request" | "sent";

export default function ForgotPassword() {
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
            value={email}
            onChange={setEmail}
            hint="We’ll send a recovery link. Expires in 30 minutes."
          />
          <button type="submit" disabled={busy} className="btn-primary w-full">
            {busy ? "Sending…" : "Send recovery link"}
          </button>
        </form>
      ) : (
        <div className="space-y-5">
          <p className="text-[14px] text-ink-muted">
            If an account exists for{" "}
            <span className="font-mono text-brand">{email}</span>, a reset link
            is on its way.
          </p>
          <p className="text-[12px] text-ink-faint">
            For security we don’t disclose whether the email is registered.
          </p>
        </div>
      )}
    </AuthLayout>
  );
}
