/**
 * Tests for Task 9: codebase-reviewer runner dispatches via runtime adapter.
 *
 * Coverage:
 *  1. runReview({ runtimeId:"openclaw" }) dispatches sessions.create + sessions.send
 *     via the openclaw adapter; returns sliced markdown.
 *  2. runReview({ runtimeId:"hermes" }) dispatches via hermes adapter.
 *  3. runReview({}) (no runtimeId) resolves to primary.
 *  4. runReview({ agentName:"custom-reviewer" }) passes the override into sessions.create.
 *  5. Adapter rejects sessions.send (timeout) -> run throws with the adapter's error message.
 *  6. AssistantText without "# Codebase Review" heading -> throws with the expected message.
 *  7. Adapter declares sessions.create unsupported -> throws UnsupportedCapabilityError.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import type {
  RuntimeAdapter, RuntimeDescriptor, CapabilitySnapshot,
  RuntimeConfigSnapshot, RuntimeConfigDescriptor,
  RuntimeActionId, RuntimeActionPayload, RuntimeActionContext, RuntimeActionResult,
  RuntimeEntity, RuntimeEntityKind,
} from "@openclaw-manager/types";
import type { RuntimeRegistry } from "../src/services/runtimes/registry.js";
import type { RuntimeConfigService } from "../src/services/runtime-config.js";
import { runReview, type RunReviewDeps, type RunReviewOpts } from "../src/services/codebase-reviewer/runner.js";
import { UnsupportedCapabilityError } from "../src/services/runtime-resolver.js";

// ---------------------------------------------------------------------------
// Fake adapter factory
// ---------------------------------------------------------------------------

type FakeAdapterOpts = {
  id: string;
  supported?: string[];
  unsupported?: string[];
  invokeActionImpl?: (
    action: RuntimeActionId,
    payload: unknown,
    ctx: RuntimeActionContext,
  ) => Promise<RuntimeActionResult>;
};

function makeFakeAdapter(opts: FakeAdapterOpts): RuntimeAdapter {
  const {
    id,
    supported = ["sessions.create", "sessions.send"],
    unsupported = [],
    invokeActionImpl,
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
    configPath: () => "/tmp/test-reviewer-runner.json",
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
// Stub helpers injected into deps
// ---------------------------------------------------------------------------

const STUB_BRIEF = "## Project Brief\nStub project brief content.";
const STUB_PROMPT = "# Codebase Review\n\nStub review content for the agent.";
const REVIEW_MARKDOWN = "# Codebase Review\n\nExecutive summary here.\n";

function makeStubDeps(
  registry: RuntimeRegistry,
  runtimeConfig: RuntimeConfigService,
): RunReviewDeps {
  return {
    registry,
    runtimeConfig,
    buildProjectBrief: async () => STUB_BRIEF,
    buildReviewPrompt: () => STUB_PROMPT,
  };
}

const BASE_OPTS: RunReviewOpts = {
  projectName: "test-project",
  projectPath: "/fake/path/test-project",
  reportDate: "2026-05-10",
};

// ---------------------------------------------------------------------------
// Test 1: runReview dispatches via openclaw adapter; returns sliced markdown
// ---------------------------------------------------------------------------

test("runReview dispatches sessions.create + sessions.send via openclaw adapter and returns markdown", async () => {
  const invokeCalls: { action: string; payload: unknown }[] = [];

  const ocAdapter = makeFakeAdapter({
    id: "openclaw",
    invokeActionImpl: async (action, payload) => {
      invokeCalls.push({ action, payload });
      if (action === "sessions.create") {
        return {
          ok: true,
          nativeResult: { id: "oc-review-sess-001", key: "oc-key-001" },
          projectionMode: "exact",
        };
      }
      if (action === "sessions.send") {
        return {
          ok: true,
          nativeResult: { assistantText: "Preamble text.\n" + REVIEW_MARKDOWN },
          projectionMode: "exact",
        };
      }
      return { ok: true, nativeResult: null, projectionMode: "exact" };
    },
  });

  const registry = fakeRegistry({ openclaw: ocAdapter });
  const runtimeConfig = fakeConfig("openclaw");
  const deps = makeStubDeps(registry, runtimeConfig);

  const result = await runReview({ ...BASE_OPTS, runtimeId: "openclaw" }, deps);

  // Should have called sessions.create first, then sessions.send
  assert.equal(invokeCalls.length, 2, "must call sessions.create then sessions.send");
  assert.equal(invokeCalls[0].action, "sessions.create");
  assert.equal(invokeCalls[1].action, "sessions.send");

  // sessions.send must have awaitCompletion: true
  const sendPayload = invokeCalls[1].payload as Record<string, unknown>;
  assert.equal(sendPayload.awaitCompletion, true, "sessions.send must have awaitCompletion: true");

  // Result must have sessionId and markdown sliced from # Codebase Review
  assert.equal(result.sessionId, "oc-key-001");
  assert.ok(result.markdown.startsWith("# Codebase Review"), "markdown must start at # Codebase Review heading");
  assert.ok(!result.markdown.includes("Preamble text"), "preamble before heading must be stripped");
});

// ---------------------------------------------------------------------------
// Test 2: runReview dispatches via hermes adapter
// ---------------------------------------------------------------------------

test("runReview dispatches sessions.create + sessions.send via hermes adapter", async () => {
  const invokeCalls: { action: string; payload: unknown }[] = [];

  const hermesAdapter = makeFakeAdapter({
    id: "hermes",
    invokeActionImpl: async (action, payload) => {
      invokeCalls.push({ action, payload });
      if (action === "sessions.create") {
        return {
          ok: true,
          nativeResult: { id: "hermes-sess-002" },
          projectionMode: "exact",
        };
      }
      if (action === "sessions.send") {
        return {
          ok: true,
          nativeResult: { assistantText: REVIEW_MARKDOWN },
          projectionMode: "exact",
        };
      }
      return { ok: true, nativeResult: null, projectionMode: "exact" };
    },
  });

  const registry = fakeRegistry({ openclaw: makeFakeAdapter({ id: "openclaw" }), hermes: hermesAdapter });
  const runtimeConfig = fakeConfig("openclaw");
  const deps = makeStubDeps(registry, runtimeConfig);

  const result = await runReview({ ...BASE_OPTS, runtimeId: "hermes" }, deps);

  assert.equal(invokeCalls[0].action, "sessions.create");
  assert.equal(invokeCalls[1].action, "sessions.send");
  // sessionId falls back to the "id" from nativeResult when no key field
  assert.equal(result.sessionId, "hermes-sess-002");
  assert.ok(result.markdown.startsWith("# Codebase Review"));
});

// ---------------------------------------------------------------------------
// Test 3: runReview with no runtimeId resolves to primary
// ---------------------------------------------------------------------------

test("runReview with no runtimeId resolves to primary runtime", async () => {
  const invokeCalls: { action: string; payload: unknown }[] = [];

  const primaryAdapter = makeFakeAdapter({
    id: "primary-rt",
    invokeActionImpl: async (action, payload) => {
      invokeCalls.push({ action, payload });
      if (action === "sessions.create") {
        return { ok: true, nativeResult: { id: "primary-sess-003" }, projectionMode: "exact" };
      }
      if (action === "sessions.send") {
        return { ok: true, nativeResult: { assistantText: REVIEW_MARKDOWN }, projectionMode: "exact" };
      }
      return { ok: true, nativeResult: null, projectionMode: "exact" };
    },
  });

  const registry = fakeRegistry({ "primary-rt": primaryAdapter });
  const runtimeConfig = fakeConfig("primary-rt");
  const deps = makeStubDeps(registry, runtimeConfig);

  // No runtimeId in opts — must resolve to primary
  const result = await runReview({ ...BASE_OPTS }, deps);

  assert.equal(invokeCalls.length, 2);
  assert.equal(invokeCalls[0].action, "sessions.create");
  assert.ok(result.markdown.startsWith("# Codebase Review"));
});

// ---------------------------------------------------------------------------
// Test 4: agentName override is passed to sessions.create
// ---------------------------------------------------------------------------

test("runReview passes agentName override into sessions.create payload", async () => {
  const createCalls: { payload: unknown }[] = [];

  const ocAdapter = makeFakeAdapter({
    id: "openclaw",
    invokeActionImpl: async (action, payload) => {
      if (action === "sessions.create") {
        createCalls.push({ payload });
        return { ok: true, nativeResult: { id: "oc-sess-004" }, projectionMode: "exact" };
      }
      return { ok: true, nativeResult: { assistantText: REVIEW_MARKDOWN }, projectionMode: "exact" };
    },
  });

  const registry = fakeRegistry({ openclaw: ocAdapter });
  const runtimeConfig = fakeConfig("openclaw");
  const deps = makeStubDeps(registry, runtimeConfig);

  await runReview({ ...BASE_OPTS, runtimeId: "openclaw", agentName: "custom-reviewer" }, deps);

  assert.equal(createCalls.length, 1);
  const payload = createCalls[0].payload as Record<string, unknown>;
  assert.equal(payload.agentName, "custom-reviewer", "must pass agentName override to sessions.create");
});

// ---------------------------------------------------------------------------
// Test 5: sessions.send returns ok:false -> run throws with adapter's error message
// ---------------------------------------------------------------------------

test("runReview throws when sessions.send returns ok:false", async () => {
  const ocAdapter = makeFakeAdapter({
    id: "openclaw",
    invokeActionImpl: async (action) => {
      if (action === "sessions.create") {
        return { ok: true, nativeResult: { id: "oc-sess-005" }, projectionMode: "exact" };
      }
      if (action === "sessions.send") {
        return { ok: false, error: "session timed out after 600000ms", projectionMode: "exact" };
      }
      return { ok: true, nativeResult: null, projectionMode: "exact" };
    },
  });

  const registry = fakeRegistry({ openclaw: ocAdapter });
  const runtimeConfig = fakeConfig("openclaw");
  const deps = makeStubDeps(registry, runtimeConfig);

  await assert.rejects(
    () => runReview({ ...BASE_OPTS, runtimeId: "openclaw" }, deps),
    (err: Error) => {
      assert.ok(
        /session timed out after 600000ms/.test(err.message),
        `error message should include adapter error; got: ${err.message}`,
      );
      return true;
    },
  );
});

// ---------------------------------------------------------------------------
// Test 6: assistantText without "# Codebase Review" heading -> throws
// ---------------------------------------------------------------------------

test("runReview throws when assistantText lacks # Codebase Review heading", async () => {
  const ocAdapter = makeFakeAdapter({
    id: "openclaw",
    invokeActionImpl: async (action) => {
      if (action === "sessions.create") {
        return { ok: true, nativeResult: { id: "oc-sess-006" }, projectionMode: "exact" };
      }
      if (action === "sessions.send") {
        return {
          ok: true,
          nativeResult: { assistantText: "Here is my review but without the required heading." },
          projectionMode: "exact",
        };
      }
      return { ok: true, nativeResult: null, projectionMode: "exact" };
    },
  });

  const registry = fakeRegistry({ openclaw: ocAdapter });
  const runtimeConfig = fakeConfig("openclaw");
  const deps = makeStubDeps(registry, runtimeConfig);

  await assert.rejects(
    () => runReview({ ...BASE_OPTS, runtimeId: "openclaw" }, deps),
    (err: Error) => {
      assert.ok(
        /did not include a '# Codebase Review' heading/.test(err.message),
        `error message should mention missing heading; got: ${err.message}`,
      );
      return true;
    },
  );
});

// ---------------------------------------------------------------------------
// Test 7: sessions.create declared unsupported -> throws UnsupportedCapabilityError
// ---------------------------------------------------------------------------

test("runReview throws UnsupportedCapabilityError when sessions.create is unsupported", async () => {
  const limitedAdapter = makeFakeAdapter({
    id: "limited-rt",
    supported: ["sessions.send"],
    unsupported: ["sessions.create"],
  });

  const registry = fakeRegistry({ "limited-rt": limitedAdapter });
  const runtimeConfig = fakeConfig("limited-rt");
  const deps = makeStubDeps(registry, runtimeConfig);

  await assert.rejects(
    () => runReview({ ...BASE_OPTS, runtimeId: "limited-rt" }, deps),
    (err: Error) => {
      assert.ok(
        err instanceof UnsupportedCapabilityError,
        `expected UnsupportedCapabilityError; got: ${err.constructor.name}: ${err.message}`,
      );
      return true;
    },
  );
});
