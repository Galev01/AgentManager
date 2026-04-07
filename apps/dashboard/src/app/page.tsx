import { AppShell } from "@/components/app-shell";
import { OverviewCards, OverviewMeta } from "@/components/overview-cards";
import { DegradedBanner } from "@/components/degraded-banner";
import { getOverview, callGatewayMethod } from "@/lib/bridge-client";

import type { OverviewData } from "@openclaw-manager/types";

export const dynamic = "force-dynamic";

export default async function OverviewPage() {
  let data: OverviewData | null = null;
  let bridgeError = false;
  let activeModel: string | null = null;

  try { data = await getOverview(); } catch { bridgeError = true; }

  try {
    const config = await callGatewayMethod("config.get", {}) as any;
    activeModel = config?.parsed?.agents?.defaults?.model?.primary ?? null;
  } catch {
    // gateway may be offline
  }

  return (
    <AppShell title="Overview">
      {bridgeError && <DegradedBanner />}
      {data ? (
        <>
          <OverviewCards data={data} />
          <OverviewMeta data={data} activeModel={activeModel} />
        </>
      ) : !bridgeError && <p className="text-text-muted">Loading...</p>}
    </AppShell>
  );
}
