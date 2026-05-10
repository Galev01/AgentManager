import { test } from "node:test";
import assert from "node:assert/strict";
import { createAgentModelsService } from "../src/services/agent-models.js";
import type { RuntimeRegistry } from "../src/services/runtimes/registry.js";
import type { RuntimeConfigService } from "../src/services/runtime-config.js";
import type {
  RuntimeAdapter,
  CapabilitySnapshot,
  RuntimeEntity,
  RuntimeConfigSnapshot,
} from "@openclaw-manager/types";

// ---------------------------------------------------------------------------
// Stub helpers
// ---------------------------------------------------------------------------

function makeCapabilities(extra?: Partial<CapabilitySnapshot>): CapabilitySnapshot {
  return {
    supported: ["models.list"],
    partial: [],
    unsupported: [],
    version: "1",
    source: "static-adapter",
    stale: false,
    ...extra,
  };
}

function makeModelEntity(id: string): RuntimeEntity {
  return {
    runtimeKind: "openclaw",
    runtimeId: "stub",
    entityKind: "model",
    entityId: id,
    displayName: id,
    nativeRef: { id },
  };
}

function makeAdapter(models: string[]): RuntimeAdapter {
  return {
    describeRuntime: async () => ({ id: "stub", kind: "openclaw", displayName: "Stub", endpoint: "x", transport: "sdk", authMode: "token-env" }),
    getCapabilities: async () => makeCapabilities(),
    listEntities: async (kind) => {
      if (kind === "model") return models.map(makeModelEntity);
      return [];
    },
    getEntity: async () => null,
    listActivity: async () => [],
    invokeAction: async () => ({ ok: false, error: "not implemented", projectionMode: "exact" }),
    getAuthModes: async () => [],
    getExtensions: async () => [],
    health: async () => ({ ok: true }),
  };
}

function makeRegistry(adapters: Record<string, RuntimeAdapter>): RuntimeRegistry {
  return {
    list: async () => [],
    get: async (id) => (id in adapters ? { id, kind: "openclaw", displayName: id, endpoint: "x", transport: "sdk", authMode: "token-env" } : null),
    adapter: async (id) => adapters[id] ?? null,
    configPath: () => "/stub/runtimes.json",
  };
}

function makeRuntimeConfig(primaryId: string): RuntimeConfigService {
  const snap: RuntimeConfigSnapshot = {
    configuredPrimaryRuntimeId: primaryId,
    effectivePrimaryRuntimeId: primaryId,
    fallbackReason: null,
    runtimes: [],
  };
  return {
    read: async () => snap,
    patch: async () => snap,
  };
}

const noopGateway = async (method: string): Promise<unknown> => {
  throw new Error(`unexpected gateway call: ${method}`);
};

// ---------------------------------------------------------------------------
// Test 1: Two adapters, distinct catalogs; runtimeId selects the right one
// ---------------------------------------------------------------------------

test("readCatalog({ runtimeId: 'hermes' }) returns hermes catalog, not primary", async () => {
  const registry = makeRegistry({
    openclaw: makeAdapter(["oc/m1"]),
    hermes: makeAdapter(["hermes/m1"]),
  });
  const runtimeConfig = makeRuntimeConfig("openclaw");
  const svc = createAgentModelsService({ callGateway: noopGateway, registry, runtimeConfig });

  const hermesCat = await svc.readCatalog({ runtimeId: "hermes" });
  assert.equal(hermesCat.status, "ok");
  assert.equal(hermesCat.models.length, 1);
  assert.equal(hermesCat.models[0].id, "hermes/m1");

  const primaryCat = await svc.readCatalog();
  assert.equal(primaryCat.status, "ok");
  assert.equal(primaryCat.models.length, 1);
  assert.equal(primaryCat.models[0].id, "oc/m1");
});

// ---------------------------------------------------------------------------
// Test 2: Validation cross-runtime
// ---------------------------------------------------------------------------

test("validateModelAgainstCatalog respects runtimeId for cross-runtime validation", async () => {
  const registry = makeRegistry({
    openclaw: makeAdapter(["oc/m1"]),
    hermes: makeAdapter(["hermes/m1"]),
  });
  const runtimeConfig = makeRuntimeConfig("openclaw");
  const svc = createAgentModelsService({ callGateway: noopGateway, registry, runtimeConfig });

  // hermes/m1 is valid against hermes
  const okResult = await svc.validateModelAgainstCatalog("hermes/m1", { runtimeId: "hermes" });
  assert.equal(okResult.ok, true);

  // oc/m1 is NOT valid against hermes
  const failResult = await svc.validateModelAgainstCatalog("oc/m1", { runtimeId: "hermes" });
  assert.equal(failResult.ok, false);
  assert.ok(!failResult.ok);
  if (!failResult.ok) {
    assert.equal(failResult.status, 400);
    assert.equal(failResult.reason, "invalid_model_id");
  }
});

// ---------------------------------------------------------------------------
// Test 3: Unknown runtimeId → unavailable (no throw)
// ---------------------------------------------------------------------------

test("readCatalog({ runtimeId: 'ghost' }) returns unavailable, does not throw", async () => {
  const registry = makeRegistry({
    openclaw: makeAdapter(["oc/m1"]),
  });
  const runtimeConfig = makeRuntimeConfig("openclaw");
  const svc = createAgentModelsService({ callGateway: noopGateway, registry, runtimeConfig });

  const result = await svc.readCatalog({ runtimeId: "ghost" });
  assert.equal(result.status, "unavailable");
  assert.deepEqual(result.models, []);
});

// ---------------------------------------------------------------------------
// Test 4: No runtime configured (effectivePrimaryRuntimeId null) + opts undefined
// ---------------------------------------------------------------------------

test("readCatalog() with no configured primary returns unavailable", async () => {
  const registry = makeRegistry({});
  // effectivePrimaryRuntimeId is null
  const snap: RuntimeConfigSnapshot = {
    configuredPrimaryRuntimeId: null,
    effectivePrimaryRuntimeId: null,
    fallbackReason: null,
    runtimes: [],
  };
  const runtimeConfig: RuntimeConfigService = {
    read: async () => snap,
    patch: async () => snap,
  };
  const svc = createAgentModelsService({ callGateway: noopGateway, registry, runtimeConfig });

  const result = await svc.readCatalog();
  assert.equal(result.status, "unavailable");
  assert.deepEqual(result.models, []);
});

// ---------------------------------------------------------------------------
// Test 5: No registry/runtimeConfig → falls back to gateway path (opts ignored)
// ---------------------------------------------------------------------------

test("readCatalog falls back to gateway when no registry/runtimeConfig, opts ignored", async () => {
  let gatewayCalled = false;
  const callGateway = async (method: string): Promise<unknown> => {
    if (method === "models.list") {
      gatewayCalled = true;
      return { models: [{ id: "gw/model1", provider: "gw" }] };
    }
    throw new Error(`unexpected: ${method}`);
  };
  // No registry, no runtimeConfig
  const svc = createAgentModelsService({ callGateway });

  const result = await svc.readCatalog({ runtimeId: "hermes" });
  assert.equal(result.status, "ok");
  assert.equal(result.models.length, 1);
  assert.equal(result.models[0].id, "gw/model1");
  assert.equal(gatewayCalled, true);
});
