import crypto from "node:crypto";
import type {
  CopilotMessage, CopilotPendingTurn, BackendKind,
} from "@openclaw-manager/types";
import type { ChatBackendAdapter } from "./backend.js";
import type { CopilotStore } from "./store.js";

export type CopilotOrchestratorDeps = {
  store: CopilotStore;
  backendFor: (kind: BackendKind) => ChatBackendAdapter;
  pendingTimeoutMs?: number;     // default 180_000
  onAudit?: (line: { event: string; data: Record<string, unknown> }) => void;
};

export type CopilotOrchestrator = {
  submitTurn(args: { sessionId: string; userMessageText: string }): Promise<{ msgId: string; pending: CopilotPendingTurn }>;
  waitForTurn(sessionId: string, msgId: string, timeoutMs: number): Promise<CopilotPendingTurn>;
  recoverOnBoot(): Promise<void>;
};

export class TurnInProgressError extends Error {
  code = "turn_in_progress" as const;
  constructor() { super("a turn is already in progress for this session"); }
}

const TERMINAL: ReadonlyArray<CopilotPendingTurn["state"]> = ["done", "error", "timeout"];

export function createCopilotOrchestrator(deps: CopilotOrchestratorDeps): CopilotOrchestrator {
  const pendingTimeoutMs = deps.pendingTimeoutMs ?? 180_000;
  const inflight = new Map<string, Promise<void>>();

  function audit(event: string, data: Record<string, unknown>) {
    deps.onAudit?.({ event, data });
  }

  async function dispatch(sessionId: string, msgId: string, userText: string, startedAt: number): Promise<void> {
    const meta = await deps.store.readMeta(sessionId);
    if (!meta) throw new Error(`copilot session not found: ${sessionId}`);
    const backend = deps.backendFor(meta.backend);

    await deps.store.writePending(sessionId, { msg_id: msgId, state: "running", startedAt });

    try {
      const result = await backend.sendTurn({ session: meta, userMessageText: userText, msgId });
      if (result.ok) {
        const assistantMsg: CopilotMessage = {
          msg_id: crypto.randomUUID(),
          role: "assistant",
          createdAt: Date.now(),
          events: [{ type: "text", text: result.assistantText }],
        };
        await deps.store.appendMessage(sessionId, assistantMsg);
        const finishedAt = Date.now();
        await deps.store.writePending(sessionId, { msg_id: msgId, state: "done", startedAt, finishedAt });
        await deps.store.updateMeta(sessionId, { lastTurnAt: finishedAt });
        audit("turn.completed", {
          sessionId, backend: meta.backend, user: meta.ownerUserId, msgId,
          latencyMs: finishedAt - startedAt,
          assistantLength: result.assistantText.length,
        });
      } else {
        await deps.store.writePending(sessionId, {
          msg_id: msgId, state: "error", startedAt, finishedAt: Date.now(), errorDetail: result.error,
        });
        audit("turn.error", { sessionId, backend: meta.backend, user: meta.ownerUserId, msgId, errorDetail: result.error });
      }
    } catch (e) {
      const errMsg = (e as Error).message;
      await deps.store.writePending(sessionId, {
        msg_id: msgId, state: "error", startedAt, finishedAt: Date.now(), errorDetail: errMsg,
      });
      audit("turn.error", { sessionId, backend: meta.backend, user: meta.ownerUserId, msgId, errorDetail: errMsg });
    }
  }

  return {
    async submitTurn({ sessionId, userMessageText }) {
      const existing = await deps.store.readPending(sessionId);
      if (existing && !TERMINAL.includes(existing.state)) {
        throw new TurnInProgressError();
      }

      const msgId = crypto.randomUUID();
      const startedAt = Date.now();
      const meta = await deps.store.readMeta(sessionId);
      if (!meta) throw new Error(`copilot session not found: ${sessionId}`);

      // Append user message + write pending in user-visible order
      await deps.store.appendMessage(sessionId, {
        msg_id: msgId, role: "user", createdAt: startedAt, events: [{ type: "text", text: userMessageText }],
      });
      const pending: CopilotPendingTurn = { msg_id: msgId, state: "pending", startedAt };
      await deps.store.writePending(sessionId, pending);
      audit("turn.accepted", { sessionId, backend: meta.backend, user: meta.ownerUserId, msgId });

      const promise = dispatch(sessionId, msgId, userMessageText, startedAt).finally(() => {
        inflight.delete(sessionId);
      });
      inflight.set(sessionId, promise);
      // Don't await — return immediately
      void promise;

      return { msgId, pending };
    },

    async waitForTurn(sessionId, msgId, timeoutMs) {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        const p = await deps.store.readPending(sessionId);
        if (!p || p.msg_id !== msgId) {
          // Different msg or cleared — caller should re-fetch snapshot
          throw new Error(`pending for msgId ${msgId} no longer present`);
        }
        if (TERMINAL.includes(p.state)) return p;
        await new Promise((r) => setTimeout(r, 50));
      }
      throw new Error("waitForTurn deadline exceeded");
    },

    async recoverOnBoot() {
      const stale = await deps.store.listAllNonTerminalPending();
      const now = Date.now();
      for (const { sessionId, pending } of stale) {
        const messages = await deps.store.readMessages(sessionId, 50);
        const newerAssistant = messages
          .filter((m) => m.role === "assistant" && m.createdAt > pending.startedAt)
          .pop();
        if (newerAssistant) {
          await deps.store.writePending(sessionId, {
            msg_id: pending.msg_id, state: "done", startedAt: pending.startedAt, finishedAt: newerAssistant.createdAt,
          });
          audit("turn.recovered_done", { sessionId, msgId: pending.msg_id });
        } else if (now - pending.startedAt > pendingTimeoutMs) {
          await deps.store.writePending(sessionId, {
            msg_id: pending.msg_id, state: "timeout", startedAt: pending.startedAt, finishedAt: now,
            errorDetail: "stale on bridge restart",
          });
          audit("turn.timeout", { sessionId, msgId: pending.msg_id, elapsedMs: now - pending.startedAt });
        }
      }
    },
  };
}
