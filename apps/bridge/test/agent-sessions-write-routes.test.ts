/**
 * Route tests for the write/read paths of agent-sessions — all migrated from
 * legacy callGateway to runtime-aware adapter dispatch in Task 7.
 *
 * Coverage:
 *  1. POST /agent-sessions with { agentName: "main" } → primary adapter,
 *     dispatches invokeAction("sessions.create", { agentName: "main" }),
 *     stores index entry, returns normalized session.
 *  2. POST /agent-sessions with { runtimeId: "hermes", agentName: "x" } →
 *     dispatches against hermes adapter, stores { id, runtimeId: "hermes" }.
 *  3. POST /agent-sessions/:id/send with id in index pointing to hermes →
 *     resolves hermes adapter, dispatches invokeAction("sessions.send", { sessionKey: id, message }).
 *     NO callGateway invocation.
 *  4. POST /agent-sessions/:id/send with ?runtimeId=openclaw mismatch on
 *     stored hermes → 400 invalid_runtime_override.
 *  5. POST /agent-sessions/:id/send with id NOT in index → falls back to primary (back-compat).
 *  6. GET /agent-sessions/:id/usage resolves stored runtime, calls
 *     adapter.read("sessions.usage", { sessionKey: id }).
 *  7. POST /agent-sessions/:id/reset dispatches invokeAction("sessions.reset", { sessionKey: id })
 *     against stored runtime.
 *  8. POST /agent-sessions/:id/abort dispatches invokeAction("sessions.abort", { sessionKey: id }).
 *  9. POST /agent-sessions/:id/compact dispatches invokeAction("sessions.compact", { sessionKey: id }).
 * 10. DELETE /agent-sessions/:id dispatches invokeAction("sessions.delete", { sessionKey: id })
 *     then agentSessionsIndex.forget(id).
 * 11. POST /agent-sessions/:id/send where sessions.send is unsupported → 409.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import express, { type Request, type Response, type NextFunction } from "express";
import { createServer } from "node:http";
import { once } from "node:events";
import { createAgentSessionsRouter } from "../src/routes/agent-sessions.js";
import type { RuntimeRegistry } from "../src/services/runtimes/registry.js";
import type { RuntimeConfigService } from "../src/services/runtime-config.js";
import type { AgentSessionsIndex, AgentSessionsIndexEntry } from "../src/services/agent-sessions-index.js";
import type {
  RuntimeAdapter, RuntimeDescriptor, CapabilitySnapshot,
  RuntimeConfigSnapshot, RuntimeConfigDescriptor,
  RuntimeActionId, RuntimeActionPayload, RuntimeActionContext, RuntimeActionResult,
  RuntimeEntity, RuntimeEntityKind, RuntimeReadCapabilityId, JsonValue,
} from "@openclaw-manager/types";

// ---------------------------------------------------------------------------
// Fake adapter factory
// ---------------------------------------------------------------------------

type FakeAdapterOpts = {
  id: string;
  supported?: string[];
  unsupported?: string[];
  readImpl?: (cap: RuntimeReadCapabilityId, params?: unknown) => Promise<unknown>;
  invokeActionImpl?: (action: RuntimeActionId, payload: unknown, ctx: RuntimeActionContext) => Promise<RuntimeActionResult>;
  noRead?: boolean;
};

function makeFakeAdapter(opts: FakeAdapterOpts): RuntimeAdapter {
  const {
    id,
    supported = [
      "sessions.list", "sessions.read", "sessions.create", "sessions.send",
      "sessions.reset", "sessions.abort", "sessions.compact", "sessions.delete",
      "sessions.usage",
    ],
    unsupported = [],
    readImpl,
    invokeActionImpl,
    noRead = false,
  } = opts;

  const caps: CapabilitySnapshot = {
    supported: supported as CapabilitySnapshot["supported"],
    partial: [],
    unsupported: unsupported as CapabilitySnapshot["unsupported"],
    version: "1.0.0",
    source: "static-adapter",
    stale: false,
  };

  const desc: RuntimeDescriptor = {
    id, kind: "openclaw", displayName: id,
    endpoint: "sdk:", transport: "sdk", authMode: "token-env",
  };

  const adapter: RuntimeAdapter = {
    describeRuntime: async () => desc,
    getCapabilities: async () => caps,
    listEntities: async (_kind: RuntimeEntityKind): Promise<RuntimeEntity[]> => [],
    getEntity: async () => null,
    listActivity: async () => [],
    invokeAction: async <A extends RuntimeActionId>(
      action: A,
      payload: RuntimeActionPayload[A],
      ctx: RuntimeActionContext,
    ): Promise<RuntimeActionResult> => {
      if (invokeActionImpl) {
        return invokeActionImpl(action, payload, ctx);
      }
      return { ok: true, nativeResult: null, projectionMode: "exact" };
    },
    getAuthModes: async () => [],
    getExtensions: async () => [],
    health: async () => ({ ok: true }),
  };

  if (!noRead) {
    adapter.read = async (cap, params) => {
      if (readImpl) return readImpl(cap, params) as Promise<JsonValue>;
      return null;
    };
  }

  return adapter;
}

// ---------------------------------------------------------------------------
// In-memory agent-sessions-index stub
// ---------------------------------------------------------------------------

function makeFakeIndex(initial: AgentSessionsIndexEntry[] = []): AgentSessionsIndex & {
  rememberedCalls: Array<{ id: string; runtimeId: string; agentName?: string }>;
  forgottenIds: string[];
} {
  const map = new Map<string, AgentSessionsIndexEntry>(initial.map((e) => [e.id, e]));
  const rememberedCalls: Array<{ id: string; runtimeId: string; agentName?: string }> = [];
  const forgottenIds: string[] = [];

  return {
    rememberedCalls,
    forgottenIds,
    async remember(entry) {
      rememberedCalls.push(entry);
      map.set(entry.id, { ...entry, createdAt: Date.now() });
    },
    async lookup(id) {
      return map.get(id) ?? null;
    },
    async forget(id) {
      forgottenIds.push(id);
      map.delete(id);
    },
    async list() {
      return [...map.values()];
    },
  };
}

// ---------------------------------------------------------------------------
// Registry / config fakes
// ---------------------------------------------------------------------------

function fakeRegistry(adapters: Record<string, RuntimeAdapter | null>): RuntimeRegistry {
  const descriptors: RuntimeDescriptor[] = Object.keys(adapters).map((id) => ({
    id, kind: "openclaw" as const, displayName: id,
    endpoint: "sdk:", transport: "sdk" as const, authMode: "token-env" as const,
  }));
  return {
    configPath: () => "/tmp/test-sessions-routes.json",
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
      enabled: true,
      status: { state: "healthy" as const },
    })) as RuntimeConfigDescriptor[],
  };
  return {
    read: async () => snap,
    patch: async () => snap,
  };
}

// ---------------------------------------------------------------------------
// App builder
// ---------------------------------------------------------------------------

type MkAppOpts = {
  adapters: Record<string, RuntimeAdapter | null>;
  primary: string | null;
  agentSessionsIndex?: AgentSessionsIndex;
  callGateway?: () => Promise<never>;
};

async function mkApp(opts: MkAppOpts) {
  const registry = fakeRegistry(opts.adapters);
  const runtimeConfig = fakeConfig(opts.primary);
  const agentSessionsIndex = opts.agentSessionsIndex ?? makeFakeIndex();
  // callGateway throws by default — proves migrated routes never call it.
  const callGateway = opts.callGateway ??
    (async () => { throw new Error("callGateway must not be invoked"); });

  const app = express();
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    (req as any).auth = { user: { id: "user-test-1" }, permissions: ["sessions.manage"] };
    next();
  });
  app.use(createAgentSessionsRouter({
    callGateway,
    registry,
    runtimeConfig,
    agentSessionsIndex,
  }));

  const server = createServer(app);
  server.listen(0);
  await once(server, "listening");
  const port = (server.address() as { port: number }).port;

  return {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

// ===========================================================================
// Tests — POST /agent-sessions
// ===========================================================================

test("POST /agent-sessions with { agentName: 'main' } → primary adapter, stores index entry, returns normalized session", async () => {
  const invokeCalls: { action: string; payload: unknown }[] = [];
  const index = makeFakeIndex();

  const primaryAdapter = makeFakeAdapter({
    id: "oc-main",
    invokeActionImpl: async (action, payload) => {
      invokeCalls.push({ action, payload });
      return { ok: true, nativeResult: { id: "sess-abc-123", agentName: "main", status: "active" }, projectionMode: "exact" };
    },
  });

  const a = await mkApp({
    adapters: { "oc-main": primaryAdapter },
    primary: "oc-main",
    agentSessionsIndex: index,
  });

  try {
    const r = await fetch(`${a.url}/agent-sessions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ agentName: "main" }),
    });
    assert.equal(r.status, 201);
    const body = await r.json() as any;
    assert.equal(body.id, "sess-abc-123");
    assert.equal(body.agentName, "main");

    // Adapter was invoked with sessions.create
    assert.equal(invokeCalls.length, 1);
    assert.equal(invokeCalls[0].action, "sessions.create");
    assert.deepEqual(invokeCalls[0].payload, { agentName: "main" });

    // Index was updated
    assert.equal(index.rememberedCalls.length, 1);
    assert.equal(index.rememberedCalls[0].id, "sess-abc-123");
    assert.equal(index.rememberedCalls[0].runtimeId, "oc-main");
    assert.equal(index.rememberedCalls[0].agentName, "main");
  } finally { await a.close(); }
});

test("POST /agent-sessions with { runtimeId: 'hermes', agentName: 'x' } → dispatches against hermes adapter", async () => {
  const hermesInvokeCalls: { action: string; payload: unknown }[] = [];
  const index = makeFakeIndex();

  const hermes = makeFakeAdapter({
    id: "hermes",
    invokeActionImpl: async (action, payload) => {
      hermesInvokeCalls.push({ action, payload });
      return { ok: true, nativeResult: { id: "hermes-sess-1", agentName: "x" }, projectionMode: "exact" };
    },
  });

  const a = await mkApp({
    adapters: { "oc-main": makeFakeAdapter({ id: "oc-main" }), "hermes": hermes },
    primary: "oc-main",
    agentSessionsIndex: index,
  });

  try {
    const r = await fetch(`${a.url}/agent-sessions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ runtimeId: "hermes", agentName: "x" }),
    });
    assert.equal(r.status, 201);
    const body = await r.json() as any;
    assert.equal(body.id, "hermes-sess-1");

    assert.equal(hermesInvokeCalls.length, 1);
    assert.equal(hermesInvokeCalls[0].action, "sessions.create");

    // Index entry must reference hermes
    assert.equal(index.rememberedCalls.length, 1);
    assert.equal(index.rememberedCalls[0].runtimeId, "hermes");
    assert.equal(index.rememberedCalls[0].id, "hermes-sess-1");
  } finally { await a.close(); }
});

// ===========================================================================
// Tests — POST /agent-sessions/:id/send
// ===========================================================================

test("POST /agent-sessions/:id/send with id in index pointing to hermes → resolves hermes adapter, NO callGateway", async () => {
  const hermesInvokeCalls: { action: string; payload: unknown }[] = [];

  const hermes = makeFakeAdapter({
    id: "hermes",
    invokeActionImpl: async (action, payload) => {
      hermesInvokeCalls.push({ action, payload });
      return { ok: true, nativeResult: { ack: true, sessionKey: "sess-hermes-42" }, projectionMode: "exact" };
    },
  });

  const index = makeFakeIndex([
    { id: "sess-hermes-42", runtimeId: "hermes", createdAt: Date.now() },
  ]);

  const a = await mkApp({
    adapters: { "oc-main": makeFakeAdapter({ id: "oc-main" }), "hermes": hermes },
    primary: "oc-main",
    agentSessionsIndex: index,
    // callGateway is the throwing default — proves it is never invoked
  });

  try {
    const r = await fetch(`${a.url}/agent-sessions/sess-hermes-42/send`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "Hello hermes" }),
    });
    assert.equal(r.status, 200);
    const body = await r.json() as any;
    assert.equal(body.ack, true);

    assert.equal(hermesInvokeCalls.length, 1);
    assert.equal(hermesInvokeCalls[0].action, "sessions.send");
    assert.deepEqual(hermesInvokeCalls[0].payload, { sessionKey: "sess-hermes-42", message: "Hello hermes" });
  } finally { await a.close(); }
});

test("POST /agent-sessions/:id/send with ?runtimeId=openclaw mismatch on stored hermes → 400 invalid_runtime_override", async () => {
  const index = makeFakeIndex([
    { id: "sess-hermes-42", runtimeId: "hermes", createdAt: Date.now() },
  ]);

  const a = await mkApp({
    adapters: { "oc-main": makeFakeAdapter({ id: "oc-main" }), "hermes": makeFakeAdapter({ id: "hermes" }) },
    primary: "oc-main",
    agentSessionsIndex: index,
  });

  try {
    const r = await fetch(`${a.url}/agent-sessions/sess-hermes-42/send?runtimeId=oc-main`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "Hi" }),
    });
    assert.equal(r.status, 400);
    const body = await r.json() as any;
    assert.equal(body.error, "invalid_runtime_override");
    assert.equal(body.stored, "hermes");
    assert.equal(body.attempted, "oc-main");
  } finally { await a.close(); }
});

test("POST /agent-sessions/:id/send with id NOT in index → falls back to primary (back-compat)", async () => {
  const primaryInvokeCalls: string[] = [];

  const primary = makeFakeAdapter({
    id: "oc-main",
    invokeActionImpl: async (action) => {
      primaryInvokeCalls.push(action);
      return { ok: true, nativeResult: { ack: true, sessionKey: "legacy-sess" }, projectionMode: "exact" };
    },
  });

  // Empty index — no stored entry for "legacy-sess"
  const index = makeFakeIndex([]);

  const a = await mkApp({
    adapters: { "oc-main": primary },
    primary: "oc-main",
    agentSessionsIndex: index,
  });

  try {
    const r = await fetch(`${a.url}/agent-sessions/legacy-sess/send`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "Hello" }),
    });
    assert.equal(r.status, 200);
    assert.deepEqual(primaryInvokeCalls, ["sessions.send"]);
  } finally { await a.close(); }
});

// ===========================================================================
// Tests — GET /agent-sessions/:id/usage
// ===========================================================================

test("GET /agent-sessions/:id/usage resolves stored runtime, calls adapter.read('sessions.usage', { sessionKey })", async () => {
  const hermesReadCalls: { cap: string; params: unknown }[] = [];

  const hermes = makeFakeAdapter({
    id: "hermes",
    readImpl: async (cap, params) => {
      hermesReadCalls.push({ cap, params });
      return { inputTokens: 1000, outputTokens: 500, sessionKey: "sess-usage-1" };
    },
  });

  const index = makeFakeIndex([
    { id: "sess-usage-1", runtimeId: "hermes", createdAt: Date.now() },
  ]);

  const a = await mkApp({
    adapters: { "oc-main": makeFakeAdapter({ id: "oc-main" }), "hermes": hermes },
    primary: "oc-main",
    agentSessionsIndex: index,
  });

  try {
    const r = await fetch(`${a.url}/agent-sessions/sess-usage-1/usage`);
    assert.equal(r.status, 200);
    const body = await r.json() as any;
    assert.equal(body.inputTokens, 1000);
    assert.equal(body.outputTokens, 500);

    assert.equal(hermesReadCalls.length, 1);
    assert.equal(hermesReadCalls[0].cap, "sessions.usage");
    assert.deepEqual(hermesReadCalls[0].params, { sessionKey: "sess-usage-1" });
  } finally { await a.close(); }
});

// ===========================================================================
// Tests — POST /agent-sessions/:id/reset|abort|compact
// ===========================================================================

test("POST /agent-sessions/:id/reset dispatches invokeAction('sessions.reset', { sessionKey }) against stored runtime", async () => {
  const invokeCalls: { action: string; payload: unknown }[] = [];

  const hermes = makeFakeAdapter({
    id: "hermes",
    invokeActionImpl: async (action, payload) => {
      invokeCalls.push({ action, payload });
      return { ok: true, nativeResult: { reset: true }, projectionMode: "exact" };
    },
  });

  const index = makeFakeIndex([
    { id: "sess-reset-1", runtimeId: "hermes", createdAt: Date.now() },
  ]);

  const a = await mkApp({
    adapters: { "oc-main": makeFakeAdapter({ id: "oc-main" }), "hermes": hermes },
    primary: "oc-main",
    agentSessionsIndex: index,
  });

  try {
    const r = await fetch(`${a.url}/agent-sessions/sess-reset-1/reset`, { method: "POST" });
    assert.equal(r.status, 200);
    const body = await r.json() as any;
    assert.equal(body.reset, true);

    assert.equal(invokeCalls.length, 1);
    assert.equal(invokeCalls[0].action, "sessions.reset");
    assert.deepEqual(invokeCalls[0].payload, { sessionKey: "sess-reset-1" });
  } finally { await a.close(); }
});

test("POST /agent-sessions/:id/abort dispatches invokeAction('sessions.abort', { sessionKey }) against stored runtime", async () => {
  const invokeCalls: { action: string; payload: unknown }[] = [];

  const hermes = makeFakeAdapter({
    id: "hermes",
    invokeActionImpl: async (action, payload) => {
      invokeCalls.push({ action, payload });
      return { ok: true, nativeResult: { aborted: true }, projectionMode: "exact" };
    },
  });

  const index = makeFakeIndex([
    { id: "sess-abort-1", runtimeId: "hermes", createdAt: Date.now() },
  ]);

  const a = await mkApp({
    adapters: { "oc-main": makeFakeAdapter({ id: "oc-main" }), "hermes": hermes },
    primary: "oc-main",
    agentSessionsIndex: index,
  });

  try {
    const r = await fetch(`${a.url}/agent-sessions/sess-abort-1/abort`, { method: "POST" });
    assert.equal(r.status, 200);
    const body = await r.json() as any;
    assert.equal(body.aborted, true);

    assert.equal(invokeCalls.length, 1);
    assert.equal(invokeCalls[0].action, "sessions.abort");
    assert.deepEqual(invokeCalls[0].payload, { sessionKey: "sess-abort-1" });
  } finally { await a.close(); }
});

test("POST /agent-sessions/:id/compact dispatches invokeAction('sessions.compact', { sessionKey }) against stored runtime", async () => {
  const invokeCalls: { action: string; payload: unknown }[] = [];

  const primary = makeFakeAdapter({
    id: "oc-main",
    invokeActionImpl: async (action, payload) => {
      invokeCalls.push({ action, payload });
      return { ok: true, nativeResult: { compacted: true }, projectionMode: "exact" };
    },
  });

  const index = makeFakeIndex([
    { id: "sess-compact-1", runtimeId: "oc-main", createdAt: Date.now() },
  ]);

  const a = await mkApp({
    adapters: { "oc-main": primary },
    primary: "oc-main",
    agentSessionsIndex: index,
  });

  try {
    const r = await fetch(`${a.url}/agent-sessions/sess-compact-1/compact`, { method: "POST" });
    assert.equal(r.status, 200);
    const body = await r.json() as any;
    assert.equal(body.compacted, true);

    assert.equal(invokeCalls.length, 1);
    assert.equal(invokeCalls[0].action, "sessions.compact");
    assert.deepEqual(invokeCalls[0].payload, { sessionKey: "sess-compact-1" });
  } finally { await a.close(); }
});

// ===========================================================================
// Tests — DELETE /agent-sessions/:id
// ===========================================================================

test("DELETE /agent-sessions/:id dispatches invokeAction('sessions.delete') then agentSessionsIndex.forget(id)", async () => {
  const primaryInvokeCalls: { action: string; payload: unknown }[] = [];

  const primary = makeFakeAdapter({
    id: "oc-main",
    invokeActionImpl: async (action, payload) => {
      primaryInvokeCalls.push({ action, payload });
      return { ok: true, nativeResult: { deleted: true }, projectionMode: "exact" };
    },
  });

  const index = makeFakeIndex([
    { id: "sess-delete-me", runtimeId: "oc-main", createdAt: Date.now() },
  ]);

  const a = await mkApp({
    adapters: { "oc-main": primary },
    primary: "oc-main",
    agentSessionsIndex: index,
  });

  try {
    const r = await fetch(`${a.url}/agent-sessions/sess-delete-me`, { method: "DELETE" });
    assert.equal(r.status, 200);
    const body = await r.json() as any;
    assert.equal(body.deleted, true);

    // invokeAction was called with correct args
    assert.equal(primaryInvokeCalls.length, 1);
    assert.equal(primaryInvokeCalls[0].action, "sessions.delete");
    assert.deepEqual(primaryInvokeCalls[0].payload, { sessionKey: "sess-delete-me" });

    // Index entry was removed
    assert.equal(index.forgottenIds.length, 1);
    assert.equal(index.forgottenIds[0], "sess-delete-me");
  } finally { await a.close(); }
});

// ===========================================================================
// Tests — unsupported capability → 409
// ===========================================================================

test("POST /agent-sessions/:id/send where sessions.send is unsupported → 409", async () => {
  const zeroclaw = makeFakeAdapter({
    id: "zeroclaw",
    supported: ["sessions.list", "sessions.create"],
    unsupported: ["sessions.send"],
  });

  const index = makeFakeIndex([
    { id: "sess-zeroclaw-1", runtimeId: "zeroclaw", createdAt: Date.now() },
  ]);

  const a = await mkApp({
    adapters: { "zeroclaw": zeroclaw },
    primary: "zeroclaw",
    agentSessionsIndex: index,
  });

  try {
    const r = await fetch(`${a.url}/agent-sessions/sess-zeroclaw-1/send`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "test" }),
    });
    assert.equal(r.status, 409);
    const body = await r.json() as any;
    assert.equal(body.ok, false);
    assert.equal(body.error.code, "UNSUPPORTED_CAPABILITY");
    assert.equal(body.error.capabilityId, "sessions.send");
  } finally { await a.close(); }
});
