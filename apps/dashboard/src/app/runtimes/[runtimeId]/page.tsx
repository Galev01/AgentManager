import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { CapabilityBadges } from "@/components/capability-badges";
import { RuntimeActivityList } from "@/components/runtime-activity-list";
import { getRuntime, getCapabilities, listActivity } from "@/lib/runtime-client";
import { requirePermission } from "@/lib/auth/current-user";
import type {
  CapabilitySnapshot,
  RuntimeActivityEvent,
  RuntimeDescriptor,
} from "@openclaw-manager/types";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ runtimeId: string }>;
}) {
  const { runtimeId } = await params;
  return { title: `Runtime: ${decodeURIComponent(runtimeId)}` };
}

export default async function RuntimeDetail({
  params,
}: {
  params: Promise<{ runtimeId: string }>;
}) {
  await requirePermission("runtimes.view");
  const { runtimeId } = await params;

  let info: { descriptor: RuntimeDescriptor; health: { ok: boolean; detail?: string } };
  try {
    info = await getRuntime(runtimeId);
  } catch {
    notFound();
  }

  let caps: CapabilitySnapshot | null;
  try {
    caps = await getCapabilities(runtimeId);
  } catch {
    caps = null;
  }

  let events: RuntimeActivityEvent[];
  try {
    events = await listActivity(runtimeId, 50);
  } catch {
    events = [];
  }

  return (
    <AppShell title={info!.descriptor.displayName}>
      <div className="p-6 space-y-6">
        <div>
          <div className="text-xs uppercase tracking-wide text-neutral-500">
            {info!.descriptor.kind} · {info!.descriptor.transport}
          </div>
          <h1 className="text-2xl font-semibold text-neutral-100">
            {info!.descriptor.displayName}
          </h1>
          <div className="text-sm text-neutral-500">{info!.descriptor.endpoint}</div>
          <div
            className={`mt-2 text-xs px-2 py-0.5 inline-block rounded border ${
              info!.health.ok
                ? "border-emerald-700 text-emerald-300"
                : "border-red-700 text-red-300"
            }`}
          >
            {info!.health.ok
              ? "Healthy"
              : `Unhealthy: ${info!.health.detail ?? "no detail"}`}
          </div>
        </div>

        <section>
          <h2 className="text-lg font-medium text-neutral-200 mb-2">Capabilities</h2>
          {caps ? (
            <CapabilityBadges snapshot={caps} />
          ) : (
            <div className="text-sm text-red-400">Capabilities unavailable.</div>
          )}
        </section>

        <section>
          <h2 className="text-lg font-medium text-neutral-200 mb-2">Recent activity</h2>
          <RuntimeActivityList events={events} />
        </section>
      </div>
    </AppShell>
  );
}
