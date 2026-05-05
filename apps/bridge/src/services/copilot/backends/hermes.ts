import type { ChatBackendAdapter, ChatTurnRequest, ChatTurnResult, SessionBootstrap } from "../backend.js";

/**
 * Phase-A1 stub. The route layer rejects backend="hermes" at create time so
 * this adapter is never reached in production. It exists so Phase A2 is a
 * single-file replacement with no contract change.
 */
export function createHermesChatBackend(): ChatBackendAdapter {
  return {
    async createSession(): Promise<SessionBootstrap> {
      return {};
    },
    async sendTurn(_req: ChatTurnRequest): Promise<ChatTurnResult> {
      return { ok: false, error: "hermes backend not yet implemented (Phase A2)" };
    },
  };
}
