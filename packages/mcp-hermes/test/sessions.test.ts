import { describe, it, expect, beforeEach } from "vitest";
import { SessionStore } from "../src/sessions.js";

describe("SessionStore", () => {
  let store: SessionStore;
  beforeEach(() => { store = new SessionStore(() => 1_700_000_000_000); });

  it("creates a session with auto-generated id", () => {
    const s = store.getOrCreate("client-1");
    expect(s.sessionId).toMatch(/^[0-9a-f-]{36}$/);
    expect(s.messageCount).toBe(0);
    expect(s.status).toBe("active");
    expect(s.startedAt).toBe(1_700_000_000_000);
  });

  it("returns existing session for same id+client", () => {
    const a = store.getOrCreate("client-1");
    const b = store.getOrCreate("client-1", a.sessionId);
    expect(b.sessionId).toBe(a.sessionId);
  });

  it("creates new session when explicit id is unknown", () => {
    const s = store.getOrCreate("client-1", "unknown-id");
    expect(s.sessionId).toBe("unknown-id");
    expect(s.messageCount).toBe(0);
  });

  it("incrementMessageCount bumps count", () => {
    const s = store.getOrCreate("client-1");
    store.incrementMessageCount("client-1", s.sessionId);
    store.incrementMessageCount("client-1", s.sessionId);
    expect(store.get("client-1", s.sessionId)?.messageCount).toBe(2);
  });

  it("conclude marks status concluded", () => {
    const s = store.getOrCreate("client-1");
    store.conclude("client-1", s.sessionId, "done");
    const after = store.get("client-1", s.sessionId);
    expect(after?.status).toBe("concluded");
    expect(after?.lastSummary).toBe("done");
  });

  it("getMostRecent returns latest by startedAt", () => {
    let now = 1_700_000_000_000;
    const store2 = new SessionStore(() => now);
    const a = store2.getOrCreate("client-2");
    now += 1000;
    const b = store2.getOrCreate("client-2", "explicit-b");
    expect(store2.getMostRecent("client-2")?.sessionId).toBe(b.sessionId);
  });

  it("isolates sessions across clients", () => {
    const a = store.getOrCreate("client-A");
    const fromB = store.get("client-B", a.sessionId);
    expect(fromB).toBeUndefined();
  });
});
