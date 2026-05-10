import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import type {
  ClaudeCodeSession,
  ClaudeCodeSessionMode,
} from "@openclaw-manager/types";

type CreateArgs = {
  ide: string;
  workspace: string;
  clientId?: string;
  openclawSessionId?: string;
  /**
   * Runtime backing this session. Required for new records. Legacy reads
   * backfill via `backfillRuntimeId` (see below).
   */
  runtimeId: string;
};

export function deriveOpenclawSessionId(id: string): string {
  return `cc-${id}`;
}

function normalize(workspace: string): string {
  return workspace.trim().replace(/\\/g, "/").toLowerCase();
}

export function computeSessionId(
  ide: string,
  workspace: string,
  clientId?: string
): string {
  const input = clientId
    ? `${ide.trim().toLowerCase()}:${normalize(workspace)}:${clientId}`
    : `${ide.trim().toLowerCase()}:${normalize(workspace)}`;
  return crypto.createHash("sha256").update(input).digest("hex").slice(0, 12);
}

export function deriveDisplayName(
  ide: string,
  workspace: string,
  clientId?: string
): string {
  const base = path.basename(normalize(workspace)) || workspace;
  const suffix = clientId ? `/${clientId.replace(/^cc-/, "").slice(0, 6)}` : "";
  return `${ide}@${base}${suffix}`;
}

/**
 * Read-time backfill for sessions written before `runtimeId` was tracked.
 * Returns the legacy entry with `runtimeId` filled in (and a `_legacy: true`
 * marker so callers can decide whether to rewrite the file). Records that
 * already carry a non-empty `runtimeId` are returned unchanged.
 */
export type BackfilledSession = ClaudeCodeSession & { _legacy?: boolean };

export function backfillRuntimeId(
  raw: Partial<ClaudeCodeSession> & { id: string; openclawSessionId: string },
  fallbackRuntimeId: string
): BackfilledSession {
  const stored = typeof raw.runtimeId === "string" && raw.runtimeId.length > 0
    ? raw.runtimeId
    : null;
  if (stored) return raw as BackfilledSession;
  return { ...(raw as ClaudeCodeSession), runtimeId: fallbackRuntimeId, _legacy: true };
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

/**
 * Read sessions, applying read-time `runtimeId` backfill against the supplied
 * fallback (typically the bridge primary runtime id). The on-disk file is
 * NOT rewritten here; persistence happens on the next write through
 * `updateSession`.
 */
export async function listSessions(
  p: string,
  fallbackRuntimeId?: string
): Promise<ClaudeCodeSession[]> {
  const { sessions } = await readFile(p);
  if (!fallbackRuntimeId) return sessions;
  return sessions.map((s) => {
    const filled = backfillRuntimeId(s, fallbackRuntimeId);
    // Strip the _legacy marker for callers that don't care.
    const { _legacy: _omit, ...rest } = filled as BackfilledSession;
    return rest as ClaudeCodeSession;
  });
}

export async function createSession(p: string, args: CreateArgs): Promise<ClaudeCodeSession> {
  if (!args.runtimeId) {
    throw new Error("createSession requires runtimeId");
  }
  const { sessions } = await readFile(p);
  const id = computeSessionId(args.ide, args.workspace, args.clientId);
  const now = new Date().toISOString();
  const existingIdx = sessions.findIndex((s) => s.id === id);
  if (existingIdx !== -1) {
    const existing = sessions[existingIdx]!;
    // Backfill runtimeId on legacy records: if the on-disk record predates
    // Phase D, persist the resolved runtimeId on the next write.
    if (typeof existing.runtimeId === "string" && existing.runtimeId.length > 0) {
      return existing;
    }
    const filled: ClaudeCodeSession = { ...existing, runtimeId: args.runtimeId };
    sessions[existingIdx] = filled;
    await writeFile(p, { sessions });
    return filled;
  }
  const session: ClaudeCodeSession = {
    id,
    displayName: deriveDisplayName(args.ide, args.workspace, args.clientId),
    ide: args.ide,
    workspace: args.workspace,
    clientId: args.clientId,
    mode: "agent",
    state: "active",
    runtimeId: args.runtimeId,
    openclawSessionId: args.openclawSessionId ?? deriveOpenclawSessionId(id),
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
  fn: (s: ClaudeCodeSession) => ClaudeCodeSession,
  fallbackRuntimeId?: string,
): Promise<ClaudeCodeSession> {
  const { sessions } = await readFile(p);
  const idx = sessions.findIndex((s) => s.id === id);
  if (idx === -1) throw new Error(`Session not found: ${id}`);
  const current = sessions[idx]!;
  // Backfill runtimeId on the way through so updates always persist a complete
  // record, not a half-migrated one.
  const filled: ClaudeCodeSession =
    typeof current.runtimeId === "string" && current.runtimeId.length > 0
      ? current
      : { ...current, runtimeId: fallbackRuntimeId ?? "" };
  sessions[idx] = fn(filled);
  await writeFile(p, { sessions });
  return sessions[idx]!;
}

export async function setSessionMode(
  p: string,
  id: string,
  mode: ClaudeCodeSessionMode,
  fallbackRuntimeId?: string,
) {
  return updateSession(p, id, (s) => ({ ...s, mode }), fallbackRuntimeId);
}

export async function renameSession(
  p: string,
  id: string,
  displayName: string,
  fallbackRuntimeId?: string,
) {
  return updateSession(p, id, (s) => ({ ...s, displayName }), fallbackRuntimeId);
}

export async function endSession(p: string, id: string, fallbackRuntimeId?: string) {
  return updateSession(p, id, (s) => ({ ...s, state: "ended" }), fallbackRuntimeId);
}

export async function resurrectSession(p: string, id: string, fallbackRuntimeId?: string) {
  return updateSession(p, id, (s) => ({ ...s, state: "active" }), fallbackRuntimeId);
}

export async function touchSession(p: string, id: string, fallbackRuntimeId?: string) {
  return updateSession(p, id, (s) => ({
    ...s,
    lastActivityAt: new Date().toISOString(),
    messageCount: s.messageCount + 1,
  }), fallbackRuntimeId);
}

export async function setOpenclawSessionId(
  p: string,
  id: string,
  openclawSessionId: string,
  fallbackRuntimeId?: string,
) {
  return updateSession(p, id, (s) => ({ ...s, openclawSessionId }), fallbackRuntimeId);
}

export async function setSessionRuntime(
  p: string,
  id: string,
  runtimeId: string,
  agentName?: string,
) {
  return updateSession(p, id, (s) => ({
    ...s,
    runtimeId,
    ...(agentName !== undefined ? { agentName } : {}),
  }));
}

export async function setRuntimeSessionKey(
  p: string,
  id: string,
  runtimeSessionKey: string,
) {
  return updateSession(p, id, (s) => ({ ...s, runtimeSessionKey }));
}
