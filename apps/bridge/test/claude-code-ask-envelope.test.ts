import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";
import { fileURLToPath } from "node:url";

import { createAskOrchestrator } from "../src/services/claude-code-ask.js";
import { readTranscript, transcriptPathFor } from "../src/services/claude-code-transcript.js";
import { listPending, resolvePending } from "../src/services/claude-code-pending.js";
import { listSessions, setSessionMode } from "../src/services/claude-code-sessions.js";

type GatewayStub = (method: string, params?: Record<string, unknown>) => Promise<unknown>;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FIXTURE_DIR = path.join(__dirname, "fixtures");

async function makeTmpDir(): Promise<{
  sessionsPath: string;
  pendingPath: string;
  transcriptsDir: string;
}> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "cc-ask-env-"));
  return {
    sessionsPath: path.join(root, "sessions.json"),
    pendingPath: path.join(root, "pending.json"),
    transcriptsDir: root,
  };
}

type Msg = { role: string; content: Array<{ type: string; text: string }> };

function makeGateway(reply = "hello from oc"): GatewayStub {
  const state: { messages: Msg[] } = { messages: [] };
  return async (method, params) => {
    if (method === "sessions.get") return { messages: [...state.messages] };
    if (method === "sessions.create") {
      return { ok: true, key: (params as { key: string }).key };
    }
    if (method === "sessions.send") {
      state.messages.push({
        role: "user",
        content: [{ type: "text", text: String((params as { message: string }).message) }],
      });
      state.messages.push({
        role: "assistant",
        content: [{ type: "text", text: reply }],
      });
      return { ok: true };
    }
    throw new Error(`unexpected gateway method ${method}`);
  };
}

