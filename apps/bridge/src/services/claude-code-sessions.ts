import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import type {
  ClaudeCodeSession,
  ClaudeCodeSessionMode,
} from "@openclaw-manager/types";

type CreateArgs = { ide: string; workspace: string; openclawSessionId: string };

function normalize(workspace: string): string {
  return workspace.trim().replace(/\\/g, "/").toLowerCase();
}

export function computeSessionId(ide: string, workspace: string): string {
  const input = `${ide.trim().toLowerCase()}:${normalize(workspace)}`;
  return crypto.createHash("sha256").update(input).digest("hex").slice(0, 12);
}

export function deriveDisplayName(ide: string, workspace: string): string {
  const base = path.basename(normalize(workspace)) || workspace;
  return `${ide}@${base}`;
}

async function readFile(p: string): Promise<{ sessions: ClaudeCodeSession[] }> {
  try {
    const raw = await fs.readFile(p, "utf8");
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed?.sessions)) return { sessions: parsed.sessions };
    return { sessions: [] };
  } catch {
    return { sessions: [] };
  }
}

async function writeFile(p: string, data: { sessions: ClaudeCodeSession[] }): Promise<void> {
  await fs.mkdir(path.dirname(p), { recursive: true });
  const tmp = `${p}.tmp-${process.pid}-${Date.now()}`;
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), "utf8");
  await fs.rename(tmp, p);
}

export async function listSessions(p: string): Promise<ClaudeCodeSession[]> {
  const { sessions } = await readFile(p);
  return sessions;
}

export async function createSession(p: string, args: CreateArgs): Promise<ClaudeCodeSession> {
  const { sessions } = await readFile(p);
  const id = computeSessionId(args.ide, args.workspace);
  const now = new Date().toISOString();
  const existing = sessions.find((s) => s.id === id);
  if (existing) return existing;
  const session: ClaudeCodeSession = {
    id,
    displayName: deriveDisplayName(args.ide, args.workspace),
    ide: args.ide,
    workspace: args.workspace,
    mode: "agent",
    state: "active",
    openclawSessionId: args.openclawSessionId,
    createdAt: now,
    lastActivityAt: now,
    messageCount: 0,
  };
  sessions.push(session);
  await writeFile(p, { sessions });
  return session;
}

export async function getOrCreateSession(p: string, args: CreateArgs): Promise<ClaudeCodeSession> {
  return createSession(p, args);
}

async function updateSession(
  p: string,
  id: string,
  fn: (s: ClaudeCodeSession) => ClaudeCodeSession
): Promise<ClaudeCodeSession> {
  const { sessions } = await readFile(p);
  const idx = sessions.findIndex((s) => s.id === id);
  if (idx === -1) throw new Error(`Session not found: ${id}`);
  sessions[idx] = fn(sessions[idx]!);
  await writeFile(p, { sessions });
  return sessions[idx]!;
}

export async function setSessionMode(p: string, id: string, mode: ClaudeCodeSessionMode) {
  return updateSession(p, id, (s) => ({ ...s, mode }));
}

export async function renameSession(p: string, id: string, displayName: string) {
  return updateSession(p, id, (s) => ({ ...s, displayName }));
}

export async function endSession(p: string, id: string) {
  return updateSession(p, id, (s) => ({ ...s, state: "ended" }));
}

export async function resurrectSession(p: string, id: string) {
  return updateSession(p, id, (s) => ({ ...s, state: "active" }));
}

export async function touchSession(p: string, id: string) {
  return updateSession(p, id, (s) => ({
    ...s,
    lastActivityAt: new Date().toISOString(),
    messageCount: s.messageCount + 1,
  }));
}
