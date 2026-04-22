import { AppShell } from "@/components/app-shell";
import { ClaudeCodeSessionDetail } from "@/components/claude-code-session-detail";
import {
  getClaudeCodeSessions,
  getClaudeCodeTranscript,
  getClaudeCodePending,
  callGatewayMethod,
  summarizeClaudeCodeSession,
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

type GatewaySessionListEntry = {
  key?: string;
  model?: string;
  agentId?: string;
  agentName?: string;
};

function readPrimaryModel(config: unknown, agentId?: string): string | null {
  const parsed = (config as { parsed?: Record<string, unknown> })?.parsed;
  const agents = parsed?.agents as Record<string, unknown> | undefined;

  // Check per-agent model override first (agents.<agentId>.model.primary)
  if (agentId && agents) {
    const agentConfig = agents[agentId] as Record<string, unknown> | undefined;
    const agentModel = agentConfig?.model as { primary?: unknown } | undefined;
    if (typeof agentModel?.primary === "string") return agentModel.primary;
  }

  // Fall back to global default (agents.defaults.model.primary)
  const defaults = agents?.defaults as Record<string, unknown> | undefined;
  const model = defaults?.model as { primary?: unknown } | undefined;
  const primary = model?.primary;
  return typeof primary === "string" ? primary : null;
}

function extractSessionsListModel(sessionsList: unknown): {
  defaultsModel: string | null;
  sessions: GatewaySessionListEntry[];
} {
  if (!sessionsList || typeof sessionsList !== "object") {
    return { defaultsModel: null, sessions: [] };
  }

  const sl = sessionsList as {
    defaults?: { model?: unknown };
    sessions?: unknown[];
  };

  return {
    defaultsModel: typeof sl.defaults?.model === "string" ? sl.defaults.model : null,
    sessions: Array.isArray(sl.sessions) ? (sl.sessions as GatewaySessionListEntry[]) : [],
  };
}

function matchSessionEntry(
  sessions: GatewaySessionListEntry[],
  openclawSessionId: string
): GatewaySessionListEntry | null {
  return (
    sessions.find(
      (session) =>
        typeof session.key === "string" &&
        (session.key === openclawSessionId || session.key.endsWith(`:${openclawSessionId}`))
    ) ?? null
  );
}

function readSessionAgentId(session: GatewaySessionListEntry | null): string | null {
  if (!session) return null;
  if (typeof session.agentName === "string" && session.agentName) return session.agentName;
  if (typeof session.agentId === "string" && session.agentId) return session.agentId;
  if (typeof session.key === "string") {
    const match = /^agent:([^:]+):/.exec(session.key);
    if (match?.[1]) return match[1];
  }
  return null;
}

function readAgentIdentityModel(agentIdentity: unknown): string | null {
  const model = (agentIdentity as { model?: unknown })?.model;
  return typeof model === "string" ? model : null;
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
  const [sessions, events, pending, config, sessionsList] = await Promise.all([
    getClaudeCodeSessions().catch(() => []),
    getClaudeCodeTranscript(id).catch(() => []),
    getClaudeCodePending().catch(() => []),
    callGatewayMethod("config.get", {}).catch(() => null),
    callGatewayMethod("sessions.list", {}).catch(() => null),
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

  const { defaultsModel, sessions: listedSessions } = extractSessionsListModel(sessionsList);
  const matchedSession = matchSessionEntry(listedSessions, session.openclawSessionId);
  const sessionAgentId = readSessionAgentId(matchedSession);

  let agentIdentity: unknown = null;
  if (sessionAgentId) {
    try {
      agentIdentity = await callGatewayMethod("agents.identity", { name: sessionAgentId });
    } catch {
      agentIdentity = null;
    }
  }

  const configuredModel = readPrimaryModel(config, sessionAgentId ?? undefined);
  const usage = aggregateTokens(gatewayState);
  const sessionModel =
    matchedSession && typeof matchedSession.model === "string" ? matchedSession.model : null;
  const agentIdentityModel = readAgentIdentityModel(agentIdentity);
  const resolvedModel =
    agentIdentityModel ??
    sessionModel ??
    usage.openclawModel ??
    configuredModel ??
    defaultsModel;

  // Fetch LLM-generated summary (don't block page render on failure)
  const llmSummary = await summarizeClaudeCodeSession(id).catch(() => null);

  return (
    <AppShell title={`Claude Code · ${session.displayName}`}>
      <div className="content">
        <ClaudeCodeSessionDetail
          session={session}
          initialEvents={events}
          initialPending={sessionPending}
          llmSummary={llmSummary}
          intel={{
            openclawModel: resolvedModel,
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
