import { test } from "node:test";
import assert from "node:assert/strict";
import {
  resolveRuntimeForCatalog,
  resolveRuntimeForCreate,
  resolveRuntimeForResource,
  requireCapability,
  UnsupportedCapabilityError,
  InvalidRuntimeOverrideError,
  UnknownRuntimeError,
  NoRuntimeAvailableError,
} from "../src/services/runtime-resolver.js";
import type { RuntimeRegistry } from "../src/services/runtimes/registry.js";
import type { RuntimeConfigService } from "../src/services/runtime-config.js";
import type {
  RuntimeAdapter, RuntimeDescriptor, CapabilitySnapshot, RuntimeConfigSnapshot,
} from "@openclaw-manager/types";

function fakeDescriptor(id: string): RuntimeDescriptor {
  return {
    id, kind: "openclaw", displayName: id, endpoint: "sdk:",
    transport: "sdk", authMode: "token-env",
  };
}

function fakeRegistry(ids: string[]): RuntimeRegistry {
  const descriptors = ids.map(fakeDescriptor);
  return {
    configPath: () => "/tmp/x",
    list: async () => [...descriptors],
    get: async (id) => descriptors.find((d) => d.id === id) ?? null,
    adapter: async () => null,
  };
}

function fakeConfig(effective: string | null): RuntimeConfigService {
  const snap: RuntimeConfigSnapshot = {
    configuredPrimaryRuntimeId: effective,
    effectivePrimaryRuntimeId: effective,
    fallbackReason: null,
    runtimes: [],
  };
  return {
    read: async () => snap,
    patch: async () => snap,
  };
}

function fakeAdapter(caps: Partial<CapabilitySnapshot>, runtimeId = "oc-main"): RuntimeAdapter {
  const full: CapabilitySnapshot = {
    supported: caps.supported ?? [],
    partial: caps.partial ?? [],
    unsupported: caps.unsupported ?? [],
    version: "1.0.0",
    source: "static-adapter",
    stale: false,
  };
  return {
    describeRuntime: async () => fakeDescriptor(runtimeId),
    getCapabilities: async () => full,
    listEntities: async () => [],
    getEntity: async () => null,
    listActivity: async () => [],
    invokeAction: async () => ({ ok: true, nativeResult: null, projectionMode: "exact" }),
    getAuthModes: async () => [],
    getExtensions: async () => [],
    health: async () => ({ ok: true }),
  };
}

// ---------- resolveRuntimeForCatalog ----------

test("resolveRuntimeForCatalog: no override → primary", async () => {
  const r = await resolveRuntimeForCatalog({}, fakeRegistry(["oc-main"]), fakeConfig("oc-main"));
  assert.deepEqual(r, { runtimeId: "oc-main", source: "primary" });
});

test("resolveRuntimeForCatalog: query override → query", async () => {
  const r = await resolveRuntimeForCatalog(
    { query: { runtimeId: "hermes-prod" } },
    fakeRegistry(["oc-main", "hermes-prod"]),
    fakeConfig("oc-main"),
  );
  assert.deepEqual(r, { runtimeId: "hermes-prod", source: "query" });
});

test("resolveRuntimeForCatalog: unknown query override throws", async () => {
  await assert.rejects(
    () => resolveRuntimeForCatalog(
      { query: { runtimeId: "missing" } },
      fakeRegistry(["oc-main"]),
      fakeConfig("oc-main"),
    ),
    UnknownRuntimeError,
  );
});

test("resolveRuntimeForCatalog: no primary configured throws NoRuntimeAvailable", async () => {
  await assert.rejects(
    () => resolveRuntimeForCatalog({}, fakeRegistry(["oc-main"]), fakeConfig(null)),
    NoRuntimeAvailableError,
  );
});

test("resolveRuntimeForCatalog: ignores non-string query.runtimeId", async () => {
  const r = await resolveRuntimeForCatalog(
    { query: { runtimeId: 12345 as unknown as string } },
    fakeRegistry(["oc-main"]),
    fakeConfig("oc-main"),
  );
  assert.deepEqual(r, { runtimeId: "oc-main", source: "primary" });
});

// ---------- resolveRuntimeForCreate ----------

test("resolveRuntimeForCreate: body wins over query and primary", async () => {
  const r = await resolveRuntimeForCreate(
    { body: { runtimeId: "hermes-prod" }, query: { runtimeId: "oc-main" } },
    fakeRegistry(["oc-main", "hermes-prod"]),
    fakeConfig("oc-main"),
  );
  assert.deepEqual(r, { runtimeId: "hermes-prod", source: "body" });
});

test("resolveRuntimeForCreate: query wins over primary when no body", async () => {
  const r = await resolveRuntimeForCreate(
    { query: { runtimeId: "hermes-prod" } },
    fakeRegistry(["oc-main", "hermes-prod"]),
    fakeConfig("oc-main"),
  );
  assert.deepEqual(r, { runtimeId: "hermes-prod", source: "query" });
});

test("resolveRuntimeForCreate: no overrides → primary", async () => {
  const r = await resolveRuntimeForCreate({}, fakeRegistry(["oc-main"]), fakeConfig("oc-main"));
  assert.deepEqual(r, { runtimeId: "oc-main", source: "primary" });
});

