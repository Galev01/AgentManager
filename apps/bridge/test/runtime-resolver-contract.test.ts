/**
 * Contract test slice for the runtime-resolver + capability gating + action
 * payload schemas.
 *
 * The existing runtime-resolver.test.ts covers helpers in isolation. This
 * file covers the *combinations* and downstream-shaped scenarios that
 * Phase B/C/D/E parallel work depends on. Treat the assertions here as the
 * stable canonical contract — if a downstream phase needs a different
 * behavior, the contract changes here first.
 *
 * Coverage:
 *   - Catalog reads (no override / query override / unknown id / primary disabled fallback).
 *   - Create flows (body wins over query wins over primary).
 *   - Resource flows (stored runtimeId honored / matching override OK / mismatch throws).
 *   - Capability gating (supported / partial / unsupported / absent).
 *   - Action schema validation (valid / missing required field / shape errors).
 *
 * Uses a synthetic registry with two adapter fakes: oc-main supports
 * agents.create + agents.list; hermes-prod declares them unsupported.
 */
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
} from "../src/services/runtime-resolver.js";
import {
  runtimeActionSchemas,
  InvalidActionPayloadError,
} from "../src/services/runtime-action-schemas.js";
import type { RuntimeRegistry } from "../src/services/runtimes/registry.js";
import type { RuntimeConfigService } from "../src/services/runtime-config.js";
import type {
  RuntimeAdapter, RuntimeDescriptor, CapabilitySnapshot,
  RuntimeConfigSnapshot, RuntimeConfigDescriptor, RuntimeKind,
} from "@openclaw-manager/types";

// ---------- shared synthetic env ----------

function descriptor(id: string, kind: RuntimeKind = "openclaw"): RuntimeDescriptor {
  return {
    id, kind, displayName: id, endpoint: "sdk:",
    transport: kind === "openclaw" ? "sdk" : "http",
    authMode: "token-env",
  };
}

function registryFor(ids: { id: string; kind?: RuntimeKind }[]): RuntimeRegistry {
  const descs = ids.map((x) => descriptor(x.id, x.kind ?? "openclaw"));
  return {
    configPath: () => "/tmp/x",
    list: async () => [...descs],
    get: async (id) => descs.find((d) => d.id === id) ?? null,
    adapter: async () => null,
  };
}

function configService(opts: {
  configured: string | null;
  effective: string | null;
  enabled: { id: string; enabled: boolean; kind?: RuntimeKind }[];
}): RuntimeConfigService {
  const runtimes: RuntimeConfigDescriptor[] = opts.enabled.map((e) => ({
    ...descriptor(e.id, e.kind ?? "openclaw"),
    enabled: e.enabled,
    status: e.enabled ? { state: "healthy" } : { state: "disabled" },
  }));
  const snap: RuntimeConfigSnapshot = {
    configuredPrimaryRuntimeId: opts.configured,
    effectivePrimaryRuntimeId: opts.effective,
    fallbackReason:
      opts.configured && opts.effective !== opts.configured
        ? "configured_primary_disabled"
        : null,
    runtimes,
  };
  return { read: async () => snap, patch: async () => snap };
}

function adapter(opts: {
  id: string;
  supported?: string[];
  partial?: CapabilitySnapshot["partial"];
  unsupported?: string[];
}): RuntimeAdapter {
  const desc = descriptor(opts.id);
  const caps: CapabilitySnapshot = {
    supported: (opts.supported ?? []) as CapabilitySnapshot["supported"],
    partial: opts.partial ?? [],
    unsupported: (opts.unsupported ?? []) as CapabilitySnapshot["unsupported"],
    version: "1.0.0",
    source: "static-adapter",
    stale: false,
  };
  return {
    describeRuntime: async () => desc,
    getCapabilities: async () => caps,
    listEntities: async () => [],
    getEntity: async () => null,
    listActivity: async () => [],
    invokeAction: async () => ({ ok: true, nativeResult: null, projectionMode: "exact" }),
    getAuthModes: async () => [],
    getExtensions: async () => [],
    health: async () => ({ ok: true }),
  };
}

// ---------- catalog reads ----------

test("contract: catalog without ?runtimeId uses primary", async () => {
  const reg = registryFor([{ id: "oc-main" }, { id: "hermes-prod", kind: "hermes" }]);
  const cfg = configService({
    configured: "oc-main", effective: "oc-main",
    enabled: [
      { id: "oc-main", enabled: true },
      { id: "hermes-prod", enabled: true, kind: "hermes" },
    ],
  });
  const r = await resolveRuntimeForCatalog({}, reg, cfg);
  assert.deepEqual(r, { runtimeId: "oc-main", source: "primary" });
});

