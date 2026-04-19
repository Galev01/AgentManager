import type {
  ClaudeCodeAskRequest,
  ClaudeCodeAskResponse,
  ClaudeCodeTranscriptEvent,
} from "@openclaw-manager/types";
import {
  getOrCreateSession,
  listSessions,
  setSessionMode,
  touchSession,
  resurrectSession,
} from "./claude-code-sessions.js";
import {
  appendTranscript,
  transcriptPathFor,
} from "./claude-code-transcript.js";
import {
  createPending,
  awaitPending,
} from "./claude-code-pending.js";

export type AskOrchestratorDeps = {
  sessionsPath: string;
  pendingPath: string;
  transcriptsDir: string;
  pendingTimeoutMs: number;
  sharedOpenclawSessionId: string;
  callGateway: (method: string, params?: Record<string, unknown>) => Promise<unknown>;
  broadcast: (kind: string, payload: unknown) => void;
};

function extractReply(raw: unknown): string {
  if (raw && typeof raw === "object") {
    const any = raw as any;
    if (typeof any.reply === "string") return any.reply;
    if (typeof any.message === "string") return any.message;
    if (typeof any.text === "string") return any.text;
    if (any.result && typeof any.result.reply === "string") return any.result.reply;
  }
  if (typeof raw === "string") return raw;
  throw new Error(`unexpected gateway response shape: ${JSON.stringify(raw)}`);
}

export function createAskOrchestrator(deps: AskOrchestratorDeps) {
  async function append(sessionId: string, ev: ClaudeCodeTranscriptEvent) {
    await appendTranscript(transcriptPathFor(deps.transcriptsDir, sessionId), ev);
    deps.broadcast("claude_code_transcript_appended", { sessionId, event: ev });
  }

  async function ask(req: ClaudeCodeAskRequest): Promise<ClaudeCodeAskResponse> {
    const session = await getOrCreateSession(deps.sessionsPath, {
      ide: req.ide,
      workspace: req.workspace,
      openclawSessionId: deps.sharedOpenclawSessionId,
    });
    if (session.state === "ended") {
      await resurrectSession(deps.sessionsPath, session.id);
    }
    deps.broadcast("claude_code_session_upserted", { id: session.id });

    const now = new Date().toISOString();
    await append(session.id, {
      t: now,
      kind: "ask",
      msgId: req.msgId,
      question: req.question,
      context: req.context,
    });

    let draft: string;
    try {
      const raw = await deps.callGateway("chat.send", {
        session_id: session.openclawSessionId,
        message: req.question,
      });
      draft = extractReply(raw);
    } catch (e) {
      throw new Error(`gateway: ${(e as Error).message}`);
    }

    await append(session.id, {
      t: new Date().toISOString(),
      kind: "draft",
      msgId: req.msgId,
      draft,
    });

    const latest = (await listSessions(deps.sessionsPath)).find((s) => s.id === session.id)!;
    if (latest.mode === "agent") {
      await append(session.id, {
        t: new Date().toISOString(),
        kind: "answer",
        msgId: req.msgId,
        answer: draft,
        source: "agent",
      });
      await touchSession(deps.sessionsPath, session.id);
      return { answer: draft, source: "agent" };
    }

    // Manual mode — create pending and hold
    const pending = await createPending(deps.pendingPath, {
      sessionId: session.id,
      msgId: req.msgId,
      question: req.question,
      draft,
    });
    deps.broadcast("claude_code_pending_upserted", pending);

    try {
      const resolved = await awaitPending(pending.id, deps.pendingTimeoutMs);
      await append(session.id, {
        t: new Date().toISOString(),
        kind: "answer",
        msgId: req.msgId,
        answer: resolved.answer,
        source: resolved.source,
        action: resolved.action,
      });
      await touchSession(deps.sessionsPath, session.id);
      deps.broadcast("claude_code_pending_resolved", { id: pending.id });
      return resolved;
    } catch (err) {
      const message = (err as Error).message;
      if (/discarded/i.test(message)) {
        await append(session.id, {
          t: new Date().toISOString(),
          kind: "discarded",
          msgId: req.msgId,
        });
        // Flip session to manual (idempotent if already)
        await setSessionMode(deps.sessionsPath, session.id, "manual");
      } else if (/timeout/i.test(message)) {
        await append(session.id, {
          t: new Date().toISOString(),
          kind: "timeout",
          msgId: req.msgId,
        });
      }
      deps.broadcast("claude_code_pending_resolved", { id: pending.id });
      throw err;
    }
  }

  return { ask };
}
