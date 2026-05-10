/**
 * Route tests for GET /runtimes/health.
 *
 * Three scenarios:
 *   1. all healthy → aggregate ok=true; every runtime status="healthy".
 *   2. one disabled, one healthy → disabled shows status="disabled" with no
 *      adapter call; aggregate ok still true.
 *   3. one healthy, one timing out → unhealthy reports error message;
 *      healthy unaffected; aggregate ok=false.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import express, { type Request, type Response, type NextFunction } from "express";
import { createServer } from "node:http";
import { once } from "node:events";
import { createRuntimesHealthRouter } from "../src/routes/runtimes-health.js";
import type { RuntimeRegistry } from "../src/services/runtimes/registry.js";
import type { RuntimeConfigService } from "../src/services/runtime-config.js";
import type {
  RuntimeAdapter, RuntimeDescriptor, CapabilitySnapshot,
  RuntimeConfigSnapshot, RuntimeConfigDescriptor,
} from "@openclaw-manager/types";

type FakeAdapterSpec = {
  health: () => Promise<{ ok: boolean; detail?: string }>;
  capabilities?: () => Promise<CapabilitySnapshot>;
  describeId?: string;
};

function fakeAdapter(spec: FakeAdapterSpec, runtimeId: string): RuntimeAdapter {
  const desc: RuntimeDescriptor = {
    id: spec.describeId ?? runtimeId, kind: "openclaw", displayName: runtimeId,
    endpoint: "sdk:", transport: "sdk", authMode: "token-env",
  };
  const caps: CapabilitySnapshot = {
    supported: ["agents.list", "agents.create"],
    partial: [],
    unsupported: ["memory.write"],
    version: "1.0.0",
    source: "static-adapter",
    stale: false,
  };
  return {
    describeRuntime: async () => desc,
    getCapabilities: spec.capabilities ?? (async () => caps),
    listEntities: async () => [],
    getEntity: async () => null,
    listActivity: async () => [],
    invokeAction: async () => ({ ok: true, nativeResult: null, projectionMode: "exact" }),
    getAuthModes: async () => [],
    getExtensions: async () => [],
    health: spec.health,
  };
}

type RegistryFake = {
  registry: RuntimeRegistry;
  adapterCalls: string[];
};

function fakeRegistry(adapters: Record<string, RuntimeAdapter | null>): RegistryFake {
  const adapterCalls: string[] = [];
  const descriptors: RuntimeDescriptor[] = Object.keys(adapters).map((id) => ({
    id, kind: "openclaw", displayName: id, endpoint: "sdk:",
    transport: "sdk", authMode: "token-env",
  }));
  return {
    adapterCalls,
    registry: {
      configPath: () => "/tmp/test-runtime-config.json",
      list: async () => [...descriptors],
      get: async (id) => descriptors.find((d) => d.id === id) ?? null,
      adapter: async (id) => {
        adapterCalls.push(id);
        return adapters[id] ?? null;
      },
    },
  };
}

function fakeConfig(
  primary: string | null,
  enabledRuntimes: { id: string; enabled: boolean }[],
): RuntimeConfigService {
  const runtimes: RuntimeConfigDescriptor[] = enabledRuntimes.map((r) => ({
    id: r.id, kind: "openclaw", displayName: r.id, endpoint: "sdk:",
    transport: "sdk", authMode: "token-env",
    enabled: r.enabled,
    status: r.enabled ? { state: "healthy" } : { state: "disabled" },
  }));
  const snap: RuntimeConfigSnapshot = {
    configuredPrimaryRuntimeId: primary,
    effectivePrimaryRuntimeId: primary,
    fallbackReason: null,
    runtimes,
  };
  return {
    read: async () => snap,
    patch: async () => snap,
  };
}

function withAuth(permissions: string[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    (req as any).auth = {
      user: { id: "user-1", username: "gal" },
      permissions,
    };
    next();
  };
}

async function mkApp(opts: {
  perms?: string[];
  adapters: Record<string, RuntimeAdapter | null>;
  primary: string | null;
  enabled: { id: string; enabled: boolean }[];
}) {
  const perms = opts.perms ?? ["runtimes.view"];
  const reg = fakeRegistry(opts.adapters);
  const cfg = fakeConfig(opts.primary, opts.enabled);
  const app = express();
  app.use(express.json());
  app.use(withAuth(perms));
  app.use(createRuntimesHealthRouter({ registry: reg.registry, runtimeConfig: cfg }));
  const s = createServer(app);
  s.listen(0);
  await once(s, "listening");
  const port = (s.address() as { port: number }).port;
  return {
    url: `http://127.0.0.1:${port}`,
    adapterCalls: reg.adapterCalls,
    close: () => new Promise<void>((r) => s.close(() => r())),
  };
}

test("GET /runtimes/health rejects 403 without runtimes.view", async () => {
  const a = await mkApp({
    perms: [],
    adapters: { "oc-main": fakeAdapter({ health: async () => ({ ok: true }) }, "oc-main") },
    primary: "oc-main",
    enabled: [{ id: "oc-main", enabled: true }],
  });
  try {
    const r = await fetch(`${a.url}/runtimes/health`);
    assert.equal(r.status, 403);
  } finally { await a.close(); }
});

test("GET /runtimes/health: all healthy → aggregate ok=true", async () => {
  const a = await mkApp({
    adapters: {
      "oc-main": fakeAdapter({ health: async () => ({ ok: true, detail: "ready" }) }, "oc-main"),
      "hermes-prod": fakeAdapter({ health: async () => ({ ok: true }) }, "hermes-prod"),
    },
    primary: "oc-main",
    enabled: [
      { id: "oc-main", enabled: true },
      { id: "hermes-prod", enabled: true },
    ],
  });
  try {
    const r = await fetch(`${a.url}/runtimes/health`);
    assert.equal(r.status, 200);
    const body = await r.json();
    assert.equal(body.ok, true);
    assert.equal(body.primaryRuntimeId, "oc-main");
    assert.equal(body.runtimes.length, 2);
    for (const rr of body.runtimes) {
      assert.equal(rr.ok, true);
      assert.equal(rr.status, "healthy");
      assert.ok(rr.capabilities);
      assert.ok(Array.isArray(rr.capabilities.supported));
      assert.ok(rr.capabilities.supported.includes("agents.list"));
    }
  } finally { await a.close(); }
});

test("GET /runtimes/health: disabled runtime shows status=disabled and no adapter call", async () => {
  const a = await mkApp({
    adapters: {
      "oc-main": fakeAdapter({ health: async () => ({ ok: true }) }, "oc-main"),
      "hermes-prod": fakeAdapter({
        health: async () => { throw new Error("should not be called"); },
      }, "hermes-prod"),
    },
    primary: "oc-main",
    enabled: [
      { id: "oc-main", enabled: true },
      { id: "hermes-prod", enabled: false },
    ],
  });
  try {
    const r = await fetch(`${a.url}/runtimes/health`);
    assert.equal(r.status, 200);
    const body = await r.json();
    assert.equal(body.ok, true, "disabled runtime should not block aggregate ok");
    assert.equal(body.runtimes.length, 2);
    const oc = body.runtimes.find((x: any) => x.runtimeId === "oc-main");
    const hermes = body.runtimes.find((x: any) => x.runtimeId === "hermes-prod");
    assert.equal(oc.status, "healthy");
    assert.equal(oc.ok, true);
    assert.equal(hermes.status, "disabled");
    assert.equal(hermes.ok, true);
    assert.ok(!("capabilities" in hermes), "disabled should not include capabilities");
    // Crucially, the registry was never asked to instantiate the disabled adapter.
    assert.ok(!a.adapterCalls.includes("hermes-prod"),
      `disabled runtime should not trigger adapter() call, but got: ${JSON.stringify(a.adapterCalls)}`);
  } finally { await a.close(); }
});

test("GET /runtimes/health: one healthy, one timing out → aggregate ok=false; healthy unaffected", async () => {
  const a = await mkApp({
    adapters: {
      "oc-main": fakeAdapter({ health: async () => ({ ok: true }) }, "oc-main"),
      "hermes-prod": fakeAdapter({
        health: async () => { throw new Error("ECONNREFUSED 127.0.0.1:9119"); },
      }, "hermes-prod"),
    },
    primary: "oc-main",
    enabled: [
      { id: "oc-main", enabled: true },
      { id: "hermes-prod", enabled: true },
    ],
  });
  try {
    const r = await fetch(`${a.url}/runtimes/health`);
    // Endpoint itself stays healthy — one bad runtime does not 500.
    assert.equal(r.status, 200);
    const body = await r.json();
    assert.equal(body.ok, false, "aggregate ok must be false when any enabled runtime is unhealthy");
    const oc = body.runtimes.find((x: any) => x.runtimeId === "oc-main");
    const hermes = body.runtimes.find((x: any) => x.runtimeId === "hermes-prod");
    assert.equal(oc.ok, true);
    assert.equal(oc.status, "healthy");
    assert.equal(hermes.ok, false);
    assert.equal(hermes.status, "unhealthy");
    assert.match(hermes.error, /ECONNREFUSED/);
  } finally { await a.close(); }
});

test("GET /runtimes/health: health.ok=false (not throw) is surfaced as unhealthy with detail", async () => {
  const a = await mkApp({
    adapters: {
      "oc-main": fakeAdapter({
        health: async () => ({ ok: false, detail: "gateway 503" }),
      }, "oc-main"),
    },
    primary: "oc-main",
    enabled: [{ id: "oc-main", enabled: true }],
  });
  try {
    const r = await fetch(`${a.url}/runtimes/health`);
    const body = await r.json();
    assert.equal(body.ok, false);
    assert.equal(body.runtimes[0].status, "unhealthy");
    assert.equal(body.runtimes[0].error, "gateway 503");
  } finally { await a.close(); }
});

test("GET /runtimes/health: capability snapshot rejection still yields a usable response", async () => {
  const a = await mkApp({
    adapters: {
      "oc-main": fakeAdapter({
        health: async () => ({ ok: true }),
        capabilities: async () => { throw new Error("snapshot pipe broken"); },
      }, "oc-main"),
    },
    primary: "oc-main",
    enabled: [{ id: "oc-main", enabled: true }],
  });
  try {
    const r = await fetch(`${a.url}/runtimes/health`);
    assert.equal(r.status, 200);
    const body = await r.json();
    assert.equal(body.ok, false);
    assert.equal(body.runtimes[0].status, "unhealthy");
    assert.match(body.runtimes[0].error, /snapshot pipe broken/);
  } finally { await a.close(); }
});
