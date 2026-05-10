import { test } from "node:test";
import assert from "node:assert/strict";
import { createHermesAdapter } from "../src/services/runtimes/hermes.js";
import type { HttpClient } from "../src/services/runtimes/adapter-base.js";
import type { RuntimeDescriptor } from "@openclaw-manager/types";

const desc: RuntimeDescriptor = {
  id: "hermes-remote",
  kind: "hermes",
  displayName: "Hermes",
  endpoint: "http://127.0.0.1:19119",
  transport: "http",
  authMode: "bearer",
};

function fakeHttp(routes: Record<string, unknown>): HttpClient {
  return {
    async json(url, _req) {
      const path = url.replace(/^https?:\/\/[^/]+/, "");
      if (!(path in routes)) throw new Error(`no fake for ${path}`);
      return routes[path] as any;
    },
  };
}

test("getCapabilities reports runtime-reported on success", async () => {
  const a = createHermesAdapter({
    descriptor: desc,
    bearer: "tok",
    http: fakeHttp({
      "/v1/capabilities": {
        supported: ["sessions.list", "sessions.read", "skills.list"],
        partial: [{ id: "logs.tail", reason: "lossy", projectionMode: "inferred", lossiness: "lossy" }],
        unsupported: [],
      },
    }),
  });
  const caps = await a.getCapabilities();
  assert.equal(caps.source, "runtime-reported");
  assert.equal(caps.stale, false);
});

test("getCapabilities returns static-adapter snapshot when shim down", async () => {
  const a = createHermesAdapter({
    descriptor: desc,
    bearer: "tok",
    http: { json: async () => { throw new Error("network down"); } },
  });
  const caps = await a.getCapabilities();
  assert.equal(caps.source, "static-adapter");
  assert.equal(caps.stale, true);
  assert.ok(caps.supported.includes("sessions.list"));
});

test("listEntities('session') hits /v1/sessions", async () => {
  const a = createHermesAdapter({
    descriptor: desc,
    bearer: "tok",
    http: fakeHttp({
      "/v1/sessions": [{ id: "s1", name: "demo", lastActivityAt: 1 }],
    }),
  });
  const ents = await a.listEntities("session");
  assert.equal(ents[0].entityId, "s1");
  assert.equal(ents[0].entityKind, "session");
  assert.equal(ents[0].runtimeKind, "hermes");
});

test("listEntities('agent') returns []", async () => {
  const a = createHermesAdapter({ descriptor: desc, bearer: "tok", http: fakeHttp({}) });
  assert.deepEqual(await a.listEntities("agent"), []);
});

test("invokeAction always returns ok:false in Phase 1", async () => {
  const a = createHermesAdapter({ descriptor: desc, bearer: "tok", http: fakeHttp({}) });
  const r = await a.invokeAction(
    "sessions.send",
    { sessionKey: "s1", message: "hello" },
    { actor: { humanActorUserId: "u", managerServiceId: "m", basis: "service-principal" } },
  );
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.match(r.error, /sessions\.send/);
  }
});

test("invokeAction surfaces action name in error for any unsupported action", async () => {
  const a = createHermesAdapter({ descriptor: desc, bearer: "tok", http: fakeHttp({}) });
  const r = await a.invokeAction(
    "agents.create",
    { name: "n", workspace: "w" },
    { actor: { humanActorUserId: "u", managerServiceId: "m", basis: "service-principal" } },
  );
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.error, /agents\.create/);
});

test("getCapabilities static fallback declares all actions unsupported", async () => {
  const a = createHermesAdapter({
    descriptor: desc,
    bearer: "tok",
    http: { json: async () => { throw new Error("network down"); } },
  });
  const caps = await a.getCapabilities();
  for (const action of ["agents.create", "channels.connect", "tools.invoke", "cron.write", "claudeCode.ask", "sessions.send"]) {
    assert.ok(caps.unsupported.includes(action as any), `${action} should be unsupported`);
  }
});

test("health hits /v1/health", async () => {
  const a = createHermesAdapter({
    descriptor: desc,
    bearer: "tok",
    http: fakeHttp({ "/v1/health": { ok: true, hermes_version: "1.0" } }),
  });
  const h = await a.health();
  assert.equal(h.ok, true);
});
