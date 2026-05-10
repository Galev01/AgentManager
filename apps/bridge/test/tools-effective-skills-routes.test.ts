/**
 * Route tests for GET /tools/effective, GET /skills, POST /skills/install.
 *
 * All three endpoints are now runtime-aware: they resolve the target runtime
 * through the registry (query or body override, or effective primary), gate on
 * the declared capability, then dispatch to the adapter.
 *
 * Coverage:
 *  1. GET /tools/effective — no override → primary adapter.read("tools.effective") called.
 *  2. GET /tools/effective?runtimeId=hermes → hermes adapter.read called.
 *  3. GET /tools/effective?runtimeId=ghost → 404 runtime_not_found.
 *  4. GET /tools/effective — adapter declares tools.effective unsupported → 409.
 *  5. GET /tools/effective — supported but adapter.read is undefined → 409 with reason.
 *  6. GET /skills?runtimeId=X → adapter.listEntities("skill") called, bare array returned.
 *     Also asserts callGateway is never invoked.
 *  7. POST /skills/install — no name body → 400.
 *  8. POST /skills/install { name } → primary adapter.invokeAction("skills.install", ...) called.
 *  9. POST /skills/install { runtimeId, name } → named adapter used (body override).
 * 10. POST /skills/install — adapter declares skills.install unsupported → 409.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import express, { type Request, type Response, type NextFunction } from "express";
import { createServer } from "node:http";
import { once } from "node:events";
import { createToolsRouter } from "../src/routes/tools.js";
import type { RuntimeRegistry } from "../src/services/runtimes/registry.js";
import type { RuntimeConfigService } from "../src/services/runtime-config.js";
import type {
  RuntimeAdapter, RuntimeDescriptor, CapabilitySnapshot,
  RuntimeConfigSnapshot, RuntimeConfigDescriptor,
  RuntimeActionId, RuntimeActionPayload, RuntimeActionContext, RuntimeActionResult,
  RuntimeEntity, RuntimeEntityKind, RuntimeReadCapabilityId,
} from "@openclaw-manager/types";

// ---------------------------------------------------------------------------
// Fake adapter factory
// ---------------------------------------------------------------------------

type FakeAdapterOpts = {
  id: string;
  supported?: string[];
  unsupported?: string[];
  readImpl?: (cap: RuntimeReadCapabilityId, params?: unknown) => Promise<unknown>;
  listEntitiesImpl?: (kind: RuntimeEntityKind) => Promise<RuntimeEntity[]>;
  invokeActionImpl?: (action: RuntimeActionId, payload: unknown, ctx: RuntimeActionContext) => Promise<RuntimeActionResult>;
  /** If true, the adapter.read method is omitted entirely. */
  noRead?: boolean;
};

function makeFakeAdapter(opts: FakeAdapterOpts): RuntimeAdapter {
  const {
    id,
    supported = ["tools.list", "tools.effective", "skills.list", "skills.install"],
    unsupported = [],
    readImpl,
    listEntitiesImpl,
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
    listEntities: async (kind: RuntimeEntityKind) => {
      if (listEntitiesImpl) return listEntitiesImpl(kind) as Promise<RuntimeEntity[]>;
      return [];
    },
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
      if (readImpl) return readImpl(cap, params) as Promise<import("@openclaw-manager/types").JsonValue>;
      return null;
    };
  }

  return adapter;
}

// ---------------------------------------------------------------------------
// Registry / config fakes
// ---------------------------------------------------------------------------

