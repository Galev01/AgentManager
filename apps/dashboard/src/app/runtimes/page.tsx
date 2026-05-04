import { AppShell } from "@/components/app-shell";
import { RuntimeCard } from "@/components/runtime-card";
import { RuntimeFallbackBanner } from "@/components/runtime-fallback-banner";
import { getRuntimeConfig } from "@/lib/runtime-config-client";
import { requirePermission } from "@/lib/auth/current-user";

export const metadata = { title: "Runtimes" };
export const dynamic = "force-dynamic";

export default async function RuntimesPage() {
  await requirePermission("runtimes.view");
  const cfg = await getRuntimeConfig();
  const enabled = cfg.runtimes.filter((r) => r.enabled);
  // primary first
  enabled.sort((a, b) =>
    a.id === cfg.effectivePrimaryRuntimeId ? -1 :
    b.id === cfg.effectivePrimaryRuntimeId ? 1 : 0,
  );

  return (
    <AppShell title="Runtimes">
      <div className="p-6 space-y-4">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-100">Runtimes</h1>
          <p className="text-sm text-neutral-400">Local agent runtimes wired into this manager.</p>
        </div>
        <RuntimeFallbackBanner
          reason={cfg.fallbackReason}
          configured={cfg.configuredPrimaryRuntimeId}
          effective={cfg.effectivePrimaryRuntimeId}
        />
        {enabled.length === 0 ? (
          <div className="text-neutral-400 text-sm">
            No enabled runtimes. Enable one in <a href="/settings" className="underline">Settings</a>.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {enabled.map((r) => (
              <RuntimeCard
                key={r.id}
                descriptor={r}
                healthy={r.status.state === "healthy" ? true : r.status.state === "unhealthy" ? false : null}
                isPrimary={r.id === cfg.effectivePrimaryRuntimeId}
              />
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
