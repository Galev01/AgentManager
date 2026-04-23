import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createAuthStore } from "../src/services/auth/store.js";

async function mk() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "auth-store-"));
  return createAuthStore({
    usersPath: path.join(dir, "users.json"),
    rolesPath: path.join(dir, "roles.json"),
    linksPath: path.join(dir, "oidc-links.json"),
    bootstrapPath: path.join(dir, "bootstrap.json"),
  });
}

test("empty initially", async () => {
  const s = await mk();
  assert.equal(await s.isEmpty(), true);
});
test("createUser lowercases key and dedups case-insensitively", async () => {
  const s = await mk();
  const u = await s.createUser({ username: "Alice", roleIds: ["admin"] });
  assert.equal(u.usernameKey, "alice");
  assert.deepEqual(await s.findByUsername("ALICE"), u);
  await assert.rejects(() => s.createUser({ username: "alice" }), /already exists/);
});
test("updateUser patches fields", async () => {
  const s = await mk();
  const u = await s.createUser({ username: "x" });
  const p = await s.updateUser(u.id, { displayName: "Mr X", status: "disabled" });
  assert.equal(p.displayName, "Mr X");
  assert.equal(p.status, "disabled");
});
test("setLocalPassword / clearLocalPassword / recordLogin / deleteUser", async () => {
  const s = await mk();
  const u = await s.createUser({ username: "c" });
  await s.setLocalPassword(u.id, "scrypt-v1$stub");
  assert.equal((await s.getUser(u.id))?.local?.passwordHash, "scrypt-v1$stub");
  await s.clearLocalPassword(u.id);
  assert.equal((await s.getUser(u.id))?.local, undefined);
  await s.recordLogin(u.id);
  assert.ok((await s.getUser(u.id))?.lastLoginAt);
  await s.deleteUser(u.id);
  assert.equal(await s.getUser(u.id), null);
});
test("roles: create/list/update/delete + system roles protected", async () => {
  const s = await mk();
  const r = await s.createRole({ name: "Op", grants: ["overview.view"] });
  assert.equal(r.system, false);
  const patched = await s.updateRole(r.id, { description: "ops" });
  assert.equal(patched.description, "ops");
  await s.deleteRole(r.id);
  assert.equal(await s.getRole(r.id), null);
  const sr = await s.upsertSystemRole("admin", { name: "Admin", grants: ["overview.view"] });
  assert.equal(sr.system, true);
  await assert.rejects(() => s.updateRole("admin", { grants: ["agents.view"] }), /system role/);
  await assert.rejects(() => s.deleteRole("admin"), /system role/);
});
test("oidc link add/find/remove", async () => {
  const s = await mk();
  const u = await s.createUser({ username: "o" });
  await s.linkOidc(u.id, { providerKey: "default", issuer: "https://iss", sub: "s1" });
  assert.equal((await s.findUserByOidc("default", "https://iss", "s1"))?.id, u.id);
  await s.unlinkOidc(u.id, "default", "https://iss", "s1");
  assert.equal(await s.findUserByOidc("default", "https://iss", "s1"), null);
});
test("bootstrap markers", async () => {
  const s = await mk();
  assert.equal(await s.bootstrapCompletedAt(), null);
  await s.markBootstrapComplete("u1");
  assert.ok(await s.bootstrapCompletedAt());
});
