/**
 * Tests for the routing-rules service: the `isDefault` flag invariants and
 * the fallback behavior in `getRuleForConversation`.
 *
 * The service reads/writes a JSON file at `config.runtimeSettingsPath` (a
 * getter). We override that getter once, at file scope, to point at a temp
 * file, and use `beforeEach` inside a `describe` to wipe it between cases.
 */
import { describe, it, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { config } from "../src/config.js";

const SETTINGS_PATH = path.join(
  os.tmpdir(),
  `ocm-routing-test-${crypto.randomUUID()}.json`
);

Object.defineProperty(config, "runtimeSettingsPath", {
  configurable: true,
  get: () => SETTINGS_PATH,
});

const {
  listRules,
  upsertRule,
  getRuleForConversation,
  getDefaultRule,
} = await import("../src/services/routing-rules.js");

function baseInput(overrides: Partial<Parameters<typeof upsertRule>[0]> = {}) {
  return {
    conversationKey: "",
    phone: "",
    displayName: null,
    relayRecipientIds: [],
    suppressBot: false,
    isDefault: false,
    note: "",
    ...overrides,
  };
}

async function wipe(): Promise<void> {
  await fs.rm(SETTINGS_PATH, { force: true }).catch(() => {});
  await fs.rm(SETTINGS_PATH + ".tmp", { force: true }).catch(() => {});
}

describe("routing-rules service", { concurrency: 1 }, () => {
  beforeEach(async () => {
    await wipe();
  });

  after(async () => {
    await wipe();
  });

  it("upsertRule with isDefault=true creates a default rule with empty conversationKey", async () => {
    const rule = await upsertRule(
      baseInput({ isDefault: true, note: "fallback" })
    );
    assert.equal(rule.isDefault, true);
    assert.equal(rule.conversationKey, "");
    assert.equal(rule.note, "fallback");

    const all = await listRules();
    assert.equal(all.length, 1);
    assert.equal(all[0]!.isDefault, true);
  });

  it("creating a second rule with isDefault=true unsets isDefault on the first", async () => {
    const first = await upsertRule(baseInput({ isDefault: true, note: "first" }));
    const second = await upsertRule(baseInput({ isDefault: true, note: "second" }));

    const all = await listRules();
    assert.equal(all.length, 2);

    const updatedFirst = all.find((r) => r.id === first.id);
    const updatedSecond = all.find((r) => r.id === second.id);
    assert.ok(updatedFirst);
    assert.ok(updatedSecond);
    assert.equal(updatedFirst!.isDefault, false);
    assert.equal(updatedSecond!.isDefault, true);

    const defaults = all.filter((r) => r.isDefault);
    assert.equal(defaults.length, 1);
  });

  it("updating an existing rule to isDefault=true unsets isDefault on others", async () => {
    const defaultRule = await upsertRule(
      baseInput({ isDefault: true, note: "original default" })
    );
    const other = await upsertRule(
      baseInput({ conversationKey: "chat-1", isDefault: false, note: "other" })
    );

    const promoted = await upsertRule(
      baseInput({
        id: other.id,
        conversationKey: "chat-1",
        isDefault: true,
        note: "other",
      })
    );
    assert.equal(promoted.isDefault, true);

    const all = await listRules();
    const originalStillDefault = all.find((r) => r.id === defaultRule.id)!.isDefault;
    assert.equal(originalStillDefault, false);

    const defaults = all.filter((r) => r.isDefault);
    assert.equal(defaults.length, 1);
    assert.equal(defaults[0]!.id, other.id);
  });

  it("getRuleForConversation returns exact match when present", async () => {
    const rule = await upsertRule(
      baseInput({ conversationKey: "chat-known", note: "exact" })
    );
    await upsertRule(baseInput({ isDefault: true, note: "fallback" }));

    const found = await getRuleForConversation("chat-known");
    assert.ok(found);
    assert.equal(found!.id, rule.id);
    assert.equal(found!.note, "exact");
  });

  it("getRuleForConversation returns the default rule when no exact match", async () => {
    await upsertRule(
      baseInput({ conversationKey: "chat-known", note: "exact" })
    );
    const def = await upsertRule(
      baseInput({ isDefault: true, note: "fallback" })
    );

    const found = await getRuleForConversation("chat-missing");
    assert.ok(found);
    assert.equal(found!.id, def.id);
    assert.equal(found!.isDefault, true);
  });

  it("getRuleForConversation returns null when no exact match and no default", async () => {
    await upsertRule(
      baseInput({ conversationKey: "chat-known", note: "exact" })
    );

    const found = await getRuleForConversation("chat-missing");
    assert.equal(found, null);
  });

  it("getDefaultRule returns the default rule or null", async () => {
    assert.equal(await getDefaultRule(), null);
    const def = await upsertRule(baseInput({ isDefault: true }));
    const found = await getDefaultRule();
    assert.ok(found);
    assert.equal(found!.id, def.id);
  });

  it("listRules on legacy settings (rule missing isDefault) normalizes it to false", async () => {
    // Simulate a pre-existing settings file persisted before `isDefault` was
    // introduced: the rule has no `isDefault` field at all.
    const legacy = {
      relayTarget: "",
      delayMs: 0,
      summaryDelayMs: 0,
      updatedAt: 1,
      updatedBy: "system",
      relayRecipients: [],
      routingRules: [
        {
          id: "legacy-1",
          conversationKey: "chat-legacy",
          phone: "",
          displayName: null,
          relayRecipientIds: [],
          suppressBot: false,
          note: "",
        },
      ],
    };
    await fs.writeFile(SETTINGS_PATH, JSON.stringify(legacy), "utf8");

    const rules = await listRules();
    assert.equal(rules.length, 1);
    assert.equal(rules[0]!.id, "legacy-1");
    assert.equal(rules[0]!.isDefault, false);

    const miss = await getRuleForConversation("not-there");
    assert.equal(miss, null);
  });
});
