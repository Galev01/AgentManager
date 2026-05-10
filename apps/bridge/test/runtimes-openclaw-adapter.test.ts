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

test("openclaw adapter describeRuntime + getCapabilities", async () => {
  const fakeGateway = async (method: string) => {
    if (method === "agents.list") return { agents: [{ id: "main" }] };
    throw new Error("unexpected");
  };
  const a = createOpenclawAdapter({ descriptor: desc }, { callGateway: fakeGateway });
  const d = await a.describeRuntime();
  assert.equal(d.kind, "openclaw");
  const caps = await a.getCapabilities();
  assert.ok(caps.supported.includes("agents.list"));
  assert.ok(caps.supported.includes("sessions.send"));
  assert.ok(caps.supported.includes("agents.create"));
  assert.ok(caps.supported.includes("cron.write"));
  assert.ok(caps.supported.includes("models.list"));
  assert.ok(caps.unsupported.includes("memory.write"));
  assert.ok(caps.unsupported.includes("skills.install"));
  assert.ok(caps.unsupported.includes("config.set"));
});

test("openclaw adapter listEntities agent", async () => {
  const fakeGateway = async (method: string) => {
    if (method === "agents.list") return { agents: [{ id: "main", name: "main" }, { id: "claude-code", name: "claude-code" }] };
    throw new Error(method);
  };
  const a = createOpenclawAdapter({ descriptor: desc }, { callGateway: fakeGateway });
  const rows = await a.listEntities("agent");
  assert.equal(rows.length, 2);
  assert.equal(rows[0].entityId, "main");
  assert.equal(rows[0].runtimeKind, "openclaw");
});

test("openclaw adapter health uses agents.list probe", async () => {
  let called = 0;
  const fakeGateway = async () => { called++; return { agents: [] }; };
  const a = createOpenclawAdapter({ descriptor: desc }, { callGateway: fakeGateway });
  const h = await a.health();
  assert.equal(h.ok, true);
  assert.equal(called, 1);
});

test("openclaw invokeAction agents.create proxies to callGateway('agents.create')", async () => {
  const calls: Array<{ method: string; params?: Record<string, unknown> }> = [];
  const fakeGateway = async (method: string, params?: Record<string, unknown>) => {
    calls.push({ method, params });
    return { id: "new-agent" };
  };
  const a = createOpenclawAdapter({ descriptor: desc }, { callGateway: fakeGateway });
  const r = await a.invokeAction("agents.create", { name: "alice", workspace: "/w" }, ctx);
  assert.equal(r.ok, true);
  if (r.ok) assert.deepEqual(r.nativeResult, { id: "new-agent" });
  assert.equal(calls[0].method, "agents.create");
  assert.equal(calls[0].params?.name, "alice");
  assert.equal(calls[0].params?.workspace, "/w");
});

test("openclaw invokeAction agents.update flattens updates into call params", async () => {
  const calls: Array<{ method: string; params?: Record<string, unknown> }> = [];
  const fakeGateway = async (method: string, params?: Record<string, unknown>) => {
    calls.push({ method, params });
    return { ok: true };
  };
  const a = createOpenclawAdapter({ descriptor: desc }, { callGateway: fakeGateway });
  await a.invokeAction("agents.update", { name: "alice", updates: { emoji: ":fire:", model: "claude" } }, ctx);
  assert.equal(calls[0].method, "agents.update");
  assert.equal(calls[0].params?.name, "alice");
  assert.equal(calls[0].params?.emoji, ":fire:");
  assert.equal(calls[0].params?.model, "claude");
});

test("openclaw invokeAction agents.delete forwards name", async () => {
  let captured: Record<string, unknown> | undefined;
  const fakeGateway = async (_m: string, params?: Record<string, unknown>) => {
    captured = params; return { ok: true };
  };
  const a = createOpenclawAdapter({ descriptor: desc }, { callGateway: fakeGateway });
  await a.invokeAction("agents.delete", { name: "alice" }, ctx);
  assert.equal(captured?.name, "alice");
});

