import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateEffective } from "../src/services/auth/permissions.js";
import type { AuthUser, AuthRole } from "@openclaw-manager/types";

function mkUser(p: Partial<AuthUser> = {}): AuthUser {
  return { id: "u", username: "u", usernameKey: "u", status: "active", roleIds: [], grants: [], linkedIdentities: [], createdAt: "", updatedAt: "", ...p };
}
function mkRole(p: Partial<AuthRole> = {}): AuthRole {
  return { id: "r", name: "r", system: false, grants: [], createdAt: "", updatedAt: "", ...p };
}

test("disabled user has zero permissions", () => {
  const u = mkUser({ status: "disabled", grants: [{ permissionId: "overview.view", kind: "allow" }] });
  assert.deepEqual(evaluateEffective(u, []), []);
});
test("direct allow", () => {
  assert.deepEqual(evaluateEffective(mkUser({ grants: [{ permissionId: "overview.view", kind: "allow" }] }), []), ["overview.view"]);
});
test("role allow", () => {
  const r = mkRole({ id: "r1", grants: [{ permissionId: "conversations.view", kind: "allow" }] });
  assert.deepEqual(evaluateEffective(mkUser({ roleIds: ["r1"] }), [r]), ["conversations.view"]);
});
test("user deny overrides role allow", () => {
  const r = mkRole({ id: "r1", grants: [{ permissionId: "conversations.view", kind: "allow" }] });
  const u = mkUser({ roleIds: ["r1"], grants: [{ permissionId: "conversations.view", kind: "deny" }] });
  assert.deepEqual(evaluateEffective(u, [r]), []);
});
test("user deny overrides direct allow", () => {
  const u = mkUser({ grants: [
    { permissionId: "agents.view", kind: "allow" },
    { permissionId: "agents.view", kind: "deny" },
  ]});
  assert.deepEqual(evaluateEffective(u, []), []);
});
test("union across roles", () => {
  const roles = [
    mkRole({ id: "a", grants: [{ permissionId: "overview.view", kind: "allow" }] }),
    mkRole({ id: "b", grants: [{ permissionId: "agents.view", kind: "allow" }] }),
  ];
  assert.deepEqual(evaluateEffective(mkUser({ roleIds: ["a", "b"] }), roles).sort(), ["agents.view", "overview.view"]);
});
test("missing role ignored", () => {
  assert.deepEqual(evaluateEffective(mkUser({ roleIds: ["nope"] }), []), []);
});
