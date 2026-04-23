import { AppShell } from "@/components/app-shell";
import { RuntimeCard } from "@/components/runtime-card";
import { listRuntimes, getRuntime } from "@/lib/runtime-client";
import { requirePermission } from "@/lib/auth/current-user";

export const metadata = { title: "Runtimes" };
export const dynamic = "force-dynamic";

export default async function RuntimesPage() {
  await requirePermission("runtimes.view");
  const descriptors = await listRuntimes();
  const withHealth = await Promise.all(
    descriptors.map(async (d) => {
      try {
        const r = await getRuntime(d.id);
        return { d, healthy: r.health.ok as boolean | null };
      } catch {
        return { d, healthy: null as boolean | null };
      }
    }),
  );

  return (
    <AppShell title="Runtimes">
      <div className="p-6 space-y-4">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-100">Runtimes</h1>
          <p className="text-sm text-neutral-400">
            Local agent runtimes wired into this manager.
          </p>
        </div>
        {withHealth.length === 0 ? (
          <div className="text-neutral-400 text-sm">
            No runtimes configured. Edit <code>runtimes.json</code> on the bridge host.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {withHealth.map(({ d, healthy }) => (
              <RuntimeCard key={d.id} descriptor={d} healthy={healthy} />
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
