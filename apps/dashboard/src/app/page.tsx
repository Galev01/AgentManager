import { AppShell } from "@/components/app-shell";
import { DegradedBanner } from "@/components/degraded-banner";
import { AttentionCard } from "@/components/overview/attention-card";
import { SystemStatus } from "@/components/overview/system-status";
import { ActivityFeed } from "@/components/overview/activity-feed";
import { StatRow } from "@/components/overview/stat-row";
import { getOverview, getReviewInbox, callGatewayMethod } from "@/lib/bridge-client";

import type { OverviewData } from "@openclaw-manager/types";
import type { LampStatus } from "@/components/ui/status-lamp";

export const dynamic = "force-dynamic";

export default async function OverviewPage() {
  let data: OverviewData | null = null;
  let bridgeError = false;

  try {
    data = await getOverview();
  } catch {
    bridgeError = true;
  }

  // Pending review inbox — cap to 5, only actionable states
  let pendingCount = 0;
  let inboxError = false;
  const recentRows: Array<{
    id: string;
    agent: string;
    who: string;
    snippet: string;
    flagged: string;
    projectId: string;
    reportDate: string;
  }> = [];

  try {
    const inbox = await getReviewInbox(["new", "needs_attention", "actionable"]);
    const items = inbox.items ?? [];
    pendingCount = items.length;
    items.slice(0, 5).forEach((item) => {
      recentRows.push({
        id: item.reportDate,
        agent: item.projectName,
        who: `${item.ideasCount} idea${item.ideasCount !== 1 ? "s" : ""}`,
        snippet: item.projectName,
        flagged: item.severity,
        projectId: item.projectId,
        reportDate: item.reportDate,
      });
    });
  } catch {
    // inbox unavailable
    inboxError = true;
  }

  // System status rows
  const gatewayStatus: LampStatus = bridgeError ? "err" : "ok";
  const bridgeStatus: LampStatus = bridgeError ? "err" : "ok";

  let relayStatus: LampStatus = "off";
  let llmStatus: LampStatus = "off";
  let llmDetail = "unknown";

  try {
    const config = await callGatewayMethod("config.get", {}) as Record<string, unknown>;
    const parsed = config?.parsed as Record<string, unknown> | undefined;
    const primaryModel = (parsed?.agents as Record<string, unknown> | undefined)
      ?.defaults as Record<string, unknown> | undefined;
    const model = primaryModel?.model as Record<string, unknown> | undefined;
    const rawPrimary = (model as any)?.primary;
    const modelName = typeof rawPrimary === "string" ? rawPrimary : undefined;
    if (modelName) {
      llmDetail = modelName;
      llmStatus = "ok";
    }
    relayStatus = "ok";
  } catch {
    // gateway offline
  }

  const systemRows = [
    { label: "Gateway", status: gatewayStatus, detail: bridgeError ? "unreachable" : "connected" },
    { label: "Bridge", status: bridgeStatus, detail: bridgeError ? "offline" : "healthy" },
    { label: "Relay", status: relayStatus, detail: relayStatus === "ok" ? "active" : "unknown" },
    { label: "LLM", status: llmStatus, detail: llmDetail },
  ];

  return (
    <AppShell title="Overview">
      {bridgeError && <DegradedBanner />}
      <div className="grid grid-cols-[2fr_1fr] gap-4 mb-4">
        <AttentionCard pendingReviewCount={pendingCount} recent={recentRows} unavailable={inboxError} />
        <div className="flex flex-col gap-4">
          <SystemStatus rows={systemRows} />
          <ActivityFeed />
        </div>
      </div>
      {data && <StatRow data={data} />}
    </AppShell>
  );
}
