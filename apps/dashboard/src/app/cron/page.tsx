import { AppShell } from "@/components/app-shell";
import { CronTable } from "@/components/cron-table";
import { listCronJobs } from "@/lib/bridge-client";
import { requirePermission } from "@/lib/auth/current-user";
import type { CronJob } from "@openclaw-manager/types";

export const metadata = { title: "Cron Jobs" };

export default async function CronPage() {
  await requirePermission("cron.view");
  let jobs: CronJob[] = [];
  try {
    jobs = await listCronJobs();
  } catch {
    // bridge unavailable — show empty list
  }

  return (
    <AppShell title="Cron Jobs">
      <div className="mx-auto max-w-5xl space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-100">Cron Jobs</h1>
          <p className="mt-1 text-sm text-zinc-400">
            Schedule recurring tasks. Run jobs on demand, add new schedules, or remove existing ones.
          </p>
        </div>
        <CronTable initial={jobs} />
      </div>
    </AppShell>
  );
}
