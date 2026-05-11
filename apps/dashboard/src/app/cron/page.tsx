import { AppShell } from "@/components/app-shell";
import { CronTable } from "@/components/cron-table";
import { CapabilityGate } from "@/components/runtime/capability-gate";
import { listCronJobs } from "@/lib/bridge-client";
import { requirePermission } from "@/lib/auth/current-user";
import { resolveActiveRuntimeId } from "@/lib/runtime-active";
import type { CronJob } from "@openclaw-manager/types";

export const metadata = { title: "Cron Jobs" };

export default async function CronPage(props: {
  searchParams: Promise<{ runtimeId?: string }>;
}) {
  await requirePermission("cron.view");
  const sp = await props.searchParams;
  const runtimeId = await resolveActiveRuntimeId(sp.runtimeId);
  let jobs: CronJob[] = [];
  try {
    jobs = await listCronJobs(runtimeId);
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
        <CapabilityGate runtimeId={runtimeId ?? ""} capabilityId="cron.list">
          <CronTable initial={jobs} />
        </CapabilityGate>
      </div>
    </AppShell>
  );
}
