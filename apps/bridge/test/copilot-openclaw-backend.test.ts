import { test } from "node:test";
import assert from "node:assert/strict";
import { createOpenclawChatBackend } from "../src/services/copilot/backends/openclaw.js";
import type { CopilotSessionMeta } from "@openclaw-manager/types";

const baseSession = (over?: Partial<CopilotSessionMeta>): CopilotSessionMeta => ({
  id: "s1",
  ownerUserId: "u1",
  runtimeId: "oc-main",
  backend: "openclaw",
  title: null,
  createdAt: 0,
  lastTurnAt: null,
  openclawSessionKey: "copilot-s1",
  ...over,
});

test("createSession calls sessions.create with derived key", async () => {
  const calls: Array<{ method: string; params: unknown }> = [];
  const callGateway = async (method: string, params?: Record<string, unknown>) => {
    calls.push({ method, params });
    return null;
  };
  const backend = createOpenclawChatBackend({ callGateway, replyPollIntervalMs: 1, replyTimeoutMs: 100 });
  const out = await backend.createSession({ sessionId: "s1", ownerUserId: "u1" });
  assert.equal(out.openclawSessionKey, "copilot-s1");
  assert.equal(calls[0].method, "sessions.create");
  assert.deepEqual(calls[0].params, { key: "copilot-s1" });
});

test("sendTurn submits message + polls until assistant text appears", async () => {
  let getCalls = 0;
  const callGateway = async (method: string, params?: Record<string, unknown>): Promise<unknown> => {
    if (method === "sessions.create") return null;
    if (method === "sessions.send") return { runId: "r1" };
    if (method === "sessions.get") {
      getCalls++;
      if (getCalls < 2) return { messages: [{ role: "user", content: [{ type: "text", text: "hi" }] }] };
      return {
        messages: [
          { role: "user", content: [{ type: "text", text: "hi" }] },
          { role: "assistant", content: [{ type: "text", text: "hello back" }] },
        ],
      };
    }
    return null;
  };
  const backend = createOpenclawChatBackend({ callGateway, replyPollIntervalMs: 1, replyTimeoutMs: 1000 });
  const result = await backend.sendTurn({
    session: baseSession(),
    userMessageText: "hi",
    msgId: "m1",
  });
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.assistantText, "hello back");
});

test("sendTurn returns ok:false with error on timeout", async () => {
  const callGateway = async (method: string): Promise<unknown> => {
    if (method === "sessions.create") return null;
    if (method === "sessions.send") return null;
    if (method === "sessions.get") return { messages: [] };
    return null;
  };
  const backend = createOpenclawChatBackend({ callGateway, replyPollIntervalMs: 1, replyTimeoutMs: 30 });
  const result = await backend.sendTurn({
    session: baseSession(),
    userMessageText: "hi",
    msgId: "m1",
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.error, /timeout/i);
});

test("sendTurn prepends preamble on first turn (baseline=0)", async () => {
  const sent: string[] = [];
  let getCalls = 0;
  const callGateway = async (method: string, params?: Record<string, unknown>): Promise<unknown> => {
    if (method === "sessions.create") return null;
    if (method === "sessions.send") {
      sent.push(String((params as { message: string }).message));
      return null;
    }
    if (method === "sessions.get") {
      getCalls++;
      if (getCalls < 2) return { messages: [] };
      return { messages: [
        { role: "user", content: [{ type: "text", text: sent[0] }] },
        { role: "assistant", content: [{ type: "text", text: "ok" }] },
      ] };
    }
    return null;
  };
  const backend = createOpenclawChatBackend({ callGateway, replyPollIntervalMs: 1, replyTimeoutMs: 1000 });
  await backend.sendTurn({ session: baseSession(), userMessageText: "first", msgId: "m1" });
  assert.match(sent[0], /Dashboard Copilot/);
  assert.match(sent[0], /first/);
});
