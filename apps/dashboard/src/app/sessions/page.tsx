import { AppShell } from "@/components/app-shell";
import { SessionTable } from "@/components/session-table";
import { listAgentSessions } from "@/lib/bridge-client";
import { requirePermission } from "@/lib/auth/current-user";
import type { AgentSession } from "@openclaw-manager/types";

export const metadata = { title: "Sessions" };

export default async function SessionsPage() {
  await requirePermission("agent_sessions.view");
  let sessions: AgentSession[] = [];
  try {
    sessions = await listAgentSessions();
  } catch {
    // bridge unavailable — show empty list
  }

  return (
    <AppShell title="Sessions">
      <div className="content">
        <SessionTable initial={sessions} />
      </div>
    </AppShell>
  );
}
