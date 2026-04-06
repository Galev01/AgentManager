import { AppShell } from "@/components/app-shell";
import { OverviewCards, OverviewMeta } from "@/components/overview-cards";
import { DegradedBanner } from "@/components/degraded-banner";
import { AutoRefresh } from "@/components/auto-refresh";
import { getOverview } from "@/lib/bridge-client";
import type { OverviewData } from "@openclaw-manager/types";

export const dynamic = "force-dynamic";

export default async function OverviewPage() {
  let data: OverviewData | null = null;
  let bridgeError = false;
  try { data = await getOverview(); } catch { bridgeError = true; }

  return (
    <AppShell title="Overview">
      <AutoRefresh intervalMs={30000} />
      {bridgeError && <DegradedBanner />}
      {data ? (
        <>
          <OverviewCards data={data} />
          <OverviewMeta data={data} />
        </>
      ) : !bridgeError && <p className="text-text-muted">Loading...</p>}
    </AppShell>
  );
}
