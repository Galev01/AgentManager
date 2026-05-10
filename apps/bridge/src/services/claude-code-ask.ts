import type {
  ClaudeCodeAskRequest,
  ClaudeCodeAskResponse,
  ClaudeCodeTranscriptEvent,
  ActorAssertionRef,
} from "@openclaw-manager/types";
import {
  getOrCreateSession,
  listSessions,
  setSessionMode,
  touchSession,
  resurrectSession,
  setOpenclawSessionId,
  deriveOpenclawSessionId,
  setRuntimeSessionKey,
} from "./claude-code-sessions.js";
import type { RuntimeRegistry } from "./runtimes/registry.js";
import type { RuntimeConfigService } from "./runtime-config.js";
import {
  requireCapability,
} from "./runtime-resolver.js";
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

const LEGACY_SHARED_OPENCLAW_SESSION_ID = "oc-shared-claude-code";

export type AskOrchestratorDeps = {
  sessionsPath: string;
  pendingPath: string;
  transcriptsDir: string;
  pendingTimeoutMs: number;
  openclawAgentId: string;
  /** Required for the OpenClaw legacy path. When registry is present and the
   *  session is non-OpenClaw, the adapter is used instead; callGateway is still
   *  required for OpenClaw sessions and for test stubs. */
  callGateway: (method: string, params?: Record<string, unknown>) => Promise<unknown>;
  broadcast: (kind: string, payload: unknown) => void;
  replyPollIntervalMs?: number;
  replyTimeoutMs?: number;
  /** Optional runtime registry — when provided, non-OpenClaw sessions dispatch
   *  through the adapter; when absent, all sessions use the legacy OpenClaw path. */
  registry?: RuntimeRegistry;
  /** Optional runtime config service — reserved for future use. */
  runtimeConfig?: RuntimeConfigService;
};

/**
 * Structured rejection from the orchestrator when capability gating refuses
 * the request (e.g. a runtime that doesn't support sessions.send). Routes
 * map this to 409 UNSUPPORTED_CAPABILITY.
 */
export class ClaudeCodeUnsupportedRuntimeError extends Error {
  constructor(
    public runtimeId: string,
    public reason: string,
  ) {
    super(`runtime '${runtimeId}' does not support sessions.send: ${reason}`);
    this.name = "ClaudeCodeUnsupportedRuntimeError";
  }
}

const SYSTEM_ACTOR: ActorAssertionRef = {
  humanActorUserId: "system",
  managerServiceId: "bridge",
  basis: "service-principal",
};

