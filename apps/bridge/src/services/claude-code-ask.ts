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
  setOpenclawSessionId,
  deriveOpenclawSessionId,
} from "./claude-code-sessions.js";

const LEGACY_SHARED_OPENCLAW_SESSION_ID = "oc-shared-claude-code";
import {
  appendTranscript,
  transcriptPathFor,
  readTranscript,
} from "./claude-code-transcript.js";
import {
  createPending,
  awaitPending,
} from "./claude-code-pending.js";
import {
  normalizeEnvelope,
  systemEnvelope,
  type AuthorContext,
} from "./envelope.js";
import type { CCEnvelope } from "@openclaw-manager/types";

export type AskOrchestratorDeps = {
  sessionsPath: string;
  pendingPath: string;
  transcriptsDir: string;
  pendingTimeoutMs: number;
  openclawAgentId: string;
  callGateway: (method: string, params?: Record<string, unknown>) => Promise<unknown>;
  broadcast: (kind: string, payload: unknown) => void;
  replyPollIntervalMs?: number;
  replyTimeoutMs?: number;
};

type GatewayMessage = {
  role?: string;
  content?: Array<{ type?: string; text?: string }>;
};

function extractAssistantText(messages: GatewayMessage[]): string | null {
  const last = messages[messages.length - 1];
  if (!last || last.role !== "assistant") return null;
  const textPart = last.content?.find((p) => p.type === "text" && typeof p.text === "string");
  return textPart?.text ?? null;
}

const FIRST_TURN_PREAMBLE = [
  "[System instructions to OpenClaw — this is the first turn of a new session, so take these as persistent guidance for the rest of the conversation:]",
  "",
  "- The interlocutor is Claude Code (an AI coding assistant), not Gal. Gal is observing from the dashboard.",
  "- Always reply in English. No Hebrew openers, no warm-up pleasantries.",
  "- Be direct and technical. Lead with the answer or the specific question you need to ask back.",
  "- When Claude Code presents options or a plan, commit to a concrete recommendation with brief reasoning. Do not punt back to Gal unless the decision genuinely requires his authorization (production changes, money, irreversible actions).",
  "- For any multi-step coding task (implementing a feature, refactoring, working through a plan with 3+ steps), instruct Claude Code to use **subagent-driven development**: dispatch a fresh subagent per task with the `superpowers:subagent-driven-development` skill, followed by the two-stage review (spec compliance, then code quality). Do not let Claude Code execute a whole plan inline as a single agent — context pollution and quality drop happen fast. Exception: one-shot edits or pure investigation that genuinely fits in one agent's head.",
  "- To signal task completion, end your reply with `[[OPENCLAW_DONE]]` on its own line.",
  "",
  "[Claude Code's first message follows:]",
  "",
].join("\n");

function wrapFirstMessage(message: string): string {
  return `${FIRST_TURN_PREAMBLE}${message}`;
}

// OpenClaw emits control-routing tags (e.g. [[OPENCLAW_DONE]] to signal task
// completion, [[reply_to_current]] for native reply-quote on channels that
// support it). None of these are user-facing content; strip before returning
// to Claude Code.
const CONTROL_TAGS = ["[[OPENCLAW_DONE]]", "[[reply_to_current]]"];

function stripControlTags(text: string): string {
  let result = text;
  for (const tag of CONTROL_TAGS) {
    result = result.split(tag).join("");
  }
  return result.replace(/^\s+|\s+$/g, "");
}

function buildGatewayKey(agentId: string, openclawSessionId: string): string {
  // If the session already carries the agent prefix (e.g. legacy
  // "agent:main:oc-shared-claude-code"), use it verbatim. Otherwise add one.
  if (openclawSessionId.startsWith("agent:")) return openclawSessionId;
  return `agent:${agentId}:${openclawSessionId}`;
}