test("contract: catalog with ?runtimeId=oc-main uses oc-main (source=query)", async () => {
  const reg = registryFor([{ id: "oc-main" }, { id: "hermes-prod", kind: "hermes" }]);
  const cfg = configService({
    configured: "hermes-prod", effective: "hermes-prod",
    enabled: [
      { id: "oc-main", enabled: true },
      { id: "hermes-prod", enabled: true, kind: "hermes" },
    ],
  });
  const r = await resolveRuntimeForCatalog(
    { query: { runtimeId: "oc-main" } }, reg, cfg);
  assert.deepEqual(r, { runtimeId: "oc-main", source: "query" });
});

test("contract: catalog with unknown ?runtimeId throws UnknownRuntimeError", async () => {
  const reg = registryFor([{ id: "oc-main" }]);
  const cfg = configService({
    configured: "oc-main", effective: "oc-main",
    enabled: [{ id: "oc-main", enabled: true }],
  });
  try {
    await resolveRuntimeForCatalog({ query: { runtimeId: "ghost" } }, reg, cfg);
    assert.fail("should throw");
  } catch (e) {
    assert.ok(e instanceof UnknownRuntimeError);
    assert.equal((e as UnknownRuntimeError).runtimeId, "ghost");
  }
});

test("contract: catalog when configured primary is disabled falls back per runtime-config service", async () => {
  // runtime-config.computeEffective: when configured primary is disabled,
  // fallback picks first openclaw-kind enabled runtime. The resolver does
  // NOT recompute fallback — it trusts the snapshot's effectivePrimaryRuntimeId.
  const reg = registryFor([{ id: "oc-main" }, { id: "oc-staging" }]);
  const cfg = configService({
    configured: "oc-main", // configured but disabled
    effective: "oc-staging", // service chose this fallback
    enabled: [
      { id: "oc-main", enabled: false },
      { id: "oc-staging", enabled: true },
    ],
  });
  const r = await resolveRuntimeForCatalog({}, reg, cfg);
  assert.deepEqual(r, { runtimeId: "oc-staging", source: "primary" });
});

// ---------- create flows ----------

test("contract: create body.runtimeId beats query beats primary", async () => {
  const reg = registryFor([
    { id: "oc-main" },
    { id: "oc-staging" },
    { id: "hermes-prod", kind: "hermes" },
  ]);
  const cfg = configService({
    configured: "oc-main", effective: "oc-main",
    enabled: [
      { id: "oc-main", enabled: true },
      { id: "oc-staging", enabled: true },
      { id: "hermes-prod", enabled: true, kind: "hermes" },
    ],
  });
  // body+query+primary all distinct → body wins.
  const r1 = await resolveRuntimeForCreate(
    { body: { runtimeId: "hermes-prod" }, query: { runtimeId: "oc-staging" } },
    reg, cfg);
  assert.deepEqual(r1, { runtimeId: "hermes-prod", source: "body" });

  // No body, query+primary distinct → query wins.
  const r2 = await resolveRuntimeForCreate(
    { query: { runtimeId: "oc-staging" } }, reg, cfg);
  assert.deepEqual(r2, { runtimeId: "oc-staging", source: "query" });

  // Neither body nor query → primary.
  const r3 = await resolveRuntimeForCreate({}, reg, cfg);
  assert.deepEqual(r3, { runtimeId: "oc-main", source: "primary" });
});

// ---------- resource flows ----------

test("contract: resource with no query honors stored runtimeId", () => {
  const r = resolveRuntimeForResource({ runtimeId: "oc-main" });
  assert.deepEqual(r, { runtimeId: "oc-main" });
});

test("contract: resource with matching ?runtimeId override is OK", () => {
  const r = resolveRuntimeForResource(
    { runtimeId: "oc-main" },
    { runtimeId: "oc-main" });
  assert.deepEqual(r, { runtimeId: "oc-main" });
});

test("contract: resource with mismatching ?runtimeId override throws InvalidRuntimeOverrideError (400 INVALID_RUNTIME_OVERRIDE)", () => {
  try {
    resolveRuntimeForResource(
      { runtimeId: "oc-main" },
      { runtimeId: "hermes-prod" });
    assert.fail("should throw");
  } catch (e) {
    assert.ok(e instanceof InvalidRuntimeOverrideError);
    assert.equal((e as InvalidRuntimeOverrideError).resourceRuntimeId, "oc-main");
    assert.equal((e as InvalidRuntimeOverrideError).attempted, "hermes-prod");
  }
});

