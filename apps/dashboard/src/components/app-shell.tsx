import { Sidebar } from "./sidebar";
import { Header } from "./header";

export function AppShell({ title, wsUrl, children }: { title: string; wsUrl?: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <Sidebar />
      <div className="ml-[var(--sidebar-width)]">
        <Header title={title} wsUrl={wsUrl} />
        <main className="p-8">{children}</main>
      </div>
    </div>
  );
}
