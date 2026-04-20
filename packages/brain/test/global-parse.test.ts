import { test } from "node:test";
import assert from "node:assert/strict";
import { parseGlobalBrain, serializeGlobalBrain } from "../src/global-schema.js";
import type { GlobalBrain } from "@openclaw-manager/types";

function sample(): GlobalBrain {
  return {
    persona: "Hebrew-first, terse, first-person bot for Acme.",
    hardRules: ["Never promise delivery dates.", "Decline pricing pre-qualification."],
    globalFacts: ["Company: Acme.", "Hours: Sun-Thu 09-18."],
    toneStyle: "No emojis, short paragraphs, no corporate voice.",
    doNotSay: ["lowest price", "money back guarantee"],
    defaultGoals: ["qualify leads", "book intro calls"],
    parseWarning: null,
    updatedAt: null,
  };
}

test("parseGlobalBrain round-trips", () => {
  const raw = serializeGlobalBrain(sample());
  const parsed = parseGlobalBrain(raw);
  const s = sample();
  assert.equal(parsed.persona, s.persona);
  assert.deepEqual(parsed.hardRules, s.hardRules);
  assert.deepEqual(parsed.globalFacts, s.globalFacts);
  assert.equal(parsed.toneStyle, s.toneStyle);
  assert.deepEqual(parsed.doNotSay, s.doNotSay);
  assert.deepEqual(parsed.defaultGoals, s.defaultGoals);
  assert.equal(parsed.parseWarning, null);
});

test("parseGlobalBrain tolerates sections in any order", () => {
  const raw = [
    "---", "kind: brain", "agent: whatsapp", "---",
    "", "# Default Goals", "- qualify",
    "", "# Persona", "One line persona.",
    "", "# Hard Rules", "- rule",
  ].join("\n");
  const parsed = parseGlobalBrain(raw);
  assert.equal(parsed.persona, "One line persona.");
  assert.deepEqual(parsed.hardRules, ["rule"]);
  assert.deepEqual(parsed.defaultGoals, ["qualify"]);
});

test("parseGlobalBrain fills empty sections with empty strings/arrays", () => {
  const parsed = parseGlobalBrain("---\nkind: brain\n---\n");
  assert.equal(parsed.persona, "");
  assert.deepEqual(parsed.hardRules, []);
  assert.deepEqual(parsed.doNotSay, []);
});

test("parseGlobalBrain sets parseWarning on missing frontmatter", () => {
  const parsed = parseGlobalBrain("# Persona\nhello\n");
  assert.equal(parsed.parseWarning, "no-frontmatter");
  assert.equal(parsed.persona, "hello");
});
