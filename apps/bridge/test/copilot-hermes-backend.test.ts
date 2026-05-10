import { test } from "node:test";
import assert from "node:assert/strict";
import { createHermesChatBackend } from "../src/services/copilot/backends/hermes.js";
import type { HttpClient } from "../src/services/runtimes/adapter-base.js";
import type { CopilotSessionMeta } from "@openclaw-manager/types";

const baseSession = (over?: Partial<CopilotSessionMeta>): CopilotSessionMeta => ({
  id: "s1",
  ownerUserId: "u1",
  backend: "hermes",
  title: null,
  createdAt: 0,
  lastTurnAt: null,
  openclawSessionKey: "copilot-s1",
  ...over,
});

function fakeHttp(handler: (url: string, req: { method: string; body?: unknown }) => unknown): HttpClient {
  return {
    async json(url, req) {
      return handler(url, req as { method: string; body?: unknown }) as never;
    },
  };
}

test("createSession returns derived openclawSessionKey", async () => {
  const backend = createHermesChatBackend({
    endpoint: "http://hermes.test:9119",
    bearer: "tok",
    http: fakeHttp(() => null),
  });
  const out = await backend.createSession({ sessionId: "s1", ownerUserId: "u1" });
  assert.equal(out.openclawSessionKey, "copilot-s1");
});

test("sendTurn POSTs /v1/chat with bearer + session_id + message", async () => {
  const calls: Array<{ url: string; body: unknown }> = [];
  const backend = createHermesChatBackend({
    endpoint: "http://hermes.test:9119",
    bearer: "tok",
    http: fakeHttp((url, req) => {
      calls.push({ url, body: req.body });
      return { ok: true, assistant_text: "hello", session_id: "copilot-s1" };
    }),
  });
  const result = await backend.sendTurn({
    session: baseSession(),
    userMessageText: "hi",
    msgId: "m1",
  });
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.assistantText, "hello");
  assert.equal(calls[0].url, "http://hermes.test:9119/v1/chat");
  assert.deepEqual(calls[0].body, { session_id: "copilot-s1", message: "hi" });
});

test("sendTurn returns ok:false on http failure", async () => {
  const backend = createHermesChatBackend({
    endpoint: "http://hermes.test:9119",
    bearer: "tok",
    http: fakeHttp(() => { throw new Error("502: shim down"); }),
  });
  const result = await backend.sendTurn({
    session: baseSession(),
    userMessageText: "hi",
    msgId: "m1",
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.error, /shim down/);
});

test("sendTurn returns ok:false when shim returns ok:false", async () => {
  const backend = createHermesChatBackend({
    endpoint: "http://hermes.test:9119",
    bearer: "tok",
    http: fakeHttp(() => ({ ok: false, error: "auth expired" })),
  });
  const result = await backend.sendTurn({
    session: baseSession(),
    userMessageText: "hi",
    msgId: "m1",
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.error, /auth expired/);
});
