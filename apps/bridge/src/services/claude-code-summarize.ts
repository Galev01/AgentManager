import type { ClaudeCodeTranscriptEvent } from "@openclaw-manager/types";

/**
 * Generates a concise summary of a Claude Code session by sending the
 * conversation transcript to the OpenClaw gateway for LLM summarization.
 *
 * Uses a disposable session key so the summary prompt does not pollute the
 * real Claude Code session history.
 */

type SummarizeDeps = {
  callGateway: (method: string, params?: Record<string, unknown>) => Promise<unknown>;
  agentId?: string;
};

type GatewayMessage = {
  role?: string;
  content?: Array<{ type?: string; text?: string }>;
};

function buildSummarizationPrompt(events: ClaudeCodeTranscriptEvent[]): string {
  const answeredMsgIds = new Set(
    events
      .filter((event) => event.kind === "answer" && typeof event.msgId === "string")
      .map((event) => event.msgId as string)
  );

  const turns: string[] = [];
  for (const event of events) {
    if (event.kind === "ask" && event.question) {
      turns.push(`[Claude Code]: ${event.question}`);
      continue;
    }
    if (
      event.kind === "draft" &&
      event.draft &&
      (!event.msgId || !answeredMsgIds.has(event.msgId))
    ) {
      turns.push(`[OpenClaw draft]: ${event.draft}`);
      continue;
    }
    if (event.kind === "answer" && event.answer) {
      const label = event.source === "operator" ? "Operator" : "OpenClaw";
      turns.push(`[${label}]: ${event.answer}`);
      continue;
    }
    if (event.kind === "discarded") {
      turns.push("[System]: Operator discarded the draft reply.");
      continue;
    }
    if (event.kind === "timeout") {
      turns.push("[System]: Operator approval timed out.");
      continue;
    }
    if (event.kind === "mode_change" && event.from && event.to) {
      turns.push(`[System]: Session mode changed from ${event.from} to ${event.to}.`);
      continue;
    }
    if (event.kind === "ended") {
      turns.push("[System]: Session ended.");
    }
  }

  if (turns.length === 0) return "";

  const maxTurns = 12;
  let compactTranscript: string;
  if (turns.length > maxTurns) {
    const head = turns.slice(0, 4).join("\n\n");
    const tail = turns.slice(-4).join("\n\n");
    compactTranscript = `${head}\n\n[... ${turns.length - 8} turns omitted ...]\n\n${tail}`;
  } else {
    compactTranscript = turns.join("\n\n");
  }

  return [
    "Summarize this Claude Code and OpenClaw conversation in 2-3 sentences.",
    "Focus on: (1) what was requested or discussed, (2) the core idea, recommendation, or decision, (3) the current status or blocker.",
    "Be concise and specific. Return only the summary text, with no preamble.",
    "",
    "--- Conversation ---",
    compactTranscript,
    "--- End ---",
  ].join("\n");
}

function extractAssistantText(messages: GatewayMessage[]): string | null {
  const last = messages[messages.length - 1];
  if (!last || last.role !== "assistant") return null;
  const textPart = last.content?.find(
    (part) => part.type === "text" && typeof part.text === "string"
  );
  return textPart?.text ?? null;
}

export async function summarizeSession(
  events: ClaudeCodeTranscriptEvent[],
  deps: SummarizeDeps
): Promise<string | null> {
  const prompt = buildSummarizationPrompt(events);
  if (!prompt) return null;

  const agentId = deps.agentId || "main";
  const tempKey = `agent:${agentId}:cc-summary-${Date.now()}`;
  let tempSessionId: string | null = null;

  try {
    const created = (await deps.callGateway("sessions.create", {
      key: tempKey,
    })) as { sessionId?: string; id?: string } | undefined;
    tempSessionId = created?.sessionId || created?.id || null;
  } catch {
    // Session creation is best-effort; sending to the key can still succeed.
  }

  const cleanup = () =>
    deps.callGateway(
      "sessions.delete",
      tempSessionId ? { session: tempSessionId } : { key: tempKey }
    ).catch(() => {});

  try {
    await deps.callGateway("sessions.send", {
      key: tempKey,
      message: prompt,
    });

    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 400));
      const state = (await deps.callGateway("sessions.get", {
        key: tempKey,
      })) as { messages?: GatewayMessage[] };
      const messages = state?.messages ?? [];
      if (messages.length < 2) continue;

      const text = extractAssistantText(messages);
      if (!text) continue;

      cleanup();
      return text.trim();
    }

    cleanup();
    return null;
  } catch (error) {
    console.warn(`[claude-code-summarize] failed: ${(error as Error).message}`);
    cleanup();
    return null;
  }
}
