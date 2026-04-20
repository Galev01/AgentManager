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

// Stateful gateway stub that mimics sessions.send/get async flow:
// sessions.send appends the user message and schedules an assistant reply;
// sessions.get returns the current message array.
function makeGatewayStub(reply: string, replyDelayMs: number = 10) {
  const messages: Array<{ role: string; content: Array<{ type: string; text: string }> }> = [];
  const callGateway = async (method: string, params?: Record<string, unknown>): Promise<unknown> => {
    if (method === "sessions.get") {
      return { messages: [...messages] };
    }
    if (method === "sessions.send") {
      const userMsg = {
        role: "user",
        content: [{ type: "text", text: String(params?.message ?? "") }],
      };
      messages.push(userMsg);
      const messageSeq = messages.length;
      setTimeout(() => {
        messages.push({
          role: "assistant",
          content: [{ type: "text", text: reply }],
        });
      }, replyDelayMs);
      return { runId: String(params?.idempotencyKey ?? "r"), status: "started", messageSeq };
    }
    throw new Error(`unmocked method: ${method}`);
  };
  return { callGateway, messages };
}

test("agent mode — returns gateway reply and logs transcript", async () => {
  const dir = await tmp();
  const p = makePaths(dir);
  const { callGateway } = makeGatewayStub("hello from openclaw");
  const orchestrator = createAskOrchestrator({
    ...p,
    pendingTimeoutMs: 1000,
    sharedOpenclawSessionId: "oc-shared",
    callGateway,
    broadcast: () => {},
    replyPollIntervalMs: 5,
    replyTimeoutMs: 1000,
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
  const { callGateway } = makeGatewayStub("drafted");
  const orchestrator = createAskOrchestrator({
    ...p,
    pendingTimeoutMs: 2000,
    sharedOpenclawSessionId: "oc-shared",
    callGateway,
    broadcast: () => {},
    replyPollIntervalMs: 5,
    replyTimeoutMs: 1000,
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
  for (let i = 0; i < 100; i++) {
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

test("manual mode discard — flips session to manual and rejects call", async () => {
  const dir = await tmp();
  const p = makePaths(dir);
  const sessionId = computeSessionId("antigravity", "C:\\proj");
  const { callGateway } = makeGatewayStub("drafted");
  const orchestrator = createAskOrchestrator({
    ...p,
    pendingTimeoutMs: 2000,
    sharedOpenclawSessionId: "oc-shared",
    callGateway,
    broadcast: () => {},
    replyPollIntervalMs: 5,
    replyTimeoutMs: 1000,
  });

  await orchestrator.ask({ ide: "antigravity", workspace: "C:\\proj", msgId: "m0", question: "w" });
  await setSessionMode(p.sessionsPath, sessionId, "manual");

  const inflight = orchestrator.ask({
    ide: "antigravity", workspace: "C:\\proj", msgId: "m1", question: "to be discarded"
  });
  for (let i = 0; i < 100; i++) {
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
    replyPollIntervalMs: 5,
    replyTimeoutMs: 500,
  });
  await assert.rejects(
    orchestrator.ask({ ide: "a", workspace: "/p", msgId: "m1", question: "q" }),
    /gateway/
  );
});

test("polling times out when assistant never replies", async () => {
  const dir = await tmp();
  const p = makePaths(dir);
  // Gateway accepts send but never appends an assistant message.
  const messages: Array<{ role: string; content: Array<{ type: string; text: string }> }> = [];
  const callGateway = async (method: string, params?: Record<string, unknown>) => {
    if (method === "sessions.get") return { messages: [...messages] };
    if (method === "sessions.send") {
      messages.push({ role: "user", content: [{ type: "text", text: String(params?.message) }] });
      return { runId: "r", status: "started", messageSeq: messages.length };
    }
    return {};
  };
  const orchestrator = createAskOrchestrator({
    ...p,
    pendingTimeoutMs: 1000,
    sharedOpenclawSessionId: "oc-shared",
    callGateway,
    broadcast: () => {},
    replyPollIntervalMs: 5,
    replyTimeoutMs: 100,
  });
  await assert.rejects(
    orchestrator.ask({ ide: "a", workspace: "/p", msgId: "m1", question: "q" }),
    /timeout/
  );
});
