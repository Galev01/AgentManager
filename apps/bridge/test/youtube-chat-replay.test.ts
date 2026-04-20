import { test } from "node:test";
import assert from "node:assert/strict";
import { splitForReplay } from "../src/services/youtube-chat-replay.js";
import type { YoutubeChatMessageRow } from "@openclaw-manager/types";

function row(id: string, role: "user" | "assistant", content: string, createdAt: string): YoutubeChatMessageRow {
  return {
    id, videoId: "v", chatSessionId: "v-main", turnId: id,
    role, content, createdAt, status: "complete",
  };
}

test("splitForReplay — <=4 turns → all verbatim, nothing to distill", () => {
  const rows = [
    row("1", "user", "q1", "2026-04-20T10:00:00Z"),
    row("2", "assistant", "a1", "2026-04-20T10:00:01Z"),
    row("3", "user", "q2", "2026-04-20T10:00:02Z"),
    row("4", "assistant", "a2", "2026-04-20T10:00:03Z"),
  ];
  const { verbatim, older } = splitForReplay(rows, 4);
  assert.equal(verbatim.length, 4);
  assert.equal(older.length, 0);
});

test("splitForReplay — >4 turns → last 4 verbatim, earlier becomes older", () => {
  const rows = [
    row("1", "user", "q1", "2026-04-20T10:00:00Z"),
    row("2", "assistant", "a1", "2026-04-20T10:00:01Z"),
    row("3", "user", "q2", "2026-04-20T10:00:02Z"),
    row("4", "assistant", "a2", "2026-04-20T10:00:03Z"),
    row("5", "user", "q3", "2026-04-20T10:00:04Z"),
    row("6", "assistant", "a3", "2026-04-20T10:00:05Z"),
  ];
  const { verbatim, older } = splitForReplay(rows, 4);
  assert.equal(verbatim.length, 4);
  assert.deepEqual(verbatim.map((r) => r.id), ["3", "4", "5", "6"]);
  assert.deepEqual(older.map((r) => r.id), ["1", "2"]);
});
