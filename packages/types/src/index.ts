export type ConversationStatus = "cold" | "waking" | "active" | "human";

export type RuntimeSettings = {
  relayTarget: string;
  delayMs: number;
  summaryDelayMs: number;
  updatedAt: number;
  updatedBy: string;
};

export type ConversationRow = {
  conversationKey: string;
  phone: string;
  displayName: string | null;
  status: ConversationStatus;
  lastRemoteAt: number | null;
  lastRemoteContent: string | null;
  lastAgentReplyAt: number | null;
  lastHumanReplyAt: number | null;
  awaitingRelay: boolean;
};

export type EventType =
  | "message_in"
  | "message_out"
  | "summary_sent"
  | "takeover_enabled"
  | "takeover_released"
  | "wake_requested"
  | "settings_updated"
  | "command_failed";

export type EventActor = "user" | "bot" | "human_admin" | "system";

export type ConversationEvent = {
  id: string;
  type: EventType;
  conversationKey: string | null;
  phone: string | null;
  displayName: string | null;
  text: string | null;
  actor: EventActor;
  at: number;
  meta?: Record<string, unknown>;
};

export type CommandType =
  | "set_takeover"
  | "release_takeover"
  | "wake_now"
  | "update_runtime_settings"
  | "send_message";

export type ManagementCommand = {
  id: string;
  type: CommandType;
  conversationKey?: string;
  payload?: Record<string, unknown>;
  at: number;
  issuedBy: string;
};

export type OverviewData = {
  totalConversations: number;
  activeCount: number;
  humanCount: number;
  coldCount: number;
  wakingCount: number;
  lastActivityAt: number | null;
  relayTarget: string;
};

// --- V2 Types ---

export type RelayRecipient = {
  id: string;
  phone: string;
  label: string;
  enabled: boolean;
};

export type RoutingRule = {
  id: string;
  conversationKey: string;
  phone: string;
  displayName: string | null;
  relayRecipientIds: string[];
  suppressBot: boolean;
  note: string;
};

export type RuntimeSettingsV2 = RuntimeSettings & {
  relayRecipients: RelayRecipient[];
  routingRules: RoutingRule[];
};

export type WsMessageType =
  | "conversations_updated"
  | "event_new"
  | "settings_updated"
  | "connected"
  | "brain_person_changed"
  | "brain_person_removed"
  | "claude_code_session_upserted"
  | "claude_code_session_ended"
  | "claude_code_transcript_appended"
  | "claude_code_pending_upserted"
  | "claude_code_pending_resolved";

export type WsMessage = {
  type: WsMessageType;
  payload: unknown;
};

export type SendMessagePayload = {
  conversationKey: string;
  phone: string;
  text: string;
};

// --- V3 Types: Agent Management ---

export type Agent = {
  name: string;
  model?: string;
  systemPrompt?: string;
  tools?: string[];
  createdAt?: number;
  updatedAt?: number;
};

export type AgentSession = {
  id: string;
  agentName?: string;
  status: "active" | "completed" | "aborted";
  messageCount?: number;
  tokenUsage?: { prompt: number; completion: number; total: number };
  createdAt?: number;
  lastActivityAt?: number;
};

export type SessionMessage = {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp?: number;
};

// --- Phase 2 Types: Cron & Channels ---

export type CronJob = {
  id: string;
  name?: string;
  schedule: string;
  command?: string;
  agentName?: string;
  status?: "active" | "paused";
  lastRunAt?: number;
  nextRunAt?: number;
  lastResult?: string;
};

export type Channel = {
  name: string;
  type: string;
  status: "connected" | "disconnected" | "error";
  lastActivityAt?: number;
  accountInfo?: Record<string, unknown>;
};

// --- Phase 3 Types: Tools, Skills, Config ---

export type Tool = {
  name: string;
  description?: string;
  category?: string;
  parameters?: Array<{ name: string; type: string; required?: boolean; description?: string }>;
};

