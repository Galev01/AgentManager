import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createTelemetryLog } from "../src/services/telemetry-log.js";
import type { TelemetryEventInput } from "@openclaw-manager/types";

async function tmpDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "telemetry-log-"));
}

function mkInput(partial: Partial<TelemetryEventInput> = {}): TelemetryEventInput {
  return {
    schemaVersion: 1,
    eventId: `ev-${Math.random().toString(36).slice(2, 10)}`,
    source: "dashboard",
    actor: { type: "user", id: "admin" },
    feature: "conversations",
    action: "opened",
    route: "/conversations",
    context: { conversationKey: "wa:972" },
    ...partial,
  };
}

test("append writes JSONL line with canonical ts", async () => {
  const dir = await tmpDir();
  const log = createTelemetryLog({ dir, retentionDays: 30, maxDiskMB: 200 });
  const stored = await log.append(mkInput());
  assert.ok(stored.ts, "canonical ts must be set");
  const day = stored.ts.slice(0, 10);
  const file = path.join(dir, `actions-${day}.jsonl`);
  const raw = await fs.readFile(file, "utf8");
  const parsed = JSON.parse(raw.trim().split("\n").pop()!);
  assert.equal(parsed.eventId, stored.eventId);
  assert.equal(parsed.ts, stored.ts);
});

test("append serializes concurrent writes (no interleaving)", async () => {
  const dir = await tmpDir();
  const log = createTelemetryLog({ dir, retentionDays: 30, maxDiskMB: 200 });
  await Promise.all(Array.from({ length: 50 }, () => log.append(mkInput())));
  const files = await fs.readdir(dir);
  const all = (
    await Promise.all(files.map((f) => fs.readFile(path.join(dir, f), "utf8")))
  ).join("");
  const lines = all.trim().split("\n");
  assert.equal(lines.length, 50);
  for (const line of lines) JSON.parse(line);
});

test("query returns newest-first and paginates with (ts, eventId) cursor", async () => {
  const dir = await tmpDir();
  const log = createTelemetryLog({ dir, retentionDays: 30, maxDiskMB: 200 });
  const stored: Array<{ ts: string; eventId: string }> = [];
  for (let i = 0; i < 5; i++) {
    const ev = await log.append(mkInput({ eventId: `ev-${i}` }));
    stored.push({ ts: ev.ts, eventId: ev.eventId });
    await new Promise((r) => setTimeout(r, 2));
  }
  const { events, nextCursor } = await log.query({ limit: 3 });
  assert.equal(events.length, 3);
  assert.equal(events[0].eventId, "ev-4");
  assert.equal(events[2].eventId, "ev-2");
  assert.ok(nextCursor);

  const page2 = await log.query({ limit: 3, until: nextCursor! });
  assert.equal(page2.events.length, 2);
  assert.equal(page2.events[0].eventId, "ev-1");
  assert.equal(page2.events[1].eventId, "ev-0");
});

test("query filters by feature and action", async () => {
  const dir = await tmpDir();
  const log = createTelemetryLog({ dir, retentionDays: 30, maxDiskMB: 200 });
  await log.append(mkInput({ feature: "agents", action: "opened" }));
  await log.append(mkInput({ feature: "conversations", action: "opened" }));
  await log.append(mkInput({ feature: "agents", action: "run_requested" }));
  const res = await log.query({ feature: "agents" });
  assert.equal(res.events.length, 2);
  assert.ok(res.events.every((e) => e.feature === "agents"));
});

test("query with 'since' returns events strictly newer than cursor", async () => {
  const dir = await tmpDir();
  const log = createTelemetryLog({ dir, retentionDays: 30, maxDiskMB: 200 });
  const a = await log.append(mkInput({ eventId: "A" }));
  await new Promise((r) => setTimeout(r, 2));
  await log.append(mkInput({ eventId: "B" }));

  const sinceCursor = Buffer.from(JSON.stringify({ ts: a.ts, eventId: a.eventId })).toString("base64");
  const res = await log.query({ since: sinceCursor });
  assert.equal(res.events.length, 1);
  assert.equal(res.events[0].eventId, "B");
});

test("reader tolerates truncated trailing line", async () => {
  const dir = await tmpDir();
  const log = createTelemetryLog({ dir, retentionDays: 30, maxDiskMB: 200 });
  const ev = await log.append(mkInput());
  const file = path.join(dir, `actions-${ev.ts.slice(0, 10)}.jsonl`);
  await fs.appendFile(file, '{"broken":', "utf8");
  const res = await log.query({});
  assert.equal(res.events.length, 1);
  assert.equal(res.events[0].eventId, ev.eventId);
});

test("validator drops unknown context keys but accepts event", async () => {
  const dir = await tmpDir();
  const log = createTelemetryLog({ dir, retentionDays: 30, maxDiskMB: 200 });
  const ev = await log.append(
    mkInput({
      feature: "conversations",
      action: "opened",
      context: { conversationKey: "wa:1", notInRegistry: "should-be-dropped" } as any,
    })
  );
  assert.equal((ev.context as any).notInRegistry, undefined);
  assert.equal((ev.context as any).conversationKey, "wa:1");
});

test("validator rejects event with oversized identity field", async () => {
  const dir = await tmpDir();
  const log = createTelemetryLog({ dir, retentionDays: 30, maxDiskMB: 200 });
  const huge = "x".repeat(200);
  await assert.rejects(() => log.append(mkInput({ feature: huge })), /identity field too long/);
});
