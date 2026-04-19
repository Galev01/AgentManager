import fs from "node:fs/promises";
import path from "node:path";
import { callGateway } from "./gateway.js";
import { config } from "../config.js";
import type { CaptionsResult } from "./youtube-captions.js";

type CreatedSession = {
  ok?: boolean;
  key?: string;
  sessionId?: string;
  id?: string;
  entry?: { sessionFile?: string };
};

type SessionsListEntry = {
  sessionId?: string;
  id?: string;
  status?: string;
  abortedLastRun?: boolean;
};

const TIMEOUT_MS = 120_000;
const POLL_INTERVAL_MS = 3_000;

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

function sessionFilePath(created: CreatedSession, sessionId: string): string {
  if (created.entry?.sessionFile) return created.entry.sessionFile;
  if (config.sessionsDir) return path.join(config.sessionsDir, `${sessionId}.jsonl`);
  throw new Error("cannot locate session file: SDK did not return it and OPENCLAW_SESSIONS_DIR is not set");
}

async function pollSessionStatus(sessionId: string): Promise<SessionsListEntry | undefined> {
  const raw = (await callGateway("sessions.list", {})) as unknown;
  const list = Array.isArray(raw)
    ? (raw as SessionsListEntry[])
    : ((raw as { sessions?: SessionsListEntry[] })?.sessions ?? []);
  return list.find((s) => s?.sessionId === sessionId || s?.id === sessionId);
}

async function readLastAssistantMessage(sessionFile: string): Promise<string | undefined> {
  let raw: string;
  try {
    raw = await fs.readFile(sessionFile, "utf8");
  } catch {
    return undefined;
  }
  const lines = raw.split(/\r?\n/).filter((l) => l.trim());
  for (let i = lines.length - 1; i >= 0; i--) {
    let entry: any;
    try {
      entry = JSON.parse(lines[i]!);
    } catch {
      continue;
    }
    if (entry?.type !== "message") continue;
    const msg = entry.message;
    if (!msg || msg.role !== "assistant") continue;
    const content = msg.content;
    if (typeof content === "string") return content;
    if (Array.isArray(content)) {
      const parts = content
        .filter((c: any) => c && c.type === "text" && typeof c.text === "string")
        .map((c: any) => c.text as string);
      if (parts.length) return parts.join("");
    }
  }
  return undefined;
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

  const started = Date.now();
  const terminal = new Set(["done", "completed", "finished", "stopped"]);
  const errored = new Set(["error", "failed", "aborted"]);

  while (true) {
    if (Date.now() - started > TIMEOUT_MS) {
      try { await callGateway("sessions.abort", { key }); } catch {}
      throw new Error(`session timeout after ${TIMEOUT_MS}ms`);
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    const s = await pollSessionStatus(sessionId);
    if (!s) continue;
    const state = typeof s.status === "string" ? s.status.toLowerCase() : "";
    if (s.abortedLastRun || errored.has(state)) {
      throw new Error(`session ended in ${state || "aborted"} state`);
    }
    if (terminal.has(state)) break;
  }

  const final = await readLastAssistantMessage(sessionFile);
  if (!final) throw new Error(`no assistant output found in session file: ${sessionFile}`);
  const trimmed = final.trim();
  const idx = trimmed.indexOf("# ");
  if (idx < 0) {
    throw new Error("agent output did not include a top-level '# ' heading");
  }
  return { sessionId, markdown: trimmed.slice(idx) };
}
