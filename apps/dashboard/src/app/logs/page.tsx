import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/session";
import { AppShell } from "@/components/app-shell";
import { LogCenterTable } from "@/components/log-center-table";

export const metadata = { title: "Logs" };
export const dynamic = "force-dynamic";

export default async function LogsPage() {
  if (!(await isAuthenticated())) redirect("/login");
  return (
    <AppShell title="Log Center">
      <div className="content">
        <p className="mb-4 text-sm text-zinc-400">
          Semantic-action telemetry. Filters apply to feature, action, outcome, actor, traceId, target.id.
        </p>
        <LogCenterTable />
      </div>
    </AppShell>
  );
}
