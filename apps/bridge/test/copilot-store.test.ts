import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
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
    backend: "openclaw",
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
  const a = await store.createSession({ ownerUserId: "u1", backend: "openclaw", title: "A" });
  const b = await store.createSession({ ownerUserId: "u2", backend: "openclaw", title: "B" });
  const c = await store.createSession({ ownerUserId: "u1", backend: "openclaw", title: "C" });
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
  const meta = await store.createSession({ ownerUserId: "u1", backend: "openclaw" });
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
  const meta = await store.createSession({ ownerUserId: "u1", backend: "openclaw" });
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
  const meta = await store.createSession({ ownerUserId: "u1", backend: "openclaw" });
  await store.appendMessage(meta.id, { msg_id: "m1", role: "user", createdAt: 1, events: [{ type: "text", text: "x" }] });
  await store.deleteSession(meta.id);
  const after = await store.readMeta(meta.id);
  assert.equal(after, null);
});

test("listAllNonTerminalPending finds sessions with non-terminal pending state", async () => {
  const root = await tempRoot();
  const store = createCopilotStore({ rootDir: root });
  const a = await store.createSession({ ownerUserId: "u1", backend: "openclaw" });
  const b = await store.createSession({ ownerUserId: "u1", backend: "openclaw" });
  await store.writePending(a.id, { msg_id: "m1", state: "running", startedAt: 100 });
  await store.writePending(b.id, { msg_id: "m2", state: "done", startedAt: 100, finishedAt: 200 });
  const stale = await store.listAllNonTerminalPending();
  assert.equal(stale.length, 1);
  assert.equal(stale[0].sessionId, a.id);
});
