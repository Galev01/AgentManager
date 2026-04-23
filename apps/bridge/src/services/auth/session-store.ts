// apps/bridge/src/services/auth/session-store.ts
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import type { AuthSession } from "@openclaw-manager/types";
import { writeJsonAtomic, readJsonOrDefault } from "../atomic-file.js";

export type SessionStoreConfig = { dir: string; ttlMs: number; lastSeenThrottleMs: number };

export type CreateSessionInput = {
  userId: string;
  origin: "local" | "oidc";
  userAgent?: string;
  ip?: string;
};

export type SessionStore = {
  create(input: CreateSessionInput): Promise<AuthSession>;
  get(sid: string): Promise<AuthSession | null>;
  touch(sid: string): Promise<AuthSession | null>;
  revoke(sid: string): Promise<void>;
  revokeAllForUser(userId: string): Promise<number>;
  listForUser(userId: string): Promise<AuthSession[]>;
  sweep(): Promise<number>;
};

function newSid(): string { return crypto.randomBytes(32).toString("base64url"); }
function fileFor(dir: string, sid: string): string {
  if (!/^[A-Za-z0-9_-]+$/.test(sid)) throw new Error("invalid sid");
  return path.join(dir, `${sid}.json`);
}

export function createSessionStore(cfg: SessionStoreConfig): SessionStore {
  return {
    async create(input) {
      const now = new Date();
      const sess: AuthSession = {
        id: newSid(),
        userId: input.userId,
        createdAt: now.toISOString(),
        lastSeenAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + cfg.ttlMs).toISOString(),
        origin: input.origin,
        userAgent: input.userAgent,
        ip: input.ip,
      };
      await writeJsonAtomic(fileFor(cfg.dir, sess.id), sess);
      return sess;
    },
    async get(sid) {
      const sess = await readJsonOrDefault<AuthSession | null>(fileFor(cfg.dir, sid), null);
      if (!sess) return null;
      if (new Date(sess.expiresAt).getTime() <= Date.now()) {
        await fs.unlink(fileFor(cfg.dir, sid)).catch(() => undefined);
        return null;
      }
      if (sess.revokedAt) return null;
      return sess;
    },
    async touch(sid) {
      const sess = await this.get(sid);
      if (!sess) return null;
      if (Date.now() - new Date(sess.lastSeenAt).getTime() < cfg.lastSeenThrottleMs) return sess;
      const next: AuthSession = { ...sess, lastSeenAt: new Date().toISOString() };
      await writeJsonAtomic(fileFor(cfg.dir, sid), next);
      return next;
    },
    async revoke(sid) { await fs.unlink(fileFor(cfg.dir, sid)).catch(() => undefined); },
    async revokeAllForUser(userId) {
      let count = 0;
      let entries: string[] = [];
      try { entries = await fs.readdir(cfg.dir); } catch { return 0; }
      for (const e of entries) {
        if (!e.endsWith(".json")) continue;
        const full = path.join(cfg.dir, e);
        try {
          const sess: AuthSession = JSON.parse(await fs.readFile(full, "utf8"));
          if (sess.userId === userId) { await fs.unlink(full).catch(() => undefined); count++; }
        } catch {}
      }
      return count;
    },
    async listForUser(userId) {
      let entries: string[] = [];
      try { entries = await fs.readdir(cfg.dir); } catch { return []; }
      const out: AuthSession[] = [];
      const now = Date.now();
      for (const e of entries) {
        if (!e.endsWith(".json")) continue;
        try {
          const sess: AuthSession = JSON.parse(await fs.readFile(path.join(cfg.dir, e), "utf8"));
          if (sess.userId !== userId) continue;
          if (new Date(sess.expiresAt).getTime() <= now) continue;
          if (sess.revokedAt) continue;
          out.push(sess);
        } catch {}
      }
      return out;
    },
    async sweep() {
      let entries: string[] = [];
      try { entries = await fs.readdir(cfg.dir); } catch { return 0; }
      const now = Date.now();
      let n = 0;
      for (const e of entries) {
        if (!e.endsWith(".json")) continue;
        const full = path.join(cfg.dir, e);
        try {
          const sess: AuthSession = JSON.parse(await fs.readFile(full, "utf8"));
          if (new Date(sess.expiresAt).getTime() <= now) { await fs.unlink(full).catch(() => undefined); n++; }
        } catch { await fs.unlink(full).catch(() => undefined); n++; }
      }
      return n;
    },
  };
}
