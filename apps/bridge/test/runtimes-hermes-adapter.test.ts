import { test } from "node:test";
import assert from "node:assert/strict";
import { createHermesAdapter } from "../src/services/runtimes/hermes.js";
import type { RuntimeDescriptor, JsonValue } from "@openclaw-manager/types";
import type { HttpClient } from "../src/services/runtimes/adapter-base.js";

const desc: RuntimeDescriptor = {
  id: "hermes-dev", kind: "hermes", displayName: "Hermes",
  endpoint: "http://fake:1", transport: "http", authMode: "bearer",
};

function http(handler: (url: string, init: any) => Promise<JsonValue>): HttpClient {
  return { json: (url, init) => handler(url, init) };
}

test("hermes adapter health OK when probe returns 2xx", async () => {
  const a = createHermesAdapter({
    descriptor: desc, bearer: "tok",
    http: http(async (url) => { if (/\/health$/.test(url)) return { ok: true }; throw new Error("unexpected"); }),
  });
  assert.equal((await a.health()).ok, true);
});

test("hermes adapter health surfaces error detail when probe fails", async () => {
  const a = createHermesAdapter({
    descriptor: desc, bearer: "tok",
    http: http(async () => { throw new Error("502: upstream"); }),
  });
  const h = await a.health();
  assert.equal(h.ok, false);
  assert.match(h.detail ?? "", /502/);
});

test("hermes adapter respects healthPath override (empty string disables probe)", async () => {
  const a = createHermesAdapter({
    descriptor: { ...desc, healthPath: "" }, bearer: "tok",
    http: http(async () => { throw new Error("should not be called"); }),
  });
  const h = await a.health();
  assert.equal(h.ok, true);
  assert.match(h.detail ?? "", /probe disabled/);
});

test("hermes adapter reports honest stub capabilities with reasons", async () => {
  const a = createHermesAdapter({ descriptor: desc, bearer: "tok" });
  const caps = await a.getCapabilities();
  assert.ok(caps.unsupported.includes("sessions.send"), "Phase 1 must not claim write support");
  const part = caps.partial.find((p) => p.id === "agents.list");
  assert.ok(part);
  assert.match(part!.reason, /stub/i);
  assert.equal(part!.lossiness, "lossy");
});
