/**
 * Tests for GET/PATCH /brain/agent logic.
 *
 * Style: direct function calls into the brain library (same as brain-cursing-rate.test.ts).
 * We test createGlobalBrainClient() from @openclaw-manager/brain in a temp vault directory —
 * no HTTP server needed.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { createGlobalBrainClient } from "@openclaw-manager/brain";
import type { GlobalBrain } from "@openclaw-manager/types";

async function makeTempVault(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "brain-global-test-"));
  return dir;
}

test("GET /brain/agent — missing WhatsApp.md returns empty brain", async () => {
  const vault = await makeTempVault();
  const { resolveBrainPaths } = await import("@openclaw-manager/brain");
  const client = createGlobalBrainClient(resolveBrainPaths(vault));

  const brain = await client.get();

  assert.equal(brain.persona, "");
  assert.deepEqual(brain.hardRules, []);
  assert.deepEqual(brain.globalFacts, []);
  assert.equal(brain.toneStyle, "");
  assert.deepEqual(brain.doNotSay, []);
  assert.deepEqual(brain.defaultGoals, []);

  await fs.rm(vault, { recursive: true, force: true });
});

test("PATCH /brain/agent — persists and GET returns updated values", async () => {
  const vault = await makeTempVault();
  const { resolveBrainPaths } = await import("@openclaw-manager/brain");
  const client = createGlobalBrainClient(resolveBrainPaths(vault));

  const updated = await client.update({ persona: "hi", hardRules: ["r1"] });
  assert.equal(updated.persona, "hi");
  assert.deepEqual(updated.hardRules, ["r1"]);

  const fetched = await client.get();
  assert.equal(fetched.persona, "hi");
  assert.deepEqual(fetched.hardRules, ["r1"]);

  await fs.rm(vault, { recursive: true, force: true });
});

test("PATCH /brain/agent — multiple fields persist together", async () => {
  const vault = await makeTempVault();
  const { resolveBrainPaths } = await import("@openclaw-manager/brain");
  const client = createGlobalBrainClient(resolveBrainPaths(vault));

  await client.update({
    persona: "friendly bot",
    hardRules: ["never lie"],
    globalFacts: ["fact1", "fact2"],
    toneStyle: "casual",
    doNotSay: ["bad word"],
    defaultGoals: ["help user"],
  });

  const fetched = await client.get();
  assert.equal(fetched.persona, "friendly bot");
  assert.deepEqual(fetched.hardRules, ["never lie"]);
  assert.deepEqual(fetched.globalFacts, ["fact1", "fact2"]);
  assert.equal(fetched.toneStyle, "casual");
  assert.deepEqual(fetched.doNotSay, ["bad word"]);
  assert.deepEqual(fetched.defaultGoals, ["help user"]);

  await fs.rm(vault, { recursive: true, force: true });
});
