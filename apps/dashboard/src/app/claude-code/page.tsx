import { AppShell } from "@/components/app-shell";
import { ClaudeCodeSessionsTable } from "@/components/claude-code-sessions-table";
import { RuntimeSessionsTable } from "@/components/runtime-sessions-table";
import { CapabilityGate } from "@/components/runtime/capability-gate";
import {
  getClaudeCodeSessions,
  getClaudeCodeSessionsWithEnvelope,
  getClaudeCodePending,
  getRuntimeSessions,
} from "@/lib/bridge-client";
import { getRuntimeConfig } from "@/lib/runtime-config-client";
import { requirePermission } from "@/lib/auth/current-user";
import { resolveActiveRuntimeId } from "@/lib/runtime-active";

export const dynamic = "force-dynamic";

export default async function ClaudeCodePage(props: {
  searchParams: Promise<{ runtimeId?: string }>;
}) {
  await requirePermission("claude_code.view");
  const sp = await props.searchParams;
  const runtimeId = await resolveActiveRuntimeId(sp.runtimeId);
  const [sessions, pending, runtimeSessions, runtimeCfg] = await Promise.all([
    getClaudeCodeSessionsWithEnvelope(runtimeId).catch(async () => {
      const legacy = await getClaudeCodeSessions(runtimeId).catch(() => []);
      return legacy.map((s) => ({ ...s, latestEnvelope: null }));
    }),
    getClaudeCodePending().catch(() => []),
    getRuntimeSessions(runtimeId).catch(() => []),
    getRuntimeConfig().catch(() => null),
  ]);
  const pendingBySession = new Map<string, number>();
  for (const p of pending) pendingBySession.set(p.sessionId, (pendingBySession.get(p.sessionId) ?? 0) + 1);
  const activeRuntime = runtimeCfg?.runtimes.find((r) => r.id === runtimeId) ?? null;
  const runtimeKind = activeRuntime?.kind ?? "openclaw";
  return (
    <AppShell title="Claude Code">
      <div className="content">
        <CapabilityGate runtimeId={runtimeId ?? ""} capabilityId="sessions.list">
          {runtimeKind === "openclaw" ? (
            <ClaudeCodeSessionsTable
              sessions={sessions}
              pendingBySession={Object.fromEntries(pendingBySession)}
            />
          ) : (
            <RuntimeSessionsTable
              sessions={runtimeSessions}
              runtimeKindLabel={activeRuntime?.displayName ?? runtimeKind}
            />
          )}
        </CapabilityGate>
      </div>
    </AppShell>
  );
}
