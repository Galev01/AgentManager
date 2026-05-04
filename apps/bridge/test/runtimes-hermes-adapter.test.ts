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
  const r = await a.invokeAction({
    action: "sessions.send",
    payload: {},
    actor: { humanActorUserId: "u", managerServiceId: "m", basis: "service-principal" },
  });
  assert.equal(r.ok, false);
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
