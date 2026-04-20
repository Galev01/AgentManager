import { callGateway } from "./gateway.js";
import type { CaptionsResult } from "./youtube-captions.js";
import {
  sessionFilePath,
  readLastAssistantMessage,
  waitForSessionTerminal,
} from "./openclaw-session-tail.js";

type CreatedSession = {
  ok?: boolean;
  key?: string;
  sessionId?: string;
  id?: string;
  entry?: { sessionFile?: string };
};

const TIMEOUT_MS = 120_000;

const SYSTEM_PROMPT = `You are a video summarizer. The user will give you the metadata and full transcript of a YouTube video. Produce a Markdown summary with this exact structure and nothing else:

# {title}

**Channel:** {channel}  **Duration:** {mm:ss}  **URL:** {url}

## TL;DR
A 2-3 sentence summary of what the video is about and its core claim.

## Key points
- 5-10 bullet points capturing the most important ideas, in the order they appear in the video.

## Notable quotes
- Up to 3 short verbatim quotes that are particularly insightful or memorable. Skip this section if there are none worth quoting.

## Takeaways
- 2-4 bullets on what the viewer should remember or do.

Write in the same language as the transcript. Do not invent facts not present in the transcript. Do not include any preamble, apology, or post-script — output only the markdown above.`;

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "??:??";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

function buildUserMessage(captions: CaptionsResult, url: string): string {
  return [
    SYSTEM_PROMPT,
    "",
    "---",
    "",
    `Title: ${captions.title}`,
    `Channel: ${captions.channel}`,
    `Duration: ${formatDuration(captions.durationSeconds)}`,
    `URL: ${url}`,
    `Language: ${captions.language}`,
    "",
    "Transcript:",
    captions.transcript,
  ].join("\n");
}

export type SummarizeResult = { sessionId: string; markdown: string };

export async function summarize(captions: CaptionsResult, url: string): Promise<SummarizeResult> {
  const created = (await callGateway("sessions.create", {})) as CreatedSession;
  const sessionId = created.sessionId || created.id;
  const key = created.key;
  if (!sessionId) throw new Error("sessions.create did not return a session id");
  if (!key) throw new Error("sessions.create did not return a session key");
  const sessionFile = sessionFilePath(created, sessionId);

  await callGateway("sessions.send", { key, message: buildUserMessage(captions, url) });

  await waitForSessionTerminal(sessionId, TIMEOUT_MS, async () => {
    try { await callGateway("sessions.abort", { key }); } catch {}
  });

  const final = await readLastAssistantMessage(sessionFile);
  if (!final) throw new Error(`no assistant output found in session file: ${sessionFile}`);
  const trimmed = final.trim();
  const idx = trimmed.indexOf("# ");
  if (idx < 0) {
    throw new Error("agent output did not include a top-level '# ' heading");
  }
  return { sessionId, markdown: trimmed.slice(idx) };
}
