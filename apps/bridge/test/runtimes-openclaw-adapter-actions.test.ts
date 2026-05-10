/**
 * Unit tests for new OpenClaw adapter actions added in Wave 1 Task 2:
 *   sessions.{create,reset,abort,compact,delete}, cron.run,
 *   sessions.send (awaitCompletion), read() for sessions.usage/cron.status/tools.effective.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createOpenclawAdapter } from "../src/services/runtimes/openclaw.js";
import type { RuntimeDescriptor, RuntimeActionContext } from "@openclaw-manager/types";

const desc: RuntimeDescriptor = {
  id: "oc-main", kind: "openclaw", displayName: "OC", endpoint: "http://fake:1",
  transport: "sdk", authMode: "token-env",
};

const ctx: RuntimeActionContext = {
  actor: { humanActorUserId: "u", managerServiceId: "m", basis: "service-principal" },
};

// ---------- sessions.create ----------

test("invokeAction sessions.create with agentName calls gateway sessions.create with agent param", async () => {
  const calls: Array<{ method: string; params?: Record<string, unknown> }> = [];
  const fakeGateway = async (method: string, params?: Record<string, unknown>) => {
    calls.push({ method, params });
    return { sessionKey: "sk1", sessionId: "sid1" };
  };
  const a = createOpenclawAdapter({ descriptor: desc }, { callGateway: fakeGateway });
  const r = await a.invokeAction("sessions.create", { agentName: "x" }, ctx);
  assert.equal(r.ok, true);
  assert.equal(calls[0].method, "sessions.create");
  assert.equal(calls[0].params?.agent, "x");
});

test("invokeAction sessions.create without agentName calls gateway with empty params", async () => {
  const calls: Array<{ method: string; params?: Record<string, unknown> }> = [];
  const fakeGateway = async (method: string, params?: Record<string, unknown>) => {
    calls.push({ method, params });
    return { sessionKey: "sk1" };
  };
  const a = createOpenclawAdapter({ descriptor: desc }, { callGateway: fakeGateway });
  const r = await a.invokeAction("sessions.create", {}, ctx);
  assert.equal(r.ok, true);
  assert.equal(calls[0].method, "sessions.create");
  assert.equal(calls[0].params?.agent, undefined);
});

// ---------- sessions.reset ----------

test("invokeAction sessions.reset calls gateway sessions.reset with session param", async () => {
  const calls: Array<{ method: string; params?: Record<string, unknown> }> = [];
  const fakeGateway = async (method: string, params?: Record<string, unknown>) => {
    calls.push({ method, params });
    return { ok: true };
  };
  const a = createOpenclawAdapter({ descriptor: desc }, { callGateway: fakeGateway });
  const r = await a.invokeAction("sessions.reset", { sessionKey: "k" }, ctx);
  assert.equal(r.ok, true);
  assert.equal(calls[0].method, "sessions.reset");
  assert.equal(calls[0].params?.session, "k");
});

// ---------- sessions.abort ----------

test("invokeAction sessions.abort calls gateway sessions.abort with session param", async () => {
  const calls: Array<{ method: string; params?: Record<string, unknown> }> = [];
  const fakeGateway = async (method: string, params?: Record<string, unknown>) => {
    calls.push({ method, params });
    return { ok: true };
  };
  const a = createOpenclawAdapter({ descriptor: desc }, { callGateway: fakeGateway });
  const r = await a.invokeAction("sessions.abort", { sessionKey: "k" }, ctx);
  assert.equal(r.ok, true);
  assert.equal(calls[0].method, "sessions.abort");
  assert.equal(calls[0].params?.session, "k");
});

// ---------- sessions.compact ----------

test("invokeAction sessions.compact calls gateway sessions.compact with session param", async () => {
  const calls: Array<{ method: string; params?: Record<string, unknown> }> = [];
  const fakeGateway = async (method: string, params?: Record<string, unknown>) => {
    calls.push({ method, params });
    return { ok: true };
  };
  const a = createOpenclawAdapter({ descriptor: desc }, { callGateway: fakeGateway });
  const r = await a.invokeAction("sessions.compact", { sessionKey: "k" }, ctx);
  assert.equal(r.ok, true);
  assert.equal(calls[0].method, "sessions.compact");
  assert.equal(calls[0].params?.session, "k");
});

// ---------- sessions.delete ----------

test("invokeAction sessions.delete calls gateway sessions.delete with session param", async () => {
  const calls: Array<{ method: string; params?: Record<string, unknown> }> = [];
  const fakeGateway = async (method: string, params?: Record<string, unknown>) => {
    calls.push({ method, params });
    return { ok: true };
  };
  const a = createOpenclawAdapter({ descriptor: desc }, { callGateway: fakeGateway });
  const r = await a.invokeAction("sessions.delete", { sessionKey: "k" }, ctx);
  assert.equal(r.ok, true);
  assert.equal(calls[0].method, "sessions.delete");
  assert.equal(calls[0].params?.session, "k");
});

// ---------- cron.run ----------

test("invokeAction cron.run calls gateway cron.run with id param", async () => {
  const calls: Array<{ method: string; params?: Record<string, unknown> }> = [];
  const fakeGateway = async (method: string, params?: Record<string, unknown>) => {
    calls.push({ method, params });
    return { ok: true };
  };
  const a = createOpenclawAdapter({ descriptor: desc }, { callGateway: fakeGateway });
  const r = await a.invokeAction("cron.run", { id: "j1" }, ctx);
  assert.equal(r.ok, true);
  assert.equal(calls[0].method, "cron.run");
  assert.equal(calls[0].params?.id, "j1");
});

// ---------- sessions.send fire-and-forget (no awaitCompletion) ----------

test("invokeAction sessions.send without awaitCompletion returns gateway result (fire-and-forget)", async () => {
  const calls: Array<{ method: string; params?: Record<string, unknown> }> = [];
  const fakeGateway = async (method: string, params?: Record<string, unknown>) => {
    calls.push({ method, params });
    return { ack: true };
  };
  const a = createOpenclawAdapter({ descriptor: desc }, { callGateway: fakeGateway });
  const r = await a.invokeAction("sessions.send", { sessionKey: "s1", message: "hello" }, ctx);
  assert.equal(r.ok, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, "sessions.send");
  if (r.ok) {
    const result = r.nativeResult as Record<string, unknown>;
    assert.equal(result.ack, true);
  }
});

// ---------- sessions.send with awaitCompletion (DI-based test) ----------

test("invokeAction sessions.send with awaitCompletion=true uses tail helpers and returns assistantText", async () => {
  const gatewayCalls: Array<{ method: string; params?: Record<string, unknown> }> = [];
  const fakeGateway = async (method: string, params?: Record<string, unknown>) => {
    gatewayCalls.push({ method, params });
    if (method === "sessions.send") return { ok: true };
    if (method === "sessions.list") {
      return { sessions: [{ key: "s1", sessionId: "sid-abc" }] };
    }
    return null;
  };

  // Injected session-tail helpers (avoid fs + real gateway polling in tests).
  let waitCalled = false;
  let sessionFileCalled = false;
  let readCalled = false;

  const fakeWait = async (_sessionId: string, _timeoutMs: number) => {
    waitCalled = true;
    // Simulates session reaching terminal state immediately.
  };

  const fakeSessionFilePath = (
    _created: Parameters<typeof import("../src/services/openclaw-session-tail.js")["sessionFilePath"]>[0],
    _sessionId: string,
  ): string => {
    sessionFileCalled = true;
    return "/fake/sessions/sid-abc.jsonl";
  };

  const fakeReadLastAssistantMessage = async (_sessionFile: string): Promise<string | undefined> => {
    readCalled = true;
    return "  Hello from assistant  ";
  };

  const a = createOpenclawAdapter({ descriptor: desc }, {
    callGateway: fakeGateway,
    waitForSessionTerminal: fakeWait,
    sessionFilePath: fakeSessionFilePath,
    readLastAssistantMessage: fakeReadLastAssistantMessage,
  });

  const r = await a.invokeAction(
    "sessions.send",
    { sessionKey: "s1", message: "hi", awaitCompletion: true, timeoutMs: 5000 },
    ctx,
  );

  assert.equal(r.ok, true, `expected ok:true but got: ${r.ok ? "ok" : (r as { error: string }).error}`);
  assert.equal(waitCalled, true, "waitForSessionTerminal should have been called");
  assert.equal(sessionFileCalled, true, "sessionFilePath should have been called");
  assert.equal(readCalled, true, "readLastAssistantMessage should have been called");

  if (r.ok) {
    const result = r.nativeResult as { assistantText: string; elapsedMs: number; sessionKey: string };
    assert.equal(result.assistantText, "Hello from assistant", "assistantText should be trimmed");
    assert.equal(result.sessionKey, "s1");
    assert.equal(typeof result.elapsedMs, "number");
  }

  // Verify gateway call sequence: send, then list.
  assert.equal(gatewayCalls[0].method, "sessions.send");
  assert.equal(gatewayCalls[1].method, "sessions.list");
});

test("invokeAction sessions.send awaitCompletion=true returns error when no assistant content", async () => {
  const fakeGateway = async (method: string) => {
    if (method === "sessions.send") return { ok: true };
    if (method === "sessions.list") return { sessions: [{ key: "s1", sessionId: "sid-abc" }] };
    return null;
  };
  const a = createOpenclawAdapter({ descriptor: desc }, {
    callGateway: fakeGateway,
    waitForSessionTerminal: async () => {},
    sessionFilePath: () => "/fake/sessions/sid-abc.jsonl",
    readLastAssistantMessage: async () => undefined, // no content
  });
  const r = await a.invokeAction(
    "sessions.send",
    { sessionKey: "s1", message: "hi", awaitCompletion: true },
    ctx,
  );
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.error, /no assistant output/);
});

test("invokeAction sessions.send awaitCompletion=true returns error on session not found", async () => {
  const fakeGateway = async (method: string) => {
    if (method === "sessions.send") return { ok: true };
    if (method === "sessions.list") return { sessions: [] }; // empty — session not found
    return null;
  };
  const a = createOpenclawAdapter({ descriptor: desc }, {
    callGateway: fakeGateway,
    waitForSessionTerminal: async () => {},
    sessionFilePath: () => "/fake/sessions/sid-abc.jsonl",
    readLastAssistantMessage: async () => "hi",
  });
  const r = await a.invokeAction(
    "sessions.send",
    { sessionKey: "s1", message: "hi", awaitCompletion: true },
    ctx,
  );
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.error, /not found/);
});

// ---------- read() ----------

test("read sessions.usage calls gateway sessions.usage with session param and returns result", async () => {
  const calls: Array<{ method: string; params?: Record<string, unknown> }> = [];
  const fakeGateway = async (method: string, params?: Record<string, unknown>) => {
    calls.push({ method, params });
    return { tokens: 100 };
  };
  const a = createOpenclawAdapter({ descriptor: desc }, { callGateway: fakeGateway });
  const result = await a.read!("sessions.usage", { sessionKey: "k" });
  assert.deepEqual(result, { tokens: 100 });
  assert.equal(calls[0].method, "sessions.usage");
  assert.equal(calls[0].params?.session, "k");
});

test("read sessions.usage throws when sessionKey missing", async () => {
  const a = createOpenclawAdapter(
    { descriptor: desc },
    { callGateway: async () => null },
  );
  await assert.rejects(
    () => a.read!("sessions.usage", {}),
    /requires sessionKey/,
  );
});

test("read cron.status calls gateway cron.status with id param", async () => {
  const calls: Array<{ method: string; params?: Record<string, unknown> }> = [];
  const fakeGateway = async (method: string, params?: Record<string, unknown>) => {
    calls.push({ method, params });
    return { state: "running" };
  };
  const a = createOpenclawAdapter({ descriptor: desc }, { callGateway: fakeGateway });
  const result = await a.read!("cron.status", { id: "j1" });
  assert.deepEqual(result, { state: "running" });
  assert.equal(calls[0].method, "cron.status");
  assert.equal(calls[0].params?.id, "j1");
});

test("read cron.status throws when id missing", async () => {
  const a = createOpenclawAdapter(
    { descriptor: desc },
    { callGateway: async () => null },
  );
  await assert.rejects(
    () => a.read!("cron.status", {}),
    /requires id/,
  );
});

test("read tools.effective calls gateway tools.effective", async () => {
  const calls: Array<{ method: string; params?: Record<string, unknown> }> = [];
  const fakeGateway = async (method: string, params?: Record<string, unknown>) => {
    calls.push({ method, params });
    return [{ id: "tool1" }];
  };
  const a = createOpenclawAdapter({ descriptor: desc }, { callGateway: fakeGateway });
  const result = await a.read!("tools.effective", {});
  assert.deepEqual(result, [{ id: "tool1" }]);
  assert.equal(calls[0].method, "tools.effective");
});

test("read throws for unsupported capability id", async () => {
  const a = createOpenclawAdapter(
    { descriptor: desc },
    { callGateway: async () => null },
  );
  await assert.rejects(
    () => a.read!("agents.list" as any),
    /unsupported capability/,
  );
});

// ---------- getCapabilities includes new ids ----------

test("openclaw adapter getCapabilities includes new session lifecycle ids in supported", async () => {
  const a = createOpenclawAdapter({ descriptor: desc }, { callGateway: async () => null });
  const caps = await a.getCapabilities();
  for (const id of [
    "sessions.create", "sessions.reset", "sessions.abort", "sessions.compact", "sessions.delete",
    "sessions.usage", "cron.status", "cron.run", "tools.effective",
  ]) {
    assert.ok(caps.supported.includes(id as any), `${id} should be in supported`);
  }
});
