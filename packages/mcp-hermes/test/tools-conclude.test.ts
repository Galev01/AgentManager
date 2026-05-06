import { describe, it, expect } from "vitest";
import { handleHermesConclude } from "../src/tools.js";
import { SessionStore } from "../src/sessions.js";

describe("hermes_conclude handler", () => {
  it("concludes most recent when no id given", async () => {
    const store = new SessionStore(() => 1);
    const a = store.getOrCreate("c1");
    const r = await handleHermesConclude({
      args: { summary: "wrapped" }, clientId: "c1", store, shim: {} as any,
    });
    const parsed = JSON.parse(r.text);
    expect(parsed.status).toBe("concluded");
    expect(parsed.session_id).toBe(a.sessionId);
    expect(store.get("c1", a.sessionId)?.lastSummary).toBe("wrapped");
  });

  it("returns no-session if nothing to conclude", async () => {
    const store = new SessionStore();
    const r = await handleHermesConclude({ args: {}, clientId: "c1", store, shim: {} as any });
    expect(r.text).toBe("no session to conclude");
  });

  it("concludes by explicit id", async () => {
    const store = new SessionStore();
    const a = store.getOrCreate("c1", "fixed-id");
    await handleHermesConclude({
      args: { session_id: "fixed-id" }, clientId: "c1", store, shim: {} as any,
    });
    expect(store.get("c1", a.sessionId)?.status).toBe("concluded");
  });
});
