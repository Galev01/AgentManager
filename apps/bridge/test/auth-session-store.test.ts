// apps/bridge/test/auth-session-store.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createSessionStore } from "../src/services/auth/session-store.js";

async function mk(ttlMs = 60_000, throttleMs = 1_000) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "sess-"));
  return { dir, store: createSessionStore({ dir, ttlMs, lastSeenThrottleMs: throttleMs }) };
}

test("create + get", async () => {
  const { store } = await mk();
  const c = await store.create({ userId: "u1", origin: "local" });
  assert.ok(/^[A-Za-z0-9_-]{43}$/.test(c.id));
  const g = await store.get(c.id);
  assert.equal(g?.userId, "u1");
});

test("get returns null for missing", async () => {
  const { store } = await mk();
  assert.equal(await store.get("nope"), null);
});

test("expired session is deleted on read", async () => {
  const { dir, store } = await mk(0, 0);
  const c = await store.create({ userId: "u1", origin: "local" });
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(await store.get(c.id), null);
  const files = await fs.readdir(dir);
  assert.ok(!files.includes(`${c.id}.json`));
});

test("touch updates lastSeenAt past throttle", async () => {
  const { store } = await mk(60_000, 1_000);
  const c = await store.create({ userId: "u1", origin: "local" });
  await new Promise((r) => setTimeout(r, 1100));
  const t = await store.touch(c.id);
  assert.ok(new Date(t!.lastSeenAt) > new Date(c.lastSeenAt));
});

test("touch no-op within throttle", async () => {
  const { store } = await mk(60_000, 60_000);
  const c = await store.create({ userId: "u1", origin: "local" });
  const t = await store.touch(c.id);
  assert.equal(t?.lastSeenAt, c.lastSeenAt);
});

test("revoke deletes", async () => {
  const { store } = await mk();
  const c = await store.create({ userId: "u1", origin: "local" });
  await store.revoke(c.id);
  assert.equal(await store.get(c.id), null);
});

test("revokeAllForUser", async () => {
  const { store } = await mk();
  const a1 = await store.create({ userId: "a", origin: "local" });
  const a2 = await store.create({ userId: "a", origin: "local" });
  const b1 = await store.create({ userId: "b", origin: "local" });
  const n = await store.revokeAllForUser("a");
  assert.equal(n, 2);
  assert.equal(await store.get(a1.id), null);
  assert.equal(await store.get(a2.id), null);
  assert.ok(await store.get(b1.id));
});

test("listForUser filters by expiry", async () => {
  const { store } = await mk();
  await store.create({ userId: "a", origin: "local" });
  await store.create({ userId: "a", origin: "oidc" });
  await store.create({ userId: "b", origin: "local" });
  assert.equal((await store.listForUser("a")).length, 2);
});
