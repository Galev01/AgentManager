import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import express from "express";
import { createAuthService } from "../src/services/auth/service.js";
import { actorAssertionAuth, requirePerm } from "../src/auth-middleware.js";
import { signAssertion } from "../src/services/auth/assertion.js";
import { config } from "../src/config.js";

async function mkSvc() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "mw-"));
  const svc = await createAuthService({
    usersPath: path.join(dir, "users.json"),
    rolesPath: path.join(dir, "roles.json"),
    linksPath: path.join(dir, "oidc-links.json"),
    bootstrapPath: path.join(dir, "bootstrap.json"),
    sessionsDir: path.join(dir, "sessions"),
    auditPath: path.join(dir, "audit.jsonl"),
    sessionTtlMs: 60_000, lastSeenThrottleMs: 0, wsTicketTtlMs: 60_000,
  });
  await svc.ensureSystemRoles();
  return svc;
}

function mkApp(mw: express.RequestHandler[], handler: express.RequestHandler): { base: string; close: () => void } {
  const app = express();
  app.use(express.json());
  for (const m of mw) app.use(m);
  app.get("/probe", handler);
  const server = app.listen(0);
  const port = (server.address() as any).port;
  return { base: `http://127.0.0.1:${port}`, close: () => server.close() };
}

test("strict: missing x-ocm-actor -> 401 missing_actor_assertion", async () => {
  const svc = await mkSvc();
  const { base, close } = mkApp(
    [actorAssertionAuth(svc, { strict: true })],
    (_req, res) => res.json({ ok: true }),
  );
  try {
    const res = await fetch(`${base}/probe`);
    assert.equal(res.status, 401);
    const body = await res.json() as { error: string };
    assert.equal(body.error, "missing_actor_assertion");
  } finally { close(); }
});

test("strict: invalid signature -> 401 invalid_actor_assertion", async () => {
  const svc = await mkSvc();
  const { base, close } = mkApp(
    [actorAssertionAuth(svc, { strict: true })],
    (_req, res) => res.json({ ok: true }),
  );
  try {
    const res = await fetch(`${base}/probe`, { headers: { "x-ocm-actor": "garbage.token" } });
    assert.equal(res.status, 401);
    const body = await res.json() as { error: string };
    assert.equal(body.error, "invalid_actor_assertion");
  } finally { close(); }
});

test("strict: expired token -> 401 invalid_actor_assertion", async () => {
  const svc = await mkSvc();
  const { base, close } = mkApp(
    [actorAssertionAuth(svc, { strict: true })],
    (_req, res) => res.json({ ok: true }),
  );
  try {
    const t = signAssertion(config.authAssertionSecret, { sub: "u", sid: "s", ttlMs: -120_000 });
    const res = await fetch(`${base}/probe`, { headers: { "x-ocm-actor": t } });
    assert.equal(res.status, 401);
    const body = await res.json() as { error: string };
    assert.equal(body.error, "invalid_actor_assertion");
  } finally { close(); }
});

test("strict: valid signature but unknown sid -> 401 stale_session", async () => {
  const svc = await mkSvc();
  const { base, close } = mkApp(
    [actorAssertionAuth(svc, { strict: true })],
    (_req, res) => res.json({ ok: true }),
  );
  try {
    const t = signAssertion(config.authAssertionSecret, { sub: "u", sid: "nope", ttlMs: 60_000 });
    const res = await fetch(`${base}/probe`, { headers: { "x-ocm-actor": t } });
    assert.equal(res.status, 401);
    const body = await res.json() as { error: string };
    assert.equal(body.error, "stale_session");
  } finally { close(); }
});

test("strict: valid token + valid session -> next() with req.auth", async () => {
  const svc = await mkSvc();
  await svc.adminCreateUser({ username: "a", password: "pw12345678", roleIds: ["viewer"] }, "system");
  const login = await svc.login({ username: "a", password: "pw12345678" });
  if (!login.ok) throw new Error("login setup failed");
  const { base, close } = mkApp(
    [actorAssertionAuth(svc, { strict: true })],
    (req, res) => res.json({ user: req.auth?.user.username, perms: req.auth?.permissions.length }),
  );
  try {
    const t = signAssertion(config.authAssertionSecret, { sub: login.user.id, sid: login.sessionId, ttlMs: 60_000 });
    const res = await fetch(`${base}/probe`, { headers: { "x-ocm-actor": t } });
    assert.equal(res.status, 200);
    const body = await res.json() as { user: string; perms: number };
    assert.equal(body.user, "a");
    assert.ok(body.perms > 0);
  } finally { close(); }
});

test("requirePerm: permission missing -> 403 with missing field", async () => {
  const svc = await mkSvc();
  await svc.adminCreateUser({ username: "b", password: "pw12345678", roleIds: ["viewer"] }, "system");
  const login = await svc.login({ username: "b", password: "pw12345678" });
  if (!login.ok) throw new Error();
  const { base, close } = mkApp(
    [actorAssertionAuth(svc, { strict: true }), requirePerm("auth.users.write")],
    (_req, res) => res.json({ ok: true }),
  );
  try {
    const t = signAssertion(config.authAssertionSecret, { sub: login.user.id, sid: login.sessionId, ttlMs: 60_000 });
    const res = await fetch(`${base}/probe`, { headers: { "x-ocm-actor": t } });
    assert.equal(res.status, 403);
    const body = await res.json() as { error: string; missing: string };
    assert.equal(body.error, "forbidden");
    assert.equal(body.missing, "auth.users.write");
  } finally { close(); }
});

test("requirePerm: permission present -> next()", async () => {
  const svc = await mkSvc();
  await svc.adminCreateUser({ username: "c", password: "pw12345678", roleIds: ["admin"] }, "system");
  const login = await svc.login({ username: "c", password: "pw12345678" });
  if (!login.ok) throw new Error();
  const { base, close } = mkApp(
    [actorAssertionAuth(svc, { strict: true }), requirePerm("auth.users.write")],
    (_req, res) => res.json({ ok: true }),
  );
  try {
    const t = signAssertion(config.authAssertionSecret, { sub: login.user.id, sid: login.sessionId, ttlMs: 60_000 });
    const res = await fetch(`${base}/probe`, { headers: { "x-ocm-actor": t } });
    assert.equal(res.status, 200);
  } finally { close(); }
});

test("non-strict: missing header -> next() without req.auth", async () => {
  const svc = await mkSvc();
  const { base, close } = mkApp(
    [actorAssertionAuth(svc, { strict: false })],
    (req, res) => res.json({ auth: req.auth ?? null }),
  );
  try {
    const res = await fetch(`${base}/probe`);
    assert.equal(res.status, 200);
    const body = await res.json() as { auth: unknown };
    assert.equal(body.auth, null);
  } finally { close(); }
});
