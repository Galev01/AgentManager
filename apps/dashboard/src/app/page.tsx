import { AppShell } from "@/components/app-shell";
import { OverviewCards, OverviewMeta } from "@/components/overview-cards";
import { DegradedBanner } from "@/components/degraded-banner";
import { getOverview } from "@/lib/bridge-client";
import { getBridgeWsUrl } from "@/lib/ws-url";
import type { OverviewData } from "@openclaw-manager/types";

export const dynamic = "force-dynamic";

export default async function OverviewPage() {
  let data: OverviewData | null = null;
  let bridgeError = false;
  try { data = await getOverview(); } catch { bridgeError = true; }

  const wsUrl = getBridgeWsUrl();

  return (
    <AppShell title="Overview" wsUrl={wsUrl}>
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
