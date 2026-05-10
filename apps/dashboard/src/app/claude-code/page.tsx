import { AppShell } from "@/components/app-shell";
import { ClaudeCodeSessionsTable } from "@/components/claude-code-sessions-table";
import { CapabilityGate } from "@/components/runtime/capability-gate";
import {
  getClaudeCodeSessions,
  getClaudeCodeSessionsWithEnvelope,
  getClaudeCodePending,
} from "@/lib/bridge-client";
import { requirePermission } from "@/lib/auth/current-user";
import { resolveActiveRuntimeId } from "@/lib/runtime-active";

export const dynamic = "force-dynamic";

export default async function ClaudeCodePage(props: {
  searchParams: Promise<{ runtimeId?: string }>;
}) {
  await requirePermission("claude_code.view");
  const sp = await props.searchParams;
  const runtimeId = await resolveActiveRuntimeId(sp.runtimeId);
  // Fall back to the pre-envelope list endpoint when the bridge hasn't been
  // redeployed with the new /sessions-with-envelope route yet.
  const [sessions, pending] = await Promise.all([
    getClaudeCodeSessionsWithEnvelope(runtimeId).catch(async () => {
      const legacy = await getClaudeCodeSessions(runtimeId).catch(() => []);
      return legacy.map((s) => ({ ...s, latestEnvelope: null }));
    }),
    getClaudeCodePending().catch(() => []),
  ]);
  const pendingBySession = new Map<string, number>();
  for (const p of pending) pendingBySession.set(p.sessionId, (pendingBySession.get(p.sessionId) ?? 0) + 1);
  return (
    <AppShell title="Claude Code">
      <div className="content">
        <CapabilityGate runtimeId={runtimeId ?? ""} capabilityId="sessions.list">
          <ClaudeCodeSessionsTable
            sessions={sessions}
            pendingBySession={Object.fromEntries(pendingBySession)}
          />
        </CapabilityGate>
      </div>
    </AppShell>
  );
}
