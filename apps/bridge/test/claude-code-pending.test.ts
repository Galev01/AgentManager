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
  registerWaiter,
  unregisterWaiter,
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

test("resolvePending removes from disk and triggers waiter", async () => {
  const dir = await tmp();
  const p = path.join(dir, "pending.json");
  const item = await createPending(p, { sessionId: "s1", msgId: "m1", question: "q", draft: "d" });
  const waiter = awaitPending(item.id, 1000);
  registerWaiter(item.id, waiter.resolve, waiter.reject);
  await resolvePending(p, item.id, { answer: "final", source: "operator", action: "send-as-is" });
  const got = await waiter.promise;
  assert.equal(got.answer, "final");
  const list = await listPending(p);
  assert.equal(list.length, 0);
});

test("awaitPending times out after given ms if never resolved", async () => {
  const waiter = awaitPending("missing-id", 50);
  registerWaiter("missing-id", waiter.resolve, waiter.reject);
  await assert.rejects(waiter.promise, /timeout/);
  unregisterWaiter("missing-id");
});
