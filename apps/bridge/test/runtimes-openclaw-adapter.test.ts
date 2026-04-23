import { test } from "node:test";
import assert from "node:assert/strict";
import { createOpenclawAdapter } from "../src/services/runtimes/openclaw.js";
import type { RuntimeDescriptor } from "@openclaw-manager/types";

const desc: RuntimeDescriptor = {
  id: "oc-main", kind: "openclaw", displayName: "OC", endpoint: "http://fake:1",
  transport: "sdk", authMode: "token-env",
};

test("openclaw adapter describeRuntime + getCapabilities", async () => {
  const fakeGateway = async (method: string) => {
    if (method === "agents.list") return { agents: [{ id: "main" }] };
    throw new Error("unexpected");
  };
  const a = createOpenclawAdapter({ descriptor: desc }, { callGateway: fakeGateway });
  const d = await a.describeRuntime();
  assert.equal(d.kind, "openclaw");
  const caps = await a.getCapabilities();
  assert.ok(caps.supported.includes("agents.list"));
  assert.ok(caps.supported.includes("sessions.send"));
});

test("openclaw adapter listEntities agent", async () => {
  const fakeGateway = async (method: string) => {
    if (method === "agents.list") return { agents: [{ id: "main", name: "main" }, { id: "claude-code", name: "claude-code" }] };
    throw new Error(method);
  };
  const a = createOpenclawAdapter({ descriptor: desc }, { callGateway: fakeGateway });
  const rows = await a.listEntities("agent");
  assert.equal(rows.length, 2);
  assert.equal(rows[0].entityId, "main");
  assert.equal(rows[0].runtimeKind, "openclaw");
});

test("openclaw adapter health uses agents.list probe", async () => {
  let called = 0;
  const fakeGateway = async () => { called++; return { agents: [] }; };
  const a = createOpenclawAdapter({ descriptor: desc }, { callGateway: fakeGateway });
  const h = await a.health();
  assert.equal(h.ok, true);
  assert.equal(called, 1);
});
