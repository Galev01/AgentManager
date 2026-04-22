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
  | "brain_agent_changed"
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
  unreadCount?: number;
  lastMessageSnippet?: string | null;
  lastMessageAt?: number | null;
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
  /** Unique per MCP process; distinguishes concurrent Claude Code chats
   * in the same IDE/workspace. Optional for sessions created before
   * this field was introduced. */
  clientId?: string;
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
  /** Canonical envelope for this turn. Absent on legacy pre-envelope events. */
  envelope?: CCEnvelope;
};

export type ClaudeCodePendingItem = {
  id: string;
  sessionId: string;
  msgId: string;
  question: string;
  draft: string;
  createdAt: string;
  /** Full canonical envelope for the asking turn. Required on items created
   *  after envelope wiring lands; absent on legacy rows. */
  envelope?: CCEnvelope;
  /** Envelope proposed for the reply (author.kind: 'agent' or 'operator'). */
  draftEnvelope?: CCEnvelope;
};

export type ClaudeCodeAskRequest = {
  ide: string;
  workspace: string;
  /** Unique per MCP process. Included in the hash that derives the session
   * id, so concurrent Claude Code chats in the same IDE/workspace land on
   * distinct bridge sessions. */
  clientId?: string;
  msgId: string;
  question: string;
  context?: Record<string, unknown>;
  // Envelope input (all optional; bridge normalizes):
  intent?: CCIntent;
  state?: CCAuthorState;
  artifact?: CCArtifact;
  priority?: CCPriority;
  refs?: CCRef[];
  parentMsgId?: string;
};

export type ClaudeCodeAskResponse = {
  answer: string;
  source: ClaudeCodeAnswerSource;
  action?: ClaudeCodeOperatorAction;
  /** Canonical envelope for the reply turn. Added in phase 1. */
  envelope?: CCEnvelope;
};

export type ClaudeCodeConnectConfig = {
  antigravity: string;
  vscode: string;
  cli: string;
};

// --- YouTube Summarizer v2 ---

export type YoutubeTranscriptSegment = {
  start: number;
  duration: number;
  end: number;
  text: string;
};

export type YoutubeTranscriptFile = {
  videoId: string;
  source: "youtube-transcript";
  language: string;
  fetchedAt: string;
  segments: YoutubeTranscriptSegment[];
};

export type YoutubeChunk = {
  id: string;
  videoId: string;
  start: number;
  end: number;
  text: string;
  segmentIndexes: number[];
  tokenEstimate: number;
  chapterId?: string;
};

export type YoutubeChunkerStrategy = {
  maxChars: number;
  overlapChars: number;
  maxSegmentsPerChunk: number;
};

export type YoutubeChunksFile = {
  videoId: string;
  createdAt: string;
  chunkerVersion: string;
  strategy: YoutubeChunkerStrategy;
  chunks: YoutubeChunk[];
};

export type YoutubePromptPresetId =
  | "tldr"
  | "key-points"
  | "study-notes"
  | "tutorial-steps"
  | "critique"
  | "action-items"
  | "quotes";

export type YoutubePromptPreset = {
  id: YoutubePromptPresetId;
  title: string;
  description: string;
  summaryInstructions: string;
  chatInstructions: string;
};

export type YoutubeChatMessageRow = {
  id: string;
  videoId: string;
  chatSessionId: string;
  turnId: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: string;
  presetId?: YoutubePromptPresetId;
  parentMessageId?: string;
  retrievedChunkIds?: string[];
  openclawSessionKey?: string;
  status: "streaming" | "complete" | "error";
  errorMessage?: string;
};

export type YoutubeChatMetaFile = {
  videoId: string;
  chatSessionId: string;
  openclawSessionKey?: string;
  lastReplayedAt?: string;
  distilledMemory?: string;
};

export type YoutubeJobKind =
  | "summary"
  | "chat"
  | "rebuild"
  | "chapter-extract"
  | "highlight-extract";

export type YoutubeRebuildPart =
  | "captions"
  | "chunks"
  | "summary"
  | "highlights"
  | "chapters"
  | "chat-history";

export type YoutubeRebuildPartStatus =
  | "pending"
  | "running"
  | "ok"
  | "failed"
  | "skipped";

export type YoutubeRebuildPartState = {
  part: YoutubeRebuildPart;
  status: YoutubeRebuildPartStatus;
  error?: string;
  startedAt?: string;
  finishedAt?: string;
};