function fakeRegistry(
  adapters: Record<string, RuntimeAdapter | null>,
): RuntimeRegistry {
  const descriptors: RuntimeDescriptor[] = Object.keys(adapters).map((id) => ({
    id, kind: "openclaw", displayName: id, endpoint: "sdk:",
    transport: "sdk" as const, authMode: "token-env" as const,
  }));
  return {
    configPath: () => "/tmp/test-tools-routes.json",
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
    runtimes: Object.entries(primary ? { [primary]: true } : {}).map(([id]) => ({
      id, kind: "openclaw", displayName: id, endpoint: "sdk:",
      transport: "sdk" as const, authMode: "token-env" as const,
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

async function mkApp(opts: {
  adapters: Record<string, RuntimeAdapter | null>;
  primary: string | null;
  /** Set to a function that throws to assert callGateway is never invoked. */
  callGateway?: () => Promise<never>;
}) {
  const registry = fakeRegistry(opts.adapters);
  const runtimeConfig = fakeConfig(opts.primary);
  const callGateway = opts.callGateway ??
    (async () => { throw new Error("callGateway must not be invoked"); });

  const app = express();
  app.use(express.json());
  // Inject a minimal auth so actor stamping has a user.
  app.use((req: Request, _res: Response, next: NextFunction) => {
    (req as any).auth = { user: { id: "user-test-1" }, permissions: ["tools.view"] };
    next();
  });
  app.use(createToolsRouter({
    callGateway,
    registry,
    runtimeConfig,
    managerServiceId: "bridge-test",
  }));

  const server = createServer(app);
  server.listen(0);
  await once(server, "listening");
  const port = (server.address() as { port: number }).port;

  return {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((r) => server.close(() => r())),
  };
}

// ===========================================================================
// Tests — GET /tools/effective
// ===========================================================================

test("GET /tools/effective: no override → calls primary adapter.read('tools.effective')", async () => {
  const readCalls: { cap: string; params: unknown }[] = [];

  const primaryAdapter = makeFakeAdapter({
    id: "oc-main",
    readImpl: async (cap, params) => {
      readCalls.push({ cap, params });
      return [{ name: "bash" }, { name: "read" }];
    },
  });

  const a = await mkApp({
    adapters: { "oc-main": primaryAdapter },
    primary: "oc-main",
  });

  try {
    const r = await fetch(`${a.url}/tools/effective`);
    assert.equal(r.status, 200);
    const body = await r.json();
    assert.ok(Array.isArray(body));
    assert.equal(body.length, 2);
    assert.equal(readCalls.length, 1);
    assert.equal(readCalls[0].cap, "tools.effective");
  } finally { await a.close(); }
});

test("GET /tools/effective?runtimeId=hermes → calls hermes adapter.read", async () => {
  const hermesReadCalls: string[] = [];

  const hermesAdapter = makeFakeAdapter({
    id: "hermes",
    readImpl: async (cap) => {
      hermesReadCalls.push(cap);
      return [{ name: "hermes-tool" }];
    },
  });

  const a = await mkApp({
    adapters: {
      "oc-main": makeFakeAdapter({ id: "oc-main" }),
      "hermes": hermesAdapter,
    },
    primary: "oc-main",
  });

  try {
    const r = await fetch(`${a.url}/tools/effective?runtimeId=hermes`);
    assert.equal(r.status, 200);
    const body = await r.json();
    assert.ok(Array.isArray(body));
    assert.equal(body[0].name, "hermes-tool");
    assert.deepEqual(hermesReadCalls, ["tools.effective"]);
  } finally { await a.close(); }
});

test("GET /tools/effective?runtimeId=ghost → 404 runtime_not_found", async () => {
  const a = await mkApp({
    adapters: { "oc-main": makeFakeAdapter({ id: "oc-main" }) },
    primary: "oc-main",
  });

  try {
    const r = await fetch(`${a.url}/tools/effective?runtimeId=ghost`);
    assert.equal(r.status, 404);
    const body = await r.json();
    assert.equal(body.error, "runtime_not_found");
    assert.equal(body.runtimeId, "ghost");
  } finally { await a.close(); }
});

test("GET /tools/effective: adapter declares tools.effective unsupported → 409", async () => {
  const a = await mkApp({
    adapters: {
      "oc-main": makeFakeAdapter({
        id: "oc-main",
        supported: ["tools.list"],
        unsupported: ["tools.effective"],
      }),
    },
    primary: "oc-main",
  });

  try {
    const r = await fetch(`${a.url}/tools/effective`);
    assert.equal(r.status, 409);
    const body = await r.json();
    assert.equal(body.ok, false);
    assert.equal(body.error.code, "UNSUPPORTED_CAPABILITY");
    assert.equal(body.error.capabilityId, "tools.effective");
  } finally { await a.close(); }
});

test("GET /tools/effective: supported but adapter.read undefined → 409 with reason", async () => {
  const a = await mkApp({
    adapters: {
      "oc-main": makeFakeAdapter({
        id: "oc-main",
        supported: ["tools.effective"],
        noRead: true,
      }),
    },
    primary: "oc-main",
  });

  try {
    const r = await fetch(`${a.url}/tools/effective`);
    assert.equal(r.status, 409);
    const body = await r.json();
    assert.equal(body.ok, false);
    assert.equal(body.error.code, "UNSUPPORTED_CAPABILITY");
    assert.equal(body.error.capabilityId, "tools.effective");
    assert.match(body.error.reason, /adapter does not implement read/);
  } finally { await a.close(); }
});

// ===========================================================================
// Tests — GET /skills
// ===========================================================================

test("GET /skills?runtimeId=X → calls listEntities('skill'), bare array, no callGateway", async () => {
  const listCalls: RuntimeEntityKind[] = [];

  const hermes = makeFakeAdapter({
    id: "hermes",
    listEntitiesImpl: async (kind) => {
      listCalls.push(kind);
      if (kind === "skill") {
        return [
          {
            runtimeKind: "hermes", runtimeId: "hermes", entityKind: "skill",
            entityId: "skill-1", displayName: "Skill One",
            nativeRef: { id: "skill-1", name: "Skill One" },
          },
        ] as RuntimeEntity[];
      }
      return [];
    },
  });

  // callGateway throws if invoked — proves the migrated route never calls it.
  const a = await mkApp({
    adapters: { "oc-main": makeFakeAdapter({ id: "oc-main" }), "hermes": hermes },
    primary: "oc-main",
    callGateway: async () => { throw new Error("callGateway must not be invoked"); },
  });

  try {
    const r = await fetch(`${a.url}/skills?runtimeId=hermes`);
    assert.equal(r.status, 200);
    const body = await r.json();
    // Dashboard expects bare array
    assert.ok(Array.isArray(body));
    assert.equal(body.length, 1);
    assert.equal(body[0].id, "skill-1");
    assert.equal(body[0].name, "Skill One");
    assert.deepEqual(listCalls, ["skill"]);
  } finally { await a.close(); }
});

// ===========================================================================
// Tests — POST /skills/install
// ===========================================================================

test("POST /skills/install with no body → 400", async () => {
  const a = await mkApp({
    adapters: { "oc-main": makeFakeAdapter({ id: "oc-main" }) },
    primary: "oc-main",
  });

  try {
    const r = await fetch(`${a.url}/skills/install`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    assert.equal(r.status, 400);
    const body = await r.json();
    assert.equal(body.error, "name is required");
  } finally { await a.close(); }
});

test("POST /skills/install { name } → primary adapter.invokeAction('skills.install', {ref})", async () => {
  const invokeCalls: { action: string; payload: unknown; actor: unknown }[] = [];

  const primaryAdapter = makeFakeAdapter({
    id: "oc-main",
    invokeActionImpl: async (action, payload, ctx) => {
      invokeCalls.push({ action, payload, actor: ctx.actor });
      return { ok: true, nativeResult: { installed: true }, projectionMode: "exact" };
    },
  });

  const a = await mkApp({
    adapters: { "oc-main": primaryAdapter },
    primary: "oc-main",
  });

  try {
    const r = await fetch(`${a.url}/skills/install`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "my-skill" }),
    });
    assert.equal(r.status, 200);
    const body = await r.json();
    assert.deepEqual(body, { installed: true });
    assert.equal(invokeCalls.length, 1);
    assert.equal(invokeCalls[0].action, "skills.install");
    assert.deepEqual(invokeCalls[0].payload, { ref: "my-skill" });
    // Actor is bridge-stamped
    const actor = invokeCalls[0].actor as any;
    assert.equal(actor.humanActorUserId, "user-test-1");
    assert.equal(actor.managerServiceId, "bridge-test");
    assert.equal(actor.basis, "service-principal");
  } finally { await a.close(); }
});

test("POST /skills/install { runtimeId, name } → hermes adapter used via body override", async () => {
  const hermesInvokeCalls: { action: string; payload: unknown }[] = [];

  const hermes = makeFakeAdapter({
    id: "hermes",
    invokeActionImpl: async (action, payload) => {
      hermesInvokeCalls.push({ action, payload });
      return { ok: true, nativeResult: { runtimeUsed: "hermes" }, projectionMode: "exact" };
    },
  });

  const a = await mkApp({
    adapters: { "oc-main": makeFakeAdapter({ id: "oc-main" }), "hermes": hermes },
    primary: "oc-main",
  });

  try {
    const r = await fetch(`${a.url}/skills/install`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ runtimeId: "hermes", name: "hermes-skill" }),
    });
    assert.equal(r.status, 200);
    const body = await r.json();
    assert.deepEqual(body, { runtimeUsed: "hermes" });
    assert.equal(hermesInvokeCalls.length, 1);
    assert.equal(hermesInvokeCalls[0].action, "skills.install");
    assert.deepEqual(hermesInvokeCalls[0].payload, { ref: "hermes-skill" });
  } finally { await a.close(); }
});

test("POST /skills/install against unsupported runtime → 409 UNSUPPORTED_CAPABILITY", async () => {
  const a = await mkApp({
    adapters: {
      "oc-main": makeFakeAdapter({
        id: "oc-main",
        supported: ["skills.list"],
        unsupported: ["skills.install"],
      }),
    },
    primary: "oc-main",
  });

  try {
    const r = await fetch(`${a.url}/skills/install`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "some-skill" }),
    });
    assert.equal(r.status, 409);
    const body = await r.json();
    assert.equal(body.ok, false);
    assert.equal(body.error.code, "UNSUPPORTED_CAPABILITY");
    assert.equal(body.error.capabilityId, "skills.install");
  } finally { await a.close(); }
});
