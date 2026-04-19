import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  appendTranscript,
  readTranscript,
  transcriptPathFor,
} from "../src/services/claude-code-transcript.js";

async function tmp(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "cc-tx-"));
}

test("transcriptPathFor joins dir and id", () => {
  const p = transcriptPathFor("/a/b", "deadbeef1234");
  assert.ok(p.endsWith("deadbeef1234.jsonl"));
});

test("appendTranscript writes one JSON line per call and readTranscript returns in order", async () => {
  const dir = await tmp();
  const p = transcriptPathFor(dir, "s1");
  await appendTranscript(p, { t: "2026-04-19T10:00:00Z", kind: "ask", msgId: "m1", question: "hi" });
  await appendTranscript(p, { t: "2026-04-19T10:00:01Z", kind: "draft", msgId: "m1", draft: "d" });
  await appendTranscript(p, {
    t: "2026-04-19T10:00:02Z",
    kind: "answer",
    msgId: "m1",
    answer: "hi back",
    source: "agent",
  });
  const events = await readTranscript(p);
  assert.equal(events.length, 3);
  assert.equal(events[0]!.kind, "ask");
  assert.equal(events[2]!.answer, "hi back");
});

test("readTranscript on missing file returns []", async () => {
  const dir = await tmp();
  const events = await readTranscript(path.join(dir, "nope.jsonl"));
  assert.deepEqual(events, []);
});

test("readTranscript skips malformed lines", async () => {
  const dir = await tmp();
  const p = transcriptPathFor(dir, "s1");
  await appendTranscript(p, { t: "2026-04-19T10:00:00Z", kind: "ask", msgId: "m1", question: "q" });
  await fs.appendFile(p, "not-json\n", "utf8");
  const events = await readTranscript(p);
  assert.equal(events.length, 1);
});
