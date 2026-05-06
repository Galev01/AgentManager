import { describe, it, expect, vi } from "vitest";
import { handleHermesSay } from "../src/tools.js";
import { SessionStore } from "../src/sessions.js";

describe("hermes_say handler", () => {
  it("creates session if none provided, calls shim, increments count", async () => {
    const store = new SessionStore(() => 1700);
    const shim = { chat: vi.fn().mockResolvedValue({ assistantText: "yo", elapsedMs: 12 }) };
    const result = await handleHermesSay({
      args: { message: "hi" },
      clientId: "c1",
      store,
      shim: shim as any,
    });
    expect(shim.chat).toHaveBeenCalledWith({
      session_id: expect.stringMatching(/^[0-9a-f-]{36}$/),
      message: "hi",
    });
    const parsed = JSON.parse(result.text);
    expect(parsed.reply).toBe("yo");
    expect(parsed.message_count).toBe(1);
    expect(parsed.session_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(parsed.elapsed_ms).toBe(12);
  });

  it("reuses provided session_id", async () => {
    const store = new SessionStore(() => 1700);
    const shim = { chat: vi.fn().mockResolvedValue({ assistantText: "ok", elapsedMs: 1 }) };
    await handleHermesSay({ args: { message: "1", session_id: "abc" }, clientId: "c1", store, shim: shim as any });
    await handleHermesSay({ args: { message: "2", session_id: "abc" }, clientId: "c1", store, shim: shim as any });
    expect(store.get("c1", "abc")?.messageCount).toBe(2);
  });

  it("propagates shim errors", async () => {
    const store = new SessionStore(() => 1700);
    const shim = { chat: vi.fn().mockRejectedValue(new Error("shim 502: boom")) };
    await expect(handleHermesSay({ args: { message: "x" }, clientId: "c1", store, shim: shim as any }))
      .rejects.toThrow(/boom/);
  });

  it("rejects empty message", async () => {
    const store = new SessionStore(() => 1700);
    const shim = { chat: vi.fn() };
    await expect(handleHermesSay({ args: { message: "" }, clientId: "c1", store, shim: shim as any }))
      .rejects.toThrow(/message required/);
    expect(shim.chat).not.toHaveBeenCalled();
  });
});
