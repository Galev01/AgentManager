import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createAskOrchestrator } from "../src/services/claude-code-ask.js";
import {
  resolvePending,
  listPending,
} from "../src/services/claude-code-pending.js";
import {
  listSessions,
  setSessionMode,
  computeSessionId,
} from "../src/services/claude-code-sessions.js";
import {
  readTranscript,
  transcriptPathFor,
} from "../src/services/claude-code-transcript.js";

async function tmp(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "cc-ask-"));
}

function makePaths(dir: string) {
  return {
    sessionsPath: path.join(dir, "sessions.json"),
    pendingPath: path.join(dir, "pending.json"),
    transcriptsDir: dir,
  };
}

test("agent mode — returns gateway reply synchronously and logs transcript", async () => {
  const dir = await tmp();
  const p = makePaths(dir);
  const orchestrator = createAskOrchestrator({
    ...p,
    pendingTimeoutMs: 1000,
    sharedOpenclawSessionId: "oc-shared",
    callGateway: async () => ({ reply: "hello from openclaw" }),
    broadcast: () => {},
  });

  const res = await orchestrator.ask({
    ide: "antigravity",
    workspace: "C:\\proj",
    msgId: "m1",
    question: "hi",
  });

  assert.equal(res.answer, "hello from openclaw");
  assert.equal(res.source, "agent");
  const sessions = await listSessions(p.sessionsPath);
  assert.equal(sessions.length, 1);
  const tx = await readTranscript(transcriptPathFor(dir, sessions[0]!.id));
  const kinds = tx.map((e) => e.kind);
  assert.deepEqual(kinds, ["ask", "draft", "answer"]);
});

test("manual mode — creates pending item and waits for operator", async () => {
  const dir = await tmp();
  const p = makePaths(dir);
  const sessionId = computeSessionId("antigravity", "C:\\proj");
  const orchestrator = createAskOrchestrator({
    ...p,
    pendingTimeoutMs: 2000,
    sharedOpenclawSessionId: "oc-shared",
    callGateway: async () => ({ reply: "drafted" }),
    broadcast: () => {},
  });

  // Pre-create session + flip to manual
  await orchestrator.ask({
    ide: "antigravity",
    workspace: "C:\\proj",
    msgId: "m0",
    question: "warmup",
  });
  await setSessionMode(p.sessionsPath, sessionId, "manual");

  const inflight = orchestrator.ask({
    ide: "antigravity",
    workspace: "C:\\proj",
    msgId: "m1",
    question: "needs moderation",
  });

  // Wait until the pending item is visible on disk
  for (let i = 0; i < 50; i++) {
    const items = await listPending(p.pendingPath);
    if (items.length > 0) break;
    await new Promise((r) => setTimeout(r, 10));
  }
  const items = await listPending(p.pendingPath);
  assert.equal(items.length, 1);
  assert.equal(items[0]!.draft, "drafted");

  // Operator sends-as-is
  await resolvePending(p.pendingPath, items[0]!.id, {
    answer: items[0]!.draft,
    source: "operator",
    action: "send-as-is",
  });
  const res = await inflight;
  assert.equal(res.answer, "drafted");
  assert.equal(res.source, "operator");
});

test("manual mode discard — flips session to manual (idempotent) and rejects call", async () => {
  const dir = await tmp();
  const p = makePaths(dir);
  const sessionId = computeSessionId("antigravity", "C:\\proj");
  const orchestrator = createAskOrchestrator({
    ...p,
    pendingTimeoutMs: 2000,
    sharedOpenclawSessionId: "oc-shared",
    callGateway: async () => ({ reply: "drafted" }),
    broadcast: () => {},
  });

  await orchestrator.ask({ ide: "antigravity", workspace: "C:\\proj", msgId: "m0", question: "w" });
  await setSessionMode(p.sessionsPath, sessionId, "manual");

  const inflight = orchestrator.ask({
    ide: "antigravity", workspace: "C:\\proj", msgId: "m1", question: "to be discarded"
  });
  for (let i = 0; i < 50; i++) {
    if ((await listPending(p.pendingPath)).length > 0) break;
    await new Promise((r) => setTimeout(r, 10));
  }
  const items = await listPending(p.pendingPath);
  await resolvePending(p.pendingPath, items[0]!.id, { error: "operator discarded reply" });
  await assert.rejects(inflight, /discarded/);
});

test("gateway failure in agent mode surfaces as error", async () => {
  const dir = await tmp();
  const p = makePaths(dir);
  const orchestrator = createAskOrchestrator({
    ...p,
    pendingTimeoutMs: 1000,
    sharedOpenclawSessionId: "oc-shared",
    callGateway: async () => { throw new Error("gateway offline"); },
    broadcast: () => {},
  });
  await assert.rejects(
    orchestrator.ask({ ide: "a", workspace: "/p", msgId: "m1", question: "q" }),
    /gateway/
  );
});
