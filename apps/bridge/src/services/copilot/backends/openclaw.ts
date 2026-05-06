import type { ChatBackendAdapter, ChatTurnRequest, ChatTurnResult, SessionBootstrap } from "../backend.js";

export type OpenclawChatBackendDeps = {
  callGateway: (method: string, params?: Record<string, unknown>) => Promise<unknown>;
  replyPollIntervalMs?: number;   // default 500
  replyTimeoutMs?: number;        // default 120000
};

type GatewayMessage = {
  role?: string;
  content?: Array<{ type?: string; text?: string }>;
};

const PREAMBLE = [
  "[Persistent system instructions for this OpenClaw session]",
  "",
  "You are the Dashboard Copilot for OpenClaw-Manager. You are talking to a",
  "human operator inside a dashboard chat panel.",
  "",
  "Tone:",
  "- Helpful, terse, technical. No warm-up pleasantries.",
  "- Lead with the answer or the specific clarifying question.",
  "- Reply in English unless the operator writes in another language.",
  "",
  "Scope:",
  "- You can explain the system, suggest changes, walk through code, interpret",
  "  logs, and propose runbooks.",
  "- You CANNOT make dashboard changes, edit files, restart services, or run",
  "  arbitrary commands from this chat. The dashboard does not yet expose",
  "  those tools to you. If the operator asks you to perform such an action,",
  "  say so clearly and offer the closest informational answer.",
  "- If the operator asks for a destructive action, do not pretend you executed",
  "  it. State the limitation honestly.",
  "",
  "Grounding:",
  "- Distinguish what you have been told vs. what you would need to look up.",
  "  When you are uncertain, say so.",
  "- Refer to files by absolute path or the canonical repo path. Do not invent",
  "  file names.",
].join("\n");

function deriveKey(sessionId: string): string { return `copilot-${sessionId}`; }

function extractAssistantText(messages: GatewayMessage[]): string | null {
  const last = messages[messages.length - 1];
  if (!last || last.role !== "assistant") return null;
  const text = last.content?.find((p) => p.type === "text" && typeof p.text === "string")?.text;
  return text ?? null;
}

function wrapFirstMessage(userText: string): string {
  return `${PREAMBLE}\n\n---\n\n${userText}`;
}

async function ensureSession(callGateway: OpenclawChatBackendDeps["callGateway"], key: string): Promise<number> {
  await callGateway("sessions.create", { key });
  const state = (await callGateway("sessions.get", { key })) as { messages?: GatewayMessage[] };
  return state?.messages?.length ?? 0;
}

async function pollForReply(
  callGateway: OpenclawChatBackendDeps["callGateway"],
  key: string,
  baselineLength: number,
  timeoutMs: number,
  intervalMs: number,
): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, intervalMs));
    const state = (await callGateway("sessions.get", { key })) as { messages?: GatewayMessage[] };
    const messages = state?.messages ?? [];
    if (messages.length > baselineLength) {
      const text = extractAssistantText(messages);
      if (text) return text;
    }
  }
  throw new Error("timeout waiting for OpenClaw reply");
}

export function createOpenclawChatBackend(deps: OpenclawChatBackendDeps): ChatBackendAdapter {
  const intervalMs = deps.replyPollIntervalMs ?? 500;
  const timeoutMs = deps.replyTimeoutMs ?? 120000;

  return {
    async createSession({ sessionId }): Promise<SessionBootstrap> {
      const key = deriveKey(sessionId);
      await deps.callGateway("sessions.create", { key });
      return { openclawSessionKey: key };
    },
    async sendTurn(req: ChatTurnRequest): Promise<ChatTurnResult> {
      const key = req.session.openclawSessionKey ?? deriveKey(req.session.id);
      try {
        const baseline = await ensureSession(deps.callGateway, key);
        const message = baseline === 0 ? wrapFirstMessage(req.userMessageText) : req.userMessageText;
        await deps.callGateway("sessions.send", { key, idempotencyKey: req.msgId, message });
        const assistantText = await pollForReply(deps.callGateway, key, baseline, timeoutMs, intervalMs);
        return { ok: true, assistantText };
      } catch (e) {
        return { ok: false, error: (e as Error).message };
      }
    },
  };
}
