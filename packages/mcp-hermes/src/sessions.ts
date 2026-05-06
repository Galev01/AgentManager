import { randomUUID } from "node:crypto";

export type SessionStatus = "active" | "concluded";

export interface SessionEntry {
  sessionId: string;
  messageCount: number;
  status: SessionStatus;
  startedAt: number;
  lastSummary?: string;
}

type Now = () => number;

export class SessionStore {
  private byClient = new Map<string, Map<string, SessionEntry>>();

  constructor(private now: Now = () => Date.now()) {}

  private clientMap(clientId: string): Map<string, SessionEntry> {
    let m = this.byClient.get(clientId);
    if (!m) { m = new Map(); this.byClient.set(clientId, m); }
    return m;
  }

  getOrCreate(clientId: string, sessionId?: string): SessionEntry {
    const m = this.clientMap(clientId);
    if (sessionId && m.has(sessionId)) return m.get(sessionId)!;
    const id = sessionId ?? randomUUID();
    const entry: SessionEntry = {
      sessionId: id,
      messageCount: 0,
      status: "active",
      startedAt: this.now(),
    };
    m.set(id, entry);
    return entry;
  }

  get(clientId: string, sessionId: string): SessionEntry | undefined {
    return this.byClient.get(clientId)?.get(sessionId);
  }

  incrementMessageCount(clientId: string, sessionId: string): void {
    const e = this.get(clientId, sessionId);
    if (e) e.messageCount += 1;
  }

  conclude(clientId: string, sessionId: string, summary?: string): void {
    const e = this.get(clientId, sessionId);
    if (!e) return;
    e.status = "concluded";
    if (summary) e.lastSummary = summary;
  }

  getMostRecent(clientId: string): SessionEntry | undefined {
    const m = this.byClient.get(clientId);
    if (!m) return undefined;
    let best: SessionEntry | undefined;
    for (const e of m.values()) {
      if (!best || e.startedAt > best.startedAt) best = e;
    }
    return best;
  }
}
