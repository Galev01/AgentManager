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
  | "connected";

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