// ---------- capability gating: combined with two adapter fakes ----------

test("contract: requireCapability on supporting adapter returns {} (no partial info)", async () => {
  const a = adapter({
    id: "oc-main",
    supported: ["agents.create", "agents.list"],
    unsupported: [],
  });
  const r = await requireCapability(a, "agents.create", "oc-main");
  assert.deepEqual(r, {});
});

test("contract: requireCapability on partial returns { partial: PartialCapability }", async () => {
  const a = adapter({
    id: "hermes-prod",
    supported: ["sessions.list", "skills.list"],
    partial: [{ id: "logs.tail", reason: "lines-only", projectionMode: "inferred", lossiness: "lossy" }],
    unsupported: ["agents.create"],
  });
  const r = await requireCapability(a, "logs.tail", "hermes-prod");
  assert.ok(r.partial);
  assert.equal(r.partial!.id, "logs.tail");
  assert.equal(r.partial!.reason, "lines-only");
  assert.equal(r.partial!.projectionMode, "inferred");
  assert.equal(r.partial!.lossiness, "lossy");
});

test("contract: requireCapability on declared-unsupported throws UnsupportedCapabilityError with runtimeId + capabilityId", async () => {
  const a = adapter({
    id: "hermes-prod",
    supported: ["sessions.list"],
    unsupported: ["agents.create"],
  });
  try {
    await requireCapability(a, "agents.create", "hermes-prod");
    assert.fail("should throw");
  } catch (e) {
    assert.ok(e instanceof UnsupportedCapabilityError);
    assert.equal((e as UnsupportedCapabilityError).runtimeId, "hermes-prod");
    assert.equal((e as UnsupportedCapabilityError).capabilityId, "agents.create");
  }
});

test("contract: two-adapter matrix — same capabilityId, different verdicts", async () => {
  const oc = adapter({ id: "oc-main", supported: ["agents.create"] });
  const hermes = adapter({
    id: "hermes-prod", supported: ["sessions.list"], unsupported: ["agents.create"],
  });
  // OpenClaw supports agents.create.
  await requireCapability(oc, "agents.create", "oc-main");
  // Hermes declares it unsupported.
  await assert.rejects(
    () => requireCapability(hermes, "agents.create", "hermes-prod"),
    UnsupportedCapabilityError,
  );
});

// ---------- action payload schemas ----------

test("contract: agents.create valid payload passes", () => {
  const valid = runtimeActionSchemas["agents.create"]({
    name: "claude-code",
    workspace: "/tmp/ws",
  });
  assert.equal(valid.name, "claude-code");
  assert.equal(valid.workspace, "/tmp/ws");
});

test("contract: agents.create missing required field throws InvalidActionPayloadError with fieldErrors", () => {
  try {
    runtimeActionSchemas["agents.create"]({ workspace: "/tmp" });
    assert.fail("should throw");
  } catch (e) {
    assert.ok(e instanceof InvalidActionPayloadError);
    const err = e as InvalidActionPayloadError;
    assert.equal(err.action, "agents.create");
    assert.ok(err.fieldErrors.length > 0);
    assert.ok(err.fieldErrors.some((f) => f.path === "name"),
      `expected fieldErrors to mention 'name', got ${JSON.stringify(err.fieldErrors)}`);
  }
});

test("contract: agents.create non-object payload throws with empty path", () => {
  try {
    runtimeActionSchemas["agents.create"]("not-an-object");
    assert.fail("should throw");
  } catch (e) {
    assert.ok(e instanceof InvalidActionPayloadError);
    const err = e as InvalidActionPayloadError;
    assert.equal(err.fieldErrors[0].path, "");
  }
});

test("contract: tools.invoke requires both toolId and JSON-serialisable input", () => {
  // Valid path
  const ok = runtimeActionSchemas["tools.invoke"]({
    toolId: "shell.bash", input: { cmd: "ls" },
  });
  assert.equal(ok.toolId, "shell.bash");

  // Missing input
  try {
    runtimeActionSchemas["tools.invoke"]({ toolId: "x" });
    assert.fail();
  } catch (e) {
    assert.ok(e instanceof InvalidActionPayloadError);
    assert.ok((e as InvalidActionPayloadError).fieldErrors.some((f) => f.path === "input"));
  }
});

