import { AppShell } from "@/components/app-shell";
import { ClaudeCodeSessionsTable } from "@/components/claude-code-sessions-table";
import {
  getClaudeCodeSessions,
  getClaudeCodeSessionsWithEnvelope,
  getClaudeCodePending,
} from "@/lib/bridge-client";

export const dynamic = "force-dynamic";

export default async function ClaudeCodePage() {
  // Fall back to the pre-envelope list endpoint when the bridge hasn't been
  // redeployed with the new /sessions-with-envelope route yet.
  const [sessions, pending] = await Promise.all([
    getClaudeCodeSessionsWithEnvelope().catch(async () => {
      const legacy = await getClaudeCodeSessions().catch(() => []);
      return legacy.map((s) => ({ ...s, latestEnvelope: null }));
    }),
    getClaudeCodePending().catch(() => []),
  ]);
  const pendingBySession = new Map<string, number>();
  for (const p of pending) pendingBySession.set(p.sessionId, (pendingBySession.get(p.sessionId) ?? 0) + 1);
  return (
    <AppShell title="Claude Code">
      <div className="content">
        <ClaudeCodeSessionsTable
          sessions={sessions}
          pendingBySession={Object.fromEntries(pendingBySession)}
        />
      </div>
    </AppShell>
  );
}
