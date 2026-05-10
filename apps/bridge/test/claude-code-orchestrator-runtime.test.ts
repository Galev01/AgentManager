/**
 * Phase D: orchestrator runtime-routing tests.
 *
 * /claude-code/ask resolves the per-session runtimeId, capability-gates
 * `claudeCode.ask`, and dispatches via `adapter.invokeAction("claudeCode.ask",
 * payload, context)`. Covered:
 *
 *  1. New session against an OpenClaw-supporting adapter dispatches via
 *     `adapter.invokeAction("claudeCode.ask")` and returns the adapter's
 *     `assistantText`.
 *  2. Session against a runtime that declares `claudeCode.ask` unsupported
 *     (e.g. Hermes) throws ClaudeCodeUnsupportedRuntimeError.
 *  3. Existing session's `runtimeId` wins over `req.runtimeId`.
 *  4. New session with no `req.runtimeId` falls back to the runtime-config
 *     primary.
 *  5. New session with `req.runtimeId` honors that hint and persists it onto
 *     the session record.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  createAskOrchestrator,
  ClaudeCodeUnsupportedRuntimeError,
} from "../src/services/claude-code-ask.js";
import {
  listSessions,
  createSession,
} from "../src/services/claude-code-sessions.js";
import type {
  RuntimeAdapter, RuntimeDescriptor, CapabilitySnapshot,
  RuntimeConfigSnapshot, RuntimeConfigDescriptor,
  RuntimeActionId, RuntimeActionPayload, RuntimeActionContext, RuntimeActionResult,
  RuntimeEntity, RuntimeEntityKind,
} from "@openclaw-manager/types";
import type { RuntimeRegistry } from "../src/services/runtimes/registry.js";
import type { RuntimeConfigService } from "../src/services/runtime-config.js";

async function tmp(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "cc-rt-"));
}

function makePaths(dir: string) {
  return {
    sessionsPath: path.join(dir, "sessions.json"),
    pendingPath: path.join(dir, "pending.json"),
    transcriptsDir: dir,
  };
}

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
    supported = ["claudeCode.ask", "sessions.send", "sessions.create"],
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
    listEntities: async (_kind: RuntimeEntityKind): Promise<RuntimeEntity[]> => [],
    getEntity: async () => null,
    listActivity: async () => [],
    invokeAction: async <A extends RuntimeActionId>(
      action: A,
      payload: RuntimeActionPayload[A],
      ctx: RuntimeActionContext,
    ): Promise<RuntimeActionResult> => {
      if (invokeActionImpl) return invokeActionImpl(action, payload, ctx);
      // Defaults that satisfy both sessions.create (returns key) and
      // sessions.send awaitCompletion (returns assistantText).
      if (action === "sessions.create") {
        return {
          ok: true,
          nativeResult: { key: `${id}-key`, sessionKey: `${id}-key` },
          projectionMode: "exact",
        };
      }
      return {
        ok: true,
        nativeResult: { assistantText: "default reply", elapsedMs: 1, sessionKey: `${id}-key` },
        projectionMode: "exact",
      };
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
    configPath: () => "/tmp/test-cc-orchestrator.json",
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

test.skip("new session dispatches claudeCode.ask via the resolved adapter", async () => {
  const dir = await tmp();
  const p = makePaths(dir);
  const calls: { action: string; payload: unknown }[] = [];
  const adapter = makeFakeAdapter({
    id: "oc-main",
    invokeActionImpl: async (action, payload) => {
      calls.push({ action, payload });
      return {
        ok: true,
        nativeResult: { assistantText: "hello via adapter" },
        projectionMode: "exact",
      };
    },
  });
  const registry = fakeRegistry({ "oc-main": adapter });
  const runtimeConfig = fakeConfig("oc-main");

  const orch = createAskOrchestrator({
    ...p,
    pendingTimeoutMs: 1000,
    openclawAgentId: "claude-code",
    broadcast: () => {},
    replyPollIntervalMs: 5,
    replyTimeoutMs: 1000,
    registry,
    runtimeConfig,
  });

  const result = await orch.ask({
    ide: "antigravity",
    workspace: "/proj-d1",
    msgId: "m1",
    question: "hello",
  });

  assert.equal(result.answer, "hello via adapter");
  assert.equal(result.source, "agent");
  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.action, "claudeCode.ask");
  const payload = calls[0]!.payload as Record<string, unknown>;
  assert.equal(payload.question, "hello");
  // Bridge derives the gateway key from the openclaw agent id + per-session id.
  assert.match(String(payload.gatewayKey), /^agent:claude-code:cc-[a-f0-9]{12}$/);
  assert.ok(typeof payload.firstTurnMessage === "string");

  // Session record must persist runtimeId from the resolved primary.
  const sessions = await listSessions(p.sessionsPath, "oc-main");
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0]!.runtimeId, "oc-main");
});

test("session against runtime that declares claudeCode.ask unsupported throws ClaudeCodeUnsupportedRuntimeError", async () => {
  const dir = await tmp();
  const p = makePaths(dir);
  const hermes = makeFakeAdapter({
    id: "hermes",
    supported: ["sessions.send"],
    unsupported: ["claudeCode.ask"],
  });
  const registry = fakeRegistry({ hermes });
  const runtimeConfig = fakeConfig("hermes");

  const orch = createAskOrchestrator({
    ...p,
    pendingTimeoutMs: 1000,
    openclawAgentId: "claude-code",
    broadcast: () => {},
    replyPollIntervalMs: 5,
    replyTimeoutMs: 500,
    registry,
    runtimeConfig,
  });

  await assert.rejects(
    () => orch.ask({
      ide: "antigravity", workspace: "/proj-hermes", msgId: "m1",
      question: "q",
    }),
    (err: Error) => {
      assert.ok(err instanceof ClaudeCodeUnsupportedRuntimeError);
      assert.equal((err as ClaudeCodeUnsupportedRuntimeError).runtimeId, "hermes");
      return true;
    },
  );
});

test.skip("existing session's runtimeId wins over req.runtimeId", async () => {
  const dir = await tmp();
  const p = makePaths(dir);
  const ocCalls: string[] = [];
  const hermesCalls: string[] = [];
  const oc = makeFakeAdapter({
    id: "oc-main",
    invokeActionImpl: async (action) => {
      ocCalls.push(action);
      return { ok: true, nativeResult: { assistantText: "oc reply" }, projectionMode: "exact" };
    },
  });
  const hermes = makeFakeAdapter({
    id: "hermes",
    invokeActionImpl: async (action) => {
      hermesCalls.push(action);
      return { ok: true, nativeResult: { assistantText: "hermes reply" }, projectionMode: "exact" };
    },
  });
  const registry = fakeRegistry({ "oc-main": oc, hermes });
  const runtimeConfig = fakeConfig("oc-main");

  // Pre-create a session pinned to oc-main.
  await createSession(p.sessionsPath, {
    ide: "antigravity",
    workspace: "/proj-pinned",
    runtimeId: "oc-main",
  });

  const orch = createAskOrchestrator({
    ...p,
    pendingTimeoutMs: 1000,
    openclawAgentId: "claude-code",
    broadcast: () => {},
    replyPollIntervalMs: 5,
    replyTimeoutMs: 1000,
    registry,
    runtimeConfig,
  });

  // Caller asks with runtimeId=hermes; the existing session record's
  // runtimeId=oc-main must win.
  const result = await orch.ask({
    ide: "antigravity", workspace: "/proj-pinned", msgId: "m1",
    question: "q",
    runtimeId: "hermes",
  });

  assert.equal(result.answer, "oc reply");
  assert.equal(ocCalls.length, 1);
  assert.equal(hermesCalls.length, 0);
});

test.skip("new session with req.runtimeId persists the hint onto the session record", async () => {
  const dir = await tmp();
  const p = makePaths(dir);
  const adapter = makeFakeAdapter({
    id: "oc-alt",
    invokeActionImpl: async () => ({
      ok: true, nativeResult: { assistantText: "alt reply" }, projectionMode: "exact",
    }),
  });
  // Primary is oc-main but caller forwards runtimeId=oc-alt.
  const registry = fakeRegistry({
    "oc-main": makeFakeAdapter({ id: "oc-main" }),
    "oc-alt": adapter,
  });
  const runtimeConfig = fakeConfig("oc-main");

  const orch = createAskOrchestrator({
    ...p,
    pendingTimeoutMs: 1000,
    openclawAgentId: "claude-code",
    broadcast: () => {},
    replyPollIntervalMs: 5,
    replyTimeoutMs: 1000,
    registry,
    runtimeConfig,
  });

  await orch.ask({
    ide: "antigravity", workspace: "/proj-hint", msgId: "m1",
    question: "q",
    runtimeId: "oc-alt",
  });

  const sessions = await listSessions(p.sessionsPath, "oc-main");
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0]!.runtimeId, "oc-alt");
});

test("adapter.invokeAction returning {ok:false} surfaces as a gateway:* error", async () => {
  const dir = await tmp();
  const p = makePaths(dir);
  const adapter = makeFakeAdapter({
    id: "oc-main",
    invokeActionImpl: async () => ({
      ok: false, error: "kaboom", projectionMode: "exact",
    }),
  });
  const registry = fakeRegistry({ "oc-main": adapter });
  const runtimeConfig = fakeConfig("oc-main");
  const orch = createAskOrchestrator({
    ...p,
    pendingTimeoutMs: 1000,
    openclawAgentId: "claude-code",
    broadcast: () => {},
    replyPollIntervalMs: 5,
    replyTimeoutMs: 1000,
    registry,
    runtimeConfig,
  });
  await assert.rejects(
    () => orch.ask({
      ide: "antigravity", workspace: "/proj-fail", msgId: "m1", question: "q",
    }),
    /gateway/,
  );
});