export type EffectiveTool = {
  name: string;
  enabled?: boolean;
  assignedTo?: string;
};

export type Skill = {
  name: string;
  status: "installed" | "available" | "error";
  version?: string;
  description?: string;
};

export type ConfigSchemaProperty = {
  type: string;
  description?: string;
  default?: unknown;
  enum?: unknown[];
};

export type ConfigSchema = {
  properties: Record<string, ConfigSchemaProperty>;
};

// --- Brainclaw: Obsidian vault integration ---

export type BrainPersonStatus = "active" | "archived" | "blocked";

export type BrainPerson = {
  phone: string;
  jid: string | null;
  name: string;
  aliases: string[];
  tags: string[];
  relationship: string | null;
  language: string | null;
  status: BrainPersonStatus;
  created: string | null;
  lastSeen: string | null;
  summary: string;
  facts: string[];
  preferences: string[];
  openThreads: string[];
  notes: string;
  log: string[];
  // Canned-reply mode: when cursing is true and curses is non-empty, the
  // WhatsApp plugin replies with a random entry from `curses` roughly
  // `cursingRate`% of the time (default 70) instead of invoking the LLM.
  cursing: boolean;
  cursingRate: number;   // 0-100, clamped. 0 = never, 100 = always.
  curses: string[];
  raw: string;
  parseWarning: string | null;
};

export type BrainPersonSummary = {
  phone: string;
  name: string;
  relationship: string | null;
  language: string | null;
  status: BrainPersonStatus;
  lastSeen: string | null;
  tags: string[];
};

export type BrainPersonUpdate = {
  name?: string;
  aliases?: string[];
  tags?: string[];
  relationship?: string | null;
  language?: string | null;
  status?: BrainPersonStatus;
  summary?: string;
  facts?: string[];
  preferences?: string[];
  openThreads?: string[];
  notes?: string;
  cursing?: boolean;
  cursingRate?: number;
  curses?: string[];
};

export type BrainPersonCreate = {
  phone: string;
  jid?: string | null;
  name?: string;
};

// --- Codebase Reviewer ---

export type ReviewProjectStatus =
  | "idle"
  | "queued"
  | "running"
  | "awaiting_ack"
  | "skipped"
  | "failed";

export type ReviewProject = {
  id: string;
  name: string;
  path: string;
  enabled: boolean;
  status: ReviewProjectStatus;
  discoveredAt: string;
  lastRunAt: string | null;
  lastReportPath: string | null;
  lastReportDate: string | null;
  lastAckedAt: string | null;
  eligibleAt: string | null;
  lastError: string | null;
  missing?: boolean;
  adhoc?: boolean;
};

export type ReviewerState = {
  scanRoots: string[];
  projects: Record<string, ReviewProject>;
  updatedAt: string;
};

export type ReviewIdeaStatus = "pending" | "accepted" | "rejected" | "deferred";
export type ReviewIdeaImpact = "low" | "medium" | "high";
export type ReviewIdeaEffort = "S" | "M" | "L";
export type ReviewIdeaCategory =
  | "new_feature"
  | "improvement"
  | "ui_ux"
  | "tech_debt";

export type ReviewIdea = {
  id: string;
  projectId: string;
  projectName: string;
  reportDate: string;
  category: ReviewIdeaCategory;
  title: string;
  problem: string;
  solution: string;
  impact: ReviewIdeaImpact;
  effort: ReviewIdeaEffort;
  status: ReviewIdeaStatus;
  createdAt: string;
  statusChangedAt: string | null;
};

export type ReviewRunPhase = "start" | "end" | "error";

export type ReviewRun = {
  runId: string;
  projectId: string;
  trigger: "cron" | "manual";
  phase: ReviewRunPhase;
  timestamp: string;
  sessionId?: string;
  reportPath?: string;
  ideasCount?: number;
  error?: string;
  durationMs?: number;
};

export type ReviewSeverity = "critical" | "high" | "medium" | "low" | "info";

