/**
 * Tests for GET /brain/people/:phone/preview logic.
 *
 * Style: direct function calls into the brain library (same as brain-cursing-rate.test.ts).
 * Tests renderInjectionPreview({ brain, person }) with real objects — no HTTP server.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { renderInjectionPreview, createBrainClient } from "@openclaw-manager/brain";
import type { GlobalBrain, BrainPerson } from "@openclaw-manager/types";

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

function basePerson(overrides?: Partial<BrainPerson>): BrainPerson {
  return {
    phone: "+972500000000",
    jid: null,
    name: "Test",
    aliases: [],
    tags: [],
    relationship: null,
    language: null,
    status: "active",
    created: null,
    lastSeen: null,
    summary: "",
    facts: [],
    preferences: [],
    openThreads: [],
    notes: "",
    log: [],
    cursing: false,
    cursingRate: 70,
    curses: [],
    raw: "",
    parseWarning: null,
    ...overrides,
  };
}

test("GET /brain/people/:phone/preview — unknown phone: getPerson returns null (route would 404)", async () => {
  // Simulate the route logic: getPerson returns null → 404.
  // Route handler: if (!person) { res.status(404).json({ error: "Not found" }); return; }
  // We verify getPerson returns null for a non-existent phone.
  const vault = await fs.mkdtemp(path.join(os.tmpdir(), "brain-person-preview-test-"));
  const client = createBrainClient(vault);
  const person = await client.getPerson("+972599999999");
  assert.equal(person, null, "getPerson should return null for unknown phone");
  await fs.rm(vault, { recursive: true, force: true });
});

test("GET /brain/people/:phone/preview — known phone + global + person: merged breakdown", () => {
  const brain: GlobalBrain = {
    ...emptyBrain(),
    persona: "agent",
    hardRules: ["no lies"],
  };
  const person = basePerson({
    summary: "A test user",
    facts: ["likes coffee"],
    preferences: ["short replies"],
    openThreads: ["pending task"],
  });

  const preview = renderInjectionPreview({ brain, person });
  const sources = preview.breakdown.map((c) => c.source);
  const labels = preview.breakdown.map((c) => c.label);

  // Global chunks come first
  assert.equal(sources[0], "global");
  assert.equal(labels[0], "persona");

  // Person chunks present
  assert.ok(labels.includes("summary"), "should include summary");
  assert.ok(labels.includes("facts"), "should include facts");
  assert.ok(labels.includes("preferences"), "should include preferences");
  assert.ok(labels.includes("openThreads"), "should include openThreads");

  // Global chunks before person chunks in ordering
  const firstPersonIdx = sources.indexOf("person");
  const lastGlobalIdx = sources.lastIndexOf("global");
  assert.ok(
    lastGlobalIdx < firstPersonIdx,
    `global chunks (last at ${lastGlobalIdx}) should come before person chunks (first at ${firstPersonIdx})`
  );
});

test("GET /brain/people/:phone/preview — cursing off: no curses chunk", () => {
  const brain: GlobalBrain = { ...emptyBrain(), persona: "agent" };
  const person = basePerson({
    cursing: false,
    curses: ["damn", "hell"],
    summary: "a user",
  });

  const preview = renderInjectionPreview({ brain, person });
  for (const chunk of preview.breakdown) {
    assert.notEqual(chunk.source, "curses", "cursing=false should produce no curses chunk");
  }
});

test("GET /brain/people/:phone/preview — cursing on with curses: last chunk is curses/rate", () => {
  const brain: GlobalBrain = { ...emptyBrain(), persona: "agent" };
  const person = basePerson({
    cursing: true,
    curses: ["damn", "hell"],
    cursingRate: 80,
    summary: "a user",
  });

  const preview = renderInjectionPreview({ brain, person });
  const lastChunk = preview.breakdown[preview.breakdown.length - 1];
  assert.equal(lastChunk.source, "curses");
  assert.equal(lastChunk.label, "rate");
  assert.ok(lastChunk.text.includes("80%"), "curses text should mention the rate");
});

test("GET /brain/people/:phone/preview — cursing on but no curses list: no curses chunk", () => {
  const brain: GlobalBrain = { ...emptyBrain(), persona: "agent" };
  const person = basePerson({
    cursing: true,
    curses: [], // empty list
    summary: "a user",
  });

  const preview = renderInjectionPreview({ brain, person });
  for (const chunk of preview.breakdown) {
    assert.notEqual(chunk.source, "curses", "empty curses list should not produce a curses chunk");
  }
});
