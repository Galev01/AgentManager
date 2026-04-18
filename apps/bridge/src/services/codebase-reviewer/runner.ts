import fs from "node:fs/promises";
import path from "node:path";
import { callGateway } from "../gateway.js";
import { config } from "../../config.js";
import { buildReviewPrompt } from "./prompt.js";
import { buildProjectBrief } from "./project-brief.js";

export type RunResult = { sessionId: string; markdown: string };

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
      entry = JSON.parse(lines[i]);
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
        .filter((c) => c && c.type === "text" && typeof c.text === "string")
        .map((c) => c.text as string);
      if (parts.length) return parts.join("");
    }
  }
  return undefined;
}

export async function runReview(opts: {
  projectName: string;
  projectPath: string;
  reportDate: string;
}): Promise<RunResult> {
  const created = (await callGateway("sessions.create", {
    agentId: config.reviewerAgent,
  })) as CreatedSession;
  const sessionId = created.sessionId || created.id;
  const key = created.key;
  if (!sessionId) throw new Error("sessions.create did not return a session id");
  if (!key) throw new Error("sessions.create did not return a session key");
  const sessionFile = sessionFilePath(created, sessionId);

  const brief = await buildProjectBrief(opts.projectPath);
  const prompt = buildReviewPrompt({ ...opts, brief });
  await callGateway("sessions.send", { key, message: prompt });

  const started = Date.now();
  const terminal = new Set(["done", "completed", "finished", "stopped"]);
  const errored = new Set(["error", "failed", "aborted"]);

  while (true) {
    if (Date.now() - started > config.reviewerTimeoutMs) {
      try { await callGateway("sessions.abort", { key }); } catch {}
      throw new Error(`timeout after ${config.reviewerTimeoutMs}ms`);
    }
    await new Promise((r) => setTimeout(r, 5000));
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
  const idx = trimmed.indexOf("# Codebase Review");
  if (idx < 0) {
    throw new Error("agent output did not include a '# Codebase Review' heading");
  }
  return { sessionId, markdown: trimmed.slice(idx) };
}
