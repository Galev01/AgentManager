import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createCopilotStore } from "../src/services/copilot/store.js";
import { createCopilotOrchestrator } from "../src/services/copilot/orchestrator.js";
import type { ChatBackendAdapter } from "../src/services/copilot/backend.js";

async function tempRoot() { return mkdtemp(path.join(tmpdir(), "copilot-orch-")); }

const okBackend: ChatBackendAdapter = {
  async createSession() { return { openclawSessionKey: "k1" }; },
  async sendTurn() { return { ok: true, assistantText: "world" }; },
};

const slowBackend = (delayMs: number, text = "world"): ChatBackendAdapter => ({
  async createSession() { return {}; },
  async sendTurn() {
    await new Promise((r) => setTimeout(r, delayMs));
    return { ok: true, assistantText: text };
  },
});

test("submitTurn appends user msg + writes pending + dispatches + resolves to done", async () => {
  const root = await tempRoot();
  const store = createCopilotStore({ rootDir: root });
  const orch = createCopilotOrchestrator({ store, backendFor: () => okBackend });
  const meta = await store.createSession({ ownerUserId: "u1", runtimeId: "oc-main", backend: "openclaw" });
  const { msgId } = await orch.submitTurn({ sessionId: meta.id, userMessageText: "hi" });

  // Pending immediately set
  const pendingNow = await store.readPending(meta.id);
  assert.ok(pendingNow);

  // Wait for completion
  await orch.waitForTurn(meta.id, msgId, 5000);
  const finalPending = await store.readPending(meta.id);
  assert.equal(finalPending?.state, "done");

  const msgs = await store.readMessages(meta.id, 50);
  assert.equal(msgs.length, 2);
  assert.equal(msgs[0].role, "user");
  assert.equal(msgs[1].role, "assistant");
  assert.deepEqual(msgs[1].events, [{ type: "text", text: "world" }]);
});

test("concurrent submitTurn returns 409 turn_in_progress", async () => {
  const root = await tempRoot();
  const store = createCopilotStore({ rootDir: root });
  const orch = createCopilotOrchestrator({ store, backendFor: () => slowBackend(100) });
  const meta = await store.createSession({ ownerUserId: "u1", runtimeId: "oc-main", backend: "openclaw" });
  await orch.submitTurn({ sessionId: meta.id, userMessageText: "first" });
  await assert.rejects(
    orch.submitTurn({ sessionId: meta.id, userMessageText: "second" }),
    (e: unknown) => (e as { code?: string }).code === "turn_in_progress",
  );
});

test("backend error transitions pending to error", async () => {
  const root = await tempRoot();
  const store = createCopilotStore({ rootDir: root });
  const errBackend: ChatBackendAdapter = {
    async createSession() { return {}; },
    async sendTurn() { return { ok: false, error: "boom" }; },
  };
  const orch = createCopilotOrchestrator({ store, backendFor: () => errBackend });
  const meta = await store.createSession({ ownerUserId: "u1", runtimeId: "oc-main", backend: "openclaw" });
  const { msgId } = await orch.submitTurn({ sessionId: meta.id, userMessageText: "x" });
  await orch.waitForTurn(meta.id, msgId, 5000);
  const p = await store.readPending(meta.id);
  assert.equal(p?.state, "error");
  assert.match(p?.errorDetail ?? "", /boom/);
});

test("recoverOnBoot transitions stale running pending to timeout", async () => {
  const root = await tempRoot();
  const store = createCopilotStore({ rootDir: root });
  const meta = await store.createSession({ ownerUserId: "u1", runtimeId: "oc-main", backend: "openclaw" });
  await store.writePending(meta.id, { msg_id: "m1", state: "running", startedAt: Date.now() - 999_999 });
  const orch = createCopilotOrchestrator({ store, backendFor: () => okBackend, pendingTimeoutMs: 180_000 });
  await orch.recoverOnBoot();
  const p = await store.readPending(meta.id);
  assert.equal(p?.state, "timeout");
});

test("recoverOnBoot transitions running with later assistant message to done", async () => {
  const root = await tempRoot();
  const store = createCopilotStore({ rootDir: root });
  const meta = await store.createSession({ ownerUserId: "u1", runtimeId: "oc-main", backend: "openclaw" });
  const startedAt = Date.now() - 1000;
  await store.writePending(meta.id, { msg_id: "m1", state: "running", startedAt });
  await store.appendMessage(meta.id, {
    msg_id: "m1", role: "user", createdAt: startedAt + 10, events: [{ type: "text", text: "hi" }],
  });
  await store.appendMessage(meta.id, {
    msg_id: "a1", role: "assistant", createdAt: startedAt + 200, events: [{ type: "text", text: "hello" }],
  });
  const orch = createCopilotOrchestrator({ store, backendFor: () => okBackend, pendingTimeoutMs: 180_000 });
  await orch.recoverOnBoot();
  const p = await store.readPending(meta.id);
  assert.equal(p?.state, "done");
});