async function ensureSessionExists(
  callGateway: AskOrchestratorDeps["callGateway"],
  gatewayKey: string
): Promise<number> {
  // First probe — if the session exists, return its current message count as baseline.
  try {
    const state = (await callGateway("sessions.get", { key: gatewayKey })) as {
      messages?: GatewayMessage[];
    };
    return state?.messages?.length ?? 0;
  } catch (e) {
    if (!/not found/i.test((e as Error).message)) throw e;
  }

  // Session doesn't exist yet. Try to create, capturing any error for diagnostic context.
  let createError: Error | null = null;
  try {
    await callGateway("sessions.create", { key: gatewayKey });
  } catch (err) {
    createError = err as Error;
    console.warn(
      `[claude-code-ask] sessions.create({ key: "${gatewayKey}" }) threw: ${createError.message}`
    );
  }

  // Trust state, not error text: re-probe. If the session now resolves, we're good.
  try {
    const state = (await callGateway("sessions.get", { key: gatewayKey })) as {
      messages?: GatewayMessage[];
    };
    return state?.messages?.length ?? 0;
  } catch (verifyErr) {
    const parts = [`session not created: ${gatewayKey}`];
    if (createError) parts.push(`create: ${createError.message}`);
    parts.push(`get: ${(verifyErr as Error).message}`);
    throw new Error(parts.join(" | "));
  }
}

async function pollForReply(
  callGateway: AskOrchestratorDeps["callGateway"],
  sessionKey: string,
  baselineLength: number,
  timeoutMs: number,
  intervalMs: number
): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, intervalMs));
    const state = (await callGateway("sessions.get", {
      key: sessionKey,
    })) as { messages?: GatewayMessage[] };
    const messages = state?.messages ?? [];
    if (messages.length >= baselineLength + 2) {
      const text = extractAssistantText(messages);
      if (text) return stripControlTags(text);
    }
  }
  throw new Error("timeout waiting for OpenClaw reply");
}

