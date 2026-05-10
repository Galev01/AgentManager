import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  createCopilotStore,
} from "../src/services/copilot/store.js";

async function tempRoot(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), "copilot-store-"));
}

test("create + read meta round-trip", async () => {
  const root = await tempRoot();
  const store = createCopilotStore({ rootDir: root });
  const meta = await store.createSession({
    ownerUserId: "u1",
    runtimeId: "oc-main", backend: "openclaw",
    title: "hello",
  });
  assert.equal(meta.ownerUserId, "u1");
  assert.equal(meta.backend, "openclaw");
  assert.equal(meta.title, "hello");
  assert.ok(meta.id.length > 0);

  const readBack = await store.readMeta(meta.id);
  assert.deepEqual(readBack, meta);
});

test("listSessionsForOwner only returns owner-matched, newest first", async () => {
  const root = await tempRoot();
  const store = createCopilotStore({ rootDir: root });
  const a = await store.createSession({ ownerUserId: "u1", runtimeId: "oc-main", backend: "openclaw", title: "A" });
  const b = await store.createSession({ ownerUserId: "u2", runtimeId: "oc-main", backend: "openclaw", title: "B" });
  const c = await store.createSession({ ownerUserId: "u1", runtimeId: "oc-main", backend: "openclaw", title: "C" });
  const list = await store.listSessionsForOwner("u1");
  assert.equal(list.length, 2);
  assert.equal(list[0].id, c.id);
  assert.equal(list[1].id, a.id);
  assert.ok(list.every((m) => m.ownerUserId === "u1"));
  assert.ok(b);
});

test("appendMessage writes JSONL line; readMessages returns ordered tail", async () => {
  const root = await tempRoot();
  const store = createCopilotStore({ rootDir: root });
  const meta = await store.createSession({ ownerUserId: "u1", runtimeId: "oc-main", backend: "openclaw" });
  await store.appendMessage(meta.id, {
    msg_id: "m1", role: "user", createdAt: 1, events: [{ type: "text", text: "hi" }],
  });
  await store.appendMessage(meta.id, {
    msg_id: "m2", role: "assistant", createdAt: 2, events: [{ type: "text", text: "hello" }],
  });
  const tail = await store.readMessages(meta.id, 50);
  assert.equal(tail.length, 2);
  assert.equal(tail[0].msg_id, "m1");
  assert.equal(tail[1].msg_id, "m2");
});

test("writePending + readPending atomic round-trip", async () => {
  const root = await tempRoot();
  const store = createCopilotStore({ rootDir: root });
  const meta = await store.createSession({ ownerUserId: "u1", runtimeId: "oc-main", backend: "openclaw" });
  await store.writePending(meta.id, {
    msg_id: "m1", state: "pending", startedAt: 100,
  });
  const p = await store.readPending(meta.id);
  assert.equal(p?.msg_id, "m1");
  assert.equal(p?.state, "pending");

  await store.writePending(meta.id, {
    msg_id: "m1", state: "done", startedAt: 100, finishedAt: 200,
  });
  const p2 = await store.readPending(meta.id);
  assert.equal(p2?.state, "done");
});

test("deleteSession recursively removes directory", async () => {
  const root = await tempRoot();
  const store = createCopilotStore({ rootDir: root });
  const meta = await store.createSession({ ownerUserId: "u1", runtimeId: "oc-main", backend: "openclaw" });
  await store.appendMessage(meta.id, { msg_id: "m1", role: "user", createdAt: 1, events: [{ type: "text", text: "x" }] });
  await store.deleteSession(meta.id);
  const after = await store.readMeta(meta.id);
  assert.equal(after, null);
});

test("listAllNonTerminalPending finds sessions with non-terminal pending state", async () => {
  const root = await tempRoot();
  const store = createCopilotStore({ rootDir: root });
  const a = await store.createSession({ ownerUserId: "u1", runtimeId: "oc-main", backend: "openclaw" });
  const b = await store.createSession({ ownerUserId: "u1", runtimeId: "oc-main", backend: "openclaw" });
  await store.writePending(a.id, { msg_id: "m1", state: "running", startedAt: 100 });
  await store.writePending(b.id, { msg_id: "m2", state: "done", startedAt: 100, finishedAt: 200 });
  const stale = await store.listAllNonTerminalPending();
  assert.equal(stale.length, 1);
  assert.equal(stale[0].sessionId, a.id);
});

