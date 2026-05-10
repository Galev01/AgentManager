/**
 * Unit tests for agent-sessions-index.ts
 *
 * Coverage:
 * 1. Initial empty state (no file → empty list)
 * 2. remember() stores an entry and it can be looked up
 * 3. lookup() returns null for unknown id
 * 4. forget() removes an entry
 * 5. forget() on unknown id is a no-op
 * 6. list() returns all stored entries
 * 7. Persistence: new instance with same path reads entries written by first instance
 * 8. remember() creates parent directories if needed
 */
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createAgentSessionsIndex } from "../src/services/agent-sessions-index.js";

let tmpDir: string;
let filePath: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "agent-sessions-index-test-"));
  filePath = path.join(tmpDir, "agent-sessions-index.json");
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

test("initial state: list returns empty array when file does not exist", async () => {
  const index = createAgentSessionsIndex({ filePath });
  const entries = await index.list();
  assert.deepEqual(entries, []);
});

test("remember() stores an entry retrievable via lookup()", async () => {
  const index = createAgentSessionsIndex({ filePath });
  await index.remember({ id: "sess-1", runtimeId: "openclaw", agentName: "main" });
  const entry = await index.lookup("sess-1");
  assert.ok(entry !== null);
  assert.equal(entry.id, "sess-1");
  assert.equal(entry.runtimeId, "openclaw");
  assert.equal(entry.agentName, "main");
  assert.ok(typeof entry.createdAt === "number" && entry.createdAt > 0);
});

test("lookup() returns null for unknown id", async () => {
  const index = createAgentSessionsIndex({ filePath });
  const entry = await index.lookup("does-not-exist");
  assert.equal(entry, null);
});

test("forget() removes an entry", async () => {
  const index = createAgentSessionsIndex({ filePath });
  await index.remember({ id: "sess-to-delete", runtimeId: "openclaw" });
  assert.ok((await index.lookup("sess-to-delete")) !== null);
  await index.forget("sess-to-delete");
  assert.equal(await index.lookup("sess-to-delete"), null);
});

test("forget() on unknown id is a no-op", async () => {
  const index = createAgentSessionsIndex({ filePath });
  // Should not throw
  await index.forget("ghost");
  assert.deepEqual(await index.list(), []);
});

test("list() returns all stored entries", async () => {
  const index = createAgentSessionsIndex({ filePath });
  await index.remember({ id: "sess-a", runtimeId: "openclaw" });
  await index.remember({ id: "sess-b", runtimeId: "hermes", agentName: "bot" });
  const entries = await index.list();
  assert.equal(entries.length, 2);
  const ids = entries.map((e) => e.id).sort();
  assert.deepEqual(ids, ["sess-a", "sess-b"]);
});

test("persistence: new instance with same filePath reads entries from disk", async () => {
  const index1 = createAgentSessionsIndex({ filePath });
  await index1.remember({ id: "persisted-sess", runtimeId: "hermes", agentName: "agent1" });

  // New instance — cache is cold
  const index2 = createAgentSessionsIndex({ filePath });
  const entry = await index2.lookup("persisted-sess");
  assert.ok(entry !== null);
  assert.equal(entry.runtimeId, "hermes");
  assert.equal(entry.agentName, "agent1");
});

test("remember() creates parent directories if needed", async () => {
  const nestedPath = path.join(tmpDir, "nested", "deep", "agent-sessions-index.json");
  const index = createAgentSessionsIndex({ filePath: nestedPath });
  await index.remember({ id: "sess-nested", runtimeId: "openclaw" });
  const entry = await index.lookup("sess-nested");
  assert.ok(entry !== null);
  assert.equal(entry.id, "sess-nested");
});
