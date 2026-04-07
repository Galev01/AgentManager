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
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-100">Agents</h1>
          <p className="mt-1 text-sm text-zinc-400">
            Manage AI agents. Create new agents, view their configuration, or remove them.
          </p>
        </div>
        <AgentTable initial={agents} />
      </div>
    </AppShell>
  );
}
