import { AppShell } from "@/components/app-shell";
import { ClaudeCodeSessionDetail } from "@/components/claude-code-session-detail";
import {
  getClaudeCodeSessions,
  getClaudeCodeTranscript,
  getClaudeCodePending,
} from "@/lib/bridge-client";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function ClaudeCodeSessionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [sessions, events, pending] = await Promise.all([
    getClaudeCodeSessions().catch(() => []),
    getClaudeCodeTranscript(id).catch(() => []),
    getClaudeCodePending().catch(() => []),
  ]);
  const session = sessions.find((s) => s.id === id);
  if (!session) notFound();
  const sessionPending = pending.filter((p) => p.sessionId === id);
  return (
    <AppShell title={`Claude Code · ${session.displayName}`}>
      <div className="content">
        <ClaudeCodeSessionDetail
          session={session}
          initialEvents={events}
          initialPending={sessionPending}
        />
      </div>
    </AppShell>
  );
}