test("openclaw invokeAction cron.write (no id) maps to gateway cron.add and unpacks spec", async () => {
  const calls: Array<{ method: string; params?: Record<string, unknown> }> = [];
  const fakeGateway = async (method: string, params?: Record<string, unknown>) => {
    calls.push({ method, params }); return { id: "j1" };
  };
  const a = createOpenclawAdapter({ descriptor: desc }, { callGateway: fakeGateway });
  await a.invokeAction(
    "cron.write",
    { spec: { cron: "* * * * *", payload: { command: "ls", agent: "main" }, enabled: true } },
    ctx,
  );
  assert.equal(calls[0].method, "cron.add");
  assert.equal(calls[0].params?.schedule, "* * * * *");
  assert.equal(calls[0].params?.command, "ls");
  assert.equal(calls[0].params?.agent, "main");
  assert.equal(calls[0].params?.enabled, true);
});

test("openclaw invokeAction cron.write (with id) maps to gateway cron.upsert", async () => {
  const calls: Array<{ method: string; params?: Record<string, unknown> }> = [];
  const fakeGateway = async (method: string, params?: Record<string, unknown>) => {
    calls.push({ method, params }); return { id: "j1" };
  };
  const a = createOpenclawAdapter({ descriptor: desc }, { callGateway: fakeGateway });
  await a.invokeAction(
    "cron.write",
    { id: "j1", spec: { cron: "*/5 * * * *", payload: {}, enabled: false } },
    ctx,
  );
  assert.equal(calls[0].method, "cron.upsert");
  assert.equal(calls[0].params?.id, "j1");
});

test("openclaw invokeAction cron.delete forwards id", async () => {
  let captured: Record<string, unknown> | undefined;
  const fakeGateway = async (_m: string, params?: Record<string, unknown>) => { captured = params; return null; };
  const a = createOpenclawAdapter({ descriptor: desc }, { callGateway: fakeGateway });
  await a.invokeAction("cron.delete", { id: "j1" }, ctx);
  assert.equal(captured?.id, "j1");
});

test("openclaw invokeAction channels.connect / disconnect proxy to gateway", async () => {
  const calls: Array<{ method: string; params?: Record<string, unknown> }> = [];
  const fakeGateway = async (method: string, params?: Record<string, unknown>) => {
    calls.push({ method, params }); return null;
  };
  const a = createOpenclawAdapter({ descriptor: desc }, { callGateway: fakeGateway });
  await a.invokeAction("channels.connect", { channelId: "wa" }, ctx);
  await a.invokeAction("channels.disconnect", { channelId: "wa" }, ctx);
  // channels.connect → channels.connect (passthrough); channels.disconnect →
  // channels.logout (the gateway's only existing implementation).
  assert.deepEqual(calls.map((c) => c.method), ["channels.connect", "channels.logout"]);
  // Both rename channelId → channel for the gateway.
  assert.equal(calls[0].params?.channel, "wa");
  assert.equal(calls[1].params?.channel, "wa");
});

test("openclaw invokeAction tools.invoke + sessions.send proxy to gateway", async () => {
  const calls: Array<{ method: string }> = [];
  const fakeGateway = async (method: string) => { calls.push({ method }); return null; };
  const a = createOpenclawAdapter({ descriptor: desc }, { callGateway: fakeGateway });
  await a.invokeAction("tools.invoke", { toolId: "t1", input: { a: 1 } }, ctx);
  await a.invokeAction("sessions.send", { sessionKey: "s1", message: "hi" }, ctx);
  assert.deepEqual(calls.map((c) => c.method), ["tools.invoke", "sessions.send"]);
});

test("openclaw invokeAction memory.write / skills.install / config.set declared unsupported", async () => {
  const fakeGateway = async () => null;
  const a = createOpenclawAdapter({ descriptor: desc }, { callGateway: fakeGateway });
  for (const action of ["memory.write", "skills.install", "config.set"] as const) {
    const r = await a.invokeAction(action, { key: "k", value: 1 } as any, ctx);
    assert.equal(r.ok, false, `${action} should be ok:false`);
    if (!r.ok) assert.match(r.error, new RegExp(action.replace(".", "\\.")));
  }
});

test("openclaw invokeAction surfaces gateway errors as ok:false", async () => {
  const fakeGateway = async () => { throw new Error("kaboom"); };
  const a = createOpenclawAdapter({ descriptor: desc }, { callGateway: fakeGateway });
  const r = await a.invokeAction("agents.delete", { name: "x" }, ctx);
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.error, /kaboom/);
});

