import { AppShell } from "@/components/app-shell";
import { SessionTable } from "@/components/session-table";
import { listAgentSessions } from "@/lib/bridge-client";
import type { AgentSession } from "@openclaw-manager/types";

export const metadata = { title: "Sessions" };

export default async function SessionsPage() {
  let sessions: AgentSession[] = [];
  try {
    sessions = await listAgentSessions();
  } catch {
    // bridge unavailable — show empty list
  }

  return (
    <AppShell title="Sessions">
      <div className="mx-auto max-w-5xl space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-100">Sessions</h1>
          <p className="mt-1 text-sm text-zinc-400">
            Manage agent sessions. Create new sessions, view their details, or delete them.
          </p>
        </div>
        <SessionTable initial={sessions} />
      </div>
    </AppShell>
  );
}
