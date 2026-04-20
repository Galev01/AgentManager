/**
 * Tests for GET /brain/agent/preview logic.
 *
 * Style: direct function calls into the brain library (same as brain-cursing-rate.test.ts).
 * Tests renderInjectionPreview() from @openclaw-manager/brain with a real GlobalBrain object.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { renderInjectionPreview } from "@openclaw-manager/brain";
import type { GlobalBrain } from "@openclaw-manager/types";

function emptyBrain(): GlobalBrain {
  return {
    persona: "",
    hardRules: [],
    globalFacts: [],
    toneStyle: "",
    doNotSay: [],
    defaultGoals: [],
    parseWarning: null,
    updatedAt: null,
  };
}

test("GET /brain/agent/preview — empty brain returns empty breakdown", () => {
  const preview = renderInjectionPreview({ brain: emptyBrain() });
  assert.deepEqual(preview.breakdown, []);
  assert.equal(preview.system, "");
});

test("GET /brain/agent/preview — persona chunk is first with source=global and label=persona", () => {
  const brain: GlobalBrain = {
    ...emptyBrain(),
    persona: "I am a helpful assistant",
    hardRules: ["r1"],
  };
  const preview = renderInjectionPreview({ brain });
  assert.ok(preview.breakdown.length >= 1, "should have at least one chunk");
  assert.equal(preview.breakdown[0].source, "global");
  assert.equal(preview.breakdown[0].label, "persona");
});

test("GET /brain/agent/preview — no person chunks when no person provided", () => {
  const brain: GlobalBrain = {
    ...emptyBrain(),
    persona: "hi",
    hardRules: ["r1"],
    globalFacts: ["fact1"],
  };
  const preview = renderInjectionPreview({ brain });
  for (const chunk of preview.breakdown) {
    assert.notEqual(chunk.source, "person", `unexpected person chunk: ${chunk.label}`);
    assert.notEqual(chunk.source, "curses", `unexpected curses chunk: ${chunk.label}`);
  }
});

test("GET /brain/agent/preview — ordering follows persona, hardRules, globalFacts, toneStyle, doNotSay, defaultGoals", () => {
  const brain: GlobalBrain = {
    persona: "bot",
    hardRules: ["r1"],
    globalFacts: ["f1"],
    toneStyle: "casual",
    doNotSay: ["bad"],
    defaultGoals: ["help"],
    parseWarning: null,
    updatedAt: null,
  };
  const preview = renderInjectionPreview({ brain });
  const labels = preview.breakdown.map((c) => c.label);
  const expected = ["persona", "hardRules", "globalFacts", "toneStyle", "doNotSay", "defaultGoals"];
  assert.deepEqual(labels, expected);
});

test("GET /brain/agent/preview — skips empty fields", () => {
  const brain: GlobalBrain = {
    ...emptyBrain(),
    persona: "bot",
    // hardRules empty — should be skipped
    globalFacts: ["f1"],
  };
  const preview = renderInjectionPreview({ brain });
  const labels = preview.breakdown.map((c) => c.label);
  assert.ok(labels.includes("persona"));
  assert.ok(labels.includes("globalFacts"));
  assert.ok(!labels.includes("hardRules"), "empty hardRules should be skipped");
});
