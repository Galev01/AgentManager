import { test } from "node:test";
import assert from "node:assert/strict";
import {
  runtimeActionSchemas,
  InvalidActionPayloadError,
} from "../src/services/runtime-action-schemas.js";
import type { RuntimeActionId } from "@openclaw-manager/types";

const ALL_ACTIONS: RuntimeActionId[] = [
  "agents.create", "agents.update", "agents.delete",
  "channels.connect", "channels.disconnect",
  "tools.invoke",
  "cron.write", "cron.delete",
  "claudeCode.ask",
  "sessions.send",
  "memory.write",
  "skills.install",
  "config.set",
];

test("every RuntimeActionId has a registered schema", () => {
  for (const id of ALL_ACTIONS) {
    assert.equal(typeof runtimeActionSchemas[id], "function", `missing schema for ${id}`);
  }
  // Also assert there are no extras — every key in the registry must be a known action.
  for (const k of Object.keys(runtimeActionSchemas)) {
    assert.ok(ALL_ACTIONS.includes(k as RuntimeActionId), `unexpected action key: ${k}`);
  }
});

test("agents.create — happy path", () => {
  const r = runtimeActionSchemas["agents.create"]({ name: "alice", workspace: "/w", emoji: ":fire:" });
  assert.equal(r.name, "alice");
  assert.equal(r.workspace, "/w");
  assert.equal(r.emoji, ":fire:");
});

test("agents.create — missing name + workspace gives both fieldErrors", () => {
  try {
    runtimeActionSchemas["agents.create"]({ emoji: ":fire:" });
    assert.fail("should have thrown");
  } catch (e) {
    assert.ok(e instanceof InvalidActionPayloadError);
    assert.equal((e as InvalidActionPayloadError).action, "agents.create");
    const paths = (e as InvalidActionPayloadError).fieldErrors.map((f) => f.path);
    assert.ok(paths.includes("name"));
    assert.ok(paths.includes("workspace"));
  }
});

test("agents.create — non-object payload throws", () => {
  assert.throws(() => runtimeActionSchemas["agents.create"]("not-an-object"), InvalidActionPayloadError);
  assert.throws(() => runtimeActionSchemas["agents.create"](null), InvalidActionPayloadError);
  assert.throws(() => runtimeActionSchemas["agents.create"]([1, 2]), InvalidActionPayloadError);
});

test("agents.update — requires name + updates object", () => {
  const r = runtimeActionSchemas["agents.update"]({ name: "a", updates: { emoji: ":x:" } });
  assert.equal(r.name, "a");
  assert.deepEqual(r.updates, { emoji: ":x:" });
  assert.throws(() => runtimeActionSchemas["agents.update"]({ name: "a" }), InvalidActionPayloadError);
  assert.throws(() => runtimeActionSchemas["agents.update"]({ updates: {} }), InvalidActionPayloadError);
  assert.throws(() => runtimeActionSchemas["agents.update"]({ name: "a", updates: "string" }), InvalidActionPayloadError);
});

test("agents.delete — requires name", () => {
  assert.deepEqual(runtimeActionSchemas["agents.delete"]({ name: "x" }), { name: "x" });
  assert.throws(() => runtimeActionSchemas["agents.delete"]({}), InvalidActionPayloadError);
  assert.throws(() => runtimeActionSchemas["agents.delete"]({ name: "" }), InvalidActionPayloadError);
});

test("channels.connect / disconnect", () => {
  const c = runtimeActionSchemas["channels.connect"]({ channelId: "wa", config: { foo: 1 } });
  assert.equal(c.channelId, "wa");
  assert.deepEqual(c.config, { foo: 1 });
  assert.deepEqual(runtimeActionSchemas["channels.disconnect"]({ channelId: "wa" }), { channelId: "wa" });
  assert.throws(() => runtimeActionSchemas["channels.connect"]({}), InvalidActionPayloadError);
  assert.throws(() => runtimeActionSchemas["channels.disconnect"]({}), InvalidActionPayloadError);
});

test("tools.invoke — requires toolId + JSON-serialisable input", () => {
  const r = runtimeActionSchemas["tools.invoke"]({ toolId: "t1", input: { a: [1, 2] } });
  assert.equal(r.toolId, "t1");
  assert.deepEqual(r.input, { a: [1, 2] });
  assert.throws(() => runtimeActionSchemas["tools.invoke"]({ toolId: "t1" }), InvalidActionPayloadError);
  // input cannot be undefined
  try {
    runtimeActionSchemas["tools.invoke"]({ toolId: "t1", input: undefined });
    assert.fail("should throw");
  } catch (e) {
    assert.ok(e instanceof InvalidActionPayloadError);
  }
});

