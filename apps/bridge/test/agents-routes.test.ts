import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import http from "node:http";
import { createAgentsRouter } from "../src/routes/agents.js";

type StubCalls = Array<{ method: string; params: unknown }>;

function bootApp(opts: {
  perms: string[];
  gatewayHandler?: (method: string, params: unknown) => unknown | Promise<unknown>;
}): { url: string; calls: StubCalls; close: () => void } {
  const calls: StubCalls = [];
  const callGateway = async (method: string, params?: unknown) => {
    calls.push({ method, params: params ?? {} });
    if (!opts.gatewayHandler) throw new Error(`unstubbed gateway call: ${method}`);
    return opts.gatewayHandler(method, params ?? {});
  };
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).auth = { user: { id: "u1" }, permissions: opts.perms };
    next();
  });
  app.use(createAgentsRouter({ callGateway }));
  const server = http.createServer(app).listen(0);
  const addr = server.address() as { port: number };
  return { url: `http://127.0.0.1:${addr.port}`, calls, close: () => server.close() };
}

test("PATCH /agents/:name returns 403 without agents.manage", async () => {
  const a = bootApp({ perms: [] });
  const r = await fetch(`${a.url}/agents/claude-code`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model: "openai-codex/gpt-5.4" }),
  });
  assert.equal(r.status, 403);
  a.close();
});

test("PATCH /agents/:name 400 when model not in catalog", async () => {
  const a = bootApp({
    perms: ["agents.manage"],
    gatewayHandler: (method) => {
      if (method === "models.list") {
        return { models: [{ id: "openai-codex/gpt-5.4", provider: "openai-codex" }] };
      }
      throw new Error(`unexpected: ${method}`);
    },
  });
  const r = await fetch(`${a.url}/agents/claude-code`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model: "ollama/does-not-exist" }),
  });
  assert.equal(r.status, 400);
  const body = await r.json();
  assert.equal(body.error, "invalid_model_id");
  // gateway agents.update must NOT have been called
  assert.equal(a.calls.find((c) => c.method === "agents.update"), undefined);
  a.close();
});

test("PATCH /agents/:name 503 when catalog unavailable and model in body", async () => {
  const a = bootApp({
    perms: ["agents.manage"],
    gatewayHandler: (method) => {
      if (method === "models.list") throw new Error("gateway down");
      throw new Error(`unexpected: ${method}`);
    },
  });
  const r = await fetch(`${a.url}/agents/claude-code`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model: "openai-codex/gpt-5.4" }),
  });
  assert.equal(r.status, 503);
  const body = await r.json();
  assert.equal(body.error, "model_catalog_unavailable");
  assert.equal(a.calls.find((c) => c.method === "agents.update"), undefined);
  a.close();
});

test("PATCH /agents/:name happy path proxies to agents.update", async () => {
  const a = bootApp({
    perms: ["agents.manage"],
    gatewayHandler: (method, params) => {
      if (method === "models.list") {
        return { models: [{ id: "openai-codex/gpt-5.4", provider: "openai-codex" }] };
      }
      if (method === "agents.update") {
        assert.equal((params as any).name, "claude-code");
        assert.equal((params as any).model, "openai-codex/gpt-5.4");
        return { ok: true, agentId: "claude-code" };
      }
      throw new Error(`unexpected: ${method}`);
    },
  });
  const r = await fetch(`${a.url}/agents/claude-code`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model: "openai-codex/gpt-5.4" }),
  });
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.equal(body.ok, true);
  a.close();
});

test("PATCH /agents/:name without model field skips validation and passes through", async () => {
  const a = bootApp({
    perms: ["agents.manage"],
    gatewayHandler: (method) => {
      if (method === "agents.update") return { ok: true };
      throw new Error(`unexpected: ${method}`);
    },
  });
  const r = await fetch(`${a.url}/agents/claude-code`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "renamed" }),
  });
  assert.equal(r.status, 200);
  // models.list not called
  assert.equal(a.calls.find((c) => c.method === "models.list"), undefined);
  a.close();
});

test("PATCH /agents/:name 400 when model is empty string", async () => {
  // Empty string is intentionally rejected: the gateway's `applyAgentConfig`
  // ignores empty/null model values (`...params.model ? { model } : {}`),
  // so passing one is ambiguous "clear-like" input that the bridge will not
  // proxy. Clearing is not supported in Phase 1; the UI uses "Set to current
  // default" instead. See spec § "Set to current default".
  const a = bootApp({
    perms: ["agents.manage"],
    gatewayHandler: () => { throw new Error("should not reach gateway"); },
  });
  const r = await fetch(`${a.url}/agents/claude-code`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model: "" }),
  });
  assert.equal(r.status, 400);
  a.close();
});

test("PATCH /agents/:name 403 even when body has no model field", async () => {
  // Permission is required for any PATCH; the gate is on the route, not just
  // on the model branch. Confirms the gate is not accidentally bypassed when
  // body is, e.g., a name-only update.
  const a = bootApp({ perms: [] });
  const r = await fetch(`${a.url}/agents/claude-code`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "renamed" }),
  });
  assert.equal(r.status, 403);
  a.close();
});

test("DELETE /agents/:name returns 403 without agents.manage", async () => {
  const a = bootApp({ perms: [] });
  const r = await fetch(`${a.url}/agents/claude-code`, { method: "DELETE" });
  assert.equal(r.status, 403);
  a.close();
});

test("DELETE /agents/:name with agents.manage proxies to gateway", async () => {
  const a = bootApp({
    perms: ["agents.manage"],
    gatewayHandler: (method, params) => {
      if (method === "agents.delete") {
        assert.equal((params as any).name, "claude-code");
        return { ok: true };
      }
      throw new Error(`unexpected: ${method}`);
    },
  });
  const r = await fetch(`${a.url}/agents/claude-code`, { method: "DELETE" });
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.equal(body.ok, true);
  a.close();
});
