import { useState } from "react";
import AppShell, { PageHeader } from "@/components/AppShell";
import { useAuth } from "@/hooks/useAuth";
import { type SectionId } from "./settings/types";
import { SettingsNav, Breadcrumb } from "./settings/SettingsNav";
import { ApplicationForm } from "./settings/ApplicationForm";
import { TimezoneForm } from "./settings/TimezoneForm";
import { MailForm } from "./settings/MailForm";
import { SystemEmailsForm } from "./settings/SystemEmailsForm";
import { StorageForm } from "./settings/StorageForm";
import { BackupsForm } from "./settings/BackupsForm";
import { CronsForm } from "./settings/CronsForm";
import { ApiTokensForm } from "./settings/ApiTokensForm";
import { ExportForm } from "./settings/ExportForm";
import { ImportForm } from "./settings/ImportForm";
import { DebugForm } from "./settings/DebugForm";

export default function Settings() {
  const [active, setActive] = useState<SectionId>("application");
  const { user } = useAuth();

  return (
    <AppShell hideSidebar>
      <PageHeader breadcrumbs={[<span>Settings</span>]} />

      {/* Two-panel layout: sub-sidebar + form */}
      <div className="flex-1 grid grid-cols-[220px_1fr] min-h-0">
        <SettingsNav active={active} onSelect={setActive} />

        <section className="overflow-y-auto">
          <div
            className={
              active === "systemEmails"
                ? "px-8 py-8" // full width — composer needs the room
                : active === "backups"
                  ? "max-w-6xl px-8 py-8"
                  : "max-w-2xl px-8 py-8"
            }
          >
            <Breadcrumb section={active} />

            {active === "application" && <ApplicationForm />}
            {active === "timezone" && <TimezoneForm />}
            {active === "mail" && <MailForm />}
            {active === "systemEmails" && <SystemEmailsForm />}
            {active === "storage" && <StorageForm />}
            {active === "backups" && <BackupsForm />}
            {active === "crons" && <CronsForm />}
            {active === "apiTokens" && <ApiTokensForm />}
            {active === "export" && <ExportForm />}
            {active === "import" && <ImportForm />}
            {active === "debug" && <DebugForm email={user?.email} />}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