test("cron.write — validates spec.cron, spec.payload, spec.enabled", () => {
  const r = runtimeActionSchemas["cron.write"]({
    spec: { cron: "* * * * *", payload: { x: 1 }, enabled: true },
  });
  assert.equal(r.spec.cron, "* * * * *");
  assert.deepEqual(r.spec.payload, { x: 1 });
  assert.equal(r.spec.enabled, true);
  assert.equal(r.id, undefined);

  const withId = runtimeActionSchemas["cron.write"]({
    id: "j1",
    spec: { cron: "* * * * *", payload: 0, enabled: false },
  });
  assert.equal(withId.id, "j1");

  // missing spec
  try {
    runtimeActionSchemas["cron.write"]({});
    assert.fail("should throw");
  } catch (e) {
    assert.ok(e instanceof InvalidActionPayloadError);
    const paths = (e as InvalidActionPayloadError).fieldErrors.map((f) => f.path);
    assert.ok(paths.includes("spec"));
  }

  // missing spec.cron
  try {
    runtimeActionSchemas["cron.write"]({ spec: { payload: {}, enabled: true } });
    assert.fail("should throw");
  } catch (e) {
    assert.ok(e instanceof InvalidActionPayloadError);
    const paths = (e as InvalidActionPayloadError).fieldErrors.map((f) => f.path);
    assert.ok(paths.includes("spec.cron"));
  }

  // spec.enabled non-boolean
  try {
    runtimeActionSchemas["cron.write"]({ spec: { cron: "*", payload: {}, enabled: "yes" } });
    assert.fail("should throw");
  } catch (e) {
    assert.ok(e instanceof InvalidActionPayloadError);
    const paths = (e as InvalidActionPayloadError).fieldErrors.map((f) => f.path);
    assert.ok(paths.includes("spec.enabled"));
  }
});

test("cron.delete — requires id", () => {
  assert.deepEqual(runtimeActionSchemas["cron.delete"]({ id: "j1" }), { id: "j1" });
  assert.throws(() => runtimeActionSchemas["cron.delete"]({}), InvalidActionPayloadError);
});

test("claudeCode.ask — requires ide, workspace, msgId, question", () => {
  const r = runtimeActionSchemas["claudeCode.ask"]({
    ide: "cc", workspace: "/w", msgId: "m1", question: "what?",
  });
  assert.equal(r.ide, "cc");
  assert.equal(r.workspace, "/w");
  assert.equal(r.msgId, "m1");
  assert.equal(r.question, "what?");
  // sessionId optional
  const r2 = runtimeActionSchemas["claudeCode.ask"]({
    ide: "cc", workspace: "/w", msgId: "m1", question: "q", sessionId: "s1",
  });
  assert.equal(r2.sessionId, "s1");

  // missing all required fields
  try {
    runtimeActionSchemas["claudeCode.ask"]({});
    assert.fail();
  } catch (e) {
    const paths = (e as InvalidActionPayloadError).fieldErrors.map((f) => f.path);
    for (const p of ["ide", "workspace", "msgId", "question"]) {
      assert.ok(paths.includes(p), `missing path ${p}`);
    }
  }
});

test("sessions.send — requires sessionKey + message", () => {
  const r = runtimeActionSchemas["sessions.send"]({ sessionKey: "s1", message: "hi" });
  assert.equal(r.sessionKey, "s1");
  assert.equal(r.message, "hi");
  assert.throws(() => runtimeActionSchemas["sessions.send"]({ sessionKey: "s1" }), InvalidActionPayloadError);
});

test("memory.write — requires key + JSON value", () => {
  const r = runtimeActionSchemas["memory.write"]({ key: "k", value: [1, "x"] });
  assert.equal(r.key, "k");
  assert.deepEqual(r.value, [1, "x"]);
  assert.throws(() => runtimeActionSchemas["memory.write"]({ key: "k" }), InvalidActionPayloadError);
});

test("skills.install — requires ref", () => {
  assert.deepEqual(runtimeActionSchemas["skills.install"]({ ref: "sk-1" }), { ref: "sk-1" });
  assert.throws(() => runtimeActionSchemas["skills.install"]({}), InvalidActionPayloadError);
});

test("config.set — requires path + value", () => {
  const r = runtimeActionSchemas["config.set"]({ path: "ui.theme", value: "dark" });
  assert.equal(r.path, "ui.theme");
  assert.equal(r.value, "dark");
  assert.throws(() => runtimeActionSchemas["config.set"]({ path: "ui.theme" }), InvalidActionPayloadError);
});

test("InvalidActionPayloadError surfaces structured fieldErrors array", () => {
  try {
    runtimeActionSchemas["agents.create"]({});
    assert.fail();
  } catch (e) {
    assert.ok(e instanceof InvalidActionPayloadError);
    const err = e as InvalidActionPayloadError;
    assert.equal(err.name, "InvalidActionPayloadError");
    assert.ok(Array.isArray(err.fieldErrors));
    assert.ok(err.fieldErrors.length >= 2);
    for (const f of err.fieldErrors) {
      assert.equal(typeof f.path, "string");
      assert.equal(typeof f.message, "string");
    }
  }
});
