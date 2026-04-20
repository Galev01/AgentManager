import { test } from "node:test";
import assert from "node:assert/strict";
import { chunkId } from "../src/services/youtube-chunk-id.js";

test("chunkId — deterministic for same inputs", () => {
  const a = chunkId("dQw4w9WgXcQ", 0);
  const b = chunkId("dQw4w9WgXcQ", 0);
  assert.equal(a, b);
});

test("chunkId — different videoId → different id", () => {
  const a = chunkId("dQw4w9WgXcQ", 0);
  const b = chunkId("aaaaaaaaaaa", 0);
  assert.notEqual(a, b);
});

test("chunkId — different startTime → different id", () => {
  const a = chunkId("dQw4w9WgXcQ", 0);
  const b = chunkId("dQw4w9WgXcQ", 42);
  assert.notEqual(a, b);
});

test("chunkId — 16 hex chars", () => {
  const id = chunkId("dQw4w9WgXcQ", 0);
  assert.match(id, /^[a-f0-9]{16}$/);
});

test("chunkId — fractional seconds coalesce to same bucket", () => {
  assert.equal(chunkId("dQw4w9WgXcQ", 0.0), chunkId("dQw4w9WgXcQ", 0));
});
