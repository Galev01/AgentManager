import type {
  OverviewData,
  ConversationRow,
  ConversationEvent,
  RuntimeSettings,
  ManagementCommand,
  RelayRecipient,
  RoutingRule,
  RuntimeSettingsV2,
  Agent,
  AgentSession,
  SessionMessage,
  CronJob,
  Channel,
  Tool,
  EffectiveTool,
  Skill,
  ConfigSchema,
  GatewayConfigSnapshot,
  BrainPerson,
  BrainPersonSummary,
  BrainPersonUpdate,
  ReviewProject,
  ReviewIdea,
  ReviewIdeaStatus,
  ReviewIdeaImpact,
  ReviewIdeaEffort,
  ReviewIdeaCategory,
  ReviewRun,
  ReviewReportSummary,
  ReviewerWorkerState,
  ReviewTriageState,
  ReviewReportMeta,
  ReviewInboxItem,
  YoutubeJob,
  YoutubeSummaryListItem,
  YoutubeSummaryMeta,
  YoutubeSubmitResponse,
  YoutubeChatMessageRow,
  YoutubeChatMetaFile,
  YoutubeChunksFile,
  YoutubeChaptersFile,
  YoutubeHighlightsFile,
  YoutubeRebuildPart,
  YoutubeRebuildStatus,
  ClaudeCodeSession,
  ClaudeCodeTranscriptEvent,
  ClaudeCodePendingItem,
  ClaudeCodeConnectConfig,
  ClaudeCodeSessionMode,
  GlobalBrain,
  GlobalBrainUpdate,
  BrainInjectionPreview,
  CCEnvelope,
} from "@openclaw-manager/types";

const BRIDGE_URL = process.env.OPENCLAW_BRIDGE_URL || "http://localhost:3100";
const BRIDGE_TOKEN = process.env.OPENCLAW_BRIDGE_TOKEN || "";

async function bridgeFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const url = `${BRIDGE_URL}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${BRIDGE_TOKEN}`, ...options?.headers },
    next: { revalidate: 0 },
  });
  if (!res.ok) throw new Error(`Bridge ${res.status}: ${await res.text()}`);
  return res.json();
}

export async function getOverview(): Promise<OverviewData> { return bridgeFetch<OverviewData>("/overview"); }
export async function getConversations(): Promise<ConversationRow[]> { return bridgeFetch<ConversationRow[]>("/conversations"); }
export async function getConversation(key: string): Promise<ConversationRow | null> {
  try { return await bridgeFetch<ConversationRow>(`/conversations/${encodeURIComponent(key)}`); } catch { return null; }
}
export async function getMessages(conversationKey: string, limit = 50, before?: number): Promise<ConversationEvent[]> {
  const params = new URLSearchParams({ conversationKey, limit: String(limit) });
  if (before) params.set("before", String(before));
  return bridgeFetch<ConversationEvent[]>(`/messages?${params}`);
}
export async function getSettings(): Promise<RuntimeSettingsV2> { return bridgeFetch<RuntimeSettingsV2>("/settings"); }
export async function updateSettings(updates: Partial<RuntimeSettings>): Promise<RuntimeSettings> {
  return bridgeFetch<RuntimeSettings>("/settings", { method: "PATCH", body: JSON.stringify(updates) });
}
export async function sendTakeover(key: string): Promise<ManagementCommand> {
  return bridgeFetch<ManagementCommand>(`/conversations/${encodeURIComponent(key)}/takeover`, { method: "POST" });
}
export async function sendRelease(key: string): Promise<ManagementCommand> {
  return bridgeFetch<ManagementCommand>(`/conversations/${encodeURIComponent(key)}/release`, { method: "POST" });
}
export async function sendWakeNow(key: string): Promise<ManagementCommand> {
  return bridgeFetch<ManagementCommand>(`/conversations/${encodeURIComponent(key)}/wake-now`, { method: "POST" });
}

