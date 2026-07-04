import { useState } from "react";
import AppShell, { PageHeader } from "@/components/AppShell";
import { useAuth } from "@/hooks/useAuth";
import { type SectionId } from "./settings/types";
import { SettingsNav, Breadcrumb } from "./settings/SettingsNav";
import { ApplicationForm } from "./settings/ApplicationForm";
import { MailForm } from "./settings/MailForm";
import { StorageForm } from "./settings/StorageForm";
import { BackupsForm } from "./settings/BackupsForm";
import { CronsForm } from "./settings/CronsForm";
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
          <div className="max-w-2xl px-8 py-8">
            <Breadcrumb section={active} />

            {active === "application" && <ApplicationForm />}
            {active === "mail" && <MailForm />}
            {active === "storage" && <StorageForm />}
            {active === "backups" && <BackupsForm />}
            {active === "crons" && <CronsForm />}
            {active === "export" && <ExportForm />}
            {active === "import" && <ImportForm />}
            {active === "debug" && <DebugForm email={user?.email} />}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
