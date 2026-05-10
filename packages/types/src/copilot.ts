import type { JsonValue } from "./runtimes.js";

export type BackendKind = "openclaw" | "hermes";

export type CopilotSessionMeta = {
  id: string;
  ownerUserId: string;
  /**
   * Runtime backing this session. Required for new records; legacy reads
   * backfill via the copilot store (see `apps/bridge/src/services/copilot/store.ts`).
   */
  runtimeId: string;
  /**
   * Backend kind kept as UI-display alias. Always equals the kind of the
   * runtime named by `runtimeId`. Migrating away from this field for
   * dispatch decisions; routes still emit it for dashboard compatibility.
   */
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
  /**
   * Preferred. When provided, the bridge looks up the runtime adapter by id
   * and derives `backend` from the runtime kind.
   */
  runtimeId?: string;
  /**
   * Legacy field still accepted for dashboard compatibility. If present
   * without `runtimeId`, the bridge derives `runtimeId` from the registry
   * (first runtime of that kind, falling back to primary).
   */
  backend?: BackendKind;
  title?: string;
};

export type CopilotTurnSubmitInput = {
  message: string;
};
