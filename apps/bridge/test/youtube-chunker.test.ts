import { test } from "node:test";
import assert from "node:assert/strict";
import { chunkTranscript, DEFAULT_STRATEGY } from "../src/services/youtube-chunker.js";
import type { YoutubeTranscriptFile } from "@openclaw-manager/types";

function buildTranscript(videoId: string, segments: { start: number; duration: number; text: string }[]): YoutubeTranscriptFile {
  return {
    videoId,
    source: "youtube-transcript",
    language: "en",
    fetchedAt: "2026-04-20T00:00:00Z",
    segments: segments.map((s) => ({ start: s.start, duration: s.duration, end: s.start + s.duration, text: s.text })),
  };
}

test("chunker — empty transcript → empty chunks", () => {
  const out = chunkTranscript(buildTranscript("abc12345678", []));
  assert.equal(out.chunks.length, 0);
});

test("chunker — single short segment → one chunk", () => {
  const out = chunkTranscript(buildTranscript("abc12345678", [
    { start: 0, duration: 3, text: "hello world" },
  ]));
  assert.equal(out.chunks.length, 1);
  assert.equal(out.chunks[0]!.start, 0);
  assert.equal(out.chunks[0]!.text.includes("hello"), true);
});

test("chunker — multiple small segments combine until size cap", () => {
  const segs = Array.from({ length: 10 }, (_, i) => ({
    start: i * 2,
    duration: 2,
    text: "word ".repeat(50),
  }));
  const out = chunkTranscript(buildTranscript("abc12345678", segs));
  assert.ok(out.chunks.length >= 1);
  for (const c of out.chunks) {
    assert.ok(c.text.length <= DEFAULT_STRATEGY.maxChars + 200, `chunk too big: ${c.text.length}`);
  }
});

test("chunker — hard ceiling on maxSegmentsPerChunk", () => {
  const segs = Array.from({ length: 200 }, (_, i) => ({
    start: i, duration: 1, text: "a",
  }));
  const out = chunkTranscript(buildTranscript("abc12345678", segs));
  for (const c of out.chunks) {
    assert.ok(c.segmentIndexes.length <= DEFAULT_STRATEGY.maxSegmentsPerChunk, "segment count exceeded ceiling");
  }
});

test("chunker — deterministic across re-runs", () => {
  const segs = Array.from({ length: 30 }, (_, i) => ({
    start: i * 3, duration: 3, text: `text ${i} `.repeat(10),
  }));
  const a = chunkTranscript(buildTranscript("abc12345678", segs));
  const b = chunkTranscript(buildTranscript("abc12345678", segs));
  assert.deepEqual(
    a.chunks.map((c) => [c.id, c.start, c.end, c.text]),
    b.chunks.map((c) => [c.id, c.start, c.end, c.text])
  );
});

test("chunker — id is stable 16-hex hash", () => {
  const out = chunkTranscript(buildTranscript("abc12345678", [
    { start: 0, duration: 5, text: "hello" },
  ]));
  assert.match(out.chunks[0]!.id, /^[a-f0-9]{16}$/);
});
