// apps/dashboard/src/app/logs/page.tsx
import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/session";
import { LogCenterTable } from "@/components/log-center-table";

export default async function LogsPage(): Promise<React.ReactElement> {
  if (!(await isAuthenticated())) redirect("/login");
  return (
    <div className="page">
      <h1>Log Center</h1>
      <p className="muted">
        Semantic-action telemetry. Filters apply to feature, action, outcome, actor, traceId, target.id.
      </p>
      <LogCenterTable />
    </div>
  );
}