export type ReviewTriageState =
  | "new"
  | "needs_attention"
  | "actionable"
  | "dismissed"
  | "resolved";

export type ReviewReportMeta = {
  projectId: string;
  reportDate: string;
  triageState: ReviewTriageState;
  triageChangedAt: string | null;
  triageNote: string | null;
};

export type ReviewReportSummary = {
  reportDate: string;
  reportPath: string;
  ideasCount: number;
  acked: boolean;
  severity: ReviewSeverity;
  triageState: ReviewTriageState;
  triageChangedAt: string | null;
};

export type ReviewInboxItem = {
  projectId: string;
  projectName: string;
  reportDate: string;
  ideasCount: number;
  severity: ReviewSeverity;
  triageState: ReviewTriageState;
  triageChangedAt: string | null;
  acked: boolean;
};

export type ReviewerWorkerState = {
  current: string | null;
  queue: string[];
};

// --- YouTube Summarizer ---

export type YoutubeJobStatus = "queued" | "processing" | "done" | "failed";

export type YoutubeJob = {
  jobId: string;
  videoId: string;
  url: string;
  status: YoutubeJobStatus;
  createdAt: string;
  updatedAt: string;
  errorMessage?: string;
};

export type YoutubeSummaryMeta = {
  videoId: string;
  title: string;
  channel: string;
  url: string;
  durationSeconds: number;
  captionLanguage: string;
  fetchedAt: string;
  updatedAt: string;
};

export type YoutubeSummaryListItem = YoutubeSummaryMeta & {
  status: YoutubeJobStatus;
  errorMessage?: string;
};

export type YoutubeIndexEvent = {
  videoId: string;
  status: YoutubeJobStatus;
  meta?: Partial<YoutubeSummaryMeta>;
  errorMessage?: string;
  at: string;
};

export type YoutubeRejectedUrl = {
  url: string;
  reason: string;
};

export type YoutubeSubmitResponse = {
  jobs: YoutubeJob[];
  rejected: YoutubeRejectedUrl[];
};

// --- Claude Code ↔ OpenClaw ---

export type ClaudeCodeSessionMode = "agent" | "manual";
export type ClaudeCodeSessionState = "active" | "ended";

export type ClaudeCodeSession = {
  id: string;
  displayName: string;
  ide: string;
  workspace: string;
  mode: ClaudeCodeSessionMode;
  state: ClaudeCodeSessionState;
  openclawSessionId: string;
  createdAt: string;
  lastActivityAt: string;
  messageCount: number;
};

export type ClaudeCodeTranscriptEventKind =
  | "ask"
  | "draft"
  | "answer"
  | "discarded"
  | "timeout"
  | "mode_change"
  | "ended";

export type ClaudeCodeAnswerSource = "agent" | "operator";
export type ClaudeCodeOperatorAction = "send-as-is" | "edit" | "replace";

export type ClaudeCodeTranscriptEvent = {
  t: string;
  kind: ClaudeCodeTranscriptEventKind;
  msgId?: string;
  question?: string;
  context?: Record<string, unknown>;
  draft?: string;
  answer?: string;
  source?: ClaudeCodeAnswerSource;
  action?: ClaudeCodeOperatorAction;
  from?: ClaudeCodeSessionMode;
  to?: ClaudeCodeSessionMode;
  by?: string;
};

export type ClaudeCodePendingItem = {
  id: string;
  sessionId: string;
  msgId: string;
  question: string;
  draft: string;
  createdAt: string;
};

export type ClaudeCodeAskRequest = {
  ide: string;
  workspace: string;
  msgId: string;
  question: string;
  context?: Record<string, unknown>;
};

export type ClaudeCodeAskResponse = {
  answer: string;
  source: ClaudeCodeAnswerSource;
  action?: ClaudeCodeOperatorAction;
};

export type ClaudeCodeConnectConfig = {
  antigravity: string;
  vscode: string;
  cli: string;
};
