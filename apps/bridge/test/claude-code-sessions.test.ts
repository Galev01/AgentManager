import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  computeSessionId,
  deriveDisplayName,
  createSession,
  getOrCreateSession,
  listSessions,
  renameSession,
  setSessionMode,
  endSession,
  resurrectSession,
  touchSession,
} from "../src/services/claude-code-sessions.js";

async function tmp(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "cc-sessions-"));
  return dir;
}

test("computeSessionId is stable for normalized ide+workspace", () => {
  const a = computeSessionId("antigravity", "C:\\Users\\X\\Proj");
  const b = computeSessionId("antigravity", "c:/users/x/proj");
  assert.equal(a, b);
  assert.equal(a.length, 12);
});

test("deriveDisplayName uses basename of workspace", () => {
  assert.equal(
    deriveDisplayName("vscode", "C:\\Users\\Gal\\repos\\my-app"),
    "vscode@my-app"
  );
});

test("createSession writes and listSessions reads back", async () => {
  const dir = await tmp();
  const p = path.join(dir, "sessions.json");
  const s = await createSession(p, {
    ide: "antigravity",
    workspace: "C:\\w\\proj",
    openclawSessionId: "oc-shared",
  });
  assert.equal(s.state, "active");
  assert.equal(s.mode, "agent");
  const list = await listSessions(p);
  assert.equal(list.length, 1);
  assert.equal(list[0]!.id, s.id);
});

test("getOrCreateSession is idempotent on ide+workspace", async () => {
  const dir = await tmp();
  const p = path.join(dir, "sessions.json");
  const a = await getOrCreateSession(p, {
    ide: "vscode",
    workspace: "C:\\w\\proj",
    openclawSessionId: "oc-shared",
  });
  const b = await getOrCreateSession(p, {
    ide: "vscode",
    workspace: "c:/w/proj",
    openclawSessionId: "oc-shared",
  });
  assert.equal(a.id, b.id);
  const list = await listSessions(p);
  assert.equal(list.length, 1);
});

test("setSessionMode flips agent <-> manual", async () => {
  const dir = await tmp();
  const p = path.join(dir, "sessions.json");
  const s = await createSession(p, { ide: "cli", workspace: "/tmp", openclawSessionId: "oc" });
  await setSessionMode(p, s.id, "manual");
  const list = await listSessions(p);
  assert.equal(list[0]!.mode, "manual");
});

test("endSession and resurrectSession toggle state", async () => {
  const dir = await tmp();
  const p = path.join(dir, "sessions.json");
  const s = await createSession(p, { ide: "cli", workspace: "/tmp", openclawSessionId: "oc" });
  await endSession(p, s.id);
  assert.equal((await listSessions(p))[0]!.state, "ended");
  await resurrectSession(p, s.id);
  assert.equal((await listSessions(p))[0]!.state, "active");
});

test("renameSession updates displayName only", async () => {
  const dir = await tmp();
  const p = path.join(dir, "sessions.json");
  const s = await createSession(p, { ide: "cli", workspace: "/tmp", openclawSessionId: "oc" });
  await renameSession(p, s.id, "my-name");
  assert.equal((await listSessions(p))[0]!.displayName, "my-name");
});

test("touchSession bumps lastActivityAt and messageCount", async () => {
  const dir = await tmp();
  const p = path.join(dir, "sessions.json");
  const s = await createSession(p, { ide: "cli", workspace: "/tmp", openclawSessionId: "oc" });
  const before = s.lastActivityAt;
  await new Promise((r) => setTimeout(r, 5));
  await touchSession(p, s.id);
  const list = await listSessions(p);
  assert.notEqual(list[0]!.lastActivityAt, before);
  assert.equal(list[0]!.messageCount, 1);
});
