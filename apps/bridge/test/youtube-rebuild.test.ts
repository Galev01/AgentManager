import { test } from "node:test";
import assert from "node:assert/strict";
import { orderRebuildParts } from "../src/services/youtube-rebuild.js";
import type { YoutubeRebuildPart } from "@openclaw-manager/types";

test("orderRebuildParts — empty input → empty output", () => {
  assert.deepEqual(orderRebuildParts([]), []);
});

test("orderRebuildParts — single part → single part", () => {
  assert.deepEqual(orderRebuildParts(["captions"]), ["captions"]);
  assert.deepEqual(orderRebuildParts(["summary"]), ["summary"]);
  assert.deepEqual(orderRebuildParts(["chat-history"]), ["chat-history"]);
});

test("orderRebuildParts — [chunks, captions] → [captions, chunks]", () => {
  assert.deepEqual(orderRebuildParts(["chunks", "captions"]), ["captions", "chunks"]);
});

test("orderRebuildParts — [summary, captions, chunks] → [captions, chunks, summary]", () => {
  assert.deepEqual(
    orderRebuildParts(["summary", "captions", "chunks"]),
    ["captions", "chunks", "summary"],
  );
});

test("orderRebuildParts — [chat-history, summary, chunks, captions] → canonical order", () => {
  assert.deepEqual(
    orderRebuildParts(["chat-history", "summary", "chunks", "captions"]),
    ["captions", "chunks", "summary", "chat-history"],
  );
});

test("orderRebuildParts — duplicates are deduplicated", () => {
  assert.deepEqual(orderRebuildParts(["summary", "summary"]), ["summary"]);
  assert.deepEqual(
    orderRebuildParts(["captions", "chunks", "captions", "chunks"]),
    ["captions", "chunks"],
  );
});

test("orderRebuildParts — all six parts in reverse order → canonical order", () => {
  const reversed: YoutubeRebuildPart[] = [
    "chat-history",
    "chapters",
    "highlights",
    "summary",
    "chunks",
    "captions",
  ];
  assert.deepEqual(orderRebuildParts(reversed), [
    "captions",
    "chunks",
    "summary",
    "highlights",
    "chapters",
    "chat-history",
  ]);
});

test("orderRebuildParts — [highlights, summary] → [summary, highlights] (canonical tie-break)", () => {
  assert.deepEqual(orderRebuildParts(["highlights", "summary"]), ["summary", "highlights"]);
});