// --- Phase E: runtimeId migration ----------------------------------------

/**
 * Writes a legacy meta.json (no `runtimeId` field) for the given sessionId
 * directly to disk so we can test the read-time backfill against records that
 * predate Phase E.
 */
async function seedLegacyMeta(root: string, sessionId: string, backend: "openclaw" | "hermes") {
  const dir = path.join(root, "sessions", sessionId);
  await mkdir(dir, { recursive: true });
  const legacy = {
    id: sessionId,
    ownerUserId: "u1",
    backend,
    title: null,
    createdAt: 1000,
    lastTurnAt: null,
  };
  await writeFile(path.join(dir, "meta.json"), JSON.stringify(legacy, null, 2) + "\n", "utf8");
}

test("readMeta backfills runtimeId for legacy openclaw session via resolver", async () => {
  const root = await tempRoot();
  const store = createCopilotStore({
    rootDir: root,
    resolveRuntimeId: async (backend) => (backend === "openclaw" ? "oc-main" : "hermes-prod"),
  });
  await seedLegacyMeta(root, "leg-1", "openclaw");
  const m = await store.readMeta("leg-1");
  assert.ok(m);
  assert.equal(m.backend, "openclaw");
  assert.equal(m.runtimeId, "oc-main");
});

test("readMeta backfills runtimeId for legacy hermes session via resolver", async () => {
  const root = await tempRoot();
  const store = createCopilotStore({
    rootDir: root,
    resolveRuntimeId: async (backend) => (backend === "hermes" ? "hermes-prod" : "oc-main"),
  });
  await seedLegacyMeta(root, "leg-2", "hermes");
  const m = await store.readMeta("leg-2");
  assert.ok(m);
  assert.equal(m.backend, "hermes");
  assert.equal(m.runtimeId, "hermes-prod");
});

test("readMeta does NOT rewrite the on-disk file (lazy backfill)", async () => {
  const root = await tempRoot();
  const store = createCopilotStore({
    rootDir: root,
    resolveRuntimeId: async () => "oc-main",
  });
  await seedLegacyMeta(root, "leg-3", "openclaw");
  await store.readMeta("leg-3");
  const onDisk = JSON.parse(await readFile(path.join(root, "sessions", "leg-3", "meta.json"), "utf8"));
  assert.equal(onDisk.runtimeId, undefined);
});

test("updateMeta persists backfilled runtimeId on first write; subsequent reads use persisted value", async () => {
  const root = await tempRoot();
  let resolverCalls = 0;
  const store = createCopilotStore({
    rootDir: root,
    resolveRuntimeId: async () => { resolverCalls++; return "oc-main"; },
  });
  await seedLegacyMeta(root, "leg-4", "openclaw");

  // First update commits the runtimeId.
  await store.updateMeta("leg-4", { lastTurnAt: 5000 });
  const callsAfterFirstWrite = resolverCalls;
  const onDisk = JSON.parse(await readFile(path.join(root, "sessions", "leg-4", "meta.json"), "utf8"));
  assert.equal(onDisk.runtimeId, "oc-main");
  assert.equal(onDisk.lastTurnAt, 5000);

  // Second read should NOT call the resolver — the persisted runtimeId wins.
  const m = await store.readMeta("leg-4");
  assert.equal(m?.runtimeId, "oc-main");
  assert.equal(resolverCalls, callsAfterFirstWrite);
});

test("readMeta returns empty runtimeId when no resolver is configured (test mode)", async () => {
  // Sanity: store is usable without a resolver — the field is just empty.
  const root = await tempRoot();
  const store = createCopilotStore({ rootDir: root });
  await seedLegacyMeta(root, "leg-5", "openclaw");
  const m = await store.readMeta("leg-5");
  assert.equal(m?.runtimeId, "");
});

test("createSession persists runtimeId on disk", async () => {
  const root = await tempRoot();
  const store = createCopilotStore({ rootDir: root });
  const meta = await store.createSession({
    ownerUserId: "u1", runtimeId: "oc-secondary", backend: "openclaw", title: "x",
  });
  const onDisk = JSON.parse(await readFile(path.join(root, "sessions", meta.id, "meta.json"), "utf8"));
  assert.equal(onDisk.runtimeId, "oc-secondary");
});
