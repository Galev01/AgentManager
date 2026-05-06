import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import type {
  CopilotSessionMeta, CopilotMessage, CopilotPendingTurn, BackendKind,
} from "@openclaw-manager/types";

export type CopilotStoreDeps = { rootDir: string };

export type CopilotStore = {
  createSession(args: {
    ownerUserId: string;
    backend: BackendKind;
    title?: string;
    openclawSessionKey?: string;
  }): Promise<CopilotSessionMeta>;
  readMeta(sessionId: string): Promise<CopilotSessionMeta | null>;
  updateMeta(sessionId: string, patch: Partial<CopilotSessionMeta>): Promise<CopilotSessionMeta>;
  listSessionsForOwner(ownerUserId: string, limit?: number): Promise<CopilotSessionMeta[]>;
  appendMessage(sessionId: string, msg: CopilotMessage): Promise<void>;
  readMessages(sessionId: string, limit: number): Promise<CopilotMessage[]>;
  writePending(sessionId: string, p: CopilotPendingTurn): Promise<void>;
  readPending(sessionId: string): Promise<CopilotPendingTurn | null>;
  clearPending(sessionId: string): Promise<void>;
  deleteSession(sessionId: string): Promise<void>;
  listAllNonTerminalPending(): Promise<Array<{ sessionId: string; pending: CopilotPendingTurn }>>;
};

const TERMINAL: ReadonlyArray<CopilotPendingTurn["state"]> = ["done", "error", "timeout"];

function sessionDir(root: string, id: string): string { return path.join(root, "sessions", id); }
function metaPath(root: string, id: string): string { return path.join(sessionDir(root, id), "meta.json"); }
function transcriptPath(root: string, id: string): string { return path.join(sessionDir(root, id), "transcript.jsonl"); }
function pendingPath(root: string, id: string): string { return path.join(sessionDir(root, id), "pending.json"); }

async function atomicWriteJson(p: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(p), { recursive: true });
  const tmp = `${p}.tmp-${process.pid}-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
  await fs.writeFile(tmp, JSON.stringify(value, null, 2) + "\n", "utf8");
  await fs.rename(tmp, p);
}

async function readJsonOrNull<T>(p: string): Promise<T | null> {
  try { return JSON.parse(await fs.readFile(p, "utf8")) as T; }
  catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw e;
  }
}

export function createCopilotStore(deps: CopilotStoreDeps): CopilotStore {
  const root = deps.rootDir;

  async function readMeta(id: string): Promise<CopilotSessionMeta | null> {
    return readJsonOrNull<CopilotSessionMeta>(metaPath(root, id));
  }

  async function writeMeta(meta: CopilotSessionMeta): Promise<void> {
    await atomicWriteJson(metaPath(root, meta.id), meta);
  }

  return {
    async createSession({ ownerUserId, backend, title, openclawSessionKey }) {
      const id = crypto.randomUUID();
      const meta: CopilotSessionMeta = {
        id, ownerUserId, backend,
        title: title ?? null,
        createdAt: Date.now(),
        lastTurnAt: null,
        ...(openclawSessionKey !== undefined ? { openclawSessionKey } : {}),
      };
      await writeMeta(meta);
      return meta;
    },
    readMeta,
    async updateMeta(id, patch) {
      const current = await readMeta(id);
      if (!current) throw new Error(`copilot session not found: ${id}`);
      const next: CopilotSessionMeta = { ...current, ...patch, id: current.id };
      await writeMeta(next);
      return next;
    },
    async listSessionsForOwner(ownerUserId, limit = 50) {
      const sessionsRoot = path.join(root, "sessions");
      let names: string[] = [];
      try { names = await fs.readdir(sessionsRoot); } catch { return []; }
      const out: CopilotSessionMeta[] = [];
      for (const id of names) {
        const meta = await readMeta(id);
        if (meta && meta.ownerUserId === ownerUserId) out.push(meta);
      }
      out.sort((a, b) => (b.lastTurnAt ?? b.createdAt) - (a.lastTurnAt ?? a.createdAt));
      return out.slice(0, limit);
    },
    async appendMessage(id, msg) {
      const dir = sessionDir(root, id);
      await fs.mkdir(dir, { recursive: true });
      await fs.appendFile(transcriptPath(root, id), JSON.stringify(msg) + "\n", "utf8");
    },
    async readMessages(id, limit) {
      let raw: string;
      try { raw = await fs.readFile(transcriptPath(root, id), "utf8"); } catch { return []; }
      const lines = raw.split("\n").filter((l) => l.length > 0);
      const tail = limit > 0 ? lines.slice(-limit) : lines;
      const out: CopilotMessage[] = [];
      for (const line of tail) {
        try { out.push(JSON.parse(line) as CopilotMessage); } catch { /* skip corrupt */ }
      }
      return out;
    },
    async writePending(id, p) { await atomicWriteJson(pendingPath(root, id), p); },
    async readPending(id) { return readJsonOrNull<CopilotPendingTurn>(pendingPath(root, id)); },
    async clearPending(id) {
      try { await fs.unlink(pendingPath(root, id)); }
      catch (e) { if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e; }
    },
    async deleteSession(id) {
      await fs.rm(sessionDir(root, id), { recursive: true, force: true });
    },
    async listAllNonTerminalPending() {
      const sessionsRoot = path.join(root, "sessions");
      let names: string[] = [];
      try { names = await fs.readdir(sessionsRoot); } catch { return []; }
      const out: Array<{ sessionId: string; pending: CopilotPendingTurn }> = [];
      for (const id of names) {
        const p = await readJsonOrNull<CopilotPendingTurn>(pendingPath(root, id));
        if (p && !TERMINAL.includes(p.state)) out.push({ sessionId: id, pending: p });
      }
      return out;
    },
  };
}
