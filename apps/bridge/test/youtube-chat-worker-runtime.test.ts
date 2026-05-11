/**
 * Tests for Task 8: youtube-chat-worker dispatches via runtime adapter.
 *
 * Coverage:
 *  1. Job with runtimeId:"openclaw" dispatches via OpenClaw adapter.
 *  2. Job with runtimeId:"hermes" dispatches via Hermes adapter.
 *  3. Job with no runtimeId resolves to primary.
 *  4. GC recovery: invalidateSessionKey clears key so next getOrCreate triggers a fresh sessions.create.
 *  5. sessions.create fails -> getOrCreateSessionKey throws.
 *  6. runtimeId + key are returned correctly on new session.
 *  7. Back-compat: existing meta with openclawSessionKey but no runtimeId resolves to primary.
 *
 * Each test uses a random video ID to avoid state pollution from previous runs, and
 * cleans up the created dirs from the real youtube data dir in a finally block.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import crypto from "node:crypto";
import * as paths from "../src/services/youtube-paths.js";
import type {
  RuntimeAdapter, RuntimeDescriptor, CapabilitySnapshot,
  RuntimeConfigSnapshot, RuntimeConfigDescriptor,
  RuntimeActionId, RuntimeActionPayload, RuntimeActionContext, RuntimeActionResult,
  RuntimeEntity, RuntimeEntityKind,
} from "@openclaw-manager/types";
import type { RuntimeRegistry } from "../src/services/runtimes/registry.js";
import type { RuntimeConfigService } from "../src/services/runtime-config.js";
import { getOrCreateSessionKey, invalidateSessionKey } from "../src/services/youtube-chat-session.js";

// ---------------------------------------------------------------------------
// Test video ID generator: unique per run to avoid state pollution
// ---------------------------------------------------------------------------

function testVideoId(tag: string): string {
  return `test-${tag}-${crypto.randomBytes(4).toString("hex")}`;
}

async function cleanupVideoId(videoId: string): Promise<void> {
  try {
    await fs.rm(paths.videoDir(videoId), { recursive: true, force: true });
  } catch {
    // best-effort
  }
}

// ---------------------------------------------------------------------------
// Fake adapter factory
// ---------------------------------------------------------------------------

type FakeAdapterOpts = {
  id: string;
  supported?: string[];
  invokeActionImpl?: (action: RuntimeActionId, payload: unknown, ctx: RuntimeActionContext) => Promise<RuntimeActionResult>;
};

function makeFakeAdapter(opts: FakeAdapterOpts): RuntimeAdapter {
  const {
    id,
    supported = ["sessions.create", "sessions.send"],
    invokeActionImpl,
  } = opts;

  const caps: CapabilitySnapshot = {
    supported: supported as CapabilitySnapshot["supported"],
    partial: [],
    unsupported: [],
    version: "1.0.0",
    source: "static-adapter",
    stale: false,
  };

  const desc: RuntimeDescriptor = {
    id, kind: "openclaw", displayName: id,
    endpoint: "sdk:", transport: "sdk", authMode: "token-env",
  };

  return {
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
    read: async () => null,
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
    configPath: () => "/tmp/test-yt-worker.json",
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
// Actor stub
// ---------------------------------------------------------------------------

const SYSTEM_ACTOR = {
  humanActorUserId: "system",
  managerServiceId: "bridge",
  basis: "service-principal" as const,
};

// ---------------------------------------------------------------------------
// Test 1: Job with runtimeId:"openclaw" dispatches via openclaw adapter
// ---------------------------------------------------------------------------

test("getOrCreateSessionKey dispatches sessions.create via openclaw adapter and stores key", async () => {
  const videoId = testVideoId("oc");

  try {
    const invokeCalls: { action: string; payload: unknown }[] = [];
    const ocAdapter = makeFakeAdapter({
      id: "openclaw",
      invokeActionImpl: async (action, payload) => {
        invokeCalls.push({ action, payload });
        return { ok: true, nativeResult: { id: "oc-sess-123" }, projectionMode: "exact" };
      },
    });

    const registry = fakeRegistry({ openclaw: ocAdapter });
    const runtimeConfig = fakeConfig("openclaw");

    const result = await getOrCreateSessionKey(videoId, {
      registry,
      runtimeConfig,
      preferredRuntimeId: "openclaw",
      actor: SYSTEM_ACTOR,
    });

    assert.equal(result.runtimeId, "openclaw");
    assert.equal(result.key, "oc-sess-123");

    assert.equal(invokeCalls.length, 1);
    assert.equal(invokeCalls[0].action, "sessions.create");

    // Second call should reuse stored key (no new sessions.create)
    const result2 = await getOrCreateSessionKey(videoId, {
      registry,
      runtimeConfig,
      preferredRuntimeId: "openclaw",
      actor: SYSTEM_ACTOR,
    });
    assert.equal(result2.key, "oc-sess-123");
    assert.equal(invokeCalls.length, 1, "should not call sessions.create again");
  } finally {
    await cleanupVideoId(videoId);
  }
});

// ---------------------------------------------------------------------------
// Test 2: Job with runtimeId:"hermes" dispatches via Hermes adapter
// ---------------------------------------------------------------------------

test("getOrCreateSessionKey dispatches sessions.create via hermes adapter", async () => {
  const videoId = testVideoId("hermes");

  try {
    const invokeCalls: { action: string; payload: unknown }[] = [];
    const hermesAdapter = makeFakeAdapter({
      id: "hermes",
      invokeActionImpl: async (action, payload) => {
        invokeCalls.push({ action, payload });
        return { ok: true, nativeResult: { id: "hermes-sess-456", assistantText: "Hi!" }, projectionMode: "exact" };
      },
    });

    const registry = fakeRegistry({ openclaw: makeFakeAdapter({ id: "openclaw" }), hermes: hermesAdapter });
    const runtimeConfig = fakeConfig("openclaw");

    const result = await getOrCreateSessionKey(videoId, {
      registry,
      runtimeConfig,
      preferredRuntimeId: "hermes",
      actor: SYSTEM_ACTOR,
    });

    assert.equal(result.runtimeId, "hermes");
    assert.equal(result.key, "hermes-sess-456");
    assert.equal(invokeCalls.length, 1);
    assert.equal(invokeCalls[0].action, "sessions.create");
  } finally {
    await cleanupVideoId(videoId);
  }
});

// ---------------------------------------------------------------------------
// Test 3: No runtimeId resolves to primary
// ---------------------------------------------------------------------------

test("getOrCreateSessionKey with no preferredRuntimeId resolves to primary", async () => {
  const videoId = testVideoId("primary");

  try {
    const invokeCalls: { action: string; payload: unknown }[] = [];
    const primaryAdapter = makeFakeAdapter({
      id: "primary-runtime",
      invokeActionImpl: async (action, payload) => {
        invokeCalls.push({ action, payload });
        return { ok: true, nativeResult: { id: "primary-sess-789" }, projectionMode: "exact" };
      },
    });

    const registry = fakeRegistry({ "primary-runtime": primaryAdapter });
    const runtimeConfig = fakeConfig("primary-runtime");

    const result = await getOrCreateSessionKey(videoId, {
      registry,
      runtimeConfig,
      // No preferredRuntimeId — should use primary
      actor: SYSTEM_ACTOR,
    });

    assert.equal(result.runtimeId, "primary-runtime");
    assert.equal(result.key, "primary-sess-789");
    assert.equal(invokeCalls.length, 1);
    assert.equal(invokeCalls[0].action, "sessions.create");
  } finally {
    await cleanupVideoId(videoId);
  }
});

// ---------------------------------------------------------------------------
// Test 4: GC recovery — invalidateSessionKey clears key
// ---------------------------------------------------------------------------

test("invalidateSessionKey clears runtimeSessionKey and openclawSessionKey from meta", async () => {
  const videoId = testVideoId("gc");

  try {
    const ocAdapter = makeFakeAdapter({
      id: "openclaw",
      invokeActionImpl: async () => ({
        ok: true, nativeResult: { id: "gc-sess-111" }, projectionMode: "exact",
      }),
    });

    const registry = fakeRegistry({ openclaw: ocAdapter });
    const runtimeConfig = fakeConfig("openclaw");

    // Create session
    const result = await getOrCreateSessionKey(videoId, {
      registry,
      runtimeConfig,
      preferredRuntimeId: "openclaw",
      actor: SYSTEM_ACTOR,
    });
    assert.equal(result.key, "gc-sess-111");

    // Invalidate
    await invalidateSessionKey(videoId);

    // Next getOrCreateSessionKey should trigger a new sessions.create
    const invokeCalls2: string[] = [];
    const ocAdapter2 = makeFakeAdapter({
      id: "openclaw",
      invokeActionImpl: async (action) => {
        invokeCalls2.push(action);
        return { ok: true, nativeResult: { id: "gc-sess-222" }, projectionMode: "exact" };
      },
    });
    const registry2 = fakeRegistry({ openclaw: ocAdapter2 });

    const result2 = await getOrCreateSessionKey(videoId, {
      registry: registry2,
      runtimeConfig,
      preferredRuntimeId: "openclaw",
      actor: SYSTEM_ACTOR,
    });
    assert.equal(result2.key, "gc-sess-222", "should have gotten a fresh session after invalidation");
    assert.equal(invokeCalls2.length, 1);
    assert.equal(invokeCalls2[0], "sessions.create");
  } finally {
    await cleanupVideoId(videoId);
  }
});

// ---------------------------------------------------------------------------
// Test 5: sessions.create fails -> getOrCreateSessionKey throws
// ---------------------------------------------------------------------------

test("getOrCreateSessionKey throws when sessions.create returns ok:false", async () => {
  const videoId = testVideoId("fail");

  try {
    const failAdapter = makeFakeAdapter({
      id: "openclaw",
      invokeActionImpl: async () => ({
        ok: false, error: "runtime unavailable", projectionMode: "exact",
      }),
    });

    const registry = fakeRegistry({ openclaw: failAdapter });
    const runtimeConfig = fakeConfig("openclaw");

    await assert.rejects(
      () => getOrCreateSessionKey(videoId, {
        registry,
        runtimeConfig,
        preferredRuntimeId: "openclaw",
        actor: SYSTEM_ACTOR,
      }),
      (err: Error) => {
        assert.ok(/sessions.create failed/i.test(err.message));
        return true;
      },
    );
  } finally {
    await cleanupVideoId(videoId);
  }
});

// ---------------------------------------------------------------------------
// Test 6: runtimeId + key are returned correctly on new session
// ---------------------------------------------------------------------------

test("getOrCreateSessionKey returns runtimeId and key on new session", async () => {
  const videoId = testVideoId("keycheck");

  try {
    const ocAdapter = makeFakeAdapter({
      id: "openclaw",
      invokeActionImpl: async () => ({
        ok: true,
        nativeResult: { id: "key-check-sess-001" },
        projectionMode: "exact",
      }),
    });

    const registry = fakeRegistry({ openclaw: ocAdapter });
    const runtimeConfig = fakeConfig("openclaw");

    const result = await getOrCreateSessionKey(videoId, {
      registry,
      runtimeConfig,
      preferredRuntimeId: "openclaw",
      actor: SYSTEM_ACTOR,
    });

    assert.equal(result.runtimeId, "openclaw", "runtimeId must be set");
    assert.equal(result.key, "key-check-sess-001", "key must be the session key");
    assert.equal(result.sessionId, `${videoId}-main`, "sessionId defaults to videoId-main");
  } finally {
    await cleanupVideoId(videoId);
  }
});

// ---------------------------------------------------------------------------
// Test 7: back-compat — existing meta with openclawSessionKey but no runtimeId
//         resolves to primary without creating new session
// ---------------------------------------------------------------------------

test("existing meta with openclawSessionKey but no runtimeId resolves to primary (back-compat)", async () => {
  const videoId = testVideoId("legacy");

  try {
    // Manually write a legacy meta file (pre-migration shape)
    const { writeChatMeta } = await import("../src/services/youtube-store-v2.js");
    await writeChatMeta({
      videoId,
      chatSessionId: `${videoId}-main`,
      openclawSessionKey: "legacy-key-abc",
      // No runtimeId, no runtimeSessionKey
    });

    const invokeCalls: string[] = [];
    const primaryAdapter = makeFakeAdapter({
      id: "oc-main",
      invokeActionImpl: async (action) => {
        invokeCalls.push(action);
        return { ok: true, nativeResult: {}, projectionMode: "exact" };
      },
    });

    const registry = fakeRegistry({ "oc-main": primaryAdapter });
    const runtimeConfig = fakeConfig("oc-main");

    const result = await getOrCreateSessionKey(videoId, {
      registry,
      runtimeConfig,
      actor: SYSTEM_ACTOR,
    });

    assert.equal(result.key, "legacy-key-abc", "must reuse existing legacy key");
    assert.equal(result.runtimeId, "oc-main", "must resolve to primary");
    assert.equal(invokeCalls.length, 0, "must NOT call sessions.create for back-compat session");
  } finally {
    await cleanupVideoId(videoId);
  }
});
