import { callGateway } from "../gateway.js";
import { config } from "../../config.js";
import { buildReviewPrompt } from "./prompt.js";

export type RunResult = { sessionId: string; markdown: string };

function pickString(obj: unknown, keys: string[]): string | undefined {
  if (!obj || typeof obj !== "object") return undefined;
  const rec = obj as Record<string, unknown>;
  for (const k of keys) {
    const v = rec[k];
    if (typeof v === "string" && v.length > 0) return v;
  }
  return undefined;
}

async function getSessionState(sessionId: string): Promise<{
  state: string | undefined;
  lastAssistant: string | undefined;
}> {
  // sessions.list returns all sessions — find ours and read its state + latest message
  const list = await callGateway("sessions.list", {}) as unknown;
  const sessions = Array.isArray(list) ? list : (list as { sessions?: unknown[] })?.sessions;
  if (!Array.isArray(sessions)) return { state: undefined, lastAssistant: undefined };
  const match = sessions.find((s: any) => s?.id === sessionId) as Record<string, unknown> | undefined;
  if (!match) return { state: undefined, lastAssistant: undefined };
  const state = pickString(match, ["state", "status"]);
  const lastAssistant = pickString(match, ["lastAssistantMessage", "lastMessage", "lastOutput"]);
  return { state, lastAssistant };
}

async function getFinalMessage(sessionId: string): Promise<string | undefined> {
  // Try sessions.usage first (some SDK builds return full transcript here), fall back to list.
  try {
    const usage = await callGateway("sessions.usage", { session: sessionId }) as unknown;
    if (usage && typeof usage === "object") {
      const transcript = (usage as Record<string, unknown>).transcript;
      if (Array.isArray(transcript)) {
        for (let i = transcript.length - 1; i >= 0; i--) {
          const msg = transcript[i] as Record<string, unknown>;
          if (msg?.role === "assistant" && typeof msg.content === "string") {
            return msg.content;
          }
        }
      }
      const last = pickString(usage as object, ["lastAssistantMessage", "lastMessage"]);
      if (last) return last;
    }
  } catch {
    // ignore, fall through
  }
  const { lastAssistant } = await getSessionState(sessionId);
  return lastAssistant;
}

export async function runReview(opts: {
  projectName: string;
  projectPath: string;
  reportDate: string;
}): Promise<RunResult> {
  const created = await callGateway("sessions.create", { cwd: opts.projectPath }) as unknown;
  const sessionId = pickString(created, ["id", "sessionId"]);
  if (!sessionId) throw new Error("sessions.create did not return a session id");

  const prompt = buildReviewPrompt(opts);
  await callGateway("sessions.send", { session: sessionId, message: prompt });

  const started = Date.now();
  const terminalStates = new Set(["done", "completed", "finished", "idle", "stopped"]);
  const errorStates = new Set(["error", "failed", "aborted"]);

  while (true) {
    if (Date.now() - started > config.reviewerTimeoutMs) {
      try { await callGateway("sessions.abort", { session: sessionId }); } catch {}
      throw new Error(`timeout after ${config.reviewerTimeoutMs}ms`);
    }
    await new Promise((r) => setTimeout(r, 3000));
    const { state } = await getSessionState(sessionId);
    if (state && errorStates.has(state.toLowerCase())) {
      throw new Error(`session ended in ${state} state`);
    }
    if (state && terminalStates.has(state.toLowerCase())) break;
  }

  const final = await getFinalMessage(sessionId);
  if (!final) throw new Error("no assistant output found for session");
  const trimmed = final.trim();
  if (!trimmed.startsWith("# Codebase Review")) {
    throw new Error("agent output did not follow the required template");
  }
  return { sessionId, markdown: trimmed };
}
