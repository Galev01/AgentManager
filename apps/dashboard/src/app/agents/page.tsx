import { AppShell } from "@/components/app-shell";
import { AgentTable } from "@/components/agent-table";
import { listAgents, listAgentSessions } from "@/lib/bridge-client";
import { requirePermission } from "@/lib/auth/current-user";
import type { Agent, AgentSession } from "@openclaw-manager/types";

export const metadata = { title: "Agents" };
export const dynamic = "force-dynamic";

export type AgentActivity = {
  activeSessions: number;
  lastUsedAt: number | null;
};

export default async function AgentsPage() {
  await requirePermission("agents.view");
  let agents: Agent[] = [];
  let sessions: AgentSession[] = [];
  try {
    [agents, sessions] = await Promise.all([
      listAgents(),
      listAgentSessions().catch(() => [] as AgentSession[]),
    ]);
  } catch {
    // bridge unavailable — show empty list
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
        <AgentTable initial={agents} activity={activity} />
      </div>
    </AppShell>
  );
}