test("resolveRuntimeForCreate: unknown body override throws", async () => {
  await assert.rejects(
    () => resolveRuntimeForCreate(
      { body: { runtimeId: "missing" } },
      fakeRegistry(["oc-main"]),
      fakeConfig("oc-main"),
    ),
    UnknownRuntimeError,
  );
});

// ---------- resolveRuntimeForResource ----------

test("resolveRuntimeForResource: stored wins, no query", () => {
  assert.deepEqual(resolveRuntimeForResource({ runtimeId: "oc-main" }), { runtimeId: "oc-main" });
});

test("resolveRuntimeForResource: matching query is OK", () => {
  assert.deepEqual(
    resolveRuntimeForResource({ runtimeId: "oc-main" }, { runtimeId: "oc-main" }),
    { runtimeId: "oc-main" },
  );
});

test("resolveRuntimeForResource: mismatching query throws InvalidRuntimeOverrideError", () => {
  try {
    resolveRuntimeForResource({ runtimeId: "oc-main" }, { runtimeId: "hermes-prod" });
    assert.fail("should throw");
  } catch (e) {
    assert.ok(e instanceof InvalidRuntimeOverrideError);
    assert.equal((e as InvalidRuntimeOverrideError).resourceRuntimeId, "oc-main");
    assert.equal((e as InvalidRuntimeOverrideError).attempted, "hermes-prod");
  }
});

test("resolveRuntimeForResource: missing stored runtimeId throws (caller bug)", () => {
  assert.throws(() => resolveRuntimeForResource({}), /missing runtimeId/);
});

test("resolveRuntimeForResource: ignores non-string query.runtimeId", () => {
  assert.deepEqual(
    resolveRuntimeForResource({ runtimeId: "oc-main" }, { runtimeId: 12345 as unknown as string }),
    { runtimeId: "oc-main" },
  );
});

// ---------- requireCapability ----------

test("requireCapability: supported returns {}", async () => {
  const a = fakeAdapter({ supported: ["agents.list"] });
  const r = await requireCapability(a, "agents.list");
  assert.deepEqual(r, {});
});

test("requireCapability: partial returns { partial: ... }", async () => {
  const a = fakeAdapter({
    partial: [{ id: "logs.tail", reason: "lossy", projectionMode: "inferred", lossiness: "lossy" }],
  });
  const r = await requireCapability(a, "logs.tail");
  assert.equal(r.partial?.id, "logs.tail");
  assert.equal(r.partial?.reason, "lossy");
});

test("requireCapability: unsupported throws UnsupportedCapabilityError with runtimeId + capabilityId", async () => {
  const a = fakeAdapter({ unsupported: ["memory.write"] }, "hermes-prod");
  try {
    await requireCapability(a, "memory.write");
    assert.fail("should throw");
  } catch (e) {
    assert.ok(e instanceof UnsupportedCapabilityError);
    assert.equal((e as UnsupportedCapabilityError).runtimeId, "hermes-prod");
    assert.equal((e as UnsupportedCapabilityError).capabilityId, "memory.write");
    assert.match((e as UnsupportedCapabilityError).reason, /unsupported/);
  }
});

test("requireCapability: absent (not in any list) throws with snapshot-incomplete reason", async () => {
  const a = fakeAdapter({ supported: ["agents.list"] }, "oc-main");
  try {
    await requireCapability(a, "memory.write");
    assert.fail("should throw");
  } catch (e) {
    assert.ok(e instanceof UnsupportedCapabilityError);
    assert.match((e as UnsupportedCapabilityError).reason, /not present/);
  }
});

test("requireCapability: explicit runtimeId arg avoids extra describeRuntime call", async () => {
  let described = 0;
  const adapter = fakeAdapter({ unsupported: ["memory.write"] }, "wont-be-called");
  const orig = adapter.describeRuntime;
  adapter.describeRuntime = async () => { described++; return orig.call(adapter); };
  try {
    await requireCapability(adapter, "memory.write", "explicit-id");
    assert.fail();
  } catch (e) {
    assert.ok(e instanceof UnsupportedCapabilityError);
    assert.equal((e as UnsupportedCapabilityError).runtimeId, "explicit-id");
    assert.equal(described, 0, "should not call describeRuntime when runtimeId provided");
  }
});

// ---------- error class shapes ----------

test("UnsupportedCapabilityError carries fields and has structured message", () => {
  const e = new UnsupportedCapabilityError("hermes", "agents.create", "phase 1");
  assert.equal(e.name, "UnsupportedCapabilityError");
  assert.equal(e.runtimeId, "hermes");
  assert.equal(e.capabilityId, "agents.create");
  assert.match(e.message, /hermes.*agents\.create.*phase 1/);
});

test("InvalidRuntimeOverrideError carries resource + attempted ids", () => {
  const e = new InvalidRuntimeOverrideError("oc-main", "hermes");
  assert.equal(e.name, "InvalidRuntimeOverrideError");
  assert.equal(e.resourceRuntimeId, "oc-main");
  assert.equal(e.attempted, "hermes");
});
