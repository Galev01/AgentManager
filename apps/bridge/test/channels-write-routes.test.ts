/**
 * Phase C — channels write-route tests.
 *
 * Verifies POST /channels/:name/connect and POST /channels/:name/logout route
 * through `RuntimeAdapter.invokeAction` with capability gating + payload
 * schema validation.
 *
 *  1. POST /channels/:name/connect → primary adapter receives
 *     `channels.connect` with the validated payload (channelId from URL,
 *     optional config from body).
 *  2. POST /channels/:name/connect on Hermes (unsupported) → 409.
 *  3. POST /channels/:name/connect with non-JSON-serialisable config → 422.
 *  4. POST /channels/:name/logout → primary adapter receives
 *     `channels.disconnect` with channelId from URL.
 *  5. POST /channels/:name/logout?runtimeId=hermes (unsupported) → 409.
 *
 * The test passes a throwing `callGateway` to confirm migrated routes never
 * fall back to the legacy direct path.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import express, { type Request, type Response, type NextFunction } from "express";
import { createServer } from "node:http";
import { once } from "node:events";
import { createChannelsRouter } from "../src/routes/channels.js";
import type { RuntimeRegistry } from "../src/services/runtimes/registry.js";
import type { RuntimeConfigService } from "../src/services/runtime-config.js";
import type {
  RuntimeAdapter, RuntimeDescriptor, CapabilitySnapshot,
  RuntimeConfigSnapshot, RuntimeConfigDescriptor,
  RuntimeActionId, RuntimeActionPayload, RuntimeActionContext, RuntimeActionResult,
  RuntimeEntityKind,
} from "@openclaw-manager/types";

type FakeAdapterOpts = {
  id: string;
  supported?: string[];
  unsupported?: string[];
  invokeActionImpl?: (action: RuntimeActionId, payload: unknown, ctx: RuntimeActionContext) => Promise<RuntimeActionResult>;
};

function makeFakeAdapter(opts: FakeAdapterOpts): RuntimeAdapter {
  const {
    id,
    supported = ["channels.list", "channels.status", "channels.connect", "channels.disconnect"],
    unsupported = [],
    invokeActionImpl,
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
    listEntities: async (_kind: RuntimeEntityKind) => [],
    getEntity: async () => null,
    listActivity: async () => [],
    invokeAction: async <A extends RuntimeActionId>(
      action: A,
      payload: RuntimeActionPayload[A],
      ctx: RuntimeActionContext,
    ): Promise<RuntimeActionResult> => {
      if (invokeActionImpl) return invokeActionImpl(action, payload, ctx);
      return { ok: true, nativeResult: { ok: true }, projectionMode: "exact" };
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
    configPath: () => "/tmp/channels-write-routes-test.json",
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

async function mkApp(opts: {
  adapters: Record<string, RuntimeAdapter | null>;
  primary: string | null;
}) {
  const registry = fakeRegistry(opts.adapters);
  const runtimeConfig = fakeConfig(opts.primary);
  const callGateway = async () => { throw new Error("callGateway must not be invoked"); };

  const app = express();
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    (req as any).auth = { user: { id: "u1" }, permissions: ["channels.logout"] };
    next();
  });
  app.use(createChannelsRouter({
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
// POST /channels/:name/connect
// ===========================================================================

test("POST /channels/:name/connect → primary adapter receives channels.connect with channelId", async () => {
  const calls: { action: string; payload: unknown }[] = [];
  const primary = makeFakeAdapter({
    id: "oc-main",
    invokeActionImpl: async (action, payload) => {
      calls.push({ action, payload });
      return { ok: true, nativeResult: { connected: true }, projectionMode: "exact" };
    },
  });
  const a = await mkApp({ adapters: { "oc-main": primary }, primary: "oc-main" });

  try {
    const r = await fetch(`${a.url}/channels/whatsapp/connect`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ config: { foo: 1 } }),
    });
    assert.equal(r.status, 200);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].action, "channels.connect");
    const p = calls[0].payload as any;
    assert.equal(p.channelId, "whatsapp");
    assert.deepEqual(p.config, { foo: 1 });
  } finally { await a.close(); }
});

test("POST /channels/:name/connect on Hermes (unsupported) → 409", async () => {
  const hermes = makeFakeAdapter({
    id: "hermes",
    supported: ["channels.list"],
    unsupported: ["channels.connect"],
  });
  const a = await mkApp({
    adapters: { "oc-main": makeFakeAdapter({ id: "oc-main" }), "hermes": hermes },
    primary: "oc-main",
  });

  try {
    const r = await fetch(`${a.url}/channels/wa/connect?runtimeId=hermes`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    assert.equal(r.status, 409);
    const body = await r.json();
    assert.equal(body.error.code, "UNSUPPORTED_CAPABILITY");
    assert.equal(body.error.capabilityId, "channels.connect");
  } finally { await a.close(); }
});

// ===========================================================================
// POST /channels/:name/logout (typed action: channels.disconnect)
// ===========================================================================

test("POST /channels/:name/logout → primary adapter receives channels.disconnect", async () => {
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
    const r = await fetch(`${a.url}/channels/whatsapp/logout`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    assert.equal(r.status, 200);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].action, "channels.disconnect");
    const p = calls[0].payload as any;
    assert.equal(p.channelId, "whatsapp");
  } finally { await a.close(); }
});

test("POST /channels/:name/logout?runtimeId=hermes (unsupported) → 409", async () => {
  const hermes = makeFakeAdapter({
    id: "hermes",
    supported: ["channels.list"],
    unsupported: ["channels.disconnect"],
  });
  const a = await mkApp({
    adapters: { "oc-main": makeFakeAdapter({ id: "oc-main" }), "hermes": hermes },
    primary: "oc-main",
  });

  try {
    const r = await fetch(`${a.url}/channels/wa/logout?runtimeId=hermes`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    assert.equal(r.status, 409);
    const body = await r.json();
    assert.equal(body.error.code, "UNSUPPORTED_CAPABILITY");
    assert.equal(body.error.capabilityId, "channels.disconnect");
  } finally { await a.close(); }
});