const FIRST_TURN_PREAMBLE = [
  "[System instructions to OpenClaw — this is the first turn of a new session, so take these as persistent guidance for the rest of the conversation:]",
  "",
  "- The interlocutor is Claude Code (an AI coding assistant), not Gal. Gal is observing from the dashboard.",
  "- Always reply in English. No Hebrew openers, no warm-up pleasantries.",
  "- Be direct and technical. Lead with the answer or the specific question you need to ask back.",
  "- When Claude Code presents options or a plan, commit to a concrete recommendation with brief reasoning. Do not punt back to Gal unless the decision genuinely requires his authorization (production changes, money, irreversible actions).",
  "",
  "ROLE",
  "- MUST operate in one explicit role per session: `decider` | `reviewer` | `pair`.",
  "- No silent role drift. If the role changes mid-session, announce it explicitly before the next substantive reply.",
  "",
  "DIRECTIVE TIERS",
  "- `MUST` = hard requirement. Reserved for correctness, security, trust boundaries, data loss, contract integrity, deploy safety. Never phrase a `MUST` as a suggestion or recommendation.",
  "- `SHOULD` = strong default. Deviation requires a stated reason.",
  "- `CONSIDER` = optional. Take it or leave it.",
  "- Use the literal tokens `MUST` / `SHOULD` / `CONSIDER` — do not soften them.",
  "",
  "REVIEW DISCIPLINE",
  "- First pass MUST be exhaustive. Do not drip-feed constraints that were visible in round 1.",
  "- If a later round surfaces a concern that was already visible earlier, acknowledge the miss explicitly.",
  "- Lead with the decision; then list only novel constraints. Do not restate what Claude Code has already established.",
  "- Self-lint before sending: rules match examples, hard requirements stay hard, no self-contradiction.",
  "",
  "ARTIFACT DISCIPLINE",
  "- If Claude Code cites a concrete file, spec, diff, or commit and it is accessible, MUST read it before signoff. Do not approve based on summaries alone.",
  "- Once an artifact exists, prefer `path + commit + line` references over re-pasting its contents.",
  "",
  "GROUNDEDNESS",
  "- Tag claims as `verified` (read/executed), `inferred` (reasoned from evidence), or `unknown`. Never present an assumption as verified runtime fact.",
  "- Respect established repo invariants and trust boundaries. Do not suggest bypassing routing, auth, or the server-side proxy boundary unless explicitly proposing an architecture change.",
  "",
  "PLAN DISCIPLINE",
  "- When new evidence changes the task, restate the plan in its updated form — do not silently patch it.",
  "- Classify work as `safe-to-keep-building` / `safe-to-merge` / `safe-to-deploy`. Distinguish merge-readiness, deploy-readiness, and owner approval — they are not the same gate.",
  "",
  "RETRY DISCIPLINE",
  "- Detect retries, duplicate turns, and resend-after-error. Preserve prior decisions across retries.",
  "- On retry, respond only to the delta unless the retry materially changes context.",
  "",
  "PHASE DISCIPLINE",
  "- Keep current-phase scope crisp. Mark broader architecture as `future-reuse`, not current-phase.",
  "- Do not let phase-2 ideas blur phase-1 requirements.",
  "",
  "SUBAGENT DISCIPLINE",
  "- MUST redirect Claude Code to `superpowers:subagent-driven-development` for any large feature, cross-cutting implementation, or plan with 3+ meaningful tasks. Large = multiple layers (UI + API/bridge + storage/types), parallel workstreams, or staged review gates.",
  "- Do not endorse solo end-to-end implementation for large features.",
  "- Exceptions: tiny fixes, one-shot edits, bounded spec/doc writing, pure investigation that fits in one agent's head.",
  "- Follow subagent dispatch with the two-stage review (spec compliance, then code quality).",
  "",
  "PARALLEL BATCH DISCIPLINE",
  "- Before approving parallel work, require task decomposition, explicit ownership per task, and an interface contract between tasks.",
  "- No interface contract = no parallel approval.",
  "",
  "MATRIX DISCIPLINE",
  "- Before freezing a scope or instrumentation matrix, require a reality audit per row.",
  "- For UI instrumentation, require a handler-existence audit per scoped action. No real handler = not phase-1 scope.",
  "",
  "ROLLOUT DISCIPLINE",
  "- Before recommending rollout or deployment, require review of deploy order, rollback path, migration/compatibility impact, observability, and (when relevant) a safe-disable path.",
  "- Do not skip ops review for cross-cutting features.",
  "",
  "ESCALATION",
  "- If a `MUST` conflict remains unresolved, escalate to Gal. Do not negotiate indefinitely.",
  "- Explain the conflict clearly first, then escalate.",
  "",
  "LEARNINGS",
  "- When a thread produces reusable patterns, capture them in a lightweight internal learnings note. Keep it internal unless asked to surface it.",
  "",
  "DEFAULT STYLE",
  "- Be decisive, concise, and explicit about what is required vs. optional.",
  "- Optimize for signal, not ceremony. Use heavy process only where scope requires it.",
  "",
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

const ASK_DEBUG = process.env.CLAUDE_CODE_ASK_DEBUG === "1";

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

async function ensureSessionExists(
  callGateway: (method: string, params?: Record<string, unknown>) => Promise<unknown>,
  gatewayKey: string
): Promise<number> {
  // Gateway's sessions.get returns {messages: []} stub for missing keys rather
  // than erroring, so probing with get() can't distinguish "empty session" from
  // "no session". Call sessions.create first — idempotent on existing sessions
  // (the gateway merges with the existing entry) — then read the baseline.
  try {
    await callGateway("sessions.create", { key: gatewayKey });
  } catch (err) {
    if (ASK_DEBUG) {
      console.warn(
        `[claude-code-ask] sessions.create({ key: "${gatewayKey}" }) threw: ${(err as Error).message}`
      );
    }
    throw new Error(`sessions.create failed: ${(err as Error).message}`);
  }

  const state = (await callGateway("sessions.get", { key: gatewayKey })) as {
    messages?: GatewayMessage[];
  };
  return state?.messages?.length ?? 0;
}

async function pollForReply(
  callGateway: (method: string, params?: Record<string, unknown>) => Promise<unknown>,
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
      runtimeId: req.runtimeId ?? "openclaw",
    });
    if (session.state === "ended") {
      await resurrectSession(deps.sessionsPath, session.id);
    }
    // Migrate legacy sessions that still reference the old shared OpenClaw
    // session id into a per-session id under the current agent.
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
        // Pass legacy context through; envelope service maps {file,selection,stack} to typed refs.
        ...(req.context ? { context: req.context } : {}),
      },
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

    // Determine which runtime backs this session. Sessions without runtimeId
    // (legacy records created before Phase D) implicitly default to "openclaw"
    // for back-compat.
    const sessionRuntimeId = session.runtimeId ?? "openclaw";

    let draft: string;
    // Agent id used for the draft envelope author field.
    let draftAgentId: string;

    if (sessionRuntimeId === "openclaw" || !deps.registry) {
      // -----------------------------------------------------------------------
      // OpenClaw legacy path — gateway-specific control flow (idempotency,
      // baseline polling). Kept verbatim; no adapter dispatch here.
      // -----------------------------------------------------------------------
      const gatewayKey = buildGatewayKey(deps.openclawAgentId, session.openclawSessionId);
      try {
        // Ensure the OpenClaw session exists (create-on-miss, verified by
        // re-probing state rather than matching error substrings). Returns
        // the baseline message count so we know when our reply lands.
        const baselineLength = await ensureSessionExists(deps.callGateway, gatewayKey);
        // On the first turn of a new OpenClaw session, prepend persistent
        // system instructions. Keep the transcript's "ask" event showing the
        // original question — only the gateway sees the wrapped version.
        const messageToGateway =
          baselineLength === 0 ? wrapFirstMessage(req.question) : req.question;

        // Submit the user turn. Gateway is async: returns {runId, status, messageSeq}.
        console.log(
          `[claude-code-ask] sending to gateway key="${gatewayKey}" idemp="${askEnvelope.msgId}" (baseline=${baselineLength})`
        );
        try {
          const sendResult = await deps.callGateway("sessions.send", {
            key: gatewayKey,
            idempotencyKey: askEnvelope.msgId,
            message: messageToGateway,
          });
          console.log(
            `[claude-code-ask] send returned ${JSON.stringify(sendResult).slice(0, 200)}`
          );
        } catch (sendErr) {
          console.warn(
            `[claude-code-ask] sessions.send threw for "${gatewayKey}": ${(sendErr as Error).message}`
          );
          throw sendErr;
        }

        // Poll sessions.get until the assistant reply appears.
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
      draftAgentId = deps.openclawAgentId;
    } else {
      // -----------------------------------------------------------------------
      // Non-OpenClaw path — dispatch through the runtime adapter.
      // -----------------------------------------------------------------------
      const adapter = await deps.registry.adapter(sessionRuntimeId);
      if (!adapter) {
        throw new Error(`runtime '${sessionRuntimeId}' has no adapter`);
      }
      // Capability gate: adapter must support sessions.send.
      await requireCapability(adapter, "sessions.send", sessionRuntimeId);

      // Establish (or reuse) the runtime-native session key.
      let runtimeSessionKey = session.runtimeSessionKey;
      if (!runtimeSessionKey) {
        // First turn: ask the adapter to create a session.
        await requireCapability(adapter, "sessions.create", sessionRuntimeId);
        const create = await adapter.invokeAction(
          "sessions.create",
          { agentName: session.agentName },
          { actor: SYSTEM_ACTOR },
        );
        if (!create.ok) {
          throw new Error(
            `sessions.create on '${sessionRuntimeId}' failed: ${(create as { error?: string }).error ?? "unknown"}`
          );
        }
        const native = (create.nativeResult ?? {}) as Record<string, unknown>;
        const resolvedKey =
          (typeof native.key === "string" && native.key) ||
          (typeof native.sessionKey === "string" && native.sessionKey) ||
          (typeof native.id === "string" && native.id) ||
          null;
        if (!resolvedKey) {
          throw new Error(`sessions.create on '${sessionRuntimeId}' did not return a key`);
        }
        runtimeSessionKey = resolvedKey;
        // Persist the key so subsequent turns reuse the same adapter session.
        session = await setRuntimeSessionKey(deps.sessionsPath, session.id, runtimeSessionKey);
      }

      // Send the prompt with awaitCompletion semantics.
      const send = await adapter.invokeAction(
        "sessions.send",
        {
          sessionKey: runtimeSessionKey,
          message: req.question,
          awaitCompletion: true,
          timeoutMs: deps.replyTimeoutMs ?? 120000,
        },
        { actor: SYSTEM_ACTOR },
      );
      if (!send.ok) {
        throw new Error(
          `sessions.send on '${sessionRuntimeId}' failed: ${(send as { error?: string }).error ?? "unknown"}`
        );
      }
      const sendNative = (send.nativeResult ?? {}) as Record<string, unknown>;
      const draftText = typeof sendNative.assistantText === "string"
        ? sendNative.assistantText.trim()
        : "";
      if (!draftText) {
        throw new Error(`empty assistantText from '${sessionRuntimeId}'`);
      }
      // Non-OpenClaw adapters don't emit control tags; skip stripping.
      draft = draftText;
      draftAgentId = session.agentName ?? sessionRuntimeId;
    }

    // Construct the draft's envelope. Author = agent composing the reply.
    const draftEnvelope: CCEnvelope = normalizeEnvelope(
      {
        message: draft,
        parentMsgId: askEnvelope.msgId,
        state: "review_ready",
        intent: askEnvelope.intent,
        // If the ask was a question, the draft is (likely) a decision; otherwise we don't know.
        artifact: askEnvelope.artifact === "question" ? "decision" : "none",
      },
      {
        authorContext: { kind: "agent", id: draftAgentId },
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
      // Same id and author as the draft; only the state advances to done.
      const answerEnvelope: CCEnvelope = { ...draftEnvelope, state: "done" };
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
      // Operator takes over authorship of the draft; id reused, state advances.
      // NOTE(phase-2): "default" is a placeholder for multi-operator identity.
      const operatorEnvelope: CCEnvelope = {
        ...draftEnvelope,
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
