import type { CopilotSessionMeta } from "@openclaw-manager/types";

export type ChatTurnRequest = {
  session: CopilotSessionMeta;
  userMessageText: string;
  msgId: string;
};

export type ChatTurnResult =
  | { ok: true; assistantText: string }
  | { ok: false; error: string };

export type SessionBootstrap = Partial<Pick<CopilotSessionMeta, "openclawSessionKey">>;

export interface ChatBackendAdapter {
  /**
   * Called once when a session is created with this backend. Bootstraps any
   * backend-side state (e.g. OpenClaw `sessions.create`). Returns optional
   * fields to merge into the meta — for OpenClaw, the gateway key.
   */
  createSession(args: { sessionId: string; ownerUserId: string }): Promise<SessionBootstrap>;

  /**
   * Submits a user turn and returns the assistant text. Backend-native
   * session memory is authoritative — the adapter does NOT receive local
   * transcript history.
   */
  sendTurn(req: ChatTurnRequest): Promise<ChatTurnResult>;
}