test("openclaw invokeAction claudeCode.ask requires gatewayKey", async () => {
  // Phase D: payload.gatewayKey is required because the orchestrator owns the
  // gateway-key derivation (it knows the agent id + openclaw session id).
  const fakeGateway = async () => null;
  const a = createOpenclawAdapter({ descriptor: desc }, { callGateway: fakeGateway });
  const r = await a.invokeAction(
    "claudeCode.ask",
    { ide: "cc", workspace: "/w", msgId: "m", question: "q" },
    ctx,
  );
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.error, /gatewayKey/);
});

test("openclaw invokeAction claudeCode.ask happy path: ensure-session, send, poll, return assistant text", async () => {
  // Stateful gateway stub mirrors the real gateway's sessions.create/send/get
  // semantics: create is idempotent, send appends user message + schedules
  // assistant reply, get returns the running message array.
  const messages: Array<{ role: string; content: Array<{ type: string; text: string }> }> = [];
  const calls: { method: string; params?: Record<string, unknown> }[] = [];
  const fakeGateway = async (method: string, params?: Record<string, unknown>) => {
    calls.push({ method, params });
    if (method === "sessions.create") return { key: String(params?.key ?? ""), created: true };
    if (method === "sessions.get") return { messages: [...messages] };
    if (method === "sessions.send") {
      messages.push({ role: "user", content: [{ type: "text", text: String(params?.message ?? "") }] });
      setTimeout(() => {
        messages.push({ role: "assistant", content: [{ type: "text", text: "hello back" }] });
      }, 5);
      return { runId: "r1", status: "started", messageSeq: messages.length };
    }
    throw new Error(`unmocked: ${method}`);
  };
  const a = createOpenclawAdapter({ descriptor: desc }, { callGateway: fakeGateway });
  const r = await a.invokeAction(
    "claudeCode.ask",
    {
      ide: "cc", workspace: "/w", msgId: "m1", question: "ping",
      gatewayKey: "agent:claude-code:cc-abc",
      replyPollIntervalMs: 5,
      replyTimeoutMs: 1_000,
    },
    ctx,
  );
  assert.equal(r.ok, true);
  if (r.ok) {
    const native = r.nativeResult as { assistantText: string; gatewayKey: string };
    assert.equal(native.assistantText, "hello back");
    assert.equal(native.gatewayKey, "agent:claude-code:cc-abc");
  }
  // Adapter must have called sessions.create once + sessions.send once + at
  // least one sessions.get (baseline + poll loop).
  const methods = calls.map((c) => c.method);
  assert.ok(methods.includes("sessions.create"));
  assert.ok(methods.includes("sessions.send"));
  assert.ok(methods.includes("sessions.get"));
});

test("openclaw invokeAction claudeCode.ask wraps first-turn message when baseline is empty", async () => {
  const messages: Array<{ role: string; content: Array<{ type: string; text: string }> }> = [];
  const sentMessages: string[] = [];
  const fakeGateway = async (method: string, params?: Record<string, unknown>) => {
    if (method === "sessions.create") return { created: true };
    if (method === "sessions.get") return { messages: [...messages] };
    if (method === "sessions.send") {
      sentMessages.push(String(params?.message ?? ""));
      messages.push({ role: "user", content: [{ type: "text", text: String(params?.message ?? "") }] });
      setTimeout(() => {
        messages.push({ role: "assistant", content: [{ type: "text", text: "ok" }] });
      }, 5);
      return { ok: true };
    }
    throw new Error(`unmocked: ${method}`);
  };
  const a = createOpenclawAdapter({ descriptor: desc }, { callGateway: fakeGateway });
  await a.invokeAction(
    "claudeCode.ask",
    {
      ide: "cc", workspace: "/w", msgId: "m1", question: "raw question",
      gatewayKey: "agent:claude-code:cc-x",
      firstTurnMessage: "WRAPPED PREAMBLE\nraw question",
      replyPollIntervalMs: 5,
      replyTimeoutMs: 1_000,
    },
    ctx,
  );
  // First turn: baseline=0 → adapter sends the wrapped preamble form.
  assert.equal(sentMessages.length, 1);
  assert.match(sentMessages[0]!, /WRAPPED PREAMBLE/);
});
