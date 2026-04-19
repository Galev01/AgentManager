import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  createPending,
  listPending,
  resolvePending,
  awaitPending,
} from "../src/services/claude-code-pending.js";

async function tmp(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "cc-pend-"));
}

test("createPending + listPending round-trips", async () => {
  const dir = await tmp();
  const p = path.join(dir, "pending.json");
  const item = await createPending(p, {
    sessionId: "s1",
    msgId: "m1",
    question: "q",
    draft: "d",
  });
  assert.ok(item.id.startsWith("pend-"));
  const list = await listPending(p);
  assert.equal(list.length, 1);
  assert.equal(list[0]!.msgId, "m1");
});

test("resolvePending removes from disk and resolves the pending promise", async () => {
  const dir = await tmp();
  const p = path.join(dir, "pending.json");
  const item = await createPending(p, { sessionId: "s1", msgId: "m1", question: "q", draft: "d" });
  const promise = awaitPending(item.id, 1000);
  await resolvePending(p, item.id, { answer: "final", source: "operator", action: "send-as-is" });
  const got = await promise;
  assert.equal(got.answer, "final");
  const list = await listPending(p);
  assert.equal(list.length, 0);
});

test("resolvePending with error rejects the pending promise", async () => {
  const dir = await tmp();
  const p = path.join(dir, "pending.json");
  const item = await createPending(p, { sessionId: "s1", msgId: "m2", question: "q", draft: "d" });
  const promise = awaitPending(item.id, 1000);
  await resolvePending(p, item.id, { error: "discarded" });
  await assert.rejects(promise, (err: Error) => {
    assert.ok(err.message.includes("discarded"));
    return true;
  });
});

test("awaitPending rejects with timeout after ms elapse", async () => {
  const promise = awaitPending("never-resolved-id", 50);
  await assert.rejects(promise, /timeout/);
});
