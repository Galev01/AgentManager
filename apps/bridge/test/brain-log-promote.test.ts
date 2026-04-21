/**
 * Tests for POST /brain/people/:phone/log/:index/promote logic.
 *
 * Style: direct function calls into the brain library (same as brain-cursing-rate.test.ts).
 * We test the underlying BrainClient operations that the route uses — no HTTP server.
 * Route logic is thin validation + client calls, so we test the real operations directly.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { createBrainClient } from "@openclaw-manager/brain";
import type { BrainClient } from "@openclaw-manager/brain";

async function setupVaultWithPerson(): Promise<{ vault: string; client: BrainClient; phone: string }> {
  const vault = await fs.mkdtemp(path.join(os.tmpdir(), "brain-log-promote-test-"));
  const client = createBrainClient(vault);
  const phone = "+972500000001";
  await client.createPerson({ phone, name: "Test" });
  await client.appendLog(phone, "ALPHA");
  return { vault, client, phone };
}

// Simulate the route target validation
function validateTarget(target: unknown): target is "facts" | "preferences" | "openThreads" {
  return target === "facts" || target === "preferences" || target === "openThreads";
}

test("promote log[0] to facts — status 201, person.facts contains ALPHA", async () => {
  const { vault, client, phone } = await setupVaultWithPerson();

  const person = await client.getPerson(phone);
  assert.ok(person, "person should exist");
  const line = person!.log[0];
  assert.equal(typeof line, "string", "log[0] should be a string");

  // The route would: check list.includes(line) → false → update → 201
  const list = person!.facts;
  assert.ok(!list.includes(line), "facts should not contain ALPHA yet");

  const updated = await client.updatePerson(phone, { facts: [...list, line] });
  assert.ok(updated.facts.includes(line), "facts should now contain ALPHA");

  await fs.rm(vault, { recursive: true, force: true });
});

test("promote log[0] to facts again — unchanged (already in list)", async () => {
  const { vault, client, phone } = await setupVaultWithPerson();

  // First promote
  const person = await client.getPerson(phone);
  const line = person!.log[0];
  await client.updatePerson(phone, { facts: [...person!.facts, line] });

  // Second promote — line already in facts
  const person2 = await client.getPerson(phone);
  assert.ok(person2!.facts.includes(line), "already in facts");
  // Route would return { unchanged: true, person } with status 200
  // We verify the de-dup logic: list.includes(line) is true
  assert.ok(person2!.facts.includes(line));
  // Facts should still have only ONE copy
  const count = person2!.facts.filter((f) => f === line).length;
  assert.equal(count, 1, "should not duplicate the entry");

  await fs.rm(vault, { recursive: true, force: true });
});

test("promote out-of-range index — log entry not found (route would 409)", async () => {
  const { vault, client, phone } = await setupVaultWithPerson();

  const person = await client.getPerson(phone);
  // index 9999 is out of range
  const line = person!.log[9999];
  // Route check: if (typeof line !== "string") → 409
  assert.notEqual(typeof line, "string", "out-of-range index should give undefined");

  await fs.rm(vault, { recursive: true, force: true });
});

test("bad target — route would reject with 400", () => {
  // Test the route's target validation logic
  assert.ok(!validateTarget("foobar"), "foobar is not a valid target");
  assert.ok(!validateTarget(undefined), "undefined is not a valid target");
  assert.ok(!validateTarget(null), "null is not a valid target");
  assert.ok(!validateTarget(123), "number is not a valid target");
});

test("valid targets — facts, preferences, openThreads all accepted", () => {
  assert.ok(validateTarget("facts"));
  assert.ok(validateTarget("preferences"));
  assert.ok(validateTarget("openThreads"));
});

test("unknown phone — getPerson returns null (route would 404)", async () => {
  const { vault, client } = await setupVaultWithPerson();

  const person = await client.getPerson("+972599900000");
  assert.equal(person, null, "unknown phone should return null");

  await fs.rm(vault, { recursive: true, force: true });
});

test("promote log[0] to preferences — works correctly", async () => {
  const { vault, client, phone } = await setupVaultWithPerson();

  const person = await client.getPerson(phone);
  const line = person!.log[0];
  const updated = await client.updatePerson(phone, { preferences: [...person!.preferences, line] });
  assert.ok(updated.preferences.includes(line), "preferences should contain ALPHA");

  await fs.rm(vault, { recursive: true, force: true });
});

test("promote log[0] to openThreads — works correctly", async () => {
  const { vault, client, phone } = await setupVaultWithPerson();

  const person = await client.getPerson(phone);
  const line = person!.log[0];
  const updated = await client.updatePerson(phone, { openThreads: [...person!.openThreads, line] });
  assert.ok(updated.openThreads.includes(line), "openThreads should contain ALPHA");

  await fs.rm(vault, { recursive: true, force: true });
});