export async function getLogs(lines = 100): Promise<any[]> {
  return bridgeFetch<any[]>("/logs/tail", {
    method: "POST",
    body: JSON.stringify({ lines }),
  });
}

export async function getSessions(): Promise<any[]> {
  return bridgeFetch<any[]>("/sessions");
}

export async function getSessionTranscript(sessionId: string): Promise<any[]> {
  return bridgeFetch<any[]>(`/sessions/${encodeURIComponent(sessionId)}/transcript`);
}

export async function callGatewayMethod(method: string, params?: Record<string, unknown>): Promise<unknown> {
  const [ns, action] = method.split(".");
  if (!action) {
    return bridgeFetch<unknown>(`/gateway/${encodeURIComponent(ns)}`, {
      method: "POST",
      body: JSON.stringify(params || {}),
    });
  }
  return bridgeFetch<unknown>(`/gateway/${encodeURIComponent(ns)}/${encodeURIComponent(action)}`, {
    method: "POST",
    body: JSON.stringify(params || {}),
  });
}

// --- Compose ---
export async function sendMessage(payload: {
  conversationKey?: string;
  phone: string;
  text: string;
}): Promise<{ ok: boolean; result: unknown }> {
  return bridgeFetch("/compose", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

// --- Relay Recipients ---
export async function getRelayRecipients(): Promise<RelayRecipient[]> {
  return bridgeFetch<RelayRecipient[]>("/relay-recipients");
}

export async function addRelayRecipient(input: {
  phone: string;
  label: string;
  enabled?: boolean;
}): Promise<RelayRecipient> {
  return bridgeFetch<RelayRecipient>("/relay-recipients", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function removeRelayRecipient(id: string): Promise<{ ok: boolean }> {
  return bridgeFetch(`/relay-recipients/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export async function toggleRelayRecipient(
  id: string,
  enabled: boolean
): Promise<RelayRecipient> {
  return bridgeFetch<RelayRecipient>(
    `/relay-recipients/${encodeURIComponent(id)}`,
    { method: "PATCH", body: JSON.stringify({ enabled }) }
  );
}

// --- Routing Rules ---
export async function getRoutingRules(): Promise<RoutingRule[]> {
  return bridgeFetch<RoutingRule[]>("/routing-rules");
}

export async function createRoutingRule(
  input: Omit<RoutingRule, "id">
): Promise<RoutingRule> {
  return bridgeFetch<RoutingRule>("/routing-rules", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateRoutingRule(
  id: string,
  input: Omit<RoutingRule, "id">
): Promise<RoutingRule> {
  return bridgeFetch<RoutingRule>(
    `/routing-rules/${encodeURIComponent(id)}`,
    { method: "PUT", body: JSON.stringify(input) }
  );
}

export async function deleteRoutingRule(id: string): Promise<{ ok: boolean }> {
  return bridgeFetch(`/routing-rules/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

// --- Settings V2 ---
export async function getSettingsV2(): Promise<RuntimeSettingsV2> {
  return bridgeFetch<RuntimeSettingsV2>("/settings");
}

// --- Agents ---
export async function listAgents(): Promise<Agent[]> {
  const result = await bridgeFetch<unknown>("/agents");
  return Array.isArray(result) ? result : [];
}

export async function getAgent(name: string): Promise<Agent | null> {
  try {
    return await bridgeFetch<Agent>(`/agents/${encodeURIComponent(name)}`);
  } catch { return null; }
}

export async function createAgent(input: {
  name: string; workspace: string; emoji?: string; avatar?: string; model?: string;
}): Promise<Agent> {
  return bridgeFetch<Agent>("/agents", { method: "POST", body: JSON.stringify(input) });
}

export async function updateAgent(name: string, updates: Partial<Agent>): Promise<Agent> {
  return bridgeFetch<Agent>(`/agents/${encodeURIComponent(name)}`, {
    method: "PATCH", body: JSON.stringify(updates),
  });
}

export async function deleteAgent(name: string): Promise<{ ok: boolean }> {
  return bridgeFetch(`/agents/${encodeURIComponent(name)}`, { method: "DELETE" });
}

// --- Agent Sessions ---
export async function listAgentSessions(filters?: {
  agent?: string; status?: string;
}): Promise<AgentSession[]> {
  const params = new URLSearchParams();
  if (filters?.agent) params.set("agent", filters.agent);
  if (filters?.status) params.set("status", filters.status);
  const qs = params.toString();
  const result = await bridgeFetch<unknown>(`/agent-sessions${qs ? `?${qs}` : ""}`);
  return Array.isArray(result) ? result : [];
}

export async function createAgentSession(agentName?: string): Promise<AgentSession> {
  return bridgeFetch<AgentSession>("/agent-sessions", {
    method: "POST", body: JSON.stringify({ agentName }),
  });
}

export async function sendSessionMessage(id: string, message: string): Promise<unknown> {
  return bridgeFetch(`/agent-sessions/${encodeURIComponent(id)}/send`, {
    method: "POST", body: JSON.stringify({ message }),
  });
}

export async function getSessionUsage(id: string): Promise<unknown> {
  return bridgeFetch(`/agent-sessions/${encodeURIComponent(id)}/usage`);
}

export async function resetSession(id: string): Promise<unknown> {
  return bridgeFetch(`/agent-sessions/${encodeURIComponent(id)}/reset`, { method: "POST" });
}

export async function abortSession(id: string): Promise<unknown> {
  return bridgeFetch(`/agent-sessions/${encodeURIComponent(id)}/abort`, { method: "POST" });
}

export async function compactSession(id: string): Promise<unknown> {
  return bridgeFetch(`/agent-sessions/${encodeURIComponent(id)}/compact`, { method: "POST" });
}

export async function deleteSession(id: string): Promise<{ ok: boolean }> {
  return bridgeFetch(`/agent-sessions/${encodeURIComponent(id)}`, { method: "DELETE" });
}

// --- Cron Jobs ---
export async function listCronJobs(): Promise<CronJob[]> {
  const result = await bridgeFetch<unknown>("/cron");
  return Array.isArray(result) ? result : [];
}

export async function addCronJob(input: {
  schedule: string; command?: string; agentName?: string; name?: string;
}): Promise<CronJob> {
  return bridgeFetch<CronJob>("/cron", { method: "POST", body: JSON.stringify(input) });
}

export async function getCronJobStatus(id: string): Promise<unknown> {
  return bridgeFetch(`/cron/${encodeURIComponent(id)}/status`);
}

export async function runCronJob(id: string): Promise<unknown> {
  return bridgeFetch(`/cron/${encodeURIComponent(id)}/run`, { method: "POST" });
}

export async function removeCronJob(id: string): Promise<{ ok: boolean }> {
  return bridgeFetch(`/cron/${encodeURIComponent(id)}`, { method: "DELETE" });
}

// --- Channels ---
export async function getChannels(): Promise<Channel[]> {
  const result = await bridgeFetch<unknown>("/channels");
  if (!Array.isArray(result)) {
    throw new Error(`Unexpected /channels response shape: ${typeof result}`);
  }
  return result as Channel[];
}

export async function logoutChannel(name: string): Promise<unknown> {
  return bridgeFetch(`/channels/${encodeURIComponent(name)}/logout`, { method: "POST" });
}

// --- Tools & Skills ---
export async function getToolsCatalog(): Promise<Tool[]> {
  const result = await bridgeFetch<unknown>("/tools/catalog");
  return Array.isArray(result) ? result : [];
}

export async function getEffectiveTools(): Promise<EffectiveTool[]> {
  const result = await bridgeFetch<unknown>("/tools/effective");
  return Array.isArray(result) ? result : [];
}

export async function getSkills(): Promise<Skill[]> {
  const result = await bridgeFetch<unknown>("/skills");
  return Array.isArray(result) ? result : [];
}

export async function installSkill(name: string): Promise<unknown> {
  return bridgeFetch("/skills/install", { method: "POST", body: JSON.stringify({ name }) });
}

// --- Gateway Config ---
export async function getGatewayConfig(): Promise<GatewayConfigSnapshot> {
  return bridgeFetch<GatewayConfigSnapshot>("/gateway-config");
}

export async function getGatewayConfigSchema(): Promise<ConfigSchema> {
  return bridgeFetch<ConfigSchema>("/gateway-config/schema");
}

export async function setGatewayConfig(
  config: Record<string, unknown>,
  baseHash: string,
): Promise<unknown> {
  return bridgeFetch("/gateway-config", {
    method: "PATCH",
    body: JSON.stringify({ config, baseHash }),
  });
}

export async function applyGatewayConfig(
  config: Record<string, unknown>,
  baseHash: string,
): Promise<unknown> {
  return bridgeFetch("/gateway-config/apply", {
    method: "POST",
    body: JSON.stringify({ config, baseHash }),
  });
}

// --- Brain ---
export async function getBrainStatus(): Promise<{ enabled: boolean }> {
  return bridgeFetch<{ enabled: boolean }>("/brain/status");
}

export async function listBrainPeople(): Promise<BrainPersonSummary[]> {
  const result = await bridgeFetch<unknown>("/brain/people");
  return Array.isArray(result) ? (result as BrainPersonSummary[]) : [];
}

export async function getBrainPerson(phone: string): Promise<BrainPerson | null> {
  try {
    return await bridgeFetch<BrainPerson>(`/brain/people/${encodeURIComponent(phone)}`);
  } catch {
    return null;
  }
}

export async function updateBrainPerson(phone: string, update: BrainPersonUpdate): Promise<BrainPerson> {
  return bridgeFetch<BrainPerson>(`/brain/people/${encodeURIComponent(phone)}`, {
    method: "PATCH",
    body: JSON.stringify(update),
  });
}

export async function appendBrainPersonLog(phone: string, entry: string): Promise<BrainPerson> {
  return bridgeFetch<BrainPerson>(`/brain/people/${encodeURIComponent(phone)}/log`, {
    method: "POST",
    body: JSON.stringify({ entry }),
  });
}

export async function createBrainPerson(input: { phone: string; name?: string }): Promise<BrainPerson> {
  return bridgeFetch<BrainPerson>("/brain/people", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

// --- Codebase Reviewer ---

export type ReviewsProjectsResponse = {
  projects: ReviewProject[];
  worker: ReviewerWorkerState;
  scanRoots: string[];
};

export async function getReviewProjects(): Promise<ReviewsProjectsResponse> {
  return bridgeFetch<ReviewsProjectsResponse>("/reviews/projects");
}

export async function scanReviewProjects(): Promise<{
  added: string[];
  missing: string[];
  total: number;
}> {
  return bridgeFetch("/reviews/projects/scan", { method: "POST" });
}

export async function addReviewProject(
  absolutePath: string
): Promise<{ project: ReviewProject; created: boolean }> {
  return bridgeFetch("/reviews/projects/add", {
    method: "POST",
    body: JSON.stringify({ path: absolutePath }),
  });
}

export async function setReviewProjectEnabled(
  id: string,
  enabled: boolean
): Promise<{ project: ReviewProject }> {
  return bridgeFetch(`/reviews/projects/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({ enabled }),
  });
}

export async function runReviewNow(
  id: string
): Promise<{ enqueued: boolean; reason?: string }> {
  return bridgeFetch(`/reviews/projects/${encodeURIComponent(id)}/run`, {
    method: "POST",
  });
}

export async function ackReviewProject(
  id: string
): Promise<{ project: ReviewProject }> {
  return bridgeFetch(`/reviews/projects/${encodeURIComponent(id)}/ack`, {
    method: "POST",
  });
}

export async function getReviewReports(
  id: string
): Promise<{ reports: ReviewReportSummary[] }> {
  return bridgeFetch(`/reviews/projects/${encodeURIComponent(id)}/reports`);
}

export async function getReviewReport(
  id: string,
  date: string
): Promise<{ markdown: string; ideas: ReviewIdea[] }> {
  return bridgeFetch(
    `/reviews/projects/${encodeURIComponent(id)}/reports/${encodeURIComponent(date)}`
  );
}

export type ReviewIdeasFilters = {
  project?: string[];
  status?: ReviewIdeaStatus[];
  impact?: ReviewIdeaImpact[];
  effort?: ReviewIdeaEffort[];
  category?: ReviewIdeaCategory[];
};

export async function getReviewIdeas(
  filters?: ReviewIdeasFilters
): Promise<{ ideas: ReviewIdea[] }> {
  const params = new URLSearchParams();
  const add = (key: string, vals: string[] | undefined) => {
    if (!vals) return;
    for (const v of vals) params.append(key, v);
  };
  add("project", filters?.project);
  add("status", filters?.status);
  add("impact", filters?.impact);
  add("effort", filters?.effort);
  add("category", filters?.category);
  const qs = params.toString();
  return bridgeFetch(`/reviews/ideas${qs ? `?${qs}` : ""}`);
}

export async function setReviewIdeaStatus(
  id: string,
  status: ReviewIdeaStatus
): Promise<{ idea: ReviewIdea }> {
  return bridgeFetch(`/reviews/ideas/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}

export async function getReviewRuns(limit = 50): Promise<{ runs: ReviewRun[] }> {
  return bridgeFetch(`/reviews/runs?limit=${limit}`);
}

export async function setReportTriage(
  projectId: string,
  reportDate: string,
  triageState: ReviewTriageState,
  triageNote?: string | null
): Promise<{ meta: ReviewReportMeta }> {
  return bridgeFetch(
    `/reviews/projects/${encodeURIComponent(projectId)}/reports/${encodeURIComponent(reportDate)}/triage`,
    {
      method: "PATCH",
      body: JSON.stringify({ triageState, triageNote: triageNote ?? null }),
    }
  );
}

export async function getReviewInbox(
  triage?: ReviewTriageState[]
): Promise<{ items: ReviewInboxItem[] }> {
  const params = new URLSearchParams();
  if (triage) for (const t of triage) params.append("triage", t);
  const qs = params.toString();
  return bridgeFetch(`/reviews/inbox${qs ? `?${qs}` : ""}`);
}

// --- YouTube Summarizer ---

export async function submitYoutubeJobs(urls: string[]): Promise<YoutubeSubmitResponse> {
  return bridgeFetch<YoutubeSubmitResponse>("/youtube/jobs", {
    method: "POST",
    body: JSON.stringify({ urls }),
  });
}

export async function listYoutubeJobs(): Promise<{ jobs: YoutubeJob[] }> {
  return bridgeFetch<{ jobs: YoutubeJob[] }>("/youtube/jobs");
}

export async function listYoutubeSummaries(): Promise<{ summaries: YoutubeSummaryListItem[] }> {
  return bridgeFetch<{ summaries: YoutubeSummaryListItem[] }>("/youtube/summaries");
}

export async function getYoutubeSummary(
  videoId: string
): Promise<{ meta: YoutubeSummaryMeta; markdown: string }> {
  return bridgeFetch<{ meta: YoutubeSummaryMeta; markdown: string }>(
    `/youtube/summaries/${encodeURIComponent(videoId)}`
  );
}

export async function rerunYoutubeSummary(videoId: string): Promise<{ job: YoutubeJob }> {
  return bridgeFetch<{ job: YoutubeJob }>(
    `/youtube/summaries/${encodeURIComponent(videoId)}/rerun`,
    { method: "POST" }
  );
}

export async function deleteYoutubeSummary(videoId: string): Promise<void> {
  const res = await fetch(`${BRIDGE_URL}/youtube/summaries/${encodeURIComponent(videoId)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${BRIDGE_TOKEN}` },
  });
  if (!res.ok) throw new Error(`Bridge ${res.status}: ${await res.text()}`);
}

// --- YouTube v2: chat / rebuild / chunks / chapters / highlights ---

export type YoutubeChatPostResponse = {
  ok: boolean;
  videoId: string;
  chatSessionId: string;
  queued: boolean;
};

export async function postYoutubeChat(
  videoId: string,
  message: string,
  chatSessionId?: string
): Promise<YoutubeChatPostResponse> {
  return bridgeFetch<YoutubeChatPostResponse>(
    `/youtube/chat/${encodeURIComponent(videoId)}`,
    {
      method: "POST",
      body: JSON.stringify({ message, ...(chatSessionId ? { chatSessionId } : {}) }),
    }
  );
}

export type YoutubeChatGetResponse = {
  ok: boolean;
  videoId: string;
  chatSessionId: string;
  meta: YoutubeChatMetaFile | null;
  messages: YoutubeChatMessageRow[];
};

export async function getYoutubeChat(
  videoId: string,
  sessionId?: string,
  after?: string
): Promise<YoutubeChatGetResponse> {
  const params = new URLSearchParams();
  if (sessionId) params.set("sessionId", sessionId);
  if (after) params.set("after", after);
  const qs = params.toString();
  return bridgeFetch<YoutubeChatGetResponse>(
    `/youtube/chat/${encodeURIComponent(videoId)}${qs ? `?${qs}` : ""}`
  );
}

export type YoutubeRebuildResult = {
  part: YoutubeRebuildPart;
  ok: boolean;
  skipped?: boolean;
  error?: string;
};

export type YoutubeRebuildResponse = {
  ok: boolean;
  videoId: string;
  results: YoutubeRebuildResult[];
};

export async function postYoutubeRebuild(
  videoId: string,
  parts: YoutubeRebuildPart[],
  url?: string
): Promise<YoutubeRebuildResponse> {
  return bridgeFetch<YoutubeRebuildResponse>(
    `/youtube/rebuild/${encodeURIComponent(videoId)}`,
    {
      method: "POST",
      body: JSON.stringify({ parts, ...(url ? { url } : {}) }),
    }
  );
}

export type YoutubeRebuildStatusResponse = {
  ok: boolean;
  status: YoutubeRebuildStatus | null;
};

export type YoutubeRebuildActiveResponse = {
  ok: boolean;
  statuses: YoutubeRebuildStatus[];
};

export async function getYoutubeRebuildStatus(
  videoId: string,
): Promise<YoutubeRebuildStatusResponse> {
  return bridgeFetch<YoutubeRebuildStatusResponse>(
    `/youtube/rebuild/${encodeURIComponent(videoId)}/status`,
  );
}

export async function listActiveYoutubeRebuilds(): Promise<YoutubeRebuildActiveResponse> {
  return bridgeFetch<YoutubeRebuildActiveResponse>("/youtube/rebuild/active");
}

export type YoutubeChunksResponse = {
  ok: boolean;
  videoId: string;
  chunks: YoutubeChunksFile | null;
};

export async function getYoutubeChunks(videoId: string): Promise<YoutubeChunksResponse> {
  return bridgeFetch<YoutubeChunksResponse>(
    `/youtube/chunks/${encodeURIComponent(videoId)}`
  );
}

export type YoutubeChaptersResponse = {
  ok: boolean;
  videoId: string;
  chapters: YoutubeChaptersFile | null;
};

export async function getYoutubeChapters(videoId: string): Promise<YoutubeChaptersResponse> {
  return bridgeFetch<YoutubeChaptersResponse>(
    `/youtube/chapters/${encodeURIComponent(videoId)}`
  );
}

export type YoutubeHighlightsResponse = {
  ok: boolean;
  videoId: string;
  highlights: YoutubeHighlightsFile | null;
};

export async function getYoutubeHighlights(videoId: string): Promise<YoutubeHighlightsResponse> {
  return bridgeFetch<YoutubeHighlightsResponse>(
    `/youtube/highlights/${encodeURIComponent(videoId)}`
  );
}

// Note: getYoutubeVideoMeta — SKIPPED. No standalone metadata endpoint on the
// bridge as of commit fbc26d9 (youtube-rebuild router). Use `getYoutubeSummary`
// to retrieve `meta` alongside the markdown until a dedicated endpoint exists.

// --- Claude Code ---

export async function getClaudeCodeSessions(): Promise<ClaudeCodeSession[]> {
  return bridgeFetch<ClaudeCodeSession[]>("/claude-code/sessions");
}

export async function getClaudeCodeSessionsWithEnvelope(): Promise<
  Array<ClaudeCodeSession & { latestEnvelope: CCEnvelope | null }>
> {
  return bridgeFetch("/claude-code/sessions-with-envelope");
}

export async function getClaudeCodeEscalationCount(): Promise<number> {
  const { count } = await bridgeFetch<{ count: number }>("/claude-code/escalations");
  return count;
}

export async function getClaudeCodeTranscript(id: string): Promise<ClaudeCodeTranscriptEvent[]> {
  return bridgeFetch<ClaudeCodeTranscriptEvent[]>(`/claude-code/transcripts/${id}`);
}

export async function getClaudeCodePending(): Promise<ClaudeCodePendingItem[]> {
  return bridgeFetch<ClaudeCodePendingItem[]>("/claude-code/pending");
}

export async function patchClaudeCodeSession(
  id: string,
  updates: { mode?: ClaudeCodeSessionMode; state?: "active" | "ended"; displayName?: string }
): Promise<ClaudeCodeSession> {
  return bridgeFetch<ClaudeCodeSession>(`/claude-code/sessions/${id}`, {
    method: "PATCH",
    body: JSON.stringify(updates),
  });
}

export async function resolveClaudeCodePending(
  id: string,
  action: "send-as-is" | "edit" | "replace" | "discard",
  text?: string
): Promise<{ ok: true }> {
  return bridgeFetch<{ ok: true }>(`/claude-code/pending/${id}`, {
    method: "POST",
    body: JSON.stringify({ action, text }),
  });
}

export async function getClaudeCodeConnectConfig(): Promise<ClaudeCodeConnectConfig> {
  return bridgeFetch<ClaudeCodeConnectConfig>("/claude-code/connect-config");
}

export async function summarizeClaudeCodeSession(id: string): Promise<string | null> {
  const { summary } = await bridgeFetch<{ summary: string | null }>(
    `/claude-code/sessions/${id}/summarize`,
    { method: "POST" }
  );
  return summary;
}

// --- Global Brain ---

export async function getGlobalBrain(): Promise<GlobalBrain> {
  return bridgeFetch<GlobalBrain>("/brain/agent");
}

export async function updateGlobalBrain(update: GlobalBrainUpdate): Promise<GlobalBrain> {
  return bridgeFetch<GlobalBrain>("/brain/agent", { method: "PATCH", body: JSON.stringify(update) });
}

export async function getAgentPreview(): Promise<BrainInjectionPreview> {
  return bridgeFetch<BrainInjectionPreview>("/brain/agent/preview");
}

export async function getPersonPreview(phone: string): Promise<BrainInjectionPreview> {
  return bridgeFetch<BrainInjectionPreview>(`/brain/people/${encodeURIComponent(phone)}/preview`);
}

export async function promoteLog(
  phone: string,
  index: number,
  target: "facts" | "preferences" | "openThreads",
): Promise<{ unchanged: boolean; person: BrainPerson }> {
  return bridgeFetch(`/brain/people/${encodeURIComponent(phone)}/log/${index}/promote`, {
    method: "POST",
    body: JSON.stringify({ target }),
  });
}
