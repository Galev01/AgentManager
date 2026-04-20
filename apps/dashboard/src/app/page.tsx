import { AppShell } from "@/components/app-shell";
import { DegradedBanner } from "@/components/degraded-banner";
import { AttentionCard } from "@/components/overview/attention-card";
import { SystemStatus } from "@/components/overview/system-status";
import { ActivityFeed } from "@/components/overview/activity-feed";
import { StatRow } from "@/components/overview/stat-row";
import { PageHeader } from "@/components/ui";
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
    inboxError = true;
  }

  const gatewayStatus: LampStatus = bridgeError ? "err" : "ok";
  const bridgeStatus: LampStatus = bridgeError ? "err" : "ok";

  let relayStatus: LampStatus = "off";
  let llmStatus: LampStatus = "off";
  let llmDetail = "unknown";

  try {
    const config = (await callGatewayMethod("config.get", {})) as Record<string, unknown>;
    const parsed = config?.parsed as Record<string, unknown> | undefined;
    const primaryModel = (parsed?.agents as Record<string, unknown> | undefined)
      ?.defaults as Record<string, unknown> | undefined;
    const model = primaryModel?.model as Record<string, unknown> | undefined;
    const rawPrimary = (model as { primary?: unknown })?.primary;
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

  const totalConversations = data?.totalConversations ?? 0;
  const activeCount = data?.activeCount ?? 0;
  const sub = [
    `${totalConversations} thread${totalConversations === 1 ? "" : "s"}`,
    `${activeCount} active`,
    pendingCount > 0 && `${pendingCount} need review`,
  ].filter(Boolean).join(" · ");

  return (
    <AppShell title="Overview">
      <div className="content">
        {bridgeError && <DegradedBanner />}

        <PageHeader title="Overview" sub={sub} />

        <div className="attn">
          <AttentionCard
            pendingReviewCount={pendingCount}
            recent={recentRows}
            unavailable={inboxError}
          />
          <div className="attn-side">
            <SystemStatus rows={systemRows} />
            <ActivityFeed />
          </div>
        </div>

        {data && <StatRow data={data} />}
      </div>
    </AppShell>
  );
}
