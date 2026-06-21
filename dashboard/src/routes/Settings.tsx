import { Link } from "react-router-dom";
import AppShell, { PageHeader } from "@/components/AppShell";
import { APP_VERSION } from "@/lib/mockData";
import ThemeToggle from "@/components/ThemeToggle";
import { useAuth } from "@/hooks/useAuth";

export default function Settings() {
  const { user } = useAuth();
  return (
    <AppShell>
      <PageHeader breadcrumbs={[<span>Settings</span>]} />
      <div className="max-w-2xl px-6 py-6 space-y-6">
        <Section title="Workspace">
          <Row label="Name" value="Workerbase" />
          <Row label="Version" value={APP_VERSION} mono />
          <Row label="Cloudflare region" value="edge-global" mono />
        </Section>

        <Section title="Appearance">
          <Row
            label="Theme"
            value={
              <span className="flex items-center gap-3 text-[13px]">
                <span>Toggle light / dark</span>
                <ThemeToggle />
              </span>
            }
          />
        </Section>

        <Section title="Account">
          <Row label="Email" value={user?.email ?? "—"} />
          <Row label="Role" value={user?.role === "superuser" ? "Superuser" : "Operator"} />
          <Row
            label="Manage"
            value={
              <Link to="/login" className="text-brand hover:underline text-[13px]">
                Switch account →
              </Link>
            }
          />
        </Section>

        <Section title="Danger zone">
          <Row
            label="Reset local state"
            value={
              <button
                className="btn-ghost text-[12px]"
                onClick={() => {
                  localStorage.clear();
                  window.location.href = "/login";
                }}
              >
                Clear session & reload
              </button>
            }
          />
        </Section>
      </div>
    </AppShell>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-surface border border-line rounded">
      <header className="px-4 py-3 hairline-b label-mono">{title}</header>
      <div className="divide-y divide-line">{children}</div>
    </section>
  );
}

function Row({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="grid grid-cols-[200px_1fr] gap-4 px-4 py-3 items-center">
      <span className="text-[13px] text-ink-muted">{label}</span>
      <span className={`text-[13px] text-ink ${mono ? "font-mono" : ""}`}>{value}</span>
    </div>
  );
}
