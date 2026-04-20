import { test } from "node:test";
import assert from "node:assert/strict";
import { readSummaryWithFallback, hasV2Artifacts } from "../src/services/youtube-compat.js";

test("readSummaryWithFallback — function is exported", () => {
  assert.equal(typeof readSummaryWithFallback, "function");
});

test("hasV2Artifacts — function is exported", () => {
  assert.equal(typeof hasV2Artifacts, "function");
});

test("readSummaryWithFallback — returns null when neither file exists", async () => {
  const r = await readSummaryWithFallback("zzzzzzzzzzz");
  assert.equal(r, null);
});

test("hasV2Artifacts — returns false when no transcript", async () => {
  const r = await hasV2Artifacts("zzzzzzzzzzz");
  assert.equal(r, false);
});
