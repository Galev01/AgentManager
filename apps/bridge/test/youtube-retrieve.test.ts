import { test } from "node:test";
import assert from "node:assert/strict";
import { buildMiniSearch } from "../src/services/youtube-retrieval-index.js";
import { searchIndex } from "../src/services/youtube-retrieve.js";
import type { YoutubeChunk } from "@openclaw-manager/types";

const chunks: YoutubeChunk[] = [
  { id: "a", videoId: "v", start: 0,  end: 10, text: "React hooks are functions that let you use state and lifecycle in functional components.", segmentIndexes: [0], tokenEstimate: 30 },
  { id: "b", videoId: "v", start: 10, end: 20, text: "useState hook returns a pair: current state and a function to update it.",                            segmentIndexes: [1], tokenEstimate: 20 },
  { id: "c", videoId: "v", start: 20, end: 30, text: "Redux is a predictable state container for JavaScript apps.",                                         segmentIndexes: [2], tokenEstimate: 15 },
];

test("searchIndex — query matches top chunk", () => {
  const ms = buildMiniSearch(chunks);
  const hits = searchIndex(ms, "useState hook", 3);
  assert.ok(hits.length > 0);
  assert.equal(hits[0]!.id, "b");
});

test("searchIndex — k limits results", () => {
  const ms = buildMiniSearch(chunks);
  const hits = searchIndex(ms, "state", 1);
  assert.equal(hits.length, 1);
});

test("searchIndex — no match returns empty", () => {
  const ms = buildMiniSearch(chunks);
  const hits = searchIndex(ms, "zzz-nonsense-zzz", 5);
  assert.equal(hits.length, 0);
});
