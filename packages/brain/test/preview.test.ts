import { test } from "node:test";
import assert from "node:assert/strict";
import { renderInjectionPreview } from "../src/preview.js";
import type { BrainPerson, GlobalBrain } from "@openclaw-manager/types";

function makeBrain(overrides: Partial<GlobalBrain> = {}): GlobalBrain {
  return {
    persona: "p", hardRules: ["hr"], globalFacts: ["gf"], toneStyle: "ts",
    doNotSay: ["dns"], defaultGoals: ["dg"], parseWarning: null, updatedAt: null,
    ...overrides,
  };
}

function makePerson(overrides: Partial<BrainPerson> = {}): BrainPerson {
  return {
    phone: "972500000000", jid: null, name: "X", aliases: [], tags: [],
    relationship: null, language: null, status: "active", created: null, lastSeen: null,
    summary: "s", facts: ["f"], preferences: ["pr"], openThreads: ["ot"],
    notes: "", log: [], cursing: false, cursingRate: 70, curses: [],
    raw: "", parseWarning: null,
    ...overrides,
  };
}

test("global-only preview produces chunks in spec order", () => {
  const out = renderInjectionPreview({ brain: makeBrain() });
  const sources = out.breakdown.map((c) => `${c.source}:${c.label}`);
  assert.deepEqual(sources, [
    "global:persona",
    "global:hardRules",
    "global:globalFacts",
    "global:toneStyle",
    "global:doNotSay",
    "global:defaultGoals",
  ]);
});

test("merged preview appends person chunks in order", () => {
  const out = renderInjectionPreview({ brain: makeBrain(), person: makePerson() });
  const sources = out.breakdown.map((c) => `${c.source}:${c.label}`);
  assert.deepEqual(sources, [
    "global:persona", "global:hardRules", "global:globalFacts", "global:toneStyle", "global:doNotSay", "global:defaultGoals",
    "person:summary", "person:facts", "person:preferences", "person:openThreads",
  ]);
});

test("curses:rate appears iff cursing is on with at least one curse", () => {
  const off = renderInjectionPreview({ brain: makeBrain(), person: makePerson({ cursing: false }) });
  assert.equal(off.breakdown.some((c) => c.source === "curses"), false);
  const on = renderInjectionPreview({ brain: makeBrain(), person: makePerson({ cursing: true, curses: ["nope"] }) });
  const last = on.breakdown[on.breakdown.length - 1];
  assert.equal(last.source, "curses");
  assert.equal(last.label, "rate");
});

test("cursing on but empty curses[] — no curses chunk", () => {
  const out = renderInjectionPreview({ brain: makeBrain(), person: makePerson({ cursing: true, curses: [] }) });
  assert.equal(out.breakdown.some((c) => c.source === "curses"), false);
});

test("skips empty global chunks", () => {
  const out = renderInjectionPreview({ brain: makeBrain({ hardRules: [], doNotSay: [] }) });
  const labels = out.breakdown.map((c) => c.label);
  assert.equal(labels.includes("hardRules"), false);
  assert.equal(labels.includes("doNotSay"), false);
});

test("breakdown.source is exactly global | person | curses", () => {
  const out = renderInjectionPreview({ brain: makeBrain(), person: makePerson({ cursing: true, curses: ["x"] }) });
  for (const c of out.breakdown) {
    assert.ok(["global", "person", "curses"].includes(c.source));
  }
});
