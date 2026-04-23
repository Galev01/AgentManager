// apps/bridge/test/auth-service.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createAuthService } from "../src/services/auth/service.js";

async function mk() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "auth-svc-"));
  return createAuthService({
    usersPath: path.join(dir, "users.json"),
    rolesPath: path.join(dir, "roles.json"),
    linksPath: path.join(dir, "oidc-links.json"),
    bootstrapPath: path.join(dir, "bootstrap.json"),
    sessionsDir: path.join(dir, "sessions"),
    auditPath: path.join(dir, "audit.jsonl"),
    sessionTtlMs: 60_000, lastSeenThrottleMs: 0, wsTicketTtlMs: 60_000,
  });
}

test("login: unknown user fails", async () => {
  const svc = await mk();
  const r = await svc.login({ username: "nobody", password: "x" });
  assert.equal(r.ok, false);
});
test("login: correct password succeeds", async () => {
  const svc = await mk();
  await svc.ensureSystemRoles();
  const u = await svc.adminCreateUser({ username: "alice", password: "pw12345678", roleIds: ["admin"] }, "system");
  const r = await svc.login({ username: "alice", password: "pw12345678" });
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.user.id, u.id);
});
test("login: disabled user fails", async () => {
  const svc = await mk();
  const u = await svc.adminCreateUser({ username: "bob", password: "pw12345678" }, "system");
  await svc.adminUpdateUser(u.id, { status: "disabled" }, "system");
  assert.equal((await svc.login({ username: "bob", password: "pw12345678" })).ok, false);
});
test("resolveSession returns user + permissions", async () => {
  const svc = await mk();
  await svc.ensureSystemRoles();
  const u = await svc.adminCreateUser({ username: "c", password: "pw12345678", roleIds: ["viewer"] }, "system");
  const login = await svc.login({ username: "c", password: "pw12345678" });
  if (!login.ok) throw new Error("login failed");
  const r = await svc.resolveSession({ sid: login.sessionId });
  assert.ok(r);
  assert.equal(r!.user.id, u.id);
  assert.ok(r!.permissions.includes("overview.view"));
  assert.ok(!r!.permissions.includes("auth.users.write"));
});
test("resolveSession null for unknown sid", async () => {
  const svc = await mk();
  assert.equal(await svc.resolveSession({ sid: "nope" }), null);
});
test("logout revokes session", async () => {
  const svc = await mk();
  await svc.adminCreateUser({ username: "d", password: "pw12345678" }, "system");
  const login = await svc.login({ username: "d", password: "pw12345678" });
  if (!login.ok) throw new Error();
  await svc.logout(login.sessionId);
  assert.equal(await svc.resolveSession({ sid: login.sessionId }), null);
});
test("disabling user invalidates existing session", async () => {
  const svc = await mk();
  const u = await svc.adminCreateUser({ username: "e", password: "pw12345678" }, "system");
  const login = await svc.login({ username: "e", password: "pw12345678" });
  if (!login.ok) throw new Error();
  await svc.adminUpdateUser(u.id, { status: "disabled" }, "system");
  assert.equal(await svc.resolveSession({ sid: login.sessionId }), null);
});
test("changePassword requires old password", async () => {
  const svc = await mk();
  const u = await svc.adminCreateUser({ username: "f", password: "pw12345678" }, "system");
  await assert.rejects(
    () => svc.changePassword(u.id, { oldPassword: "wrong", newPassword: "newpw1234" }),
    /incorrect/,
  );
  await svc.changePassword(u.id, { oldPassword: "pw12345678", newPassword: "newpw1234" });
  assert.equal((await svc.login({ username: "f", password: "newpw1234" })).ok, true);
});
test("adminResetPassword sets new password + revokes sessions", async () => {
  const svc = await mk();
  const u = await svc.adminCreateUser({ username: "g", password: "pw12345678" }, "system");
  const login = await svc.login({ username: "g", password: "pw12345678" });
  if (!login.ok) throw new Error();
  await svc.adminResetPassword(u.id, "freshpw1234", "system");
  assert.equal(await svc.resolveSession({ sid: login.sessionId }), null);
  assert.equal((await svc.login({ username: "g", password: "freshpw1234" })).ok, true);
});
test("bootstrap: creates first admin", async () => {
  const svc = await mk();
  const r = await svc.bootstrap({ token: "tok", username: "root", password: "bootpass12" }, { token: "tok" });
  assert.equal(r.ok, true);
});
test("bootstrap: rejects second run", async () => {
  const svc = await mk();
  await svc.bootstrap({ token: "tok", username: "root", password: "bootpass12" }, { token: "tok" });
  const r2 = await svc.bootstrap({ token: "tok", username: "other", password: "bootpass12" }, { token: "tok" });
  assert.equal(r2.ok, false);
});
test("bootstrap: rejects wrong token", async () => {
  const svc = await mk();
  const r = await svc.bootstrap({ token: "bad", username: "x", password: "bootpass12" }, { token: "tok" });
  assert.equal(r.ok, false);
});
test("legacy migration: accepts ADMIN_PASSWORD when no users, blocked after", async () => {
  const svc = await mk();
  const r = await svc.loginLegacy({ password: "legacy" }, { legacyPassword: "legacy" });
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.user.username, "admin");
  const r2 = await svc.loginLegacy({ password: "legacy" }, { legacyPassword: "legacy" });
  assert.equal(r2.ok, false);
});
