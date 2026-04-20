import { AppShell } from "@/components/app-shell";
import { ClaudeCodeSessionDetail } from "@/components/claude-code-session-detail";
import {
  getClaudeCodeSessions,
  getClaudeCodeTranscript,
  getClaudeCodePending,
  callGatewayMethod,
} from "@/lib/bridge-client";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

type UsageBlock = {
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
};

type GatewaySessionState = {
  messages?: Array<{
    role?: string;
    model?: string;
    usage?: UsageBlock;
    content?: Array<{ type?: string; text?: string }>;
  }>;
  model?: string;
  usage?: UsageBlock;
};

function readPrimaryModel(config: unknown): string | null {
  const parsed = (config as { parsed?: Record<string, unknown> })?.parsed;
  const agents = parsed?.agents as Record<string, unknown> | undefined;
  const defaults = agents?.defaults as Record<string, unknown> | undefined;
  const model = defaults?.model as { primary?: unknown } | undefined;
  const primary = model?.primary;
  return typeof primary === "string" ? primary : null;
}

function aggregateTokens(state: GatewaySessionState | null): {
  openclawInput: number;
  openclawOutput: number;
  openclawCacheRead: number;
  openclawCacheCreate: number;
  openclawModel: string | null;
} {
  let input = 0;
  let output = 0;
  let cacheRead = 0;
  let cacheCreate = 0;
  let model: string | null = null;

  const msgs = state?.messages ?? [];
  for (const m of msgs) {
    if (m.role === "assistant") {
      if (!model && typeof m.model === "string") model = m.model;
      input += m.usage?.input_tokens ?? 0;
      output += m.usage?.output_tokens ?? 0;
      cacheRead += m.usage?.cache_read_input_tokens ?? 0;
      cacheCreate += m.usage?.cache_creation_input_tokens ?? 0;
    }
  }

  if (!model && typeof state?.model === "string") model = state.model;

  return {
    openclawInput: input,
    openclawOutput: output,
    openclawCacheRead: cacheRead,
    openclawCacheCreate: cacheCreate,
    openclawModel: model,
  };
}

export default async function ClaudeCodeSessionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [sessions, events, pending, config] = await Promise.all([
    getClaudeCodeSessions().catch(() => []),
    getClaudeCodeTranscript(id).catch(() => []),
    getClaudeCodePending().catch(() => []),
    callGatewayMethod("config.get", {}).catch(() => null),
  ]);
  const session = sessions.find((s) => s.id === id);
  if (!session) notFound();
  const sessionPending = pending.filter((p) => p.sessionId === id);

  let gatewayState: GatewaySessionState | null = null;
  try {
    gatewayState = (await callGatewayMethod("sessions.get", {
      key: session.openclawSessionId,
    })) as GatewaySessionState;
  } catch {
    gatewayState = null;
  }

  const configuredModel = readPrimaryModel(config);
  const usage = aggregateTokens(gatewayState);

  return (
    <AppShell title={`Claude Code · ${session.displayName}`}>
      <div className="content">
        <ClaudeCodeSessionDetail
          session={session}
          initialEvents={events}
          initialPending={sessionPending}
          intel={{
            openclawModel: usage.openclawModel ?? configuredModel,
            openclawTokens: {
              input: usage.openclawInput,
              output: usage.openclawOutput,
              cacheRead: usage.openclawCacheRead,
              cacheCreate: usage.openclawCacheCreate,
            },
          }}
        />
      </div>
    </AppShell>
  );
}
