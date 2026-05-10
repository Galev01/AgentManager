/**
 * Phase C — agents write-route tests.
 *
 * Verifies POST /agents, PATCH /agents/:name, DELETE /agents/:name route
 * through `RuntimeAdapter.invokeAction` with capability gating + payload
 * schema validation:
 *
 *  1. POST /agents happy path on primary OpenClaw runtime → adapter receives
 *     `agents.create` with the validated payload.
 *  2. POST /agents with body.runtimeId override → dispatches against the
 *     overridden adapter.
 *  3. POST /agents on a runtime where `agents.create` is unsupported → 409
 *     UNSUPPORTED_CAPABILITY with structured error shape.
 *  4. POST /agents with missing required field (workspace) → 422 with
 *     `fieldErrors`.
 *  5. PATCH /agents/:name happy path → adapter receives `agents.update`.
 *  6. PATCH /agents/:name with ?runtimeId=hermes where update unsupported → 409.
 *  7. DELETE /agents/:name happy path → adapter receives `agents.delete`.
 *  8. DELETE /agents/:name with ?runtimeId=hermes where delete unsupported → 409.
 *
 * Notes:
 *  - Agents have no bridge-side store of `runtimeId` (they're runtime-owned),
 *    so the spec's `INVALID_RUNTIME_OVERRIDE` 400 case does not apply for
 *    PATCH/DELETE — see plan Phase C.1: "treat as catalog mutation with
 *    override".
 *  - We pass a throwing `callGateway` to confirm the migrated routes never
 *    fall back to the legacy direct-gateway path.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import express, { type Request, type Response, type NextFunction } from "express";
import { createServer } from "node:http";
import { once } from "node:events";
import { createAgentsRouter } from "../src/routes/agents.js";
import type { RuntimeRegistry } from "../src/services/runtimes/registry.js";
import type { RuntimeConfigService } from "../src/services/runtime-config.js";
import type {
  RuntimeAdapter, RuntimeDescriptor, CapabilitySnapshot,
  RuntimeConfigSnapshot, RuntimeConfigDescriptor,
  RuntimeActionId, RuntimeActionPayload, RuntimeActionContext, RuntimeActionResult,
  RuntimeEntity, RuntimeEntityKind, JsonValue,
} from "@openclaw-manager/types";

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

type FakeAdapterOpts = {
  id: string;
  supported?: string[];
  unsupported?: string[];
  invokeActionImpl?: (action: RuntimeActionId, payload: unknown, ctx: RuntimeActionContext) => Promise<RuntimeActionResult>;
  // For models.list catalog reads (used by agent-models-service when a runtimeId
  // is supplied — the model validation path).
  modelEntities?: Array<{ id: string; provider?: string }>;
};

function makeFakeAdapter(opts: FakeAdapterOpts): RuntimeAdapter {
  const {
    id,
    supported = [
      "agents.list", "agents.read", "agents.create", "agents.update", "agents.delete",
      "models.list",
    ],
    unsupported = [],
    invokeActionImpl,
    modelEntities = [],
  } = opts;

  const caps: CapabilitySnapshot = {
    supported: supported as CapabilitySnapshot["supported"],
    partial: [],
    unsupported: unsupported as CapabilitySnapshot["unsupported"],
    version: "1.0.0", source: "static-adapter", stale: false,
  };
  const desc: RuntimeDescriptor = {
    id, kind: "openclaw", displayName: id,
    endpoint: "sdk:", transport: "sdk", authMode: "token-env",
  };

  return {
    describeRuntime: async () => desc,
    getCapabilities: async () => caps,
    listEntities: async (kind: RuntimeEntityKind): Promise<RuntimeEntity[]> => {
      if (kind === "model") {
        return modelEntities.map((m) => ({
          runtimeKind: "openclaw" as const, runtimeId: id,
          entityKind: "model" as const, entityId: m.id, displayName: m.id,
          nativeRef: m as JsonValue,
        }));
      }
      return [];
    },
    getEntity: async () => null,
    listActivity: async () => [],
    invokeAction: async <A extends RuntimeActionId>(
      action: A,
      payload: RuntimeActionPayload[A],
      ctx: RuntimeActionContext,
    ): Promise<RuntimeActionResult> => {
      if (invokeActionImpl) return invokeActionImpl(action, payload, ctx);
      return { ok: true, nativeResult: null, projectionMode: "exact" };
    },
    getAuthModes: async () => [],
    getExtensions: async () => [],
    health: async () => ({ ok: true }),
  };
}

function fakeRegistry(adapters: Record<string, RuntimeAdapter | null>): RuntimeRegistry {
  const descriptors: RuntimeDescriptor[] = Object.keys(adapters).map((id) => ({
    id, kind: "openclaw" as const, displayName: id,
    endpoint: "sdk:", transport: "sdk" as const, authMode: "token-env" as const,
  }));
  return {
    configPath: () => "/tmp/agents-write-routes-test.json",
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

type MkAppOpts = {
  adapters: Record<string, RuntimeAdapter | null>;
  primary: string | null;
  perms?: string[];
  callGateway?: () => Promise<never>;
};

async function mkApp(opts: MkAppOpts) {
  const registry = fakeRegistry(opts.adapters);
  const runtimeConfig = fakeConfig(opts.primary);
  const callGateway = opts.callGateway
    ?? (async () => { throw new Error("callGateway must not be invoked"); });

  const app = express();
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    (req as any).auth = {
      user: { id: "user-test-1" },
      permissions: opts.perms ?? ["agents.manage"],
    };
    next();
  });
  app.use(createAgentsRouter({
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
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

// ===========================================================================
// POST /agents
// ===========================================================================

test("POST /agents happy path → primary adapter receives agents.create with validated payload", async () => {
  const calls: { action: string; payload: unknown }[] = [];
  const primary = makeFakeAdapter({
    id: "oc-main",
    invokeActionImpl: async (action, payload) => {
      calls.push({ action, payload });
      return { ok: true, nativeResult: { ok: true, agentId: "new-agent" }, projectionMode: "exact" };
    },
  });
  const a = await mkApp({ adapters: { "oc-main": primary }, primary: "oc-main" });

  try {
    const r = await fetch(`${a.url}/agents`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "new-agent", workspace: "C:\\work", emoji: "[]" }),
    });
    assert.equal(r.status, 201);
    const body = await r.json();
    assert.equal(body.agentId, "new-agent");
    assert.equal(calls.length, 1);
    assert.equal(calls[0].action, "agents.create");
    const p = calls[0].payload as any;
    assert.equal(p.name, "new-agent");
    assert.equal(p.workspace, "C:\\work");
    assert.equal(p.emoji, "[]");
  } finally { await a.close(); }
});

test("POST /agents with body.runtimeId → dispatches against overridden adapter", async () => {
  const altCalls: { action: string }[] = [];
  const primary = makeFakeAdapter({ id: "oc-main" });
  const alt = makeFakeAdapter({
    id: "oc-alt",
    invokeActionImpl: async (action) => {
      altCalls.push({ action });
      return { ok: true, nativeResult: { ok: true, agentId: "alt-agent" }, projectionMode: "exact" };
    },
  });
  const a = await mkApp({
    adapters: { "oc-main": primary, "oc-alt": alt },
    primary: "oc-main",
  });

  try {
    const r = await fetch(`${a.url}/agents`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ runtimeId: "oc-alt", name: "alt-agent", workspace: "C:\\alt" }),
    });
    assert.equal(r.status, 201);
    assert.equal(altCalls.length, 1);
    assert.equal(altCalls[0].action, "agents.create");
  } finally { await a.close(); }
});

test("POST /agents on runtime where agents.create is unsupported → 409 UNSUPPORTED_CAPABILITY", async () => {
  const hermes = makeFakeAdapter({
    id: "hermes",
    supported: ["agents.list"],
    unsupported: ["agents.create"],
  });
  const a = await mkApp({
    adapters: { "oc-main": makeFakeAdapter({ id: "oc-main" }), "hermes": hermes },
    primary: "oc-main",
  });

  try {
    const r = await fetch(`${a.url}/agents`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ runtimeId: "hermes", name: "h", workspace: "/tmp" }),
    });
    assert.equal(r.status, 409);
    const body = await r.json();
    assert.equal(body.ok, false);
    assert.equal(body.error.code, "UNSUPPORTED_CAPABILITY");
    assert.equal(body.error.runtimeId, "hermes");
    assert.equal(body.error.capabilityId, "agents.create");
  } finally { await a.close(); }
});

test("POST /agents with missing workspace → 422 INVALID_PAYLOAD with fieldErrors", async () => {
  const primary = makeFakeAdapter({
    id: "oc-main",
    invokeActionImpl: async () => {
      throw new Error("adapter must not be invoked when payload is invalid");
    },
  });
  const a = await mkApp({ adapters: { "oc-main": primary }, primary: "oc-main" });

  try {
    const r = await fetch(`${a.url}/agents`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "no-workspace" }),
    });
    assert.equal(r.status, 422);
    const body = await r.json();
    assert.equal(body.ok, false);
    assert.equal(body.error.code, "INVALID_PAYLOAD");
    assert.equal(body.error.action, "agents.create");
    assert.ok(Array.isArray(body.error.fieldErrors));
    assert.ok(body.error.fieldErrors.some((f: any) => f.path === "workspace"));
  } finally { await a.close(); }
});

// ===========================================================================
// PATCH /agents/:name
// ===========================================================================

test("PATCH /agents/:name happy path → adapter receives agents.update", async () => {
  const calls: { action: string; payload: unknown }[] = [];
  const primary = makeFakeAdapter({
    id: "oc-main",
    invokeActionImpl: async (action, payload) => {
      calls.push({ action, payload });
      return { ok: true, nativeResult: { ok: true }, projectionMode: "exact" };
    },
  });
  const a = await mkApp({ adapters: { "oc-main": primary }, primary: "oc-main" });

  try {
    const r = await fetch(`${a.url}/agents/claude-code`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ workspace: "C:\\new" }),
    });
    assert.equal(r.status, 200);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].action, "agents.update");
    const p = calls[0].payload as any;
    assert.equal(p.name, "claude-code");
    assert.deepEqual(p.updates, { workspace: "C:\\new" });
  } finally { await a.close(); }
});

test("PATCH /agents/:name?runtimeId=hermes where update unsupported → 409", async () => {
  const hermes = makeFakeAdapter({
    id: "hermes",
    supported: ["agents.list"],
    unsupported: ["agents.update"],
  });
  const a = await mkApp({
    adapters: { "oc-main": makeFakeAdapter({ id: "oc-main" }), "hermes": hermes },
    primary: "oc-main",
  });

  try {
    const r = await fetch(`${a.url}/agents/foo?runtimeId=hermes`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ workspace: "/tmp" }),
    });
    assert.equal(r.status, 409);
    const body = await r.json();
    assert.equal(body.error.code, "UNSUPPORTED_CAPABILITY");
    assert.equal(body.error.capabilityId, "agents.update");
  } finally { await a.close(); }
});

// ===========================================================================
// DELETE /agents/:name
// ===========================================================================

test("DELETE /agents/:name happy path → adapter receives agents.delete", async () => {
  const calls: { action: string; payload: unknown }[] = [];
  const primary = makeFakeAdapter({
    id: "oc-main",
    invokeActionImpl: async (action, payload) => {
      calls.push({ action, payload });
      return { ok: true, nativeResult: { ok: true }, projectionMode: "exact" };
    },
  });
  const a = await mkApp({ adapters: { "oc-main": primary }, primary: "oc-main" });

  try {
    const r = await fetch(`${a.url}/agents/foo`, { method: "DELETE" });
    assert.equal(r.status, 200);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].action, "agents.delete");
    assert.deepEqual(calls[0].payload, { name: "foo" });
  } finally { await a.close(); }
});

test("DELETE /agents/:name?runtimeId=hermes where delete unsupported → 409", async () => {
  const hermes = makeFakeAdapter({
    id: "hermes",
    supported: ["agents.list"],
    unsupported: ["agents.delete"],
  });
  const a = await mkApp({
    adapters: { "oc-main": makeFakeAdapter({ id: "oc-main" }), "hermes": hermes },
    primary: "oc-main",
  });

  try {
    const r = await fetch(`${a.url}/agents/foo?runtimeId=hermes`, { method: "DELETE" });
    assert.equal(r.status, 409);
    const body = await r.json();
    assert.equal(body.error.code, "UNSUPPORTED_CAPABILITY");
    assert.equal(body.error.capabilityId, "agents.delete");
  } finally { await a.close(); }
});