describe("claude-code-ask envelope integration", () => {
  let paths: Awaited<ReturnType<typeof makeTmpDir>>;
  const noop = () => {};

  beforeEach(async () => {
    paths = await makeTmpDir();
  });

  it("agent mode: ask+draft+answer all carry envelopes with correct authors", async () => {
    const orch = createAskOrchestrator({
      ...paths,
      pendingTimeoutMs: 60_000,
      openclawAgentId: "claude-code",
      callGateway: makeGateway("answer body"),
      broadcast: noop,
      replyPollIntervalMs: 5,
      replyTimeoutMs: 1_000,
    });

    const result = await orch.ask({
      ide: "cli",
      workspace: "/tmp/w",
      msgId: "m-abcdef123456",
      question: "pick A or B",
      intent: "decide",
      state: "blocked",
      artifact: "question",
    });

    assert.equal(result.answer, "answer body");
    assert.equal(result.source, "agent");
    assert.deepEqual(result.envelope?.author, { kind: "agent", id: "claude-code" });
    assert.equal(result.envelope?.state, "done");

    const sessions = await listSessions(paths.sessionsPath);
    const events = await readTranscript(transcriptPathFor(paths.transcriptsDir, sessions[0]!.id));

    const ask = events.find((e) => e.kind === "ask")!;
    assert.deepEqual(ask.envelope?.author, { kind: "ide", id: "cli" });
    assert.equal(ask.envelope?.intent, "decide");
    assert.equal(ask.envelope?.state, "blocked");
    assert.equal(ask.envelope?.artifact, "question");

    const draft = events.find((e) => e.kind === "draft")!;
    assert.deepEqual(draft.envelope?.author, { kind: "agent", id: "claude-code" });
    assert.equal(draft.envelope?.state, "review_ready");
    assert.equal(draft.envelope?.artifact, "decision"); // mapped from question
    assert.equal(draft.envelope?.parentMsgId, ask.envelope?.msgId);

    const answer = events.find((e) => e.kind === "answer")!;
    assert.equal(answer.envelope?.state, "done");

    // --- Fixture capture for dashboard work (Tasks 9-13) ---
    await fs.mkdir(FIXTURE_DIR, { recursive: true });
    await fs.writeFile(
      path.join(FIXTURE_DIR, "envelope-transcript.json"),
      JSON.stringify(events, null, 2),
      "utf8"
    );
  });

  it("manual mode: pending carries both envelopes; operator reply is operator-authored", async () => {
    const orch = createAskOrchestrator({
      ...paths,
      pendingTimeoutMs: 5_000,
      openclawAgentId: "claude-code",
      callGateway: makeGateway("draft body"),
      broadcast: noop,
      replyPollIntervalMs: 5,
      replyTimeoutMs: 1_000,
    });

    // Create session via a first ask in agent mode.
    await orch.ask({
      ide: "cli",
      workspace: "/tmp/w",
      msgId: "m-first0000001",
      question: "first",
    });

    // Flip the session to manual.
    const [session] = await listSessions(paths.sessionsPath);
    await setSessionMode(paths.sessionsPath, session!.id, "manual");

    // Fire the manual-mode ask; it will hold until we resolve the pending.
    const manualAsk = orch.ask({
      ide: "cli",
      workspace: "/tmp/w",
      msgId: "m-manual00000001",
      question: "manual decide",
      intent: "decide",
      state: "blocked",
      artifact: "question",
    });

    // Poll for the pending item, then resolve it.
    let pending: Awaited<ReturnType<typeof listPending>>[number] | undefined;
    for (let i = 0; i < 100; i++) {
      const items = await listPending(paths.pendingPath);
      if (items.length > 0) {
        pending = items[0];
        break;
      }
      await new Promise((r) => setTimeout(r, 10));
    }
    if (!pending) throw new Error("no pending item appeared");

    assert.deepEqual(pending.envelope?.author, { kind: "ide", id: "cli" });
    assert.equal(pending.envelope?.intent, "decide");
    assert.equal(pending.envelope?.state, "blocked");
    assert.deepEqual(pending.draftEnvelope?.author, { kind: "agent", id: "claude-code" });

    await resolvePending(paths.pendingPath, pending.id, {
      answer: "take A",
      source: "operator",
      action: "replace",
    });

    const resolved = await manualAsk;
    assert.equal(resolved.source, "operator");
    assert.equal(resolved.action, "replace");
    assert.deepEqual(resolved.envelope?.author, { kind: "operator", id: "default" });
    assert.equal(resolved.envelope?.state, "done");
  });

  it("coerces invalid caller enums, preserves raw on canonical envelope", async () => {
    const orch = createAskOrchestrator({
      ...paths,
      pendingTimeoutMs: 1_000,
      openclawAgentId: "claude-code",
      callGateway: makeGateway("ok"),
      broadcast: noop,
      replyPollIntervalMs: 5,
      replyTimeoutMs: 1_000,
    });

    await orch.ask({
      ide: "cli",
      workspace: "/tmp/w",
      msgId: "m-coerced00001",
      question: "q",
      intent: "chitchat" as never,
      state: "banana" as never,
    });

    const sessions = await listSessions(paths.sessionsPath);
    const events = await readTranscript(transcriptPathFor(paths.transcriptsDir, sessions[0]!.id));
    const ask = events.find((e) => e.kind === "ask")!;
    assert.equal(ask.envelope?.intent, "report");
    assert.equal(ask.envelope?.state, "new");
    assert.equal(ask.envelope?._raw?.intent, "chitchat");
    assert.equal(ask.envelope?._raw?.state, "banana");
  });

  it("throws 'message required' on empty question", async () => {
    const orch = createAskOrchestrator({
      ...paths,
      pendingTimeoutMs: 1_000,
      openclawAgentId: "claude-code",
      callGateway: makeGateway(),
      broadcast: noop,
      replyPollIntervalMs: 5,
      replyTimeoutMs: 1_000,
    });

    await assert.rejects(
      () =>
        orch.ask({
          ide: "cli",
          workspace: "/tmp/w",
          msgId: "m-empty0000001",
          question: "",
        }),
      (err: unknown) => /message required/.test((err as Error).message)
    );
  });

  it("duplicate caller msgId triggers bridge remint on the second ask", async () => {
    const orch = createAskOrchestrator({
      ...paths,
      pendingTimeoutMs: 1_000,
      openclawAgentId: "claude-code",
      callGateway: makeGateway("ok"),
      broadcast: noop,
      replyPollIntervalMs: 5,
      replyTimeoutMs: 1_000,
    });

    await orch.ask({
      ide: "cli",
      workspace: "/tmp/w",
      msgId: "m-dupeabcdefff",
      question: "first",
    });

    await orch.ask({
      ide: "cli",
      workspace: "/tmp/w",
      msgId: "m-dupeabcdefff", // same
      question: "second",
    });

    const sessions = await listSessions(paths.sessionsPath);
    const events = await readTranscript(transcriptPathFor(paths.transcriptsDir, sessions[0]!.id));
    const asks = events.filter((e) => e.kind === "ask");
    assert.equal(asks.length, 2);
    assert.notEqual(asks[0]!.envelope?.msgId, asks[1]!.envelope?.msgId);
    assert.match(asks[1]!.envelope!.msgId, /^m-[a-f0-9]{12}$/);
  });
});
