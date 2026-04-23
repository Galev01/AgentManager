import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import express from "express";
import { createAuthService } from "../src/services/auth/service.js";
import { createPublicAuthRouter } from "../src/routes/auth.js";

async function mkApp() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ar-"));
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
  const app = express();
  app.use(express.json());
  app.use(createPublicAuthRouter(svc));
  const server = app.listen(0);
  const port = (server.address() as any).port;
  return { svc, base: `http://127.0.0.1:${port}`, close() { server.close(); } };
}

test("POST /auth/login succeeds then /auth/session/resolve returns permissions", async () => {
  const { svc, base, close } = await mkApp();
  try {
    await svc.adminCreateUser({ username: "alice", password: "pw12345678", roleIds: ["viewer"] }, "system");
    const login = await fetch(`${base}/auth/login`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "alice", password: "pw12345678" }),
    });
    assert.equal(login.status, 200);
    const { sessionId } = await login.json() as { sessionId: string };
    const r = await fetch(`${base}/auth/session/resolve`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sid: sessionId }),
    });
    assert.equal(r.status, 200);
    const body = await r.json() as { permissions: string[] };
    assert.ok(body.permissions.includes("overview.view"));
  } finally { close(); }
});

test("POST /auth/login rejects bad creds with 401", async () => {
  const { svc, base, close } = await mkApp();
  try {
    await svc.adminCreateUser({ username: "b", password: "pw12345678" }, "system");
    const res = await fetch(`${base}/auth/login`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "b", password: "wrong" }),
    });
    assert.equal(res.status, 401);
  } finally { close(); }
});

test("POST /auth/login returns bootstrap_required when no users and no legacy pwd", async () => {
  const { base, close } = await mkApp();
  try {
    const res = await fetch(`${base}/auth/login`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "x", password: "y" }),
    });
    assert.equal(res.status, 401);
    const body = await res.json() as { error: string };
    assert.equal(body.error, "bootstrap_required");
  } finally { close(); }
});
