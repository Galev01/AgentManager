import { test } from "node:test";
import assert from "node:assert/strict";
import { applyUpdate } from "@openclaw-manager/brain";
import type { BrainPerson } from "@openclaw-manager/types";

function basePerson(): BrainPerson {
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
  };
}

test("applyUpdate — cursingRate 1 stays 1 (no 0-1 fraction auto-scaling)", () => {
  const updated = applyUpdate(basePerson(), { cursingRate: 1 });
  assert.equal(updated.cursingRate, 1);
});

test("applyUpdate — cursingRate 0 stays 0", () => {
  const updated = applyUpdate(basePerson(), { cursingRate: 0 });
  assert.equal(updated.cursingRate, 0);
});

test("applyUpdate — cursingRate 100 stays 100", () => {
  const updated = applyUpdate(basePerson(), { cursingRate: 100 });
  assert.equal(updated.cursingRate, 100);
});

test("applyUpdate — cursingRate 50 stays 50", () => {
  const updated = applyUpdate(basePerson(), { cursingRate: 50 });
  assert.equal(updated.cursingRate, 50);
});

test("applyUpdate — fractional 0.5 rounds to 1 (not 50)", () => {
  const updated = applyUpdate(basePerson(), { cursingRate: 0.5 });
  assert.equal(updated.cursingRate, 1);
});

test("applyUpdate — negative value clamps to 0", () => {
  const updated = applyUpdate(basePerson(), { cursingRate: -5 });
  assert.equal(updated.cursingRate, 0);
});

test("applyUpdate — over 100 clamps to 100", () => {
  const updated = applyUpdate(basePerson(), { cursingRate: 150 });
  assert.equal(updated.cursingRate, 100);
});
