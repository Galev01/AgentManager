import fs from "node:fs/promises";
import path from "node:path";
import { callGateway } from "./gateway.js";
import { config } from "../config.js";

type CreatedSession = { key?: string; sessionId?: string; id?: string; entry?: { sessionFile?: string } };
type SessionsListEntry = { sessionId?: string; id?: string; status?: string; abortedLastRun?: boolean };

const POLL_MS = 3_000;

export function sessionFilePath(created: CreatedSession, sessionId: string): string {
  if (created.entry?.sessionFile) return created.entry.sessionFile;
  if (config.sessionsDir) return path.join(config.sessionsDir, `${sessionId}.jsonl`);
  throw new Error("cannot locate session file");
}

export async function readLastAssistantMessage(sessionFile: string): Promise<string | undefined> {
  let raw: string;
  try { raw = await fs.readFile(sessionFile, "utf8"); } catch { return undefined; }
  const lines = raw.split(/\r?\n/).filter((l) => l.trim());
  for (let i = lines.length - 1; i >= 0; i--) {
    let entry: any;
    try { entry = JSON.parse(lines[i]!); } catch { continue; }
    if (entry?.type !== "message") continue;
    const msg = entry.message;
    if (!msg || msg.role !== "assistant") continue;
    const c = msg.content;
    if (typeof c === "string") return c;
    if (Array.isArray(c)) {
      const parts = c
        .filter((p: any) => p?.type === "text" && typeof p.text === "string")
        .map((p: any) => p.text as string);
      if (parts.length) return parts.join("");
    }
  }
  return undefined;
}

export async function waitForSessionTerminal(
  sessionId: string,
  timeoutMs: number,
  onTimeoutAbort?: () => Promise<void>
): Promise<void> {
  const started = Date.now();
  const terminal = new Set(["done", "completed", "finished", "stopped"]);
  const errored = new Set(["error", "failed", "aborted"]);
  while (true) {
    if (Date.now() - started > timeoutMs) {
      if (onTimeoutAbort) await onTimeoutAbort().catch(() => {});
      throw new Error(`session timeout after ${timeoutMs}ms`);
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
    const raw = (await callGateway("sessions.list", {})) as unknown;
    const list = Array.isArray(raw)
      ? (raw as SessionsListEntry[])
      : ((raw as { sessions?: SessionsListEntry[] })?.sessions ?? []);
    const s = list.find((e) => e.sessionId === sessionId || e.id === sessionId);
    if (!s) continue;
    const state = (s.status || "").toLowerCase();
    if (s.abortedLastRun || errored.has(state)) throw new Error(`session ended in ${state || "aborted"} state`);
    if (terminal.has(state)) return;
  }
}