export type YoutubeRebuildStatus = {
  videoId: string;
  /** True while a rebuild is in flight; false after completion (entry is
   *  retained briefly so polling clients see the final state). */
  active: boolean;
  startedAt: string;
  finishedAt?: string;
  parts: YoutubeRebuildPartState[];
};

export type YoutubeJobV2Input = {
  presetId?: YoutubePromptPresetId;
  message?: string;
  chatSessionId?: string;
  rebuildParts?: YoutubeRebuildPart[];
};

export type YoutubeJobV2Output = {
  summaryPath?: string;
  chatMessageId?: string;
  chunksPath?: string;
};

export type YoutubeChapter = {
  id: string;
  title: string;
  start: number;
  end?: number;
};

export type YoutubeChaptersFile = {
  videoId: string;
  source: "description" | "inferred";
  createdAt: string;
  chapters: YoutubeChapter[];
};

export type YoutubeHighlight = {
  id: string;
  videoId: string;
  quote: string;
  start: number;
  end?: number;
  reason?: string;
  createdAt: string;
};

export type YoutubeHighlightsFile = {
  videoId: string;
  createdAt: string;
  highlights: YoutubeHighlight[];
};

export type YoutubeVideoMetadataFile = {
  videoId: string;
  title: string;
  channel: string;
  url: string;
  durationSeconds: number;
  captionLanguage: string;
  fetchedAt: string;
  updatedAt: string;
};

export interface GlobalBrain {
  persona: string;
  hardRules: string[];
  globalFacts: string[];
  toneStyle: string;
  doNotSay: string[];
  defaultGoals: string[];
  parseWarning: string | null;
  updatedAt: string | null;
}

export type GlobalBrainUpdate = Partial<Omit<GlobalBrain, "parseWarning" | "updatedAt">>;

export interface BrainInjectionPreview {
  system: string;
  breakdown: Array<{
    source: "global" | "person" | "curses";
    label: string;
    text: string;
  }>;
}

// --- Claude Code ↔ OpenClaw Collaboration Envelope (phase 1) ---

export type CCIntent =
  | "decide"
  | "brainstorm"
  | "plan"
  | "review"
  | "research"
  | "unblock"
  | "handoff"
  | "report";

export type CCAuthorState =
  | "new"
  | "in_progress"
  | "blocked"
  | "review_ready"
  | "done"
  | "parked";

export type CCSystemState = "timeout";
export type CCState = CCAuthorState | CCSystemState;

export type CCArtifact =
  | "none"
  | "question"
  | "decision"
  | "spec"
  | "plan"
  | "review_notes"
  | "patch"
  | "summary";

export type CCPriority = "low" | "normal" | "high" | "urgent";

export type CCAuthorKind = "ide" | "agent" | "operator" | "system";

export type CCAuthor = {
  kind: CCAuthorKind;
  id: string;
};

export type CCRefRelation =
  | "background"
  | "source_of_truth"
  | "prior_attempt"
  | "parallel_work";

export type CCRef =
  | { kind: "file"; path: string; range?: string; relation?: CCRefRelation }
  | { kind: "commit"; sha: string; relation?: CCRefRelation }
  | { kind: "spec"; path: string; relation?: CCRefRelation }
  | { kind: "error"; text: string; relation?: CCRefRelation }
  | { kind: "session"; id: string; relation?: CCRefRelation };

/** Canonical internal envelope (after bridge normalization). */
export type CCEnvelope = {
  msgId: string;
  parentMsgId: string | null;
  author: CCAuthor;
  intent: CCIntent;
  state: CCState;
  artifact: CCArtifact;
  priority: CCPriority;
  refs: CCRef[];
  message: string;
  /** Advisory raw values preserved when caller supplied unknown/invalid enums.
   *  Internal only; never surfaced to callers in phase 1. */
  _raw?: {
    intent?: string;
    state?: string;
    artifact?: string;
    refs?: unknown[];
    author?: unknown;
  };
  /** Confidence of inferred fields. Internal only. */
  _intentConfidence?: "low" | "normal";
};

/** Shape accepted in `openclaw_say` / `POST /claude-code/ask`. All fields
 *  except `message` are optional. The bridge normalizes into `CCEnvelope`. */
export type CCEnvelopeInput = {
  message: string;
  intent?: CCIntent;
  state?: CCAuthorState;
  artifact?: CCArtifact;
  priority?: CCPriority;
  refs?: CCRef[];
  parentMsgId?: string;
  msgId?: string;
};
