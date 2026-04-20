import { AppShell } from "@/components/app-shell";
import { ClaudeCodeSessionsTable } from "@/components/claude-code-sessions-table";
import { getClaudeCodeSessions, getClaudeCodePending } from "@/lib/bridge-client";

export const dynamic = "force-dynamic";

export default async function ClaudeCodePage() {
  const [sessions, pending] = await Promise.all([
    getClaudeCodeSessions().catch(() => []),
    getClaudeCodePending().catch(() => []),
  ]);
  const pendingBySession = new Map<string, number>();
  for (const p of pending) pendingBySession.set(p.sessionId, (pendingBySession.get(p.sessionId) ?? 0) + 1);
  return (
    <AppShell title="Claude Code">
      <ClaudeCodeSessionsTable
        sessions={sessions}
        pendingBySession={Object.fromEntries(pendingBySession)}
      />
    </AppShell>
  );
}