export function createAskOrchestrator(deps: AskOrchestratorDeps) {
  async function append(sessionId: string, ev: ClaudeCodeTranscriptEvent) {
    await appendTranscript(transcriptPathFor(deps.transcriptsDir, sessionId), ev);
    deps.broadcast("claude_code_transcript_appended", { sessionId, event: ev });
  }

  async function ask(req: ClaudeCodeAskRequest): Promise<ClaudeCodeAskResponse> {
    let session = await getOrCreateSession(deps.sessionsPath, {
      ide: req.ide,
      workspace: req.workspace,
      clientId: req.clientId,
    });
    if (session.state === "ended") {
      await resurrectSession(deps.sessionsPath, session.id);
    }
    if (session.openclawSessionId === LEGACY_SHARED_OPENCLAW_SESSION_ID) {
      session = await setOpenclawSessionId(
        deps.sessionsPath,
        session.id,
        deriveOpenclawSessionId(session.id)
      );
    }
    deps.broadcast("claude_code_session_upserted", { id: session.id });

    // Load existing msgIds to detect duplicates.
    const transcriptPath = transcriptPathFor(deps.transcriptsDir, session.id);
    const prior = await readTranscript(transcriptPath);
    const existingMsgIds = new Set<string>();
    for (const ev of prior) if (ev.msgId) existingMsgIds.add(ev.msgId);

    // Normalize the asking turn's envelope. Author = ide-kind (the IDE the
    // MCP call came from). Root turn iff session has no prior asks.
    const midThread = prior.some((e) => e.kind === "ask");
    const askAuthor: AuthorContext = {
      kind: "ide",
      id: req.ide && req.ide.length > 0 ? req.ide : "unknown",
    };
    const askEnvelope = normalizeEnvelope(
      {
        message: req.question,
        msgId: req.msgId,
        parentMsgId: req.parentMsgId,
        intent: req.intent,
        state: req.state,
        artifact: req.artifact,
        priority: req.priority,
        refs: req.refs,
        // pass context for legacy {file,selection,stack} mapping
        ...(req.context ? { context: req.context } : {}),
      } as never,
      {
        authorContext: askAuthor,
        midThread,
        existingMsgIds,
        parentMsgIdFallback: null,
      }
    );

    await append(session.id, {
      t: new Date().toISOString(),
      kind: "ask",
      msgId: askEnvelope.msgId,
      question: req.question,
      context: req.context,
      envelope: askEnvelope,
    });

    const gatewayKey = buildGatewayKey(deps.openclawAgentId, session.openclawSessionId);

    let draft: string;
    try {
      const baselineLength = await ensureSessionExists(deps.callGateway, gatewayKey);
      const messageToGateway =
        baselineLength === 0 ? wrapFirstMessage(req.question) : req.question;

      await deps.callGateway("sessions.send", {
        key: gatewayKey,
        idempotencyKey: askEnvelope.msgId,
        message: messageToGateway,
      });

      draft = await pollForReply(
        deps.callGateway,
        gatewayKey,
        baselineLength,
        deps.replyTimeoutMs ?? 120000,
        deps.replyPollIntervalMs ?? 500
      );
    } catch (e) {
      throw new Error(`gateway: ${(e as Error).message}`);
    }

    // Construct the draft's envelope. Author = gateway agent composing the reply.
    const draftEnvelope: CCEnvelope = normalizeEnvelope(
      {
        message: draft,
        parentMsgId: askEnvelope.msgId,
        state: "review_ready",
        intent: askEnvelope.intent,
        artifact: askEnvelope.artifact === "question" ? "decision" : "none",
      },
      {
        authorContext: { kind: "agent", id: deps.openclawAgentId },
        midThread: true,
        parentMsgIdFallback: askEnvelope.msgId,
      }
    );

    await append(session.id, {
      t: new Date().toISOString(),
      kind: "draft",
      msgId: askEnvelope.msgId,
      draft,
      envelope: draftEnvelope,
    });

    const latest = (await listSessions(deps.sessionsPath)).find((s) => s.id === session.id)!;
    if (latest.mode === "agent") {
      const answerEnvelope: CCEnvelope = {
        ...draftEnvelope,
        msgId: draftEnvelope.msgId, // same draft id
        state: "done",
      };
      await append(session.id, {
        t: new Date().toISOString(),
        kind: "answer",
        msgId: askEnvelope.msgId,
        answer: draft,
        source: "agent",
        envelope: answerEnvelope,
      });
      await touchSession(deps.sessionsPath, session.id);
      return { answer: draft, source: "agent", envelope: answerEnvelope };
    }

    // Manual mode — create pending with both envelopes and hold.
    const pending = await createPending(deps.pendingPath, {
      sessionId: session.id,
      msgId: askEnvelope.msgId,
      question: req.question,
      draft,
      envelope: askEnvelope,
      draftEnvelope,
    });
    deps.broadcast("claude_code_pending_upserted", pending);

    try {
      const resolved = await awaitPending(pending.id, deps.pendingTimeoutMs);
      const operatorEnvelope: CCEnvelope = {
        ...draftEnvelope,
        msgId: draftEnvelope.msgId,
        author: { kind: "operator", id: "default" },
        state: "done",
      };
      await append(session.id, {
        t: new Date().toISOString(),
        kind: "answer",
        msgId: askEnvelope.msgId,
        answer: resolved.answer,
        source: resolved.source,
        action: resolved.action,
        envelope: operatorEnvelope,
      });
      await touchSession(deps.sessionsPath, session.id);
      deps.broadcast("claude_code_pending_resolved", { id: pending.id });
      return { ...resolved, envelope: operatorEnvelope };
    } catch (err) {
      const message = (err as Error).message;
      if (/discarded/i.test(message)) {
        const discardedEnvelope = systemEnvelope(
          "operator discarded reply",
          "blocked",
          "bridge",
          askEnvelope.msgId
        );
        await append(session.id, {
          t: new Date().toISOString(),
          kind: "discarded",
          msgId: askEnvelope.msgId,
          envelope: discardedEnvelope,
        });
        await setSessionMode(deps.sessionsPath, session.id, "manual");
      } else if (/timeout/i.test(message)) {
        const timeoutEnvelope = systemEnvelope(
          "pending draft expired",
          "timeout",
          "bridge",
          askEnvelope.msgId
        );
        await append(session.id, {
          t: new Date().toISOString(),
          kind: "timeout",
          msgId: askEnvelope.msgId,
          envelope: timeoutEnvelope,
        });
      }
      deps.broadcast("claude_code_pending_resolved", { id: pending.id });
      throw err;
    }
  }

  return { ask };
}
