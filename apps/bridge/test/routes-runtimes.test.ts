import { test } from "node:test";
import assert from "node:assert/strict";
import express, { type Request, type Response, type NextFunction } from "express";
import { createServer } from "node:http";
import { once } from "node:events";
import { createRuntimesRouter } from "../src/routes/runtimes.js";
import type { RuntimeRegistry } from "../src/services/runtimes/registry.js";
import type { InvokeActionRequest, RuntimeAdapter, RuntimeDescriptor, CapabilitySnapshot } from "@openclaw-manager/types";

function fakeRegistry(captured: { last?: InvokeActionRequest }): RuntimeRegistry {
  const desc: RuntimeDescriptor = {
    id: "oc-main", kind: "openclaw", displayName: "OC", endpoint: "sdk:",
    transport: "sdk", authMode: "token-env",
  };
  const caps: CapabilitySnapshot = { supported: ["agents.list"], partial: [], unsupported: [], version: "1.0.0" };
  const adapter: RuntimeAdapter = {
    describeRuntime: async () => desc,
    getCapabilities: async () => caps,
    listEntities: async () => [],
    getEntity: async () => null,
    listActivity: async () => [],
    invokeAction: async (req) => { captured.last = req; return { ok: true, nativeResult: "fake", projectionMode: "exact" }; },
    getAuthModes: async () => [],
    getExtensions: async () => [],
    health: async () => ({ ok: true }),
  };
  return {
    list: async () => [desc],
    get: async (id) => (id === "oc-main" ? desc : null),
    adapter: async (id) => (id === "oc-main" ? adapter : null),
  };
}

// Stub middleware that simulates upstream strict-actor middleware populating
// req.auth. Routes must read humanActorUserId from req.auth, never from body.
function withAuth(userId: string, permissions: string[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    (req as any).auth = {
      user: { id: userId, username: "gal" },
      permissions,
      claims: { sub: userId, sid: "sess-1", iat: 0, exp: Math.floor(Date.now() / 1000) + 60, username: "gal" },
    };
    next();
  };
}

async function mkApp(permissions: string[] = ["runtimes.view", "runtimes.invoke"], captured: { last?: InvokeActionRequest } = {}) {
  const app = express();
  app.use(express.json());
  app.use(withAuth("user-1", permissions));
  app.use(createRuntimesRouter({ registry: fakeRegistry(captured), managerServiceId: "bridge-primary" }));
  const s = createServer(app);
  s.listen(0);
  await once(s, "listening");
  const port = (s.address() as { port: number }).port;
  return { url: `http://127.0.0.1:${port}`, captured, close: () => new Promise<void>((r) => s.close(() => r())) };
}

test("GET /runtimes returns descriptors when user has runtimes.view", async () => {
  const a = await mkApp();
  try {
    const r = await (await fetch(`${a.url}/runtimes`)).json();
    assert.equal(r.runtimes.length, 1);
  } finally { await a.close(); }
});

test("GET /runtimes rejects 403 when user lacks runtimes.view", async () => {
  const a = await mkApp([]);
  try {
    const r = await fetch(`${a.url}/runtimes`);
    assert.equal(r.status, 403);
  } finally { await a.close(); }
});

test("GET /runtimes/:id/capabilities", async () => {
  const a = await mkApp();
  try {
    const r = await (await fetch(`${a.url}/runtimes/oc-main/capabilities`)).json();
    assert.ok(r.supported.includes("agents.list"));
  } finally { await a.close(); }
});

test("GET /runtimes/:id returns 404 for unknown", async () => {
  const a = await mkApp();
  try {
    const r = await fetch(`${a.url}/runtimes/missing`);
    assert.equal(r.status, 404);
  } finally { await a.close(); }
});

test("POST /runtimes/:id/actions requires runtimes.invoke (403 otherwise)", async () => {
  const a = await mkApp(["runtimes.view"]);
  try {
    const r = await fetch(`${a.url}/runtimes/oc-main/actions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "agents.list", payload: {} }),
    });
    assert.equal(r.status, 403);
  } finally { await a.close(); }
});

test("POST /runtimes/:id/actions injects actor from req.auth and ignores body-supplied actor", async () => {
  const captured: { last?: InvokeActionRequest } = {};
  const a = await mkApp(["runtimes.view", "runtimes.invoke"], captured);
  try {
    const r = await fetch(`${a.url}/runtimes/oc-main/actions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // Body pretends to be a different user — bridge must ignore this.
      body: JSON.stringify({
        action: "agents.list",
        payload: {},
        actor: { humanActorUserId: "attacker", managerServiceId: "evil", basis: "service-principal" },
      }),
    });
    const body = await r.json();
    assert.equal(body.ok, true);
    assert.ok(a.captured.last);
    assert.equal(a.captured.last!.actor.humanActorUserId, "user-1", "bridge must use req.auth.user.id, not body");
    assert.equal(a.captured.last!.actor.managerServiceId, "bridge-primary");
    assert.equal(a.captured.last!.actor.basis, "service-principal");
  } finally { await a.close(); }
});

test("POST /runtimes/:id/actions rejects 400 when action missing", async () => {
  const a = await mkApp();
  try {
    const r = await fetch(`${a.url}/runtimes/oc-main/actions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payload: {} }),
    });
    assert.equal(r.status, 400);
  } finally { await a.close(); }
});

test("POST /runtimes/:id/actions rejects unsupported capability", async () => {
  const a = await mkApp();
  try {
    const r = await fetch(`${a.url}/runtimes/oc-main/actions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "memory.write", payload: {} }),
    });
    // Registry fake declares only supported=["agents.list"] so memory.write is rejected.
    assert.equal(r.status, 400);
    const body = await r.json();
    assert.equal(body.error, "capability_unsupported");
  } finally { await a.close(); }
});
