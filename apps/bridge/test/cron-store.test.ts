/**
 * Unit tests for cron-store.ts
 *
 * Coverage:
 * 1. Initial empty state (no file → empty list)
 * 2. remember() stores an entry and it can be looked up
 * 3. lookup() returns null for unknown id
 * 4. forget() removes an entry
 * 5. list() returns all stored entries
 * 6. Persistence: new instance with same path can read entries written by first instance
 */
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createCronStore } from "../src/services/cron-store.js";

let tmpDir: string;
let filePath: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "cron-store-test-"));
  filePath = path.join(tmpDir, "cron-jobs.json");
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

test("initial state: list returns empty array when file does not exist", async () => {
  const store = createCronStore({ filePath });
  const entries = await store.list();
  assert.deepEqual(entries, []);
});

test("remember() stores an entry retrievable via lookup()", async () => {
  const store = createCronStore({ filePath });
  await store.remember({ id: "job-1", runtimeId: "openclaw", agentName: "main" });
  const entry = await store.lookup("job-1");
  assert.ok(entry !== null);
  assert.equal(entry.id, "job-1");
  assert.equal(entry.runtimeId, "openclaw");
  assert.equal(entry.agentName, "main");
  assert.ok(typeof entry.createdAt === "number" && entry.createdAt > 0);
});

test("lookup() returns null for unknown id", async () => {
  const store = createCronStore({ filePath });
  const entry = await store.lookup("does-not-exist");
  assert.equal(entry, null);
});

test("forget() removes an entry", async () => {
  const store = createCronStore({ filePath });
  await store.remember({ id: "job-to-delete", runtimeId: "openclaw" });
  assert.ok((await store.lookup("job-to-delete")) !== null);
  await store.forget("job-to-delete");
  assert.equal(await store.lookup("job-to-delete"), null);
});

test("forget() on unknown id is a no-op", async () => {
  const store = createCronStore({ filePath });
  // Should not throw
  await store.forget("ghost");
  assert.deepEqual(await store.list(), []);
});

test("list() returns all stored entries", async () => {
  const store = createCronStore({ filePath });
  await store.remember({ id: "job-a", runtimeId: "openclaw" });
  await store.remember({ id: "job-b", runtimeId: "hermes", agentName: "bot" });
  const entries = await store.list();
  assert.equal(entries.length, 2);
  const ids = entries.map((e) => e.id).sort();
  assert.deepEqual(ids, ["job-a", "job-b"]);
});

test("persistence: new instance with same filePath reads entries from disk", async () => {
  const store1 = createCronStore({ filePath });
  await store1.remember({ id: "persisted-job", runtimeId: "hermes", agentName: "agent1" });

  // New instance — cache is cold
  const store2 = createCronStore({ filePath });
  const entry = await store2.lookup("persisted-job");
  assert.ok(entry !== null);
  assert.equal(entry.runtimeId, "hermes");
  assert.equal(entry.agentName, "agent1");
});

test("remember() creates parent directories if needed", async () => {
  const nestedPath = path.join(tmpDir, "nested", "deep", "cron-jobs.json");
  const store = createCronStore({ filePath: nestedPath });
  await store.remember({ id: "job-nested", runtimeId: "openclaw" });
  const entry = await store.lookup("job-nested");
  assert.ok(entry !== null);
  assert.equal(entry.id, "job-nested");
});
