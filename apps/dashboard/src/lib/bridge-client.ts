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
  name: string; model?: string; systemPrompt?: string; tools?: string[];
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
  return Array.isArray(result) ? result : [];
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
export async function getGatewayConfig(): Promise<Record<string, unknown>> {
  return bridgeFetch<Record<string, unknown>>("/gateway-config");
}

export async function getGatewayConfigSchema(): Promise<ConfigSchema> {
  return bridgeFetch<ConfigSchema>("/gateway-config/schema");
}

export async function setGatewayConfig(updates: Record<string, unknown>): Promise<unknown> {
  return bridgeFetch("/gateway-config", { method: "PATCH", body: JSON.stringify(updates) });
}

export async function applyGatewayConfig(): Promise<unknown> {
  return bridgeFetch("/gateway-config/apply", { method: "POST" });
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
