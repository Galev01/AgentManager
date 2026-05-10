import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import http from "node:http";
import { createModelsRouter } from "../src/routes/models.js";
import { createAgentModelsRouter } from "../src/routes/agent-models.js";
import type { RuntimeRegistry } from "../src/services/runtimes/registry.js";
import type { RuntimeConfigService } from "../src/services/runtime-config.js";
import type {
  RuntimeAdapter, RuntimeDescriptor, RuntimeEntity, CapabilitySnapshot,
  RuntimeConfigSnapshot,
} from "@openclaw-manager/types";

type StubCalls = Array<{ method: string; params: unknown }>;

function fakeAdapterFromGateway(
  callGateway: (method: string, params?: unknown) => Promise<unknown>,
  runtimeId = "oc-main",
): RuntimeAdapter {
  const desc: RuntimeDescriptor = {
    id: runtimeId, kind: "openclaw", displayName: runtimeId, endpoint: "sdk:",
    transport: "sdk", authMode: "token-env",
  };
  const caps: CapabilitySnapshot = {
    supported: ["agents.list", "models.list"],
    partial: [],
    unsupported: [],
    version: "1.0.0",
    source: "static-adapter",
    stale: false,
  };
  return {
    describeRuntime: async () => desc,
    getCapabilities: async () => caps,
    listEntities: async (kind) => {
      if (kind === "model") {
        const res = (await callGateway("models.list")) as { models?: Array<Record<string, unknown>> };
        return (res?.models ?? []).map((m): RuntimeEntity => ({
          runtimeKind: "openclaw",
          runtimeId,
          entityKind: "model",
          entityId: String(m.id ?? m.key ?? ""),
          displayName: String(m.displayName ?? m.name ?? m.id ?? ""),
          nativeRef: m as any,
        }));
      }
      return [];
    },
    getEntity: async () => null,
    listActivity: async () => [],
    invokeAction: async () => ({ ok: true, nativeResult: null, projectionMode: "exact" }),
    getAuthModes: async () => [],
    getExtensions: async () => [],
    health: async () => ({ ok: true }),
  };
}

function fakeRegistry(adapter: RuntimeAdapter, runtimeId = "oc-main"): RuntimeRegistry {
  const desc: RuntimeDescriptor = {
    id: runtimeId, kind: "openclaw", displayName: runtimeId, endpoint: "sdk:",
    transport: "sdk", authMode: "token-env",
  };
  return {
    configPath: () => "/tmp/test-runtime-config.json",
    list: async () => [desc],
    get: async (id) => (id === runtimeId ? desc : null),
    adapter: async (id) => (id === runtimeId ? adapter : null),
  };
}

function fakeConfig(primary: string | null = "oc-main"): RuntimeConfigService {
  const snap: RuntimeConfigSnapshot = {
    configuredPrimaryRuntimeId: primary,
    effectivePrimaryRuntimeId: primary,
    fallbackReason: null,
    runtimes: [],
  };
  return {
    read: async () => snap,
    patch: async () => snap,
  };
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
  const adapter = fakeAdapterFromGateway(callGateway);
  const registry = fakeRegistry(adapter);
  const runtimeConfig = fakeConfig();
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).auth = { user: { id: "u1" }, permissions: opts.perms };
    next();
  });
  app.use(createModelsRouter({ callGateway, registry, runtimeConfig }));
  app.use(createAgentModelsRouter({ callGateway, registry, runtimeConfig }));
  const server = http.createServer(app).listen(0);
  const addr = server.address() as { port: number };
  return { url: `http://127.0.0.1:${addr.port}`, calls, close: () => server.close() };
}

test("GET /models returns gateway-projected catalog", async () => {
  const a = bootApp({
    perms: [],
    gatewayHandler: (method) => {
      if (method === "models.list") {
        return {
          models: [
            { id: "openai-codex/gpt-5.4", provider: "openai-codex", name: "GPT-5.4", contextWindow: 200000, cost: { input: 1.5, output: 5 } },
            { id: "ollama/gemma4", provider: "ollama", name: "gemma4", contextWindow: 131072 },
          ],
        };
      }
      throw new Error("unexpected");
    },
  });
  const r = await fetch(`${a.url}/models`);
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.equal(body.status, "ok");
  assert.equal(body.models.length, 2);
  assert.equal(body.models[0].id, "openai-codex/gpt-5.4");
  assert.equal(body.models[0].costInput, 1.5);
  a.close();
});

test("GET /models returns status 'unavailable' on gateway error", async () => {
  const a = bootApp({
    perms: [],
    gatewayHandler: () => { throw new Error("gateway down"); },
  });
  const r = await fetch(`${a.url}/models`);
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.equal(body.status, "unavailable");
  assert.deepEqual(body.models, []);
  a.close();
});

test("GET /agent-models composes catalog + agents + global default", async () => {
  const a = bootApp({
    perms: [],
    gatewayHandler: (method) => {
      if (method === "models.list") {
        return { models: [{ id: "openai-codex/gpt-5.4", provider: "openai-codex" }] };
      }
      if (method === "agents.list") {
        return {
          agents: [
            { id: "main", name: "main", model: "openai-codex/gpt-5.4-mini", isDefault: true },
            { id: "claude-code", name: "claude-code", model: "openai-codex/gpt-5.4" },
          ],
        };
      }
      throw new Error("unexpected");
    },
  });
  const r = await fetch(`${a.url}/agent-models`);
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.equal(body.catalogStatus, "ok");
  assert.equal(body.globalDefaultModelId, "openai-codex/gpt-5.4-mini");
  assert.equal(body.agents.length, 2);
  assert.equal(body.agents.find((x: any) => x.agentId === "claude-code").effectiveModelId, "openai-codex/gpt-5.4");
  assert.equal(body.agents[0].hasExplicitOverride, undefined);
  a.close();
});

test("GET /agent-models survives catalog outage", async () => {
  const a = bootApp({
    perms: [],
    gatewayHandler: (method) => {
      if (method === "models.list") throw new Error("gateway");
      if (method === "agents.list") return { agents: [{ id: "main", model: "x" }] };
      throw new Error("unexpected");
    },
  });
  const r = await fetch(`${a.url}/agent-models`);
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.equal(body.catalogStatus, "unavailable");
  assert.deepEqual(body.catalog, []);
  assert.equal(body.agents.length, 1);
  a.close();
});
