import { AppShell } from "@/components/app-shell";
import { AgentTable } from "@/components/agent-table";
import { CapabilityGate } from "@/components/runtime/capability-gate";
import { listAgents, listAgentSessions } from "@/lib/bridge-client";
import { getModelsCatalog } from "@/lib/agent-models-client";
import { requirePermission } from "@/lib/auth/current-user";
import { resolveActiveRuntimeId } from "@/lib/runtime-active";
import type { Agent, AgentSession, ModelDescriptor } from "@openclaw-manager/types";

export const metadata = { title: "Agents" };
export const dynamic = "force-dynamic";

export type AgentActivity = {
  activeSessions: number;
  lastUsedAt: number | null;
};

export default async function AgentsPage(props: {
  searchParams: Promise<{ runtimeId?: string }>;
}) {
  await requirePermission("agents.view");
  const sp = await props.searchParams;
  const runtimeId = await resolveActiveRuntimeId(sp.runtimeId);
  let agents: Agent[] = [];
  let sessions: AgentSession[] = [];
  let modelCatalog: ModelDescriptor[] = [];
  let modelCatalogStatus: "ok" | "unavailable" = "unavailable";

  try {
    const [agentRows, sessionRows, catalog] = await Promise.all([
      listAgents(runtimeId),
      listAgentSessions().catch(() => [] as AgentSession[]),
      getModelsCatalog().catch(() => ({ models: [] as ModelDescriptor[], status: "unavailable" as const })),
    ]);
    agents = agentRows;
    sessions = sessionRows;
    modelCatalog = catalog.models;
    modelCatalogStatus = catalog.status;
  } catch {
    // Bridge unavailable - show empty list.
  }

  const activity: Record<string, AgentActivity> = {};
  for (const s of sessions) {
    const key = s.agentName ?? "";
    if (!key) continue;
    const cur = activity[key] ?? { activeSessions: 0, lastUsedAt: null };
    if (s.status === "active") cur.activeSessions += 1;
    const t = s.lastActivityAt ?? s.createdAt ?? null;
    if (t != null && (cur.lastUsedAt == null || t > cur.lastUsedAt)) {
      cur.lastUsedAt = t;
    }
    activity[key] = cur;
  }

  return (
    <AppShell title="Agents">
      <div className="content">
        <CapabilityGate runtimeId={runtimeId ?? ""} capabilityId="agents.list">
          <AgentTable
            initial={agents}
            activity={activity}
            modelCatalog={modelCatalog}
            modelCatalogStatus={modelCatalogStatus}
          />
        </CapabilityGate>
      </div>
    </AppShell>
  );
}
