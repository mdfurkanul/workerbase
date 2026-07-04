import type { ReactNode } from "react";
import { TopBar } from "./app-shell/TopBar";
import { Sidebar } from "./app-shell/Sidebar";

export { PageHeader, EmptyState } from "./app-shell/PageHeader";
export { FileText } from "./app-shell/PageHeader";

/**
 * Dashboard chrome — orange top bar + optional Collections sidebar.
 * Pass `hideSidebar` for routes (e.g. Settings) that ship their own
 * sub-sidebar.
 */
export default function AppShell({
  children,
  hideSidebar = false,
}: {
  children: ReactNode;
  hideSidebar?: boolean;
}) {
  return (
    <div className="h-screen overflow-hidden flex flex-col bg-bg text-ink">
      <TopBar />
      <div className="flex-1 flex min-h-0">
        {!hideSidebar && <Sidebar />}
        <main className="flex-1 min-w-0 flex flex-col min-h-0">
          {children}
        </main>
      </div>
    </div>
  );
}
