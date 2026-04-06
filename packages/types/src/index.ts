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
  | "update_runtime_settings";

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
