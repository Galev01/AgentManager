import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import http from "node:http";
import { createAgentsRouter } from "../src/routes/agents.js";
import type { RuntimeRegistry } from "../src/services/runtimes/registry.js";
import type { RuntimeConfigService } from "../src/services/runtime-config.js";
import type {
  RuntimeAdapter, RuntimeDescriptor, CapabilitySnapshot,
  RuntimeConfigSnapshot, RuntimeConfigDescriptor,
  RuntimeActionId, RuntimeActionPayload, RuntimeActionContext, RuntimeActionResult,
} from "@openclaw-manager/types";

type StubCalls = Array<{ method: string; params: unknown }>;

// Build a minimal OpenClaw-shaped adapter that mirrors gatewayHandler so the
// migrated routes (POST/PATCH/DELETE on /agents now go through invokeAction)
// continue to behave as the legacy callGateway-based assertions expected.
function buildPrimaryAdapter(opts: {
  id: string;
  gatewayHandler?: (method: string, params: unknown) => unknown | Promise<unknown>;
  recordCalls: StubCalls;
}): RuntimeAdapter {
  const desc: RuntimeDescriptor = {
    id: opts.id, kind: "openclaw", displayName: opts.id,
    endpoint: "sdk:", transport: "sdk", authMode: "token-env",
  };
  const caps: CapabilitySnapshot = {
    supported: [
      "agents.list", "agents.read", "models.list",
      "agents.create", "agents.update", "agents.delete",
    ],
    partial: [], unsupported: [],
    version: "1.0.0", source: "static-adapter", stale: false,
  };
  return {
    describeRuntime: async () => desc,
    getCapabilities: async () => caps,
    listEntities: async (kind) => {
      if (kind !== "model") return [];
      // models.list comes from the agent-models service which calls listEntities
      // when the registry is provided. Reuse the same gatewayHandler.
      const raw = opts.gatewayHandler
        ? await opts.gatewayHandler("models.list", {})
        : { models: [] };
      const models = (raw as { models?: Array<Record<string, unknown>> })?.models ?? [];
      return models.map((m) => {
        const id = String(m.id ?? m.key ?? "");
        return {
          runtimeKind: "openclaw" as const, runtimeId: opts.id,
          entityKind: "model" as const, entityId: id, displayName: id,
          nativeRef: m as import("@openclaw-manager/types").JsonValue,
        };
      });
    },
    getEntity: async () => null,
    listActivity: async () => [],
    invokeAction: async <A extends RuntimeActionId>(
      action: A,
      payload: RuntimeActionPayload[A],
      _ctx: RuntimeActionContext,
    ): Promise<RuntimeActionResult> => {
      // Translate typed action back to legacy gateway shape so the test's
      // gatewayHandler stub continues to match.
      let method = action as string;
      let params: unknown = payload;
      if (action === "agents.update") {
        const p = payload as RuntimeActionPayload["agents.update"];
        params = { name: p.name, ...p.updates };
      }
      opts.recordCalls.push({ method, params });
      try {
        const out = opts.gatewayHandler
          ? await opts.gatewayHandler(method, params)
          : null;
        return { ok: true, nativeResult: (out as import("@openclaw-manager/types").JsonValue) ?? null, projectionMode: "exact" };
      } catch (e) {
        return { ok: false, error: (e as Error).message ?? String(e), projectionMode: "exact" };
      }
    },
    getAuthModes: async () => [],
    getExtensions: async () => [],
    health: async () => ({ ok: true }),
  };
}

function fakeRegistry(adapters: Record<string, RuntimeAdapter>): RuntimeRegistry {
  const descriptors: RuntimeDescriptor[] = Object.keys(adapters).map((id) => ({
    id, kind: "openclaw", displayName: id,
    endpoint: "sdk:", transport: "sdk", authMode: "token-env",
  }));
  return {
    configPath: () => "/tmp/agents-routes-test.json",
    list: async () => [...descriptors],
    get: async (id) => descriptors.find((d) => d.id === id) ?? null,
    adapter: async (id) => adapters[id] ?? null,
  };
}

function fakeConfig(primary: string | null): RuntimeConfigService {
  const snap: RuntimeConfigSnapshot = {
    configuredPrimaryRuntimeId: primary,
    effectivePrimaryRuntimeId: primary,
    fallbackReason: null,
    runtimes: (primary ? [primary] : []).map((id) => ({
      id, kind: "openclaw" as const, displayName: id,
      endpoint: "sdk:", transport: "sdk" as const, authMode: "token-env" as const,
      enabled: true, status: { state: "healthy" as const },
    })) as RuntimeConfigDescriptor[],
  };
  return { read: async () => snap, patch: async () => snap };
}

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
  const adapter = buildPrimaryAdapter({
    id: "oc-main",
    gatewayHandler: opts.gatewayHandler,
    recordCalls: calls,
  });
  const registry = fakeRegistry({ "oc-main": adapter });
  const runtimeConfig = fakeConfig("oc-main");
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).auth = { user: { id: "u1" }, permissions: opts.perms };
    next();
  });
  app.use(createAgentsRouter({ callGateway, registry, runtimeConfig }));
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

test("POST /agents validates requested model before creating", async () => {
  const a = bootApp({
    perms: ["agents.manage"],
    gatewayHandler: (method) => {
      if (method === "models.list") {
        return { models: [{ id: "openai-codex/gpt-5.4", provider: "openai-codex" }] };
      }
      throw new Error(`unexpected: ${method}`);
    },
  });
  const r = await fetch(`${a.url}/agents`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: "new-agent",
      workspace: "C:\\work",
      model: "ollama/does-not-exist",
    }),
  });
  assert.equal(r.status, 400);
  const body = await r.json();
  assert.equal(body.error, "invalid_model_id");
  assert.equal(a.calls.find((c) => c.method === "agents.create"), undefined);
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
  // default" instead. See spec "Set to current default".
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
