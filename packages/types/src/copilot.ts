import type { JsonValue } from "./runtimes.js";

export type BackendKind = "openclaw" | "hermes";

export type CopilotSessionMeta = {
  id: string;
  ownerUserId: string;
  backend: BackendKind;
  title: string | null;
  createdAt: number;
  lastTurnAt: number | null;
  openclawSessionKey?: string;
};

export type CopilotMessageRole = "user" | "assistant" | "system";

export type CopilotToolCall = {
  type: "tool_call";
  call_id: string;
  tool: string;
  arguments: JsonValue;
};

export type CopilotToolResult = {
  type: "tool_result";
  call_id: string;
  ok: boolean;
  result?: JsonValue;
  error?: string;
};

export type CopilotMessageEvent =
  | { type: "text"; text: string }
  | CopilotToolCall
  | CopilotToolResult;

export type CopilotMessage = {
  msg_id: string;
  role: CopilotMessageRole;
  events: CopilotMessageEvent[];
  createdAt: number;
};

export type CopilotPendingState =
  | "pending"
  | "running"
  | "done"
  | "error"
  | "timeout";

export type CopilotPendingTurn = {
  msg_id: string;
  state: CopilotPendingState;
  startedAt: number;
  finishedAt?: number;
  errorDetail?: string;
};

export type CopilotSessionSnapshot = {
  meta: CopilotSessionMeta;
  messages: CopilotMessage[];
  pending: CopilotPendingTurn | null;
};

export type CopilotTurnPollResponse = {
  pending: CopilotPendingTurn;
  assistantMessage: CopilotMessage | null;
  lastMessageId: string | null;
};

export type CopilotSessionCreateInput = {
  backend: BackendKind;
  title?: string;
};

export type CopilotTurnSubmitInput = {
  message: string;
};
