/**
 * Phase B catalog-read route tests — verify each migrated GET handler:
 *   1. Default — no `?runtimeId` resolves to primary, returns expected items.
 *   2. Override — `?runtimeId=alt` returns alt runtime's items.
 *   3. Unsupported runtime — capability declared unsupported returns 409
 *      with structured `{ code, runtimeId, capabilityId, reason, message }`.
 *   4. Unknown runtime — `?runtimeId=does-not-exist` returns 404.
 *
 * Routes covered:
 *   /agents (agents.list), /agents/:name (agents.read)
 *   /agent-sessions (sessions.list)
 *   /channels (channels.status)
 *   /tools/catalog (tools.list)
 *   /cron (cron.list)
 *   /logs/tail (logs.tail)
 *   /models (models.list)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import express, { type Request, type Response, type NextFunction } from "express";
import { createServer } from "node:http";
import { once } from "node:events";
import { createAgentsRouter } from "../src/routes/agents.js";
import { createAgentSessionsRouter } from "../src/routes/agent-sessions.js";
import { createChannelsRouter } from "../src/routes/channels.js";
import { createToolsRouter } from "../src/routes/tools.js";
import { createCronRouter } from "../src/routes/cron.js";
import { createLogsRouter } from "../src/routes/logs.js";
import { createModelsRouter } from "../src/routes/models.js";
import type { RuntimeRegistry } from "../src/services/runtimes/registry.js";
import type { RuntimeConfigService } from "../src/services/runtime-config.js";
import type {
  RuntimeAdapter, RuntimeDescriptor, CapabilitySnapshot,
  RuntimeConfigSnapshot, RuntimeEntity, RuntimeEntityKind,
  RuntimeActivityEvent, CapabilityId,
} from "@openclaw-manager/types";

// --- Fake adapter helpers ----------------------------------------------------

type FakeAdapterOpts = {
  id: string;
  supported: CapabilityId[];
  unsupported?: CapabilityId[];
  entitiesByKind?: Partial<Record<RuntimeEntityKind, RuntimeEntity[]>>;
  entityById?: (kind: RuntimeEntityKind, id: string) => RuntimeEntity | null;
  activity?: RuntimeActivityEvent[];
};

function fakeAdapter(opts: FakeAdapterOpts): RuntimeAdapter {
  const desc: RuntimeDescriptor = {
    id: opts.id, kind: "openclaw", displayName: opts.id, endpoint: "sdk:",
    transport: "sdk", authMode: "token-env",
  };
  const caps: CapabilitySnapshot = {
    supported: opts.supported,
    partial: [],
    unsupported: opts.unsupported ?? [],
    version: "1.0.0",
    source: "static-adapter",
    stale: false,
  };
  return {
    describeRuntime: async () => desc,
    getCapabilities: async () => caps,
    listEntities: async (kind) => opts.entitiesByKind?.[kind] ?? [],
    getEntity: async (kind, id) => opts.entityById?.(kind, id) ?? null,
    listActivity: async () => opts.activity ?? [],
    invokeAction: async () => ({ ok: true, nativeResult: null, projectionMode: "exact" }),
    getAuthModes: async () => [],
    getExtensions: async () => [],
    health: async () => ({ ok: true }),
  };
}

function fakeRegistry(adapters: Record<string, RuntimeAdapter>): RuntimeRegistry {
  const descriptors: RuntimeDescriptor[] = Object.keys(adapters).map((id) => ({
    id, kind: "openclaw", displayName: id, endpoint: "sdk:",
    transport: "sdk", authMode: "token-env",
  }));
  return {
    configPath: () => "/tmp/test.json",
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
    runtimes: [],
  };
  return { read: async () => snap, patch: async () => snap };
}

function withAuth(perms: string[] = []) {
  return (req: Request, _res: Response, next: NextFunction) => {
    (req as any).auth = { user: { id: "u1" }, permissions: perms };
    next();
  };
}

async function mkServer(router: express.Router) {
  const app = express();
  app.use(express.json());
  app.use(withAuth());
  app.use(router);
  const s = createServer(app);
  s.listen(0);
  await once(s, "listening");
  const port = (s.address() as { port: number }).port;
  return {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((r) => s.close(() => r())),
  };
}

const dummyCallGateway = async () => { throw new Error("dummy gateway should not be hit on catalog reads"); };

// --- /agents (agents.list) ---------------------------------------------------

test("GET /agents: default → primary, returns adapter entities", async () => {
  const adapter = fakeAdapter({
    id: "oc-main",
    supported: ["agents.list"],
    entitiesByKind: {
      agent: [{
        runtimeKind: "openclaw", runtimeId: "oc-main",
        entityKind: "agent", entityId: "a1", displayName: "alice",
        nativeRef: { id: "a1", name: "alice" },
      }],
    },
  });
  const registry = fakeRegistry({ "oc-main": adapter });
  const runtimeConfig = fakeConfig("oc-main");
  const router = createAgentsRouter({ callGateway: dummyCallGateway, registry, runtimeConfig });
  const s = await mkServer(router);
  try {
    const r = await fetch(`${s.url}/agents`);
    assert.equal(r.status, 200);
    const body = await r.json();
    assert.equal(body.runtimeId, "oc-main");
    assert.equal(body.source, "primary");
    assert.equal(body.agents.length, 1);
    assert.equal(body.agents[0].id, "a1");
  } finally { await s.close(); }
});

test("GET /agents?runtimeId=alt: query override resolves to alt", async () => {
  const adapterA = fakeAdapter({
    id: "oc-main", supported: ["agents.list"],
    entitiesByKind: { agent: [{ runtimeKind: "openclaw", runtimeId: "oc-main", entityKind: "agent", entityId: "a1", displayName: "main" }] },
  });
  const adapterB = fakeAdapter({
    id: "oc-alt", supported: ["agents.list"],
    entitiesByKind: { agent: [{ runtimeKind: "openclaw", runtimeId: "oc-alt", entityKind: "agent", entityId: "b1", displayName: "alt" }] },
  });
  const registry = fakeRegistry({ "oc-main": adapterA, "oc-alt": adapterB });
  const runtimeConfig = fakeConfig("oc-main");
  const router = createAgentsRouter({ callGateway: dummyCallGateway, registry, runtimeConfig });
  const s = await mkServer(router);
  try {
    const r = await fetch(`${s.url}/agents?runtimeId=oc-alt`);
    const body = await r.json();
    assert.equal(body.runtimeId, "oc-alt");
    assert.equal(body.source, "query");
    assert.equal(body.agents.length, 1);
    assert.equal(body.agents[0].id, "b1");
  } finally { await s.close(); }
});

test("GET /agents?runtimeId=hermes: unsupported capability returns 409 with structured error", async () => {
  const adapterOC = fakeAdapter({ id: "oc-main", supported: ["agents.list"] });
  const adapterH = fakeAdapter({ id: "hermes", supported: [], unsupported: ["agents.list"] });
  const registry = fakeRegistry({ "oc-main": adapterOC, "hermes": adapterH });
  const runtimeConfig = fakeConfig("oc-main");
  const router = createAgentsRouter({ callGateway: dummyCallGateway, registry, runtimeConfig });
  const s = await mkServer(router);
  try {
    const r = await fetch(`${s.url}/agents?runtimeId=hermes`);
    assert.equal(r.status, 409);
    const body = await r.json();
    assert.equal(body.ok, false);
    assert.equal(body.error.code, "UNSUPPORTED_CAPABILITY");
    assert.equal(body.error.runtimeId, "hermes");
    assert.equal(body.error.capabilityId, "agents.list");
    assert.match(body.error.reason, /unsupported/);
  } finally { await s.close(); }
});

test("GET /agents?runtimeId=ghost: unknown runtime returns 404", async () => {
  const adapter = fakeAdapter({ id: "oc-main", supported: ["agents.list"] });
  const registry = fakeRegistry({ "oc-main": adapter });
  const runtimeConfig = fakeConfig("oc-main");
  const router = createAgentsRouter({ callGateway: dummyCallGateway, registry, runtimeConfig });
  const s = await mkServer(router);
  try {
    const r = await fetch(`${s.url}/agents?runtimeId=ghost`);
    assert.equal(r.status, 404);
    const body = await r.json();
    assert.equal(body.error, "runtime_not_found");
  } finally { await s.close(); }
});

// --- /agents/:name (agents.read) ---------------------------------------------

test("GET /agents/:name: default → primary, returns adapter entity", async () => {
  const adapter = fakeAdapter({
    id: "oc-main", supported: ["agents.read"],
    entityById: (kind, id) => kind === "agent" && id === "alice"
      ? { runtimeKind: "openclaw", runtimeId: "oc-main", entityKind: "agent", entityId: "alice", displayName: "alice", nativeRef: { id: "alice", name: "alice", workspace: "/w" } }
      : null,
  });
  const registry = fakeRegistry({ "oc-main": adapter });
  const runtimeConfig = fakeConfig("oc-main");
  const router = createAgentsRouter({ callGateway: dummyCallGateway, registry, runtimeConfig });
  const s = await mkServer(router);
  try {
    const r = await fetch(`${s.url}/agents/alice`);
    assert.equal(r.status, 200);
    const body = await r.json();
    assert.equal(body.runtimeId, "oc-main");
    assert.equal(body.source, "primary");
    assert.equal(body.id, "alice");
    assert.equal(body.workspace, "/w");
  } finally { await s.close(); }
});

test("GET /agents/:name: 404 when entity not found", async () => {
  const adapter = fakeAdapter({ id: "oc-main", supported: ["agents.read"] });
  const registry = fakeRegistry({ "oc-main": adapter });
  const runtimeConfig = fakeConfig("oc-main");
  const router = createAgentsRouter({ callGateway: dummyCallGateway, registry, runtimeConfig });
  const s = await mkServer(router);
  try {
    const r = await fetch(`${s.url}/agents/missing`);
    assert.equal(r.status, 404);
    const body = await r.json();
    assert.equal(body.error, "agent_not_found");
  } finally { await s.close(); }
});

// --- /agent-sessions (sessions.list) -----------------------------------------

test("GET /agent-sessions: default → primary, returns array of sessions", async () => {
  const adapter = fakeAdapter({
    id: "oc-main", supported: ["sessions.list"],
    entitiesByKind: {
      session: [{
        runtimeKind: "openclaw", runtimeId: "oc-main",
        entityKind: "session", entityId: "s1", displayName: "sess1",
        nativeRef: { id: "s1", agentName: "alice", status: "active" },
      }],
    },
  });
  const registry = fakeRegistry({ "oc-main": adapter });
  const runtimeConfig = fakeConfig("oc-main");
  const router = createAgentSessionsRouter({ callGateway: dummyCallGateway, registry, runtimeConfig });
  const s = await mkServer(router);
  try {
    const r = await fetch(`${s.url}/agent-sessions`);
    assert.equal(r.status, 200);
    const body = await r.json();
    assert.ok(Array.isArray(body));
    assert.equal(body.length, 1);
    assert.equal(body[0].id, "s1");
    assert.equal(body[0].agentName, "alice");
  } finally { await s.close(); }
});

test("GET /agent-sessions?runtimeId=hermes: unsupported returns 409", async () => {
  const adapterH = fakeAdapter({ id: "hermes", supported: [], unsupported: ["sessions.list"] });
  const registry = fakeRegistry({ "oc-main": fakeAdapter({ id: "oc-main", supported: ["sessions.list"] }), "hermes": adapterH });
  const runtimeConfig = fakeConfig("oc-main");
  const router = createAgentSessionsRouter({ callGateway: dummyCallGateway, registry, runtimeConfig });
  const s = await mkServer(router);
  try {
    const r = await fetch(`${s.url}/agent-sessions?runtimeId=hermes`);
    assert.equal(r.status, 409);
    const body = await r.json();
    assert.equal(body.error.code, "UNSUPPORTED_CAPABILITY");
    assert.equal(body.error.capabilityId, "sessions.list");
  } finally { await s.close(); }
});

test("GET /agent-sessions?runtimeId=ghost: unknown runtime returns 404", async () => {
  const adapter = fakeAdapter({ id: "oc-main", supported: ["sessions.list"] });
  const registry = fakeRegistry({ "oc-main": adapter });
  const runtimeConfig = fakeConfig("oc-main");
  const router = createAgentSessionsRouter({ callGateway: dummyCallGateway, registry, runtimeConfig });
  const s = await mkServer(router);
  try {
    const r = await fetch(`${s.url}/agent-sessions?runtimeId=ghost`);
    assert.equal(r.status, 404);
  } finally { await s.close(); }
});

// --- /channels (channels.status) ---------------------------------------------

test("GET /channels: default → primary, returns array of channels", async () => {
  const adapter = fakeAdapter({
    id: "oc-main", supported: ["channels.status"],
    entitiesByKind: {
      channel: [{
        runtimeKind: "openclaw", runtimeId: "oc-main",
        entityKind: "channel", entityId: "whatsapp", displayName: "whatsapp",
        nativeType: "connected",
        nativeRef: { id: "whatsapp", status: "connected", connected: true, configured: true },
      }],
    },
  });
  const registry = fakeRegistry({ "oc-main": adapter });
  const runtimeConfig = fakeConfig("oc-main");
  const router = createChannelsRouter({ callGateway: dummyCallGateway, registry, runtimeConfig });
  const s = await mkServer(router);
  try {
    const r = await fetch(`${s.url}/channels`);
    assert.equal(r.status, 200);
    const body = await r.json();
    assert.ok(Array.isArray(body));
    assert.equal(body.length, 1);
    assert.equal(body[0].name, "whatsapp");
    assert.equal(body[0].status, "connected");
  } finally { await s.close(); }
});

test("GET /channels?runtimeId=hermes: unsupported returns 409", async () => {
  const adapterH = fakeAdapter({ id: "hermes", supported: [], unsupported: ["channels.status"] });
  const registry = fakeRegistry({ "oc-main": fakeAdapter({ id: "oc-main", supported: ["channels.status"] }), "hermes": adapterH });
  const runtimeConfig = fakeConfig("oc-main");
  const router = createChannelsRouter({ callGateway: dummyCallGateway, registry, runtimeConfig });
  const s = await mkServer(router);
  try {
    const r = await fetch(`${s.url}/channels?runtimeId=hermes`);
    assert.equal(r.status, 409);
    const body = await r.json();
    assert.equal(body.error.capabilityId, "channels.status");
  } finally { await s.close(); }
});

test("GET /channels?runtimeId=ghost: 404", async () => {
  const adapter = fakeAdapter({ id: "oc-main", supported: ["channels.status"] });
  const registry = fakeRegistry({ "oc-main": adapter });
  const runtimeConfig = fakeConfig("oc-main");
  const router = createChannelsRouter({ callGateway: dummyCallGateway, registry, runtimeConfig });
  const s = await mkServer(router);
  try {
    const r = await fetch(`${s.url}/channels?runtimeId=ghost`);
    assert.equal(r.status, 404);
  } finally { await s.close(); }
});

// --- /tools/catalog (tools.list) ---------------------------------------------

test("GET /tools/catalog: default → primary, returns array", async () => {
  const adapter = fakeAdapter({
    id: "oc-main", supported: ["tools.list"],
    entitiesByKind: {
      tool: [{
        runtimeKind: "openclaw", runtimeId: "oc-main",
        entityKind: "tool", entityId: "search", displayName: "search",
        nativeRef: { id: "search", label: "Search" },
      }],
    },
  });
  const registry = fakeRegistry({ "oc-main": adapter });
  const runtimeConfig = fakeConfig("oc-main");
  const router = createToolsRouter({ callGateway: dummyCallGateway, registry, runtimeConfig });
  const s = await mkServer(router);
  try {
    const r = await fetch(`${s.url}/tools/catalog`);
    assert.equal(r.status, 200);
    const body = await r.json();
    assert.ok(Array.isArray(body));
    assert.equal(body[0].id, "search");
  } finally { await s.close(); }
});

test("GET /tools/catalog?runtimeId=hermes: unsupported returns 409", async () => {
  const adapterH = fakeAdapter({ id: "hermes", supported: [], unsupported: ["tools.list"] });
  const registry = fakeRegistry({ "oc-main": fakeAdapter({ id: "oc-main", supported: ["tools.list"] }), "hermes": adapterH });
  const runtimeConfig = fakeConfig("oc-main");
  const router = createToolsRouter({ callGateway: dummyCallGateway, registry, runtimeConfig });
  const s = await mkServer(router);
  try {
    const r = await fetch(`${s.url}/tools/catalog?runtimeId=hermes`);
    assert.equal(r.status, 409);
    const body = await r.json();
    assert.equal(body.error.capabilityId, "tools.list");
  } finally { await s.close(); }
});

test("GET /tools/catalog?runtimeId=ghost: 404", async () => {
  const adapter = fakeAdapter({ id: "oc-main", supported: ["tools.list"] });
  const registry = fakeRegistry({ "oc-main": adapter });
  const runtimeConfig = fakeConfig("oc-main");
  const router = createToolsRouter({ callGateway: dummyCallGateway, registry, runtimeConfig });
  const s = await mkServer(router);
  try {
    const r = await fetch(`${s.url}/tools/catalog?runtimeId=ghost`);
    assert.equal(r.status, 404);
  } finally { await s.close(); }
});

// --- /cron (cron.list) -------------------------------------------------------

test("GET /cron: default → primary, returns array", async () => {
  const adapter = fakeAdapter({
    id: "oc-main", supported: ["cron.list"],
    entitiesByKind: {
      cron: [{
        runtimeKind: "openclaw", runtimeId: "oc-main",
        entityKind: "cron", entityId: "j1", displayName: "midnight",
        nativeRef: { id: "j1", name: "midnight", schedule: "0 0 * * *" },
      }],
    },
  });
  const registry = fakeRegistry({ "oc-main": adapter });
  const runtimeConfig = fakeConfig("oc-main");
  const router = createCronRouter({ callGateway: dummyCallGateway, registry, runtimeConfig });
  const s = await mkServer(router);
  try {
    const r = await fetch(`${s.url}/cron`);
    assert.equal(r.status, 200);
    const body = await r.json();
    assert.ok(Array.isArray(body));
    assert.equal(body.length, 1);
    assert.equal(body[0].id, "j1");
  } finally { await s.close(); }
});

test("GET /cron?runtimeId=hermes: unsupported returns 409", async () => {
  const adapterH = fakeAdapter({ id: "hermes", supported: [], unsupported: ["cron.list"] });
  const registry = fakeRegistry({ "oc-main": fakeAdapter({ id: "oc-main", supported: ["cron.list"] }), "hermes": adapterH });
  const runtimeConfig = fakeConfig("oc-main");
  const router = createCronRouter({ callGateway: dummyCallGateway, registry, runtimeConfig });
  const s = await mkServer(router);
  try {
    const r = await fetch(`${s.url}/cron?runtimeId=hermes`);
    assert.equal(r.status, 409);
    const body = await r.json();
    assert.equal(body.error.capabilityId, "cron.list");
  } finally { await s.close(); }
});

test("GET /cron?runtimeId=ghost: 404", async () => {
  const adapter = fakeAdapter({ id: "oc-main", supported: ["cron.list"] });
  const registry = fakeRegistry({ "oc-main": adapter });
  const runtimeConfig = fakeConfig("oc-main");
  const router = createCronRouter({ callGateway: dummyCallGateway, registry, runtimeConfig });
  const s = await mkServer(router);
  try {
    const r = await fetch(`${s.url}/cron?runtimeId=ghost`);
    assert.equal(r.status, 404);
  } finally { await s.close(); }
});

// --- /logs/tail (logs.tail) --------------------------------------------------

test("GET /logs/tail: default → primary, returns events with runtimeId/source", async () => {
  const adapter = fakeAdapter({
    id: "oc-main", supported: ["logs.tail"],
    activity: [{
      runtimeKind: "openclaw", runtimeId: "oc-main",
      eventKind: "message_out", at: 12345, text: "hello",
      projectionMode: "exact", lossiness: "none",
    }],
  });
  const registry = fakeRegistry({ "oc-main": adapter });
  const runtimeConfig = fakeConfig("oc-main");
  const router = createLogsRouter({ callGateway: dummyCallGateway, registry, runtimeConfig });
  const s = await mkServer(router);
  try {
    const r = await fetch(`${s.url}/logs/tail`);
    assert.equal(r.status, 200);
    const body = await r.json();
    assert.equal(body.runtimeId, "oc-main");
    assert.equal(body.source, "primary");
    assert.equal(body.events.length, 1);
    assert.equal(body.events[0].text, "hello");
  } finally { await s.close(); }
});

test("GET /logs/tail?runtimeId=hermes: unsupported returns 409", async () => {
  const adapterH = fakeAdapter({ id: "hermes", supported: [], unsupported: ["logs.tail"] });
  const registry = fakeRegistry({ "oc-main": fakeAdapter({ id: "oc-main", supported: ["logs.tail"] }), "hermes": adapterH });
  const runtimeConfig = fakeConfig("oc-main");
  const router = createLogsRouter({ callGateway: dummyCallGateway, registry, runtimeConfig });
  const s = await mkServer(router);
  try {
    const r = await fetch(`${s.url}/logs/tail?runtimeId=hermes`);
    assert.equal(r.status, 409);
    const body = await r.json();
    assert.equal(body.error.capabilityId, "logs.tail");
  } finally { await s.close(); }
});

test("GET /logs/tail?runtimeId=ghost: 404", async () => {
  const adapter = fakeAdapter({ id: "oc-main", supported: ["logs.tail"] });
  const registry = fakeRegistry({ "oc-main": adapter });
  const runtimeConfig = fakeConfig("oc-main");
  const router = createLogsRouter({ callGateway: dummyCallGateway, registry, runtimeConfig });
  const s = await mkServer(router);
  try {
    const r = await fetch(`${s.url}/logs/tail?runtimeId=ghost`);
    assert.equal(r.status, 404);
  } finally { await s.close(); }
});

// --- /models (models.list) ---------------------------------------------------

test("GET /models: default → primary, returns catalog", async () => {
  const adapter = fakeAdapter({
    id: "oc-main", supported: ["models.list"],
    entitiesByKind: {
      model: [{
        runtimeKind: "openclaw", runtimeId: "oc-main",
        entityKind: "model", entityId: "openai-codex/gpt-5.4", displayName: "GPT-5.4",
        nativeRef: { id: "openai-codex/gpt-5.4", provider: "openai-codex", name: "GPT-5.4" },
      }],
    },
  });
  const registry = fakeRegistry({ "oc-main": adapter });
  const runtimeConfig = fakeConfig("oc-main");
  const router = createModelsRouter({ callGateway: dummyCallGateway, registry, runtimeConfig });
  const s = await mkServer(router);
  try {
    const r = await fetch(`${s.url}/models`);
    assert.equal(r.status, 200);
    const body = await r.json();
    assert.equal(body.runtimeId, "oc-main");
    assert.equal(body.source, "primary");
    assert.equal(body.status, "ok");
    assert.equal(body.models[0].id, "openai-codex/gpt-5.4");
  } finally { await s.close(); }
});

test("GET /models?runtimeId=hermes: unsupported returns 409", async () => {
  const adapterH = fakeAdapter({ id: "hermes", supported: [], unsupported: ["models.list"] });
  const registry = fakeRegistry({ "oc-main": fakeAdapter({ id: "oc-main", supported: ["models.list"] }), "hermes": adapterH });
  const runtimeConfig = fakeConfig("oc-main");
  const router = createModelsRouter({ callGateway: dummyCallGateway, registry, runtimeConfig });
  const s = await mkServer(router);
  try {
    const r = await fetch(`${s.url}/models?runtimeId=hermes`);
    assert.equal(r.status, 409);
    const body = await r.json();
    assert.equal(body.error.capabilityId, "models.list");
  } finally { await s.close(); }
});

test("GET /models?runtimeId=ghost: 404", async () => {
  const adapter = fakeAdapter({ id: "oc-main", supported: ["models.list"] });
  const registry = fakeRegistry({ "oc-main": adapter });
  const runtimeConfig = fakeConfig("oc-main");
  const router = createModelsRouter({ callGateway: dummyCallGateway, registry, runtimeConfig });
  const s = await mkServer(router);
  try {
    const r = await fetch(`${s.url}/models?runtimeId=ghost`);
    assert.equal(r.status, 404);
  } finally { await s.close(); }
});
