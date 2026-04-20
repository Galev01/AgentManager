import { AppShell } from "@/components/app-shell";
import { AgentTable } from "@/components/agent-table";
import { listAgents } from "@/lib/bridge-client";
import type { Agent } from "@openclaw-manager/types";

export const metadata = { title: "Agents" };

export default async function AgentsPage() {
  let agents: Agent[] = [];
  try {
    agents = await listAgents();
  } catch {
    // bridge unavailable — show empty list
  }

  return (
    <AppShell title="Agents">
      <div className="content">
        <AgentTable initial={agents} />
      </div>
    </AppShell>
  );
}
