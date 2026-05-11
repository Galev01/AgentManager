/**
 * Route tests for POST /cron, GET /cron/:id/status, POST /cron/:id/run,
 * DELETE /cron/:id — all migrated from legacy callGateway to runtime-aware
 * adapter dispatch in Task 6.
 *
 * Coverage:
 *  1. POST /cron with { schedule, agentName } → resolves primary, dispatches
 *     invokeAction("cron.write", ...), stores { id, runtimeId: primary } in cron-store.
 *  2. POST /cron with { runtimeId: "hermes", schedule } → dispatches against hermes adapter.
 *  3. POST /cron against runtime where cron.write is unsupported → 409.
 *  4. GET /cron/:id/status when store has id with runtimeId: "hermes" → calls hermes
 *     adapter.read("cron.status", { id }). NO callGateway invocation.
 *  5. GET /cron/:id/status with ?runtimeId=openclaw mismatch on stored hermes → 400
 *     invalid_runtime_override.
 *  6. POST /cron/:id/run dispatches invokeAction("cron.run", { id }) against stored runtime.
 *  7. DELETE /cron/:id dispatches invokeAction("cron.delete", { id }) then forget(id).
 *  8. Endpoints on a job NOT in the store fall back to primary runtime (back-compat).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import express, { type Request, type Response, type NextFunction } from "express";
import { createServer } from "node:http";
import { once } from "node:events";
import { createCronRouter } from "../src/routes/cron.js";
import type { RuntimeRegistry } from "../src/services/runtimes/registry.js";
import type { RuntimeConfigService } from "../src/services/runtime-config.js";
import type { CronStore, CronStoreEntry } from "../src/services/cron-store.js";
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
    supported = ["cron.list", "cron.write", "cron.delete", "cron.run", "cron.status"],
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
// In-memory cron-store stub
// ---------------------------------------------------------------------------

function makeFakeCronStore(initial: CronStoreEntry[] = []): CronStore & {
  rememberedCalls: Array<{ id: string; runtimeId: string; agentName?: string }>;
  forgottenIds: string[];
} {
  const map = new Map<string, CronStoreEntry>(initial.map((e) => [e.id, e]));
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
    configPath: () => "/tmp/test-cron-routes.json",
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
  cronStore?: CronStore;
  callGateway?: () => Promise<never>;
};

async function mkApp(opts: MkAppOpts) {
  const registry = fakeRegistry(opts.adapters);
  const runtimeConfig = fakeConfig(opts.primary);
  const cronStore = opts.cronStore ?? makeFakeCronStore();
  // callGateway throws by default — proves migrated routes never call it.
  const callGateway = opts.callGateway ??
    (async () => { throw new Error("callGateway must not be invoked"); });

  const app = express();
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    (req as any).auth = { user: { id: "user-test-1" }, permissions: ["cron.manage"] };
    next();
  });
  app.use(createCronRouter({
    callGateway,
    registry,
    runtimeConfig,
    cronStore,
    managerServiceId: "bridge-test",
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
// Tests — POST /cron
// ===========================================================================

test("POST /cron with { schedule, agentName } → primary adapter, stores { id, runtimeId } in cron-store", async () => {
  const invokeCalls: { action: string; payload: unknown }[] = [];
  const store = makeFakeCronStore();

  const primaryAdapter = makeFakeAdapter({
    id: "oc-main",
    invokeActionImpl: async (action, payload) => {
      invokeCalls.push({ action, payload });
      return { ok: true, nativeResult: { id: "cron-abc-123", status: "created" }, projectionMode: "exact" };
    },
  });

  const a = await mkApp({
    adapters: { "oc-main": primaryAdapter },
    primary: "oc-main",
    cronStore: store,
  });

  try {
    const r = await fetch(`${a.url}/cron`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ schedule: "* * * * *", agentName: "main" }),
    });
    assert.equal(r.status, 201);
    const body = await r.json();
    assert.equal(body.id, "cron-abc-123");

    // Adapter was invoked
    assert.equal(invokeCalls.length, 1);
    assert.equal(invokeCalls[0].action, "cron.write");
    const payload = invokeCalls[0].payload as any;
    assert.ok(payload.spec);
    assert.equal(payload.spec.cron, "* * * * *");
    assert.equal(payload.spec.enabled, true);

    // Store was updated
    assert.equal(store.rememberedCalls.length, 1);
    assert.equal(store.rememberedCalls[0].id, "cron-abc-123");
    assert.equal(store.rememberedCalls[0].runtimeId, "oc-main");
    assert.equal(store.rememberedCalls[0].agentName, "main");
  } finally { await a.close(); }
});

test("POST /cron with { runtimeId: 'hermes', schedule } → dispatches against hermes adapter", async () => {
  const hermesInvokeCalls: { action: string; payload: unknown }[] = [];
  const store = makeFakeCronStore();

  const hermes = makeFakeAdapter({
    id: "hermes",
    invokeActionImpl: async (action, payload) => {
      hermesInvokeCalls.push({ action, payload });
      return { ok: true, nativeResult: { id: "hermes-job-1" }, projectionMode: "exact" };
    },
  });

  const a = await mkApp({
    adapters: { "oc-main": makeFakeAdapter({ id: "oc-main" }), "hermes": hermes },
    primary: "oc-main",
    cronStore: store,
  });

  try {
    const r = await fetch(`${a.url}/cron`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ runtimeId: "hermes", schedule: "0 9 * * *" }),
    });
    assert.equal(r.status, 201);
    const body = await r.json();
    assert.equal(body.id, "hermes-job-1");

    assert.equal(hermesInvokeCalls.length, 1);
    assert.equal(hermesInvokeCalls[0].action, "cron.write");

    // Store entry must reference hermes
    assert.equal(store.rememberedCalls.length, 1);
    assert.equal(store.rememberedCalls[0].runtimeId, "hermes");
  } finally { await a.close(); }
});

test("POST /cron against runtime where cron.write is unsupported → 409", async () => {
  const a = await mkApp({
    adapters: {
      "oc-main": makeFakeAdapter({
        id: "oc-main",
        supported: ["cron.list"],
        unsupported: ["cron.write"],
      }),
    },
    primary: "oc-main",
  });

  try {
    const r = await fetch(`${a.url}/cron`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ schedule: "* * * * *" }),
    });
    assert.equal(r.status, 409);
    const body = await r.json();
    assert.equal(body.ok, false);
    assert.equal(body.error.code, "UNSUPPORTED_CAPABILITY");
    assert.equal(body.error.capabilityId, "cron.write");
  } finally { await a.close(); }
});

// ===========================================================================
// Tests — GET /cron/:id/status
// ===========================================================================

test("GET /cron/:id/status: store has id with runtimeId=hermes → hermes adapter.read, NO callGateway", async () => {
  const hermesReadCalls: { cap: string; params: unknown }[] = [];

  const hermes = makeFakeAdapter({
    id: "hermes",
    readImpl: async (cap, params) => {
      hermesReadCalls.push({ cap, params });
      return { id: "job-42", status: "active", nextRun: "2026-05-11T00:00:00Z" };
    },
  });

  const store = makeFakeCronStore([
    { id: "job-42", runtimeId: "hermes", createdAt: Date.now() },
  ]);

  const a = await mkApp({
    adapters: { "oc-main": makeFakeAdapter({ id: "oc-main" }), "hermes": hermes },
    primary: "oc-main",
    cronStore: store,
    // callGateway is the throwing default — proves it is never invoked
  });

  try {
    const r = await fetch(`${a.url}/cron/job-42/status`);
    assert.equal(r.status, 200);
    const body = await r.json();
    assert.equal(body.status, "active");

    assert.equal(hermesReadCalls.length, 1);
    assert.equal(hermesReadCalls[0].cap, "cron.status");
    assert.deepEqual(hermesReadCalls[0].params, { id: "job-42" });
  } finally { await a.close(); }
});

test("GET /cron/:id/status with ?runtimeId=openclaw mismatch on stored hermes → 400 invalid_runtime_override", async () => {
  const hermes = makeFakeAdapter({ id: "hermes" });
  const store = makeFakeCronStore([
    { id: "job-42", runtimeId: "hermes", createdAt: Date.now() },
  ]);

  const a = await mkApp({
    adapters: { "oc-main": makeFakeAdapter({ id: "oc-main" }), "hermes": hermes },
    primary: "oc-main",
    cronStore: store,
  });

  try {
    const r = await fetch(`${a.url}/cron/job-42/status?runtimeId=oc-main`);
    assert.equal(r.status, 400);
    const body = await r.json();
    assert.equal(body.error, "invalid_runtime_override");
    assert.equal(body.stored, "hermes");
    assert.equal(body.attempted, "oc-main");
  } finally { await a.close(); }
});

// ===========================================================================
// Tests — POST /cron/:id/run
// ===========================================================================

test("POST /cron/:id/run dispatches invokeAction('cron.run', { id }) against stored runtime", async () => {
  const hermesInvokeCalls: { action: string; payload: unknown }[] = [];

  const hermes = makeFakeAdapter({
    id: "hermes",
    invokeActionImpl: async (action, payload) => {
      hermesInvokeCalls.push({ action, payload });
      return { ok: true, nativeResult: { triggered: true }, projectionMode: "exact" };
    },
  });

  const store = makeFakeCronStore([
    { id: "job-run-me", runtimeId: "hermes", createdAt: Date.now() },
  ]);

  const a = await mkApp({
    adapters: { "oc-main": makeFakeAdapter({ id: "oc-main" }), "hermes": hermes },
    primary: "oc-main",
    cronStore: store,
  });

  try {
    const r = await fetch(`${a.url}/cron/job-run-me/run`, { method: "POST" });
    assert.equal(r.status, 200);
    const body = await r.json();
    assert.equal(body.triggered, true);

    assert.equal(hermesInvokeCalls.length, 1);
    assert.equal(hermesInvokeCalls[0].action, "cron.run");
    assert.deepEqual(hermesInvokeCalls[0].payload, { id: "job-run-me" });
  } finally { await a.close(); }
});

// ===========================================================================
// Tests — DELETE /cron/:id
// ===========================================================================

test("DELETE /cron/:id dispatches invokeAction('cron.delete', { id }) then cronStore.forget(id)", async () => {
  const primaryInvokeCalls: { action: string; payload: unknown }[] = [];

  const primary = makeFakeAdapter({
    id: "oc-main",
    invokeActionImpl: async (action, payload) => {
      primaryInvokeCalls.push({ action, payload });
      return { ok: true, nativeResult: { deleted: true }, projectionMode: "exact" };
    },
  });

  const store = makeFakeCronStore([
    { id: "job-delete-me", runtimeId: "oc-main", createdAt: Date.now() },
  ]);

  const a = await mkApp({
    adapters: { "oc-main": primary },
    primary: "oc-main",
    cronStore: store,
  });

  try {
    const r = await fetch(`${a.url}/cron/job-delete-me`, { method: "DELETE" });
    assert.equal(r.status, 200);
    const body = await r.json();
    assert.equal(body.deleted, true);

    // invokeAction was called with correct args
    assert.equal(primaryInvokeCalls.length, 1);
    assert.equal(primaryInvokeCalls[0].action, "cron.delete");
    assert.deepEqual(primaryInvokeCalls[0].payload, { id: "job-delete-me" });

    // Store entry was removed
    assert.equal(store.forgottenIds.length, 1);
    assert.equal(store.forgottenIds[0], "job-delete-me");
  } finally { await a.close(); }
});

// ===========================================================================
// Tests — back-compat: job not in store falls back to primary
// ===========================================================================

test("GET /cron/:id/status: job NOT in store falls back to primary runtime", async () => {
  const primaryReadCalls: string[] = [];

  const primary = makeFakeAdapter({
    id: "oc-main",
    readImpl: async (cap) => {
      primaryReadCalls.push(cap);
      return { id: "legacy-job", status: "idle" };
    },
  });

  // Empty store — no stored entry for "legacy-job"
  const store = makeFakeCronStore([]);

  const a = await mkApp({
    adapters: { "oc-main": primary },
    primary: "oc-main",
    cronStore: store,
  });

  try {
    const r = await fetch(`${a.url}/cron/legacy-job/status`);
    assert.equal(r.status, 200);
    const body = await r.json();
    assert.equal(body.status, "idle");

    // Primary adapter.read was invoked (back-compat fallback)
    assert.deepEqual(primaryReadCalls, ["cron.status"]);
  } finally { await a.close(); }
});

test("POST /cron/:id/run: job NOT in store falls back to primary runtime", async () => {
  const primaryInvokeCalls: string[] = [];

  const primary = makeFakeAdapter({
    id: "oc-main",
    invokeActionImpl: async (action) => {
      primaryInvokeCalls.push(action);
      return { ok: true, nativeResult: { triggered: true }, projectionMode: "exact" };
    },
  });

  const store = makeFakeCronStore([]);

  const a = await mkApp({
    adapters: { "oc-main": primary },
    primary: "oc-main",
    cronStore: store,
  });

  try {
    const r = await fetch(`${a.url}/cron/legacy-run/run`, { method: "POST" });
    assert.equal(r.status, 200);
    assert.deepEqual(primaryInvokeCalls, ["cron.run"]);
  } finally { await a.close(); }
});

test("DELETE /cron/:id: job NOT in store falls back to primary runtime", async () => {
  const primaryInvokeCalls: string[] = [];

  const primary = makeFakeAdapter({
    id: "oc-main",
    invokeActionImpl: async (action) => {
      primaryInvokeCalls.push(action);
      return { ok: true, nativeResult: { deleted: true }, projectionMode: "exact" };
    },
  });

  const store = makeFakeCronStore([]);

  const a = await mkApp({
    adapters: { "oc-main": primary },
    primary: "oc-main",
    cronStore: store,
  });

  try {
    const r = await fetch(`${a.url}/cron/legacy-delete`, { method: "DELETE" });
    assert.equal(r.status, 200);
    assert.deepEqual(primaryInvokeCalls, ["cron.delete"]);
  } finally { await a.close(); }
});
