import { describe, it, expect } from "vitest";
import { handleHermesSessionInfo } from "../src/tools.js";
import { SessionStore } from "../src/sessions.js";

describe("hermes_session_info handler", () => {
  it("returns most recent when no id provided", async () => {
    let now = 1000;
    const store = new SessionStore(() => now);
    store.getOrCreate("c1");
    now += 100;
    const b = store.getOrCreate("c1");
    const r = await handleHermesSessionInfo({ args: {}, clientId: "c1", store, shim: {} as any });
    const parsed = JSON.parse(r.text);
    expect(parsed.session_id).toBe(b.sessionId);
    expect(parsed.status).toBe("active");
  });

  it("returns specific session when id given", async () => {
    const store = new SessionStore(() => 1234);
    const a = store.getOrCreate("c1");
    store.incrementMessageCount("c1", a.sessionId);
    const r = await handleHermesSessionInfo({
      args: { session_id: a.sessionId }, clientId: "c1", store, shim: {} as any,
    });
    const parsed = JSON.parse(r.text);
    expect(parsed.session_id).toBe(a.sessionId);
    expect(parsed.message_count).toBe(1);
    expect(parsed.started_at).toBe(1234);
  });

  it("returns status:unknown for missing session", async () => {
    const store = new SessionStore();
    const r = await handleHermesSessionInfo({
      args: { session_id: "nope" }, clientId: "c1", store, shim: {} as any,
    });
    const parsed = JSON.parse(r.text);
    expect(parsed.status).toBe("unknown");
    expect(parsed.session_id).toBe("nope");
  });

  it("returns no-session text when no id and no recent", async () => {
    const store = new SessionStore();
    const r = await handleHermesSessionInfo({ args: {}, clientId: "c1", store, shim: {} as any });
    expect(r.text).toBe("no session yet");
  });
});