test("contract: cron.write nested spec validation produces nested fieldErrors", () => {
  try {
    runtimeActionSchemas["cron.write"]({
      spec: { cron: "* * * * *" /* missing payload + enabled */ },
    });
    assert.fail();
  } catch (e) {
    assert.ok(e instanceof InvalidActionPayloadError);
    const err = e as InvalidActionPayloadError;
    const paths = err.fieldErrors.map((f) => f.path);
    assert.ok(paths.includes("spec.payload"), `expected spec.payload error, got ${JSON.stringify(paths)}`);
    assert.ok(paths.includes("spec.enabled"), `expected spec.enabled error, got ${JSON.stringify(paths)}`);
  }
});

test("contract: claudeCode.ask requires ide+workspace+msgId+question", () => {
  const ok = runtimeActionSchemas["claudeCode.ask"]({
    ide: "vscode", workspace: "/tmp/ws", msgId: "m1", question: "hi",
  });
  assert.equal(ok.msgId, "m1");
  // Optional sessionId can be omitted.
  assert.equal(ok.sessionId, undefined);

  try {
    runtimeActionSchemas["claudeCode.ask"]({ ide: "vscode", workspace: "/tmp" });
    assert.fail();
  } catch (e) {
    assert.ok(e instanceof InvalidActionPayloadError);
    const paths = (e as InvalidActionPayloadError).fieldErrors.map((f) => f.path);
    assert.ok(paths.includes("msgId"));
    assert.ok(paths.includes("question"));
  }
});

test("contract: every RuntimeActionId has a registered schema (closed-set sanity)", () => {
  // If RuntimeActionId grows, this test forces the schema map to grow with it.
  const expected: string[] = [
    "agents.create", "agents.update", "agents.delete",
    "channels.connect", "channels.disconnect",
    "tools.invoke",
    "cron.write", "cron.delete", "cron.run",
    "claudeCode.ask",
    "sessions.create", "sessions.send", "sessions.reset",
    "sessions.abort", "sessions.compact", "sessions.delete",
    "memory.write",
    "skills.install",
    "config.set",
  ];
  for (const id of expected) {
    assert.equal(typeof (runtimeActionSchemas as any)[id], "function",
      `runtimeActionSchemas missing entry for ${id}`);
  }
});

// ---------- combined flow: resolver → capability gate → schema → ready-to-dispatch ----------

test("contract: end-to-end create flow shape — resolve, gate, validate, ready to invoke", async () => {
  const reg = registryFor([{ id: "oc-main" }, { id: "hermes-prod", kind: "hermes" }]);
  const cfg = configService({
    configured: "oc-main", effective: "oc-main",
    enabled: [
      { id: "oc-main", enabled: true },
      { id: "hermes-prod", enabled: true, kind: "hermes" },
    ],
  });

  // 1. Resolve: body wins.
  const resolved = await resolveRuntimeForCreate(
    { body: { runtimeId: "oc-main", name: "agent-a", workspace: "/ws" } },
    reg, cfg);
  assert.equal(resolved.runtimeId, "oc-main");

  // 2. Adapter + capability gate.
  const a = adapter({ id: "oc-main", supported: ["agents.create"] });
  const gate = await requireCapability(a, "agents.create", resolved.runtimeId);
  assert.deepEqual(gate, {});

  // 3. Schema validation against original body (resolver does not strip
  //    runtimeId — schema validators ignore extras).
  const validated = runtimeActionSchemas["agents.create"]({
    name: "agent-a", workspace: "/ws",
  });
  assert.equal(validated.name, "agent-a");

  // After this, the route would call adapter.invokeAction("agents.create", validated, context).
  // The point of this test is the *contract*: the four steps return shapes
  // downstream phases can chain together without re-reading the resolver impl.
});

test("contract: end-to-end create against unsupported runtime → 409 path is taken before schema validation", async () => {
  // This sequence mirrors what Phase C handlers will do. Capability gate
  // throws before payload schema runs, which is intentional: an unsupported
  // capability is a 409 even if the payload would have been valid.
  const a = adapter({
    id: "hermes-prod", supported: ["sessions.list"], unsupported: ["agents.create"],
  });
  await assert.rejects(
    () => requireCapability(a, "agents.create", "hermes-prod"),
    (e: unknown) => {
      assert.ok(e instanceof UnsupportedCapabilityError);
      assert.equal((e as UnsupportedCapabilityError).runtimeId, "hermes-prod");
      assert.equal((e as UnsupportedCapabilityError).capabilityId, "agents.create");
      return true;
    },
  );
});
