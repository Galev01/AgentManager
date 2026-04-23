# Multi-Runtime Control Plane — Phase 1 (MVP) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Evolve OpenClaw-Manager from a single-runtime admin into a capability-aware multi-runtime control plane with shared discovery / events / audit / action-dispatch contract across OpenClaw, Hermes Agent (nousresearch), ZeroClaw (zeroclaw-labs), and Nanobot (HKUDS + nanobot-ai). Phase 1 ships the contract, a full OpenClaw adapter, stubbed-but-honest adapters for the other three, a unified activity view, and a dashboard shell.

**Architecture:** One bridge mounts a `RuntimeRegistry` of runtime-specific adapters that implement a shared `RuntimeAdapter` contract (`describeRuntime / getCapabilities / listEntities / getEntity / listActivity / invokeAction / getAuthModes / getExtensions / health`). The contract is **capability-aware, not lowest-common-denominator**: each adapter advertises a `CapabilitySnapshot` that the dashboard uses to enable or gray out runtime-specific UI surfaces. The canonical collaboration envelope gets a `runtime_kind` / `native_ref` / `projection_mode` / `lossiness` extension so cross-runtime items stay honest about where their semantics come from. MCP is treated as interoperability transport (primary for Nanobot) — not the semantic center. Subscribe-style activity streaming (`subscribeActivity`) and runtime-native actor resolution (`resolveActor`) are **Phase 2**, deliberately out of the Phase 1 contract so adapters don't ship stubs for them.

**Tech Stack:** TypeScript 5.9 strict everywhere. Bridge = Express 5. Dashboard = Next.js 15 App Router + Tailwind 4. Shared types = `@openclaw-manager/types`. MCP client = `@modelcontextprotocol/sdk`. File-based storage for runtime registry config. Node 22+. Tests = node:test.

**Out of scope (deferred to Phase 2/3 plans):**
- Deep Hermes / ZeroClaw / Nanobot adapters beyond health + describe + minimal introspection
- Write actions on non-OpenClaw runtimes
- Federated per-runtime user mapping (Phase 1 uses service-principal only with explicit per-action audit of human actor + target runtime)
- ZeroClaw Rust sidecar (Phase 3, only if HTTP/MCP introspection proves insufficient)
- Cross-runtime orchestration (broadcast, migrate session, hand-off)

---

## File Structure

**New files:**
```
packages/types/src/runtimes.ts            # RuntimeKind, RuntimeDescriptor, CapabilitySnapshot, RuntimeEntity, RuntimeActivity, ProjectionMode, Lossiness, RuntimeAdapter contract
apps/bridge/src/services/runtimes/
  registry.ts                             # RuntimeRegistry class — load config, list, get, health
  adapter-base.ts                         # AdapterConfig, helpers, fetch wrapper with timeout
  openclaw.ts                             # OpenClaw adapter — wraps existing callGateway
  hermes.ts                               # Hermes HTTP adapter — health + describe stub
  zeroclaw.ts                             # ZeroClaw HTTP adapter — health + describe stub
  nanobot.ts                              # Nanobot MCP adapter — MCP client handshake + tool list
apps/bridge/src/routes/runtimes.ts        # /runtimes REST surface
apps/dashboard/src/lib/runtime-client.ts  # server-side bridge caller for /runtimes/*
apps/dashboard/src/app/runtimes/page.tsx               # registry list
apps/dashboard/src/app/runtimes/[runtimeId]/page.tsx   # runtime detail
apps/dashboard/src/components/runtime-card.tsx         # card for list view
apps/dashboard/src/components/capability-badges.tsx    # capability pills in detail view
apps/dashboard/src/components/runtime-activity-list.tsx # cross-runtime feed component
openclaw-plugin/management/runtimes.json  # default runtime registry config (gitignored content, committed example)
docs/RUNTIMES.md                          # runtime adapter integration guide
docs/superpowers/specs/2026-04-23-multi-runtime-control-plane.md   # spec (links back to this plan)
```

**Modified files:**
```
packages/types/src/index.ts           # re-export new runtime types + extend EnvelopeRef with runtime_kind/native_ref/projection_mode/lossiness
apps/bridge/src/server.ts             # mount runtimes router after /claude-code carve-out
apps/bridge/src/config.ts             # add runtimesConfigPath loading
apps/dashboard/src/components/app-shell.tsx   # add "Runtimes" sidebar entry
packages/types/src/index.ts           # add "runtimes.view" + "runtimes.invoke" permission ids
apps/bridge/src/services/auth/service.ts  # add runtime perms to admin system role grants
apps/bridge/src/services/envelope.ts  # normalize new envelope fields
```

**New tests:**
```
apps/bridge/test/runtimes-registry.test.ts
apps/bridge/test/runtimes-openclaw-adapter.test.ts
apps/bridge/test/runtimes-hermes-adapter.test.ts
apps/bridge/test/runtimes-zeroclaw-adapter.test.ts
apps/bridge/test/runtimes-nanobot-adapter.test.ts
apps/bridge/test/routes-runtimes.test.ts
apps/bridge/test/envelope-runtime-fields.test.ts
```

---

## Task 1: Contract types

**Files:**
- Create: `packages/types/src/runtimes.ts`
- Modify: `packages/types/src/index.ts` (re-export)
- Test: `apps/bridge/test/runtimes-registry.test.ts` (types compile check exercised by registry test in Task 2)

- [ ] **Step 1: Create runtime types**

Write `packages/types/src/runtimes.ts`:

```ts
// Wire-safe JSON for anything that crosses the bridge boundary. Adapter
// results and native refs must be JSON-serialisable so dashboard and audit
// consumers never see non-cloneable values.
export type JsonValue =
  | null | boolean | number | string
  | JsonValue[] | { [k: string]: JsonValue };

export type RuntimeKind = "openclaw" | "hermes" | "zeroclaw" | "nanobot";

export type ProjectionMode = "exact" | "partial" | "inferred";

export type Lossiness = "none" | "lossy";

export type RuntimeDescriptor = {
  id: string;                    // stable, human-set ("oc-main", "hermes-prod")
  kind: RuntimeKind;
  displayName: string;
  endpoint: string;              // primary URL (HTTP, WS, or "mcp:stdio:<bin>")
  transport: "http" | "ws" | "mcp-stdio" | "sdk";
  authMode: "bearer" | "token-env" | "mcp-none";
  healthPath?: string;           // override default "/health" when the runtime uses a different probe path
  notes?: string;
};

export type CapabilityId =
  | "agents.list" | "agents.read"
  | "sessions.list" | "sessions.read" | "sessions.send"
  | "channels.list" | "channels.status"
  | "memory.query" | "memory.write"
  | "skills.list" | "skills.install"
  | "tools.list" | "tools.invoke"
  | "cron.list" | "cron.write"
  | "logs.tail"
  | "config.get" | "config.set";

// A partial capability must explain *why* so the dashboard can render honest
// degradation instead of a silent amber badge. Examples:
//   { id: "sessions.list", reason: "no pagination exposed", lossiness: "lossy", projectionMode: "partial" }
//   { id: "logs.tail", reason: "lines-only, no structured events", lossiness: "lossy", projectionMode: "inferred" }
export type PartialCapability = {
  id: CapabilityId;
  reason: string;
  projectionMode: ProjectionMode;
  lossiness: Lossiness;
};

export type CapabilitySnapshot = {
  supported: CapabilityId[];
  partial: PartialCapability[];
  unsupported: CapabilityId[];
  version: string;                 // adapter contract version
  runtimeVersion?: string;         // reported by the runtime if available
};

export type RuntimeEntityKind =
  | "agent" | "session" | "channel" | "skill" | "tool" | "cron" | "memory";

export type RuntimeEntity = {
  runtimeKind: RuntimeKind;
  runtimeId: string;
  entityKind: RuntimeEntityKind;
  entityId: string;                // native id as returned by the runtime
  displayName: string;
  nativeType?: string;             // e.g. Hermes "skill.python" or ZeroClaw "channel.telegram"
  lastActivityAt?: number;         // epoch ms
  nativeRef?: JsonValue;           // verbatim runtime payload, for debugging + lossiness inspection
};

export type RuntimeActivityEvent = {
  runtimeKind: RuntimeKind;
  runtimeId: string;
  eventKind:
    | "message_in" | "message_out"
    | "session_started" | "session_ended"
    | "tool_invoked" | "tool_result"
    | "skill_run" | "cron_fired"
    | "channel_connected" | "channel_disconnected"
    | "error";
  at: number;                      // epoch ms
  entityId?: string;
  text?: string;
  projectionMode: ProjectionMode;
  lossiness: Lossiness;
  nativeRef?: JsonValue;
};

export type RuntimeAuthMode = {
  id: "service" | "delegated" | "asserted";
  label: string;
  description: string;
};

// ActorAssertionRef is bridge-stamped, never caller-supplied. The bridge
// route derives humanActorUserId from req.auth.user.id and the service id
// from config; callers only supply action + payload + optional runtimeActorId
// (if Phase 2 delegated mode is used).
export type ActorAssertionRef = {
  humanActorUserId: string;
  managerServiceId: string;
  runtimeActorId?: string;
  basis: "service-principal" | "delegated" | "assertion";
};

// What the HTTP client sends. Note: actor is deliberately absent — the bridge
// constructs it from the authenticated request context.
export type InvokeActionHttpRequest = {
  action: string;
  targetEntityId?: string;
  payload: JsonValue;
  runtimeActorId?: string;         // optional Phase-2 delegated mode hint
};

// What the adapter receives. Bridge-internal shape with the constructed actor.
export type InvokeActionRequest = InvokeActionHttpRequest & {
  actor: ActorAssertionRef;
};

export type InvokeActionResult<T extends JsonValue = JsonValue> =
  | { ok: true; nativeResult: T; projectionMode: ProjectionMode }
  | { ok: false; error: string; projectionMode: ProjectionMode };

export interface RuntimeAdapter {
  describeRuntime(): Promise<RuntimeDescriptor>;
  getCapabilities(): Promise<CapabilitySnapshot>;
  listEntities(kind: RuntimeEntityKind, filters?: JsonValue): Promise<RuntimeEntity[]>;
  getEntity(kind: RuntimeEntityKind, id: string): Promise<RuntimeEntity | null>;
  listActivity(sinceMs?: number, limit?: number): Promise<RuntimeActivityEvent[]>;
  invokeAction(req: InvokeActionRequest): Promise<InvokeActionResult>;
  getAuthModes(): Promise<RuntimeAuthMode[]>;
  getExtensions(): Promise<string[]>;
  health(): Promise<{ ok: boolean; detail?: string }>;
  // Phase 1 adapters that hold long-lived resources (Nanobot MCP subprocess)
  // must implement dispose(). Others may leave it undefined; the registry
  // treats undefined as no-op.
  dispose?(): Promise<void>;
}
```

- [ ] **Step 2: Re-export from packages/types index**

Edit `packages/types/src/index.ts`. Add at top of file after existing imports:

```ts
export * from "./runtimes.js";
```

Add to the `PermissionId` union (locate the existing permission list and add):

```ts
  | "runtimes.view"
  | "runtimes.invoke"
```

Add to `ALL_PERMISSION_IDS` array the two new ids.

- [ ] **Step 3: Build types package**

Run: `pnpm --filter @openclaw-manager/types build`
Expected: exits 0, emits to `packages/types/dist/`.

- [ ] **Step 4: Commit**

```bash
git add packages/types/src/runtimes.ts packages/types/src/index.ts packages/types/dist
git commit -m "$(cat <<'EOF'
feat(types): RuntimeAdapter contract + CapabilitySnapshot + ActorAssertionRef

Lays the shared contract for the multi-runtime control plane. Capability
ids name what an adapter can do (supported / partial / unsupported),
ProjectionMode + Lossiness flag how honest a cross-runtime rendering is,
and ActorAssertionRef carries the four identity layers (human, manager
service, runtime actor, basis) that every cross-runtime action must stamp.
EOF
)"
```

---

## Task 2: Runtime registry service

**Files:**
- Create: `apps/bridge/src/services/runtimes/registry.ts`
- Create: `apps/bridge/src/services/runtimes/adapter-base.ts`
- Create: `openclaw-plugin/management/runtimes.json` (example; real file gitignored)
- Test: `apps/bridge/test/runtimes-registry.test.ts`

- [ ] **Step 1: Write failing test for registry load + list**

Create `apps/bridge/test/runtimes-registry.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRuntimeRegistry } from "../src/services/runtimes/registry.js";

test("registry loads config + lists descriptors", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "reg-"));
  const cfg = path.join(dir, "runtimes.json");
  await writeFile(cfg, JSON.stringify({
    runtimes: [
      { id: "oc-main", kind: "openclaw", displayName: "OC Main", endpoint: "http://127.0.0.1:18789", transport: "sdk", authMode: "token-env" },
      { id: "hermes-dev", kind: "hermes", displayName: "Hermes Dev", endpoint: "http://127.0.0.1:18800", transport: "http", authMode: "bearer" },
    ],
  }));

  const reg = await createRuntimeRegistry({ configPath: cfg });
  const all = await reg.list();
  assert.equal(all.length, 2);
  assert.equal(all[0].id, "oc-main");
  const one = await reg.get("hermes-dev");
  assert.ok(one);
  assert.equal(one!.kind, "hermes");
  assert.equal(await reg.get("missing"), null);
});

test("registry rejects malformed config", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "reg-"));
  const cfg = path.join(dir, "runtimes.json");
  await writeFile(cfg, "not-json");
  await assert.rejects(() => createRuntimeRegistry({ configPath: cfg }), /invalid runtime config/i);
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `pnpm --filter bridge exec node --test --test-concurrency=1 --experimental-strip-types test/runtimes-registry.test.ts`
Expected: FAIL — `createRuntimeRegistry` not defined.

- [ ] **Step 3: Create adapter-base.ts**

Create `apps/bridge/src/services/runtimes/adapter-base.ts`:

```ts
import type { RuntimeAdapter, RuntimeDescriptor, CapabilitySnapshot, JsonValue } from "@openclaw-manager/types";

// HttpClient is injectable so HTTP adapters are testable without binding
// real ports. Default implementation (`defaultHttp`) calls fetch.
export type HttpRequest = {
  method: "GET" | "POST" | "PATCH" | "DELETE";
  headers?: Record<string, string>;
  body?: JsonValue;
  timeoutMs?: number;
};
export type HttpClient = {
  json(url: string, req: HttpRequest): Promise<JsonValue>;
};

export const defaultHttp: HttpClient = {
  async json(url, req) {
    const controller = new AbortController();
    const to = setTimeout(() => controller.abort(), req.timeoutMs ?? 5000);
    try {
      const res = await fetch(url, {
        method: req.method,
        headers: req.headers,
        body: req.body === undefined ? undefined : JSON.stringify(req.body),
        signal: controller.signal,
      });
      const text = await res.text();
      if (!res.ok) throw new Error(`${res.status}: ${text.slice(0, 300)}`);
      return text ? (JSON.parse(text) as JsonValue) : null;
    } finally { clearTimeout(to); }
  },
};

export type AdapterConfig = {
  descriptor: RuntimeDescriptor;
  bearer?: string;
  timeoutMs?: number;
  http?: HttpClient;
};

export const ADAPTER_CONTRACT_VERSION = "1.0.0";

export function emptyCapabilities(): CapabilitySnapshot {
  return { supported: [], partial: [], unsupported: [], version: ADAPTER_CONTRACT_VERSION };
}

export type AdapterFactory = (cfg: AdapterConfig) => RuntimeAdapter;
```

- [ ] **Step 4: Create registry.ts**

Create `apps/bridge/src/services/runtimes/registry.ts`:

```ts
import { readFile } from "node:fs/promises";
import type { RuntimeAdapter, RuntimeDescriptor, RuntimeKind } from "@openclaw-manager/types";
import type { AdapterConfig, AdapterFactory } from "./adapter-base.js";

export type RegistryConfig = { configPath: string; factories?: Partial<Record<RuntimeKind, AdapterFactory>> };

type RegistryInternal = {
  descriptors: RuntimeDescriptor[];
  adapters: Map<string, RuntimeAdapter>;
};

function assertDescriptor(d: unknown): asserts d is RuntimeDescriptor {
  const o = d as Record<string, unknown>;
  if (!o || typeof o.id !== "string" || typeof o.kind !== "string"
    || typeof o.displayName !== "string" || typeof o.endpoint !== "string"
    || typeof o.transport !== "string" || typeof o.authMode !== "string") {
    throw new Error("invalid runtime config: missing required descriptor field");
  }
  if (!["openclaw", "hermes", "zeroclaw", "nanobot"].includes(o.kind as string)) {
    throw new Error(`invalid runtime config: unknown kind '${o.kind}'`);
  }
}

export type RuntimeRegistry = {
  list(): Promise<RuntimeDescriptor[]>;
  get(id: string): Promise<RuntimeDescriptor | null>;
  adapter(id: string): Promise<RuntimeAdapter | null>;
};

export async function createRuntimeRegistry(cfg: RegistryConfig): Promise<RuntimeRegistry> {
  let raw: string;
  try { raw = await readFile(cfg.configPath, "utf8"); }
  catch (e) { throw new Error(`invalid runtime config: cannot read ${cfg.configPath}: ${(e as Error).message}`); }

  let parsed: { runtimes?: unknown };
  try { parsed = JSON.parse(raw); }
  catch { throw new Error(`invalid runtime config: not valid JSON`); }

  if (!parsed.runtimes || !Array.isArray(parsed.runtimes)) throw new Error("invalid runtime config: runtimes array missing");
  parsed.runtimes.forEach(assertDescriptor);
  const descriptors = parsed.runtimes as RuntimeDescriptor[];

  const state: RegistryInternal = { descriptors, adapters: new Map() };
  const factories = cfg.factories ?? {};

  return {
    async list() { return [...state.descriptors]; },
    async get(id) { return state.descriptors.find((d) => d.id === id) ?? null; },
    async adapter(id) {
      if (state.adapters.has(id)) return state.adapters.get(id)!;
      const d = state.descriptors.find((x) => x.id === id);
      if (!d) return null;
      const f = factories[d.kind];
      if (!f) return null;
      const adapterCfg: AdapterConfig = { descriptor: d, timeoutMs: 5000 };
      const a = f(adapterCfg);
      state.adapters.set(id, a);
      return a;
    },
  };
}
```

- [ ] **Step 5: Run tests to verify passing**

Run: `pnpm --filter bridge exec node --test --test-concurrency=1 --experimental-strip-types test/runtimes-registry.test.ts`
Expected: 2 pass, 0 fail.

- [ ] **Step 6: Add example runtimes.json**

Create `openclaw-plugin/management/runtimes.json`:

```json
{
  "runtimes": [
    {
      "id": "oc-main",
      "kind": "openclaw",
      "displayName": "OpenClaw (local)",
      "endpoint": "http://127.0.0.1:18789",
      "transport": "sdk",
      "authMode": "token-env",
      "notes": "Primary runtime. Uses existing OPENCLAW_GATEWAY_TOKEN + SDK path."
    }
  ]
}
```

- [ ] **Step 7: Commit**

```bash
git add apps/bridge/src/services/runtimes/registry.ts apps/bridge/src/services/runtimes/adapter-base.ts apps/bridge/test/runtimes-registry.test.ts openclaw-plugin/management/runtimes.json
git commit -m "$(cat <<'EOF'
feat(bridge): RuntimeRegistry loads runtimes.json and lazily instantiates adapters

Config-driven so users add Hermes / ZeroClaw / Nanobot without code
changes. Factories get injected (registry does not import concrete
adapters), which keeps tests isolated and lets us swap an adapter
implementation without touching the registry.
EOF
)"
```

---

## Task 3: OpenClaw adapter (full)

**Files:**
- Create: `apps/bridge/src/services/runtimes/openclaw.ts`
- Test: `apps/bridge/test/runtimes-openclaw-adapter.test.ts`

- [ ] **Step 1: Write failing test**

Create `apps/bridge/test/runtimes-openclaw-adapter.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { createOpenclawAdapter } from "../src/services/runtimes/openclaw.js";
import type { RuntimeDescriptor } from "@openclaw-manager/types";

const desc: RuntimeDescriptor = {
  id: "oc-main", kind: "openclaw", displayName: "OC", endpoint: "http://fake:1",
  transport: "sdk", authMode: "token-env",
};

test("openclaw adapter describeRuntime + getCapabilities", async () => {
  const fakeGateway = async (method: string) => {
    if (method === "agents.list") return { agents: [{ id: "main" }] };
    throw new Error("unexpected");
  };
  const a = createOpenclawAdapter({ descriptor: desc }, { callGateway: fakeGateway });
  const d = await a.describeRuntime();
  assert.equal(d.kind, "openclaw");
  const caps = await a.getCapabilities();
  assert.ok(caps.supported.includes("agents.list"));
  assert.ok(caps.supported.includes("sessions.send"));
});

test("openclaw adapter listEntities agent", async () => {
  const fakeGateway = async (method: string) => {
    if (method === "agents.list") return { agents: [{ id: "main", name: "main" }, { id: "claude-code", name: "claude-code" }] };
    throw new Error(method);
  };
  const a = createOpenclawAdapter({ descriptor: desc }, { callGateway: fakeGateway });
  const rows = await a.listEntities("agent");
  assert.equal(rows.length, 2);
  assert.equal(rows[0].entityId, "main");
  assert.equal(rows[0].runtimeKind, "openclaw");
});

test("openclaw adapter health uses agents.list probe", async () => {
  let called = 0;
  const fakeGateway = async () => { called++; return { agents: [] }; };
  const a = createOpenclawAdapter({ descriptor: desc }, { callGateway: fakeGateway });
  const h = await a.health();
  assert.equal(h.ok, true);
  assert.equal(called, 1);
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `pnpm --filter bridge exec node --test --test-concurrency=1 --experimental-strip-types test/runtimes-openclaw-adapter.test.ts`
Expected: FAIL — `createOpenclawAdapter` not defined.

- [ ] **Step 3: Implement adapter**

Create `apps/bridge/src/services/runtimes/openclaw.ts`:

```ts
import type {
  RuntimeAdapter, RuntimeEntity, RuntimeEntityKind, RuntimeActivityEvent,
  InvokeActionRequest, InvokeActionResult, RuntimeAuthMode, CapabilitySnapshot, JsonValue,
} from "@openclaw-manager/types";
import { ADAPTER_CONTRACT_VERSION, type AdapterConfig } from "./adapter-base.js";

export type OpenclawAdapterDeps = {
  callGateway: (method: string, params?: Record<string, unknown>) => Promise<unknown>;
};

export function createOpenclawAdapter(cfg: AdapterConfig, deps: OpenclawAdapterDeps): RuntimeAdapter {
  const { descriptor } = cfg;
  const { callGateway } = deps;

  const supported: CapabilitySnapshot["supported"] = [
    "agents.list", "agents.read",
    "sessions.list", "sessions.read", "sessions.send",
    "channels.list", "channels.status",
    "tools.list", "tools.invoke",
    "cron.list", "cron.write",
    "logs.tail",
    "config.get", "config.set",
    "skills.list", "skills.install",
  ];

  return {
    async describeRuntime() { return descriptor; },
    async getCapabilities(): Promise<CapabilitySnapshot> {
      return { supported, partial: [], unsupported: ["memory.query", "memory.write"], version: ADAPTER_CONTRACT_VERSION };
    },
    async listEntities(kind: RuntimeEntityKind): Promise<RuntimeEntity[]> {
      if (kind === "agent") {
        const res = (await callGateway("agents.list")) as { agents?: Array<{ id: string; name?: string }> };
        return (res.agents ?? []).map((a) => ({
          runtimeKind: "openclaw" as const, runtimeId: descriptor.id,
          entityKind: "agent" as const, entityId: a.id, displayName: a.name ?? a.id,
          nativeRef: a,
        }));
      }
      if (kind === "session") {
        const res = (await callGateway("sessions.list")) as { sessions?: Array<Record<string, unknown>> };
        return (res.sessions ?? []).map((s) => ({
          runtimeKind: "openclaw" as const, runtimeId: descriptor.id,
          entityKind: "session" as const,
          entityId: String(s.key ?? s.sessionId ?? ""),
          displayName: String(s.key ?? ""),
          nativeType: String((s as { lastChannel?: string }).lastChannel ?? ""),
          lastActivityAt: typeof s.updatedAt === "number" ? (s.updatedAt as number) : undefined,
          nativeRef: s,
        }));
      }
      if (kind === "channel") {
        const res = (await callGateway("channels.status")) as { channels?: Array<{ id: string; status: string }> };
        return (res.channels ?? []).map((c) => ({
          runtimeKind: "openclaw" as const, runtimeId: descriptor.id,
          entityKind: "channel" as const, entityId: c.id, displayName: c.id,
          nativeType: c.status, nativeRef: c,
        }));
      }
      if (kind === "tool") {
        const res = (await callGateway("tools.catalog")) as { tools?: Array<{ id: string; label?: string }> };
        return (res.tools ?? []).map((t) => ({
          runtimeKind: "openclaw" as const, runtimeId: descriptor.id,
          entityKind: "tool" as const, entityId: t.id, displayName: t.label ?? t.id,
          nativeRef: t,
        }));
      }
      return [];
    },
    async getEntity(kind, id) {
      const list = await this.listEntities(kind);
      return list.find((e) => e.entityId === id) ?? null;
    },
    async listActivity(sinceMs, limit): Promise<RuntimeActivityEvent[]> {
      try {
        const res = (await callGateway("logs.tail", { lines: limit ?? 100 })) as { lines?: string[] };
        const lines = res.lines ?? [];
        return lines.map((line, i): RuntimeActivityEvent => ({
          runtimeKind: "openclaw", runtimeId: descriptor.id,
          eventKind: "message_out",
          at: Date.now() - (lines.length - i) * 1000,
          text: line,
          projectionMode: "inferred",
          lossiness: "lossy",
          nativeRef: { line },
        })).filter((e) => !sinceMs || e.at >= sinceMs);
      } catch { return []; }
    },
    async invokeAction(req: InvokeActionRequest): Promise<InvokeActionResult> {
      try {
        // payload is JsonValue from the contract; callGateway expects a plain
        // params record. Both are structurally JSON, the cast is safe.
        const params = req.payload as Record<string, unknown>;
        const nativeResult = await callGateway(req.action, params);
        return { ok: true, nativeResult: nativeResult as JsonValue, projectionMode: "exact" };
      } catch (e) {
        return { ok: false, error: (e as Error).message, projectionMode: "exact" };
      }
    },
    async getAuthModes(): Promise<RuntimeAuthMode[]> {
      return [{ id: "service", label: "Service principal", description: "Bridge-side OPENCLAW_GATEWAY_TOKEN." }];
    },
    async getExtensions() {
      return ["plugins", "approvals", "transcripts", "claude-code-bridge", "youtube-v2", "brain"];
    },
    async health() {
      try { await callGateway("agents.list"); return { ok: true }; }
      catch (e) { return { ok: false, detail: (e as Error).message }; }
    },
  };
}
```

- [ ] **Step 4: Run test to verify passing**

Run: `pnpm --filter bridge exec node --test --test-concurrency=1 --experimental-strip-types test/runtimes-openclaw-adapter.test.ts`
Expected: 3 pass.

- [ ] **Step 5: Commit**

```bash
git add apps/bridge/src/services/runtimes/openclaw.ts apps/bridge/test/runtimes-openclaw-adapter.test.ts
git commit -m "feat(bridge): OpenClaw runtime adapter wrapping existing callGateway"
```

---

## Task 4: Hermes stub adapter (read-only describe + health)

**Files:**
- Create: `apps/bridge/src/services/runtimes/hermes.ts`
- Test: `apps/bridge/test/runtimes-hermes-adapter.test.ts`

**Research prerequisite (do before writing code):** Fetch `https://github.com/nousresearch/hermes-agent` README and verify (a) the HTTP surface shape, (b) auth header name, (c) whether `/health` endpoint exists, (d) how skills / scheduler / sessions map. Record findings inline in the adapter file as JSDoc so Phase 2 deep integration has a starting point.

- [ ] **Step 1: Fetch + read Hermes README**

Run: `curl -sL https://raw.githubusercontent.com/nousresearch/hermes-agent/main/README.md | head -400` and transcribe the auth + endpoint sections into a comment block at the top of `hermes.ts` when you create it.

- [ ] **Step 2: Write failing test**

Create `apps/bridge/test/runtimes-hermes-adapter.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHermesAdapter } from "../src/services/runtimes/hermes.js";
import type { RuntimeDescriptor, JsonValue } from "@openclaw-manager/types";
import type { HttpClient } from "../src/services/runtimes/adapter-base.js";

const desc: RuntimeDescriptor = {
  id: "hermes-dev", kind: "hermes", displayName: "Hermes",
  endpoint: "http://fake:1", transport: "http", authMode: "bearer",
};

function http(handler: (url: string, init: any) => Promise<JsonValue>): HttpClient {
  return { json: (url, init) => handler(url, init) };
}

test("hermes adapter health OK when probe returns 2xx", async () => {
  const a = createHermesAdapter({
    descriptor: desc, bearer: "tok",
    http: http(async (url) => { if (/\/health$/.test(url)) return { ok: true }; throw new Error("unexpected"); }),
  });
  assert.equal((await a.health()).ok, true);
});

test("hermes adapter health surfaces error detail when probe fails", async () => {
  const a = createHermesAdapter({
    descriptor: desc, bearer: "tok",
    http: http(async () => { throw new Error("502: upstream"); }),
  });
  const h = await a.health();
  assert.equal(h.ok, false);
  assert.match(h.detail ?? "", /502/);
});

test("hermes adapter respects healthPath override (empty string disables probe)", async () => {
  const a = createHermesAdapter({
    descriptor: { ...desc, healthPath: "" }, bearer: "tok",
    http: http(async () => { throw new Error("should not be called"); }),
  });
  const h = await a.health();
  assert.equal(h.ok, true);
  assert.match(h.detail ?? "", /probe disabled/);
});

test("hermes adapter reports honest stub capabilities with reasons", async () => {
  const a = createHermesAdapter({ descriptor: desc, bearer: "tok" });
  const caps = await a.getCapabilities();
  assert.ok(caps.unsupported.includes("sessions.send"), "Phase 1 must not claim write support");
  const part = caps.partial.find((p) => p.id === "agents.list");
  assert.ok(part);
  assert.match(part!.reason, /stub/i);
  assert.equal(part!.lossiness, "lossy");
});
```

- [ ] **Step 3: Implement Hermes adapter**

Create `apps/bridge/src/services/runtimes/hermes.ts`:

```ts
/**
 * Hermes Agent adapter — Phase 1 stub.
 *
 * Scope: honest health probe + describe + capability snapshot. No entity
 * listing until Phase 2 grounds against real endpoints.
 *
 * Public source:
 *   https://github.com/nousresearch/hermes-agent
 *
 * Health probe path defaults to "/health" but is overridable via the
 * descriptor's healthPath field. When the runtime returns non-2xx the
 * adapter reports `ok:false` with the raw error detail; when the runtime
 * has no probe endpoint at all, configure `healthPath: ""` in
 * runtimes.json and the adapter will return `{ok:true, detail:"probe disabled"}`.
 *
 * Adapter authors: before adding new methods, fetch the README and record
 * the exact endpoint shape in this block. Do not guess endpoint paths.
 */
import type {
  RuntimeAdapter, RuntimeActivityEvent, InvokeActionRequest, InvokeActionResult,
  RuntimeAuthMode, CapabilitySnapshot, RuntimeEntity, RuntimeEntityKind, PartialCapability,
} from "@openclaw-manager/types";
import { ADAPTER_CONTRACT_VERSION, defaultHttp, type AdapterConfig } from "./adapter-base.js";

export function createHermesAdapter(cfg: AdapterConfig): RuntimeAdapter {
  const { descriptor, bearer, timeoutMs } = cfg;
  const http = cfg.http ?? defaultHttp;
  const base = descriptor.endpoint.replace(/\/$/, "");
  const authHeader: Record<string, string> = bearer ? { Authorization: `Bearer ${bearer}` } : {};

  const partial: PartialCapability[] = [
    { id: "agents.list",   reason: "Phase 1 stub — no entity listing",           projectionMode: "inferred", lossiness: "lossy" },
    { id: "sessions.list", reason: "Phase 1 stub — no entity listing",           projectionMode: "inferred", lossiness: "lossy" },
    { id: "skills.list",   reason: "Phase 1 stub — no entity listing",           projectionMode: "inferred", lossiness: "lossy" },
    { id: "logs.tail",     reason: "Phase 1 stub — adapter does not fetch logs", projectionMode: "inferred", lossiness: "lossy" },
  ];

  return {
    async describeRuntime() { return descriptor; },
    async getCapabilities(): Promise<CapabilitySnapshot> {
      return {
        supported: [],
        partial,
        unsupported: [
          "sessions.send", "channels.list", "channels.status",
          "memory.query", "memory.write",
          "skills.install", "tools.list", "tools.invoke",
          "cron.list", "cron.write", "config.get", "config.set",
          "agents.read", "sessions.read",
        ],
        version: ADAPTER_CONTRACT_VERSION,
      };
    },
    async listEntities(_kind: RuntimeEntityKind): Promise<RuntimeEntity[]> { return []; },
    async getEntity() { return null; },
    async listActivity(): Promise<RuntimeActivityEvent[]> { return []; },
    async invokeAction(_req: InvokeActionRequest): Promise<InvokeActionResult> {
      return { ok: false, error: "hermes write actions not implemented in Phase 1", projectionMode: "exact" };
    },
    async getAuthModes(): Promise<RuntimeAuthMode[]> {
      return [{ id: "service", label: "Bearer", description: "Hermes bearer via env HERMES_TOKEN." }];
    },
    async getExtensions() { return ["skills-library", "scheduler", "memory", "channel-connectors"]; },
    async health() {
      const path = descriptor.healthPath ?? "/health";
      if (path === "") return { ok: true, detail: "probe disabled" };
      try {
        await http.json(`${base}${path}`, { method: "GET", headers: authHeader, timeoutMs });
        return { ok: true };
      } catch (e) {
        return { ok: false, detail: (e as Error).message };
      }
    },
  };
}
```

- [ ] **Step 4: Run test**

Run: `pnpm --filter bridge exec node --test --test-concurrency=1 --experimental-strip-types test/runtimes-hermes-adapter.test.ts`
Expected: 2 pass.

- [ ] **Step 5: Commit**

```bash
git add apps/bridge/src/services/runtimes/hermes.ts apps/bridge/test/runtimes-hermes-adapter.test.ts
git commit -m "feat(bridge): Hermes adapter Phase 1 stub — health + capabilities only"
```

---

## Task 5: ZeroClaw stub adapter (read-only describe + health)

**Files:**
- Create: `apps/bridge/src/services/runtimes/zeroclaw.ts`
- Test: `apps/bridge/test/runtimes-zeroclaw-adapter.test.ts`

**Research prerequisite:** Fetch `https://github.com/zeroclaw-labs/zeroclaw` README + AGENTS.md to verify HTTP endpoints, auth scheme, and what introspection surfaces are actually exposed over HTTP (vs. only through Rust traits). Record findings in the JSDoc at top of `zeroclaw.ts`.

- [ ] **Step 1: Fetch ZeroClaw docs**

Run: `curl -sL https://raw.githubusercontent.com/zeroclaw-labs/zeroclaw/master/README.md | head -300` and transcribe endpoint shape.

- [ ] **Step 2: Write failing test**

Create `apps/bridge/test/runtimes-zeroclaw-adapter.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { createZeroclawAdapter } from "../src/services/runtimes/zeroclaw.js";
import type { RuntimeDescriptor, JsonValue } from "@openclaw-manager/types";
import type { HttpClient } from "../src/services/runtimes/adapter-base.js";

const desc: RuntimeDescriptor = {
  id: "zc-dev", kind: "zeroclaw", displayName: "ZeroClaw",
  endpoint: "http://fake:1", transport: "http", authMode: "bearer",
};

function http(handler: (url: string) => Promise<JsonValue>): HttpClient {
  return { json: (url) => handler(url) };
}

test("zeroclaw adapter reports partial channels.list with structured reason + unsupported write", async () => {
  const a = createZeroclawAdapter({ descriptor: desc, bearer: "tok" });
  const caps = await a.getCapabilities();
  const part = caps.partial.find((p) => p.id === "channels.list");
  assert.ok(part);
  assert.equal(part!.lossiness, "lossy");
  assert.ok(caps.unsupported.includes("memory.write"));
});

test("zeroclaw adapter health surfaces error detail on probe failure", async () => {
  const a = createZeroclawAdapter({
    descriptor: desc, bearer: "tok",
    http: http(async () => { throw new Error("ECONNREFUSED"); }),
  });
  const h = await a.health();
  assert.equal(h.ok, false);
  assert.match(h.detail ?? "", /ECONNREFUSED/);
});

test("zeroclaw adapter respects empty healthPath (probe disabled)", async () => {
  const a = createZeroclawAdapter({
    descriptor: { ...desc, healthPath: "" }, bearer: "tok",
    http: http(async () => { throw new Error("should not be called"); }),
  });
  const h = await a.health();
  assert.equal(h.ok, true);
});
```

- [ ] **Step 3: Implement ZeroClaw adapter**

Create `apps/bridge/src/services/runtimes/zeroclaw.ts`:

```ts
/**
 * ZeroClaw adapter — Phase 1 stub.
 *
 * Source: https://github.com/zeroclaw-labs/zeroclaw
 *
 * Phase 1 scope: honest health + capability declaration. No write actions.
 * Trait-level introspection (providers / channel matrix / memory backends)
 * may require a Rust companion sidecar — tracked as Phase 3. Do not embed
 * Rust in-process in this Node bridge.
 *
 * Health probe is configurable via descriptor.healthPath; empty string
 * disables probe (same contract as Hermes adapter).
 */
import type {
  RuntimeAdapter, RuntimeEntity, RuntimeEntityKind, RuntimeActivityEvent,
  InvokeActionRequest, InvokeActionResult, RuntimeAuthMode, CapabilitySnapshot, PartialCapability,
} from "@openclaw-manager/types";
import { ADAPTER_CONTRACT_VERSION, defaultHttp, type AdapterConfig } from "./adapter-base.js";

export function createZeroclawAdapter(cfg: AdapterConfig): RuntimeAdapter {
  const { descriptor, bearer, timeoutMs } = cfg;
  const http = cfg.http ?? defaultHttp;
  const base = descriptor.endpoint.replace(/\/$/, "");
  const authHeader: Record<string, string> = bearer ? { Authorization: `Bearer ${bearer}` } : {};

  const partial: PartialCapability[] = [
    { id: "agents.list",     reason: "Phase 1 stub — no entity listing",           projectionMode: "inferred", lossiness: "lossy" },
    { id: "channels.list",   reason: "Phase 1 stub — no entity listing",           projectionMode: "inferred", lossiness: "lossy" },
    { id: "channels.status", reason: "Phase 1 stub — no channel polling",          projectionMode: "inferred", lossiness: "lossy" },
    { id: "tools.list",      reason: "Phase 1 stub — no entity listing",           projectionMode: "inferred", lossiness: "lossy" },
    { id: "logs.tail",       reason: "Phase 1 stub — adapter does not fetch logs", projectionMode: "inferred", lossiness: "lossy" },
  ];

  return {
    async describeRuntime() { return descriptor; },
    async getCapabilities(): Promise<CapabilitySnapshot> {
      return {
        supported: [],
        partial,
        unsupported: [
          "sessions.send", "memory.query", "memory.write",
          "skills.list", "skills.install", "tools.invoke",
          "cron.list", "cron.write", "config.set",
          "agents.read", "sessions.read", "sessions.list", "config.get",
        ],
        version: ADAPTER_CONTRACT_VERSION,
      };
    },
    async listEntities(_kind: RuntimeEntityKind): Promise<RuntimeEntity[]> { return []; },
    async getEntity() { return null; },
    async listActivity(): Promise<RuntimeActivityEvent[]> { return []; },
    async invokeAction(_req: InvokeActionRequest): Promise<InvokeActionResult> {
      return { ok: false, error: "zeroclaw write actions not implemented in Phase 1", projectionMode: "exact" };
    },
    async getAuthModes(): Promise<RuntimeAuthMode[]> {
      return [{ id: "service", label: "Bearer", description: "ZeroClaw bearer via env ZEROCLAW_TOKEN." }];
    },
    async getExtensions() { return ["traits", "providers", "channel-matrix", "memory-backends"]; },
    async health() {
      const path = descriptor.healthPath ?? "/health";
      if (path === "") return { ok: true, detail: "probe disabled" };
      try {
        await http.json(`${base}${path}`, { method: "GET", headers: authHeader, timeoutMs });
        return { ok: true };
      } catch (e) {
        return { ok: false, detail: (e as Error).message };
      }
    },
  };
}
```

- [ ] **Step 4: Run test**

Run: `pnpm --filter bridge exec node --test --test-concurrency=1 --experimental-strip-types test/runtimes-zeroclaw-adapter.test.ts`
Expected: 2 pass.

- [ ] **Step 5: Commit**

```bash
git add apps/bridge/src/services/runtimes/zeroclaw.ts apps/bridge/test/runtimes-zeroclaw-adapter.test.ts
git commit -m "feat(bridge): ZeroClaw adapter Phase 1 stub — health + capabilities only"
```

---

## Task 6: Nanobot MCP adapter (read-only tool catalog)

**Files:**
- Create: `apps/bridge/src/services/runtimes/nanobot.ts`
- Test: `apps/bridge/test/runtimes-nanobot-adapter.test.ts`

**Research prerequisite:** Verify MCP client connection method for Nanobot — it may be MCP-stdio (spawn binary) or MCP-http. Fetch README + inspect `@modelcontextprotocol/sdk` ClientTransport options. Record the chosen transport in JSDoc.

- [ ] **Step 1: Write failing test with mock MCP client**

Create `apps/bridge/test/runtimes-nanobot-adapter.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { createNanobotAdapter } from "../src/services/runtimes/nanobot.js";
import type { RuntimeDescriptor } from "@openclaw-manager/types";

const desc: RuntimeDescriptor = {
  id: "nanobot-local", kind: "nanobot", displayName: "Nanobot",
  endpoint: "mcp:stdio:nanobot-mcp", transport: "mcp-stdio", authMode: "mcp-none",
};

test("nanobot adapter advertises tools.list as supported", async () => {
  const fakeClient = {
    connect: async () => {},
    listTools: async () => ({ tools: [{ name: "echo", description: "echo input" }] }),
    close: async () => {},
  };
  const a = createNanobotAdapter({ descriptor: desc }, { mcpClient: fakeClient });
  const caps = await a.getCapabilities();
  assert.ok(caps.supported.includes("tools.list"));
  const tools = await a.listEntities("tool");
  assert.equal(tools.length, 1);
  assert.equal(tools[0].entityId, "echo");
  assert.equal(tools[0].runtimeKind, "nanobot");
});

test("nanobot health surfaces MCP transport error", async () => {
  const fakeClient = {
    connect: async () => { throw new Error("stdio spawn failed"); },
    listTools: async () => ({ tools: [] }),
    close: async () => {},
  };
  const a = createNanobotAdapter({ descriptor: desc }, { mcpClient: fakeClient });
  const h = await a.health();
  assert.equal(h.ok, false);
  assert.match(h.detail ?? "", /spawn/);
});

test("nanobot adapter connects only once across repeated calls (pooled)", async () => {
  let connects = 0;
  let closed = false;
  const fakeClient = {
    connect: async () => { connects++; },
    listTools: async () => ({ tools: [{ name: "a" }, { name: "b" }] }),
    close: async () => { closed = true; },
  };
  const a = createNanobotAdapter({ descriptor: desc }, { mcpClient: fakeClient });
  await a.health();
  await a.listEntities("tool");
  await a.listEntities("tool");
  assert.equal(connects, 1, "connect() must be called at most once for a non-disposed adapter");
  await a.dispose!();
  assert.equal(closed, true, "dispose() must close the MCP transport");
});

test("nanobot adapter retries connect after a failed attempt", async () => {
  let attempts = 0;
  const fakeClient = {
    connect: async () => { attempts++; if (attempts === 1) throw new Error("transient"); },
    listTools: async () => ({ tools: [] }),
    close: async () => {},
  };
  const a = createNanobotAdapter({ descriptor: desc }, { mcpClient: fakeClient });
  assert.equal((await a.health()).ok, false);
  assert.equal((await a.health()).ok, true);
  assert.equal(attempts, 2);
});
```

- [ ] **Step 2: Implement Nanobot adapter**

Create `apps/bridge/src/services/runtimes/nanobot.ts`:

```ts
/**
 * Nanobot adapter — Phase 1.
 *
 * Nanobot is MCP-native; we use @modelcontextprotocol/sdk to connect over
 * stdio (default) or http. The endpoint string carries the transport
 * choice — `mcp:stdio:<bin>` or `mcp:http:<url>`. Phase 1 exposes tool
 * catalog only. Tool invocation stays unsupported pending Phase 2 once
 * auth modes and UX are clear.
 *
 * Connection lifecycle: the adapter holds ONE MCP client instance and
 * connects lazily once. Subsequent calls reuse the connection. dispose()
 * closes the transport and marks the adapter unusable. The registry calls
 * dispose() on shutdown; tests must call dispose() explicitly.
 */
import type {
  RuntimeAdapter, RuntimeEntity, RuntimeEntityKind, RuntimeActivityEvent,
  InvokeActionRequest, InvokeActionResult, RuntimeAuthMode, CapabilitySnapshot,
} from "@openclaw-manager/types";
import { ADAPTER_CONTRACT_VERSION, type AdapterConfig } from "./adapter-base.js";

export type NanobotMcpClient = {
  connect(): Promise<void>;
  listTools(): Promise<{ tools: Array<{ name: string; description?: string }> }>;
  close(): Promise<void>;
};

export type NanobotAdapterDeps = {
  mcpClient: NanobotMcpClient;
};

export function createNanobotAdapter(cfg: AdapterConfig, deps: NanobotAdapterDeps): RuntimeAdapter {
  const { descriptor } = cfg;
  const { mcpClient } = deps;

  let connectPromise: Promise<void> | null = null;
  let disposed = false;

  async function ensureConnected(): Promise<void> {
    if (disposed) throw new Error("nanobot adapter disposed");
    if (!connectPromise) {
      connectPromise = mcpClient.connect().catch((e) => {
        // On failure, clear the cached promise so a later retry can try again.
        connectPromise = null;
        throw e;
      });
    }
    await connectPromise;
  }

  return {
    async describeRuntime() { return descriptor; },
    async getCapabilities(): Promise<CapabilitySnapshot> {
      return {
        supported: ["tools.list"],
        partial: [],
        unsupported: [
          "agents.list", "agents.read",
          "sessions.list", "sessions.read", "sessions.send",
          "channels.list", "channels.status",
          "memory.query", "memory.write",
          "skills.list", "skills.install",
          "tools.invoke",
          "cron.list", "cron.write",
          "logs.tail", "config.get", "config.set",
        ],
        version: ADAPTER_CONTRACT_VERSION,
      };
    },
    async listEntities(kind: RuntimeEntityKind): Promise<RuntimeEntity[]> {
      if (kind !== "tool") return [];
      await ensureConnected();
      const { tools } = await mcpClient.listTools();
      return tools.map((t) => ({
        runtimeKind: "nanobot" as const, runtimeId: descriptor.id,
        entityKind: "tool" as const, entityId: t.name, displayName: t.name,
        nativeType: t.description,
        nativeRef: { name: t.name, description: t.description ?? null },
      }));
    },
    async getEntity(kind, id) {
      const list = await this.listEntities(kind);
      return list.find((e) => e.entityId === id) ?? null;
    },
    async listActivity(): Promise<RuntimeActivityEvent[]> { return []; },
    async invokeAction(_req: InvokeActionRequest): Promise<InvokeActionResult> {
      return { ok: false, error: "nanobot write actions not implemented in Phase 1", projectionMode: "exact" };
    },
    async getAuthModes(): Promise<RuntimeAuthMode[]> {
      return [{ id: "service", label: "MCP transport", description: "Nanobot MCP does not currently gate by bearer." }];
    },
    async getExtensions() { return ["mcp-hosts", "tools", "executions", "vllm-runtime"]; },
    async health() {
      try { await ensureConnected(); return { ok: true }; }
      catch (e) { return { ok: false, detail: (e as Error).message }; }
    },
    async dispose() {
      if (disposed) return;
      disposed = true;
      if (connectPromise) {
        try { await mcpClient.close(); } catch { /* best-effort */ }
      }
    },
  };
}
```

- [ ] **Step 3: Run test**

Run: `pnpm --filter bridge exec node --test --test-concurrency=1 --experimental-strip-types test/runtimes-nanobot-adapter.test.ts`
Expected: 2 pass.

- [ ] **Step 4: Commit**

```bash
git add apps/bridge/src/services/runtimes/nanobot.ts apps/bridge/test/runtimes-nanobot-adapter.test.ts
git commit -m "feat(bridge): Nanobot MCP adapter Phase 1 — tool catalog only, injected client for test isolation"
```

---

## Task 7: Wire adapters into registry + config loading

**Files:**
- Modify: `apps/bridge/src/config.ts` (add `runtimesConfigPath`)
- Modify: `apps/bridge/src/services/runtimes/registry.ts` (accept real factories, not just test factories)
- Create: `apps/bridge/src/services/runtimes/factories.ts` (assembles real adapters with real deps)

- [ ] **Step 1: Add config field**

Edit `apps/bridge/src/config.ts`. Locate the exported `config` object and add:

```ts
  runtimesConfigPath: process.env.RUNTIMES_CONFIG_PATH
    ?? `${process.env.MANAGEMENT_DIR}/runtimes.json`,
```

If the file uses a typed `Config` interface, add `runtimesConfigPath: string;` to the interface.

- [ ] **Step 2: Create factories assembly**

Create `apps/bridge/src/services/runtimes/factories.ts`:

```ts
import type { AdapterFactory } from "./adapter-base.js";
import type { RuntimeKind } from "@openclaw-manager/types";
import { createOpenclawAdapter } from "./openclaw.js";
import { createHermesAdapter } from "./hermes.js";
import { createZeroclawAdapter } from "./zeroclaw.js";
import { createNanobotAdapter } from "./nanobot.js";
import { callGateway } from "../gateway.js";
import { Client as McpClient } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { NanobotMcpClient } from "./nanobot.js";

function makeNanobotMcpClient(endpoint: string): NanobotMcpClient {
  // endpoint like "mcp:stdio:/path/to/binary --arg"
  const m = /^mcp:stdio:(.+)$/.exec(endpoint);
  if (!m) throw new Error(`unsupported nanobot endpoint: ${endpoint}`);
  const [cmd, ...args] = m[1].split(" ").filter(Boolean);
  const client = new McpClient({ name: "openclaw-manager", version: "0.1.0" }, { capabilities: {} });
  const transport = new StdioClientTransport({ command: cmd, args });
  return {
    async connect() { await client.connect(transport); },
    async listTools() { return (await client.listTools()) as { tools: Array<{ name: string; description?: string }> }; },
    async close() { await client.close(); },
  };
}

export const realFactories: Record<RuntimeKind, AdapterFactory> = {
  openclaw: (cfg) => createOpenclawAdapter(cfg, { callGateway }),
  hermes: (cfg) => createHermesAdapter({ ...cfg, bearer: process.env.HERMES_TOKEN ?? cfg.bearer }),
  zeroclaw: (cfg) => createZeroclawAdapter({ ...cfg, bearer: process.env.ZEROCLAW_TOKEN ?? cfg.bearer }),
  nanobot: (cfg) => createNanobotAdapter(cfg, { mcpClient: makeNanobotMcpClient(cfg.descriptor.endpoint) }),
};
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter bridge build`
Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add apps/bridge/src/config.ts apps/bridge/src/services/runtimes/factories.ts
git commit -m "feat(bridge): assemble runtime adapter factories with real deps (gateway SDK + MCP stdio)"
```

---

## Task 8: Bridge REST routes for runtimes

**Files:**
- Create: `apps/bridge/src/routes/runtimes.ts`
- Modify: `apps/bridge/src/server.ts` (mount router + instantiate registry)
- Test: `apps/bridge/test/routes-runtimes.test.ts`

- [ ] **Step 1: Write failing route test**

Create `apps/bridge/test/routes-runtimes.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import express, { type Request, type Response, type NextFunction } from "express";
import { createServer } from "node:http";
import { once } from "node:events";
import { createRuntimesRouter } from "../src/routes/runtimes.js";
import type { RuntimeRegistry } from "../src/services/runtimes/registry.js";
import type { InvokeActionRequest, RuntimeAdapter, RuntimeDescriptor, CapabilitySnapshot } from "@openclaw-manager/types";

function fakeRegistry(captured: { last?: InvokeActionRequest }): RuntimeRegistry {
  const desc: RuntimeDescriptor = {
    id: "oc-main", kind: "openclaw", displayName: "OC", endpoint: "sdk:",
    transport: "sdk", authMode: "token-env",
  };
  const caps: CapabilitySnapshot = { supported: ["agents.list"], partial: [], unsupported: [], version: "1.0.0" };
  const adapter: RuntimeAdapter = {
    describeRuntime: async () => desc,
    getCapabilities: async () => caps,
    listEntities: async () => [],
    getEntity: async () => null,
    listActivity: async () => [],
    invokeAction: async (req) => { captured.last = req; return { ok: true, nativeResult: "fake", projectionMode: "exact" }; },
    getAuthModes: async () => [],
    getExtensions: async () => [],
    health: async () => ({ ok: true }),
  };
  return {
    list: async () => [desc],
    get: async (id) => (id === "oc-main" ? desc : null),
    adapter: async (id) => (id === "oc-main" ? adapter : null),
  };
}

// Stub middleware that simulates upstream strict-actor middleware populating
// req.auth. Routes must read humanActorUserId from req.auth, never from body.
function withAuth(userId: string, permissions: string[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    (req as any).auth = {
      user: { id: userId, username: "gal" },
      permissions,
      claims: { sub: userId, sid: "sess-1", iat: 0, exp: Math.floor(Date.now() / 1000) + 60, username: "gal" },
    };
    next();
  };
}

async function mkApp(permissions: string[] = ["runtimes.view", "runtimes.invoke"], captured: { last?: InvokeActionRequest } = {}) {
  const app = express();
  app.use(express.json());
  app.use(withAuth("user-1", permissions));
  app.use(createRuntimesRouter({ registry: fakeRegistry(captured), managerServiceId: "bridge-primary" }));
  const s = createServer(app);
  s.listen(0);
  await once(s, "listening");
  const port = (s.address() as { port: number }).port;
  return { url: `http://127.0.0.1:${port}`, captured, close: () => new Promise<void>((r) => s.close(() => r())) };
}

test("GET /runtimes returns descriptors when user has runtimes.view", async () => {
  const a = await mkApp();
  try {
    const r = await (await fetch(`${a.url}/runtimes`)).json();
    assert.equal(r.runtimes.length, 1);
  } finally { await a.close(); }
});

test("GET /runtimes rejects 403 when user lacks runtimes.view", async () => {
  const a = await mkApp([]);
  try {
    const r = await fetch(`${a.url}/runtimes`);
    assert.equal(r.status, 403);
  } finally { await a.close(); }
});

test("GET /runtimes/:id/capabilities", async () => {
  const a = await mkApp();
  try {
    const r = await (await fetch(`${a.url}/runtimes/oc-main/capabilities`)).json();
    assert.ok(r.supported.includes("agents.list"));
  } finally { await a.close(); }
});

test("GET /runtimes/:id returns 404 for unknown", async () => {
  const a = await mkApp();
  try {
    const r = await fetch(`${a.url}/runtimes/missing`);
    assert.equal(r.status, 404);
  } finally { await a.close(); }
});

test("POST /runtimes/:id/actions requires runtimes.invoke (403 otherwise)", async () => {
  const a = await mkApp(["runtimes.view"]);
  try {
    const r = await fetch(`${a.url}/runtimes/oc-main/actions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "agents.list", payload: {} }),
    });
    assert.equal(r.status, 403);
  } finally { await a.close(); }
});

test("POST /runtimes/:id/actions injects actor from req.auth and ignores body-supplied actor", async () => {
  const captured: { last?: InvokeActionRequest } = {};
  const a = await mkApp(["runtimes.view", "runtimes.invoke"], captured);
  try {
    const r = await fetch(`${a.url}/runtimes/oc-main/actions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // Body pretends to be a different user — bridge must ignore this.
      body: JSON.stringify({
        action: "agents.list",
        payload: {},
        actor: { humanActorUserId: "attacker", managerServiceId: "evil", basis: "service-principal" },
      }),
    });
    const body = await r.json();
    assert.equal(body.ok, true);
    assert.ok(a.captured.last);
    assert.equal(a.captured.last!.actor.humanActorUserId, "user-1", "bridge must use req.auth.user.id, not body");
    assert.equal(a.captured.last!.actor.managerServiceId, "bridge-primary");
    assert.equal(a.captured.last!.actor.basis, "service-principal");
  } finally { await a.close(); }
});

test("POST /runtimes/:id/actions rejects 400 when action missing", async () => {
  const a = await mkApp();
  try {
    const r = await fetch(`${a.url}/runtimes/oc-main/actions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payload: {} }),
    });
    assert.equal(r.status, 400);
  } finally { await a.close(); }
});

test("POST /runtimes/:id/actions rejects unsupported capability", async () => {
  const a = await mkApp();
  try {
    const r = await fetch(`${a.url}/runtimes/oc-main/actions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "memory.write", payload: {} }),
    });
    // Registry fake declares only supported=["agents.list"] so memory.write is rejected.
    assert.equal(r.status, 400);
    const body = await r.json();
    assert.equal(body.error, "capability_unsupported");
  } finally { await a.close(); }
});
```

- [ ] **Step 2: Implement router**

Create `apps/bridge/src/routes/runtimes.ts`:

```ts
import { Router, type Router as ExpressRouter, type Request, type Response, type NextFunction } from "express";
import type { RuntimeRegistry } from "../services/runtimes/registry.js";
import type {
  RuntimeEntityKind, InvokeActionHttpRequest, ActorAssertionRef, CapabilityId,
  InvokeActionRequest, PermissionId,
} from "@openclaw-manager/types";

export type RuntimesRouterDeps = {
  registry: RuntimeRegistry;
  managerServiceId: string;   // stable id for this bridge instance, stamped on every actor
};

// Local permission guard. The bridge's real requirePerm lives in
// auth-middleware; this function has the identical shape so tests can
// substitute a minimal req.auth without pulling the full auth stack.
function requirePerm(...perms: PermissionId[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const eff = req.auth?.permissions ?? [];
    for (const p of perms) {
      if (!eff.includes(p)) { res.status(403).json({ error: "forbidden", missing: p }); return; }
    }
    next();
  };
}

export function createRuntimesRouter(deps: RuntimesRouterDeps): ExpressRouter {
  const r: ExpressRouter = Router();
  const { registry, managerServiceId } = deps;

  r.get("/runtimes", requirePerm("runtimes.view"), async (_req, res) => {
    res.json({ runtimes: await registry.list() });
  });

  r.get("/runtimes/:id", requirePerm("runtimes.view"), async (req, res) => {
    const d = await registry.get(req.params.id);
    if (!d) { res.status(404).json({ error: "runtime_not_found" }); return; }
    const a = await registry.adapter(req.params.id);
    if (!a) { res.status(500).json({ error: "adapter_unavailable" }); return; }
    res.json({ descriptor: d, health: await a.health() });
  });

  r.get("/runtimes/:id/capabilities", requirePerm("runtimes.view"), async (req, res) => {
    const a = await registry.adapter(req.params.id);
    if (!a) { res.status(404).json({ error: "runtime_not_found" }); return; }
    res.json(await a.getCapabilities());
  });

  r.get("/runtimes/:id/entities/:kind", requirePerm("runtimes.view"), async (req, res) => {
    const a = await registry.adapter(req.params.id);
    if (!a) { res.status(404).json({ error: "runtime_not_found" }); return; }
    const kind = req.params.kind as RuntimeEntityKind;
    try { res.json({ entities: await a.listEntities(kind) }); }
    catch (e) { res.status(502).json({ error: "adapter_error", detail: (e as Error).message }); }
  });

  r.get("/runtimes/:id/activity", requirePerm("runtimes.view"), async (req, res) => {
    const a = await registry.adapter(req.params.id);
    if (!a) { res.status(404).json({ error: "runtime_not_found" }); return; }
    const sinceMs = req.query.sinceMs ? Number(req.query.sinceMs) : undefined;
    const limit = req.query.limit ? Number(req.query.limit) : undefined;
    try { res.json({ events: await a.listActivity(sinceMs, limit) }); }
    catch (e) { res.status(502).json({ error: "adapter_error", detail: (e as Error).message }); }
  });

  r.post("/runtimes/:id/actions", requirePerm("runtimes.view", "runtimes.invoke"), async (req, res) => {
    if (!req.auth) { res.status(401).json({ error: "unauthorized" }); return; }
    const a = await registry.adapter(req.params.id);
    if (!a) { res.status(404).json({ error: "runtime_not_found" }); return; }

    const body = (req.body ?? {}) as Partial<InvokeActionHttpRequest>;
    if (typeof body.action !== "string" || body.action.length === 0) {
      res.status(400).json({ error: "action required" });
      return;
    }

    // Capability gate: refuse calls to actions the adapter declared unsupported.
    // Supported + partial both pass; unsupported fails fast with a clear error
    // so the dashboard can explain "the adapter cannot do this" without waiting
    // for a runtime round-trip.
    const caps = await a.getCapabilities();
    const asCap = body.action as CapabilityId;
    if (caps.unsupported.includes(asCap)) {
      res.status(400).json({ error: "capability_unsupported", capability: asCap });
      return;
    }

    // CRITICAL: actor is bridge-stamped, never body-supplied. humanActorUserId
    // comes from req.auth (populated upstream by actorAssertionAuth middleware);
    // managerServiceId is a deployment constant; basis is the Phase 1 default.
    // Phase 2 will allow body.runtimeActorId to select a delegated runtime
    // identity, but Phase 1 stays on service-principal only.
    const actor: ActorAssertionRef = {
      humanActorUserId: req.auth.user.id,
      managerServiceId,
      runtimeActorId: typeof body.runtimeActorId === "string" ? body.runtimeActorId : undefined,
      basis: "service-principal",
    };
    const adapterReq: InvokeActionRequest = {
      action: body.action,
      targetEntityId: body.targetEntityId,
      payload: body.payload ?? {},
      runtimeActorId: actor.runtimeActorId,
      actor,
    };
    res.json(await a.invokeAction(adapterReq));
  });

  return r;
}
```

- [ ] **Step 3: Mount router in server.ts**

Edit `apps/bridge/src/server.ts`. Add imports near other route imports:

```ts
import { createRuntimeRegistry } from "./services/runtimes/registry.js";
import { realFactories } from "./services/runtimes/factories.js";
import { createRuntimesRouter } from "./routes/runtimes.js";
```

After existing `authService` creation and before `app.listen`, add:

```ts
const runtimeRegistry = await createRuntimeRegistry({
  configPath: config.runtimesConfigPath,
  factories: realFactories,
});
```

Mount router AFTER the existing strict actor-assertion middleware so
`req.auth` is populated before our `requirePerm` runs:

```ts
app.use(createRuntimesRouter({
  registry: runtimeRegistry,
  managerServiceId: process.env.BRIDGE_SERVICE_ID ?? "bridge-primary",
}));
```

Add `BRIDGE_SERVICE_ID` to `.env.example` with the default value commented:

```
# Identity stamped on every runtime-dispatched action. Keep stable across
# restarts so audit trails stay coherent.
BRIDGE_SERVICE_ID=bridge-primary
```

- [ ] **Step 4: Run route tests**

Run: `pnpm --filter bridge exec node --test --test-concurrency=1 --experimental-strip-types test/routes-runtimes.test.ts`
Expected: 4 pass.

- [ ] **Step 5: Build full bridge**

Run: `pnpm --filter bridge build`
Expected: exits 0.

- [ ] **Step 6: Commit**

```bash
git add apps/bridge/src/routes/runtimes.ts apps/bridge/src/server.ts apps/bridge/test/routes-runtimes.test.ts
git commit -m "feat(bridge): /runtimes REST surface + strict-actor gated action dispatch"
```

---

## Task 9: Extend envelope with runtime taxonomy

**Files:**
- Modify: `packages/types/src/index.ts` (extend envelope types)
- Modify: `apps/bridge/src/services/envelope.ts` (normalize new fields)
- Test: `apps/bridge/test/envelope-runtime-fields.test.ts`

- [ ] **Step 1: Extend envelope type**

Edit `packages/types/src/index.ts`. Locate the `CCEnvelope` (or equivalent) type. Add optional fields:

```ts
  // Runtime taxonomy — set by bridge when a turn relates to a non-OpenClaw runtime
  // or when cross-runtime projection must be made explicit.
  runtime_kind?: RuntimeKind;
  runtime_id?: string;
  entity_kind?: RuntimeEntityKind;
  entity_id?: string;
  native_type?: string;
  projection_mode?: ProjectionMode;
  lossiness?: Lossiness;
  native_ref?: unknown;
  capabilities_snapshot?: CapabilitySnapshot;
```

- [ ] **Step 2: Write envelope normalization test**

Create `apps/bridge/test/envelope-runtime-fields.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeEnvelope } from "../src/services/envelope.js";

test("envelope preserves runtime_kind + native_ref unchanged", () => {
  const e = normalizeEnvelope(
    { message: "x", runtime_kind: "hermes", runtime_id: "h1", projection_mode: "partial", lossiness: "lossy", native_ref: { foo: 1 } },
    { authorContext: { kind: "agent", id: "a" }, midThread: true, parentMsgIdFallback: "p" },
  );
  assert.equal(e.runtime_kind, "hermes");
  assert.equal(e.runtime_id, "h1");
  assert.equal(e.projection_mode, "partial");
  assert.equal(e.lossiness, "lossy");
  assert.deepEqual(e.native_ref, { foo: 1 });
});

test("envelope defaults projection_mode to exact when runtime_kind set and projection_mode omitted", () => {
  const e = normalizeEnvelope(
    { message: "x", runtime_kind: "openclaw", runtime_id: "oc-main" },
    { authorContext: { kind: "agent", id: "a" }, midThread: true, parentMsgIdFallback: "p" },
  );
  assert.equal(e.projection_mode, "exact");
  assert.equal(e.lossiness, "none");
});
```

- [ ] **Step 3: Update envelope.ts**

Edit `apps/bridge/src/services/envelope.ts` `normalizeEnvelope` function. Locate the section where optional fields are propagated onto the output. Add:

```ts
  if (input.runtime_kind) out.runtime_kind = input.runtime_kind;
  if (input.runtime_id) out.runtime_id = input.runtime_id;
  if (input.entity_kind) out.entity_kind = input.entity_kind;
  if (input.entity_id) out.entity_id = input.entity_id;
  if (input.native_type) out.native_type = input.native_type;
  if (input.native_ref !== undefined) out.native_ref = input.native_ref;
  if (input.capabilities_snapshot) out.capabilities_snapshot = input.capabilities_snapshot;
  if (input.runtime_kind) {
    out.projection_mode = input.projection_mode ?? "exact";
    out.lossiness = input.lossiness ?? "none";
  } else {
    if (input.projection_mode) out.projection_mode = input.projection_mode;
    if (input.lossiness) out.lossiness = input.lossiness;
  }
```

- [ ] **Step 4: Run tests**

Run: `pnpm --filter bridge exec node --test --test-concurrency=1 --experimental-strip-types test/envelope-runtime-fields.test.ts`
Expected: 2 pass.

- [ ] **Step 5: Build + commit**

```bash
pnpm --filter @openclaw-manager/types build && pnpm --filter bridge build
git add packages/types/src/index.ts packages/types/dist apps/bridge/src/services/envelope.ts apps/bridge/test/envelope-runtime-fields.test.ts
git commit -m "$(cat <<'EOF'
feat(envelope): add runtime taxonomy fields (runtime_kind/entity_kind/projection_mode/lossiness)

Cross-runtime turns now stamp origin and declare whether their projection
into canonical envelope shape is exact, partial, or inferred. Legacy
CC<->OC turns are unaffected (fields absent => single-runtime).
EOF
)"
```

---

## Task 10: Dashboard runtime-client + list page

**Files:**
- Create: `apps/dashboard/src/lib/runtime-client.ts`
- Create: `apps/dashboard/src/app/runtimes/page.tsx`
- Create: `apps/dashboard/src/components/runtime-card.tsx`
- Modify: `apps/dashboard/src/components/app-shell.tsx` (sidebar entry)

- [ ] **Step 1: Create runtime-client**

Create `apps/dashboard/src/lib/runtime-client.ts`:

```ts
import { actorHeaders } from "./auth/bridge-actor";
import type {
  RuntimeDescriptor, CapabilitySnapshot, RuntimeEntity,
  RuntimeEntityKind, RuntimeActivityEvent, InvokeActionResult, InvokeActionHttpRequest,
} from "@openclaw-manager/types";

const BRIDGE_URL = process.env.OPENCLAW_BRIDGE_URL || "http://localhost:3100";
const BRIDGE_TOKEN = process.env.OPENCLAW_BRIDGE_TOKEN || "";

async function bridgeGet<T>(path: string): Promise<T> {
  const actor = await actorHeaders();
  const res = await fetch(`${BRIDGE_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${BRIDGE_TOKEN}`,
      ...actor,
    },
    next: { revalidate: 0 },
  });
  if (!res.ok) throw new Error(`bridge ${res.status}: ${await res.text()}`);
  return (await res.json()) as T;
}

async function bridgePost<T>(path: string, body: unknown): Promise<T> {
  const actor = await actorHeaders();
  const res = await fetch(`${BRIDGE_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${BRIDGE_TOKEN}`,
      ...actor,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`bridge ${res.status}: ${await res.text()}`);
  return (await res.json()) as T;
}

export async function listRuntimes(): Promise<RuntimeDescriptor[]> {
  const { runtimes } = await bridgeGet<{ runtimes: RuntimeDescriptor[] }>("/runtimes");
  return runtimes;
}

export async function getRuntime(id: string): Promise<{ descriptor: RuntimeDescriptor; health: { ok: boolean; detail?: string } }> {
  return bridgeGet(`/runtimes/${encodeURIComponent(id)}`);
}

export async function getCapabilities(id: string): Promise<CapabilitySnapshot> {
  return bridgeGet(`/runtimes/${encodeURIComponent(id)}/capabilities`);
}

export async function listEntities(id: string, kind: RuntimeEntityKind): Promise<RuntimeEntity[]> {
  const { entities } = await bridgeGet<{ entities: RuntimeEntity[] }>(`/runtimes/${encodeURIComponent(id)}/entities/${kind}`);
  return entities;
}

export async function listActivity(id: string, limit = 50): Promise<RuntimeActivityEvent[]> {
  const { events } = await bridgeGet<{ events: RuntimeActivityEvent[] }>(`/runtimes/${encodeURIComponent(id)}/activity?limit=${limit}`);
  return events;
}

// Dashboard sends the http-request shape (no actor — bridge stamps it from
// the authenticated session). This is enforced on both ends by the type
// system and by the route's ignore-body-actor behavior.
export async function invokeRuntimeAction(id: string, req: InvokeActionHttpRequest): Promise<InvokeActionResult> {
  return bridgePost(`/runtimes/${encodeURIComponent(id)}/actions`, req);
}
```

- [ ] **Step 2: Create RuntimeCard component**

Create `apps/dashboard/src/components/runtime-card.tsx`:

```tsx
import Link from "next/link";
import type { RuntimeDescriptor } from "@openclaw-manager/types";

export function RuntimeCard({ descriptor, healthy }: { descriptor: RuntimeDescriptor; healthy: boolean | null }) {
  const dot = healthy === true ? "bg-emerald-500" : healthy === false ? "bg-red-500" : "bg-neutral-500";
  return (
    <Link href={`/runtimes/${encodeURIComponent(descriptor.id)}`} className="block border border-neutral-800 hover:border-neutral-600 rounded-lg p-4 bg-neutral-900/40">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm uppercase tracking-wide text-neutral-400">{descriptor.kind}</div>
          <div className="text-lg font-semibold text-neutral-100">{descriptor.displayName}</div>
          <div className="text-xs text-neutral-500 mt-1">{descriptor.endpoint}</div>
        </div>
        <div className={`w-3 h-3 rounded-full ${dot}`} aria-label={healthy === true ? "healthy" : healthy === false ? "unhealthy" : "unknown"} />
      </div>
    </Link>
  );
}
```

- [ ] **Step 3: Create /runtimes page**

Create `apps/dashboard/src/app/runtimes/page.tsx`:

```tsx
import { listRuntimes, getRuntime } from "../../lib/runtime-client";
import { RuntimeCard } from "../../components/runtime-card";
import { requireAuthPage } from "../../lib/auth/require-auth";

export const dynamic = "force-dynamic";

export default async function RuntimesPage() {
  await requireAuthPage("runtimes.view");
  const descriptors = await listRuntimes();
  const withHealth = await Promise.all(
    descriptors.map(async (d) => {
      try { const r = await getRuntime(d.id); return { d, healthy: r.health.ok }; }
      catch { return { d, healthy: null as boolean | null }; }
    }),
  );

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-neutral-100">Runtimes</h1>
        <p className="text-sm text-neutral-400">Local agent runtimes wired into this manager.</p>
      </div>
      {withHealth.length === 0 ? (
        <div className="text-neutral-400 text-sm">No runtimes configured. Edit <code>runtimes.json</code> on the bridge host.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {withHealth.map(({ d, healthy }) => <RuntimeCard key={d.id} descriptor={d} healthy={healthy} />)}
        </div>
      )}
    </div>
  );
}
```

**Note on `requireAuthPage`:** if the dashboard uses a differently-named helper (e.g. `requireAuth`, `requirePermissionPage`), use the existing one. Check `apps/dashboard/src/lib/auth/` for the actual import path and signature before this step. Pass the `runtimes.view` permission id added in Task 1.

- [ ] **Step 4: Add sidebar entry**

Edit `apps/dashboard/src/components/app-shell.tsx`. Locate the nav entries array (likely an `items` or `navigation` const) and add an entry, using whatever icon token the project uses for agent/runtime concepts:

```ts
{ id: "runtimes", label: "Runtimes", href: "/runtimes", icon: "cube", perm: "runtimes.view" },
```

- [ ] **Step 5: Verify dashboard builds**

Run: `pnpm --filter dashboard build`
Expected: exits 0.

- [ ] **Step 6: Commit**

```bash
git add apps/dashboard/src/lib/runtime-client.ts apps/dashboard/src/components/runtime-card.tsx apps/dashboard/src/app/runtimes/page.tsx apps/dashboard/src/components/app-shell.tsx
git commit -m "feat(dashboard): /runtimes list page + sidebar entry gated by runtimes.view"
```

---

## Task 11: Dashboard runtime detail page

**Files:**
- Create: `apps/dashboard/src/app/runtimes/[runtimeId]/page.tsx`
- Create: `apps/dashboard/src/components/capability-badges.tsx`
- Create: `apps/dashboard/src/components/runtime-activity-list.tsx`

- [ ] **Step 1: CapabilityBadges**

Create `apps/dashboard/src/components/capability-badges.tsx`:

```tsx
import type { CapabilitySnapshot, PartialCapability } from "@openclaw-manager/types";

function pill(id: string, cls: string, key: string) {
  return <span key={key} className={`text-xs px-2 py-0.5 rounded border ${cls}`}>{id}</span>;
}

function partialPill(p: PartialCapability) {
  return (
    <span
      key={p.id}
      title={`${p.reason} (${p.projectionMode}, ${p.lossiness})`}
      className="text-xs px-2 py-0.5 rounded border border-amber-700 text-amber-300 bg-amber-900/20 cursor-help"
    >
      {p.id} <span className="text-amber-500/70">• {p.projectionMode}</span>
    </span>
  );
}

export function CapabilityBadges({ snapshot }: { snapshot: CapabilitySnapshot }) {
  return (
    <div className="space-y-3">
      {snapshot.supported.length > 0 && (
        <div>
          <div className="text-xs uppercase tracking-wide text-neutral-500 mb-1">Supported</div>
          <div className="flex flex-wrap gap-1.5">
            {snapshot.supported.map((id) => pill(id, "border-emerald-700 text-emerald-300 bg-emerald-900/20", id))}
          </div>
        </div>
      )}
      {snapshot.partial.length > 0 && (
        <div>
          <div className="text-xs uppercase tracking-wide text-neutral-500 mb-1">Partial</div>
          <div className="flex flex-wrap gap-1.5">
            {snapshot.partial.map((p) => partialPill(p))}
          </div>
          <div className="mt-1 text-[10px] text-neutral-500">Hover a partial badge to see why the projection is lossy.</div>
        </div>
      )}
      {snapshot.unsupported.length > 0 && (
        <div>
          <div className="text-xs uppercase tracking-wide text-neutral-500 mb-1">Unsupported</div>
          <div className="flex flex-wrap gap-1.5">
            {snapshot.unsupported.map((id) => pill(id, "border-neutral-700 text-neutral-500 bg-neutral-900/20", id))}
          </div>
        </div>
      )}
      <div className="text-xs text-neutral-500">Adapter contract {snapshot.version}{snapshot.runtimeVersion ? ` · runtime ${snapshot.runtimeVersion}` : ""}</div>
    </div>
  );
}
```

- [ ] **Step 2: RuntimeActivityList**

Create `apps/dashboard/src/components/runtime-activity-list.tsx`:

```tsx
import type { RuntimeActivityEvent } from "@openclaw-manager/types";

export function RuntimeActivityList({ events }: { events: RuntimeActivityEvent[] }) {
  if (events.length === 0) return <div className="text-sm text-neutral-500">No recent activity.</div>;
  return (
    <ul className="space-y-1.5 text-sm">
      {events.map((e, i) => (
        <li key={`${e.at}-${i}`} className="flex gap-3 items-start border-b border-neutral-900 pb-1.5">
          <span className="text-xs text-neutral-500 shrink-0 w-24">{new Date(e.at).toISOString().slice(11, 19)}</span>
          <span className="text-xs uppercase tracking-wide text-neutral-400 shrink-0 w-28">{e.eventKind}</span>
          <span className={`text-xs shrink-0 w-16 ${e.projectionMode === "exact" ? "text-emerald-400" : e.projectionMode === "partial" ? "text-amber-400" : "text-neutral-500"}`}>{e.projectionMode}</span>
          <span className="text-neutral-200 flex-1 truncate">{e.text ?? "—"}</span>
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 3: Detail page**

Create `apps/dashboard/src/app/runtimes/[runtimeId]/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { getRuntime, getCapabilities, listActivity } from "../../../lib/runtime-client";
import { CapabilityBadges } from "../../../components/capability-badges";
import { RuntimeActivityList } from "../../../components/runtime-activity-list";
import { requireAuthPage } from "../../../lib/auth/require-auth";

export const dynamic = "force-dynamic";

export default async function RuntimeDetail({ params }: { params: Promise<{ runtimeId: string }> }) {
  await requireAuthPage("runtimes.view");
  const { runtimeId } = await params;
  let info, caps, events;
  try { info = await getRuntime(runtimeId); }
  catch { notFound(); }
  try { caps = await getCapabilities(runtimeId); } catch { caps = null; }
  try { events = await listActivity(runtimeId, 50); } catch { events = []; }

  return (
    <div className="p-6 space-y-6">
      <div>
        <div className="text-xs uppercase tracking-wide text-neutral-500">{info!.descriptor.kind} · {info!.descriptor.transport}</div>
        <h1 className="text-2xl font-semibold text-neutral-100">{info!.descriptor.displayName}</h1>
        <div className="text-sm text-neutral-500">{info!.descriptor.endpoint}</div>
        <div className={`mt-2 text-xs px-2 py-0.5 inline-block rounded border ${info!.health.ok ? "border-emerald-700 text-emerald-300" : "border-red-700 text-red-300"}`}>
          {info!.health.ok ? "Healthy" : `Unhealthy: ${info!.health.detail ?? "no detail"}`}
        </div>
      </div>

      <section>
        <h2 className="text-lg font-medium text-neutral-200 mb-2">Capabilities</h2>
        {caps ? <CapabilityBadges snapshot={caps} /> : <div className="text-sm text-red-400">Capabilities unavailable.</div>}
      </section>

      <section>
        <h2 className="text-lg font-medium text-neutral-200 mb-2">Recent activity</h2>
        <RuntimeActivityList events={events ?? []} />
      </section>
    </div>
  );
}
```

- [ ] **Step 4: Build dashboard**

Run: `pnpm --filter dashboard build`
Expected: exits 0.

- [ ] **Step 5: Commit**

```bash
git add apps/dashboard/src/components/capability-badges.tsx apps/dashboard/src/components/runtime-activity-list.tsx apps/dashboard/src/app/runtimes/[runtimeId]/page.tsx
git commit -m "feat(dashboard): runtime detail page — capabilities + recent activity with projection-mode coloring"
```

---

## Task 12: Add runtime permissions to system roles

**Files:**
- Modify: `apps/bridge/src/services/auth/service.ts` (add `runtimes.view` + `runtimes.invoke` to admin system role grants)
- Modify: `apps/dashboard/src/lib/auth/permission-gate.tsx` or wherever `PermissionGate` resolves perms, if needed (no change if perm ids are already plumbed via `ALL_PERMISSION_IDS`)

- [ ] **Step 1: Add perms to admin role grant list**

Edit `apps/bridge/src/services/auth/service.ts`. Locate `SYSTEM_ROLES` (or equivalent constant) and add to the admin role's `grants` the two ids from Task 1:

```ts
  "runtimes.view",
  "runtimes.invoke",
```

If there is a viewer / operator role also defined, add `runtimes.view` (view-only) to it.

- [ ] **Step 2: Build bridge**

Run: `pnpm --filter bridge build`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add apps/bridge/src/services/auth/service.ts
git commit -m "feat(auth): grant runtimes.view + runtimes.invoke to admin system role"
```

---

## Task 13: Smoke test + docs

**Files:**
- Create: `docs/RUNTIMES.md`
- Create: `scripts/smoke-runtimes.mjs`
- Modify: `package.json` (add `smoke:runtimes` script)
- Create: `docs/superpowers/specs/2026-04-23-multi-runtime-control-plane.md`

- [ ] **Step 1: Write RUNTIMES.md**

Create `docs/RUNTIMES.md`:

````markdown
# Runtime Adapters

OpenClaw-Manager is a multi-runtime control plane. Each external agent runtime is exposed through an adapter that implements the `RuntimeAdapter` contract in `packages/types/src/runtimes.ts`.

## Design principles

1. **Capability-aware, not lowest-common-denominator.** Adapters declare `supported` / `partial` / `unsupported` capabilities; the dashboard grays out unsupported actions rather than faking them.
2. **Native-first, canonical-projected.** Cross-runtime events carry a `projection_mode` (exact/partial/inferred) and a `native_ref` with verbatim runtime payload, so debugging is never blind.
3. **MCP is transport, not ontology.** Nanobot is MCP-native; for the others, MCP may be an invocation surface but the control-plane model is richer (lifecycle, approvals, audit).

## Adding a new adapter

1. Add the runtime kind to `RuntimeKind` union in `packages/types/src/runtimes.ts` (requires Phase 2 migration — not a hot swap).
2. Create `apps/bridge/src/services/runtimes/<name>.ts` implementing `RuntimeAdapter`.
3. Register a factory in `apps/bridge/src/services/runtimes/factories.ts`.
4. Add the runtime descriptor to `runtimes.json` (in `MANAGEMENT_DIR`).
5. Write unit tests using the dependency-injected adapter pattern (see `runtimes-openclaw-adapter.test.ts`).

## runtimes.json shape

```json
{
  "runtimes": [
    { "id": "oc-main", "kind": "openclaw", "displayName": "OpenClaw (local)",
      "endpoint": "http://127.0.0.1:18789", "transport": "sdk", "authMode": "token-env" }
  ]
}
```

Per-runtime env vars:

| Kind | Env | Purpose |
|---|---|---|
| openclaw | `OPENCLAW_GATEWAY_TOKEN`, `OPENCLAW_SDK_PATH` | Existing gateway wiring |
| hermes | `HERMES_TOKEN` | Bearer for Hermes HTTP API |
| zeroclaw | `ZEROCLAW_TOKEN` | Bearer for ZeroClaw HTTP API |
| nanobot | — | MCP-stdio transport; the endpoint `mcp:stdio:<cmd>` is the spawn command |

## Phase 1 scope vs. Phase 2

Phase 1 (shipped) — full OpenClaw coverage, honest health + describe + capabilities stubs for the other three, one-way action dispatch through `/runtimes/:id/actions`, and a dashboard runtime list + detail view.

Phase 2 (not yet) — deep Hermes / ZeroClaw / Nanobot coverage, write actions per capability, federated per-runtime user mapping, cross-runtime activity aggregation, subscription-based activity stream.
````

- [ ] **Step 2: Write spec doc**

Create `docs/superpowers/specs/2026-04-23-multi-runtime-control-plane.md`:

```markdown
# Multi-Runtime Control Plane — Spec

## Why

Users running local agent runtimes increasingly mix OpenClaw with alternatives — Hermes, ZeroClaw, Nanobot. Running four dashboards with four auth setups and four mental models is worse than any one of them. OpenClaw-Manager should become the single pane of glass, but it must stay honest about what each runtime actually supports.

## What

A capability-aware control plane. One `RuntimeAdapter` contract is implemented per runtime. The dashboard renders a runtime-agnostic shell (list, detail, activity) plus runtime-specific extension panels.

## Key decisions

1. **Shape: A (Adapter-per-runtime) with capabilities, not lowest-common-denominator.**
2. **Envelope: canonical projection over native refs** — `runtime_kind`, `native_ref`, `projection_mode`, `lossiness` stamped on cross-runtime turns.
3. **Auth (Phase 1): bridge service principal with explicit actor stamping.** Federated per-runtime user mapping deferred to Phase 2.
4. **ZeroClaw Rust: no in-process coupling.** HTTP/MCP only in Phase 1; companion sidecar evaluated in Phase 3 if trait introspection proves essential.
5. **MCP is transport, not the semantic center.** Nanobot uses MCP-native; the others do not unify on MCP.

## Non-goals (Phase 1)

- Write parity across all four runtimes.
- Cross-runtime orchestration (broadcast a turn, migrate a session).
- Runtime-native UI parity in depth.

## Implementation plan

See `docs/superpowers/plans/2026-04-23-multi-runtime-control-plane.md`.
```

- [ ] **Step 3: Create smoke script**

Create `scripts/smoke-runtimes.mjs`:

```js
#!/usr/bin/env node
// Smoke test: lists runtimes, capabilities, and health per runtime.
// Usage: BRIDGE_URL=http://127.0.0.1:3100 BRIDGE_TOKEN=... X_OCM_ACTOR=... node scripts/smoke-runtimes.mjs

const BRIDGE_URL = process.env.BRIDGE_URL || "http://127.0.0.1:3100";
const BRIDGE_TOKEN = process.env.BRIDGE_TOKEN;
const ACTOR = process.env.X_OCM_ACTOR;
if (!BRIDGE_TOKEN) { console.error("BRIDGE_TOKEN required"); process.exit(1); }
if (!ACTOR) { console.error("X_OCM_ACTOR (signed actor assertion) required — /runtimes is strict"); process.exit(1); }

const headers = { Authorization: `Bearer ${BRIDGE_TOKEN}`, "x-ocm-actor": ACTOR, "Content-Type": "application/json" };

async function j(path) {
  const r = await fetch(`${BRIDGE_URL}${path}`, { headers });
  if (!r.ok) throw new Error(`${path} ${r.status}: ${await r.text()}`);
  return r.json();
}

const { runtimes } = await j("/runtimes");
console.log(`${runtimes.length} runtimes configured`);
for (const d of runtimes) {
  try {
    const info = await j(`/runtimes/${encodeURIComponent(d.id)}`);
    const caps = await j(`/runtimes/${encodeURIComponent(d.id)}/capabilities`);
    console.log(`- ${d.id} (${d.kind}) health=${info.health.ok ? "OK" : "FAIL"} supported=${caps.supported.length} partial=${caps.partial.length} unsupported=${caps.unsupported.length}`);
  } catch (e) {
    console.log(`- ${d.id} (${d.kind}) ERROR: ${e.message}`);
  }
}
```

- [ ] **Step 4: Register script**

Edit `package.json`. Inside `scripts`, add:

```json
"smoke:runtimes": "node scripts/smoke-runtimes.mjs"
```

- [ ] **Step 5: Manual smoke test**

Run: `BRIDGE_URL=http://127.0.0.1:3100 BRIDGE_TOKEN=<token> X_OCM_ACTOR=<actor> pnpm smoke:runtimes`
Expected output: lists the `oc-main` runtime with health OK and a count of supported capabilities matching the adapter implementation (15 supported ids from Task 3).

- [ ] **Step 6: Commit**

```bash
git add docs/RUNTIMES.md docs/superpowers/specs/2026-04-23-multi-runtime-control-plane.md scripts/smoke-runtimes.mjs package.json
git commit -m "docs + smoke: runtime adapter guide, spec, and smoke script"
```

---

## Task 14: AGENTS.md update

**Files:**
- Modify: `AGENTS.md`

- [ ] **Step 1: Append Runtimes section**

Edit `AGENTS.md`. Add a new section after the existing "Claude Code ↔ OpenClaw" section:

```markdown
## Runtimes (multi-runtime control plane)

OpenClaw-Manager acts as a control plane over multiple local agent runtimes. Phase 1 covers OpenClaw (full) plus honest stubs for Hermes Agent, ZeroClaw, and Nanobot — health + describe + capability snapshot, no write actions.

- Contract: `packages/types/src/runtimes.ts` (`RuntimeAdapter`, `CapabilitySnapshot`, `RuntimeEntity`, `RuntimeActivityEvent`).
- Registry: `apps/bridge/src/services/runtimes/registry.ts`, config at `$MANAGEMENT_DIR/runtimes.json`.
- Adapters: `apps/bridge/src/services/runtimes/{openclaw,hermes,zeroclaw,nanobot}.ts`.
- Routes: `/runtimes`, `/runtimes/:id`, `/runtimes/:id/capabilities`, `/runtimes/:id/entities/:kind`, `/runtimes/:id/activity`, `/runtimes/:id/actions` (all strict-actor gated).
- Permissions: `runtimes.view`, `runtimes.invoke`.
- Dashboard: `/runtimes` (list), `/runtimes/[runtimeId]` (detail with capability badges + activity).

Full guide: [`docs/RUNTIMES.md`](docs/RUNTIMES.md).
```

- [ ] **Step 2: Commit**

```bash
git add AGENTS.md
git commit -m "docs(agents): describe multi-runtime control plane Phase 1"
```

---

## Self-review

**Spec coverage:**
- Shape (A+capabilities) → Tasks 1, 2, 3, 4, 5, 6, 7, 8.
- Envelope taxonomy → Task 9.
- Auth (service principal + bridge-stamped actor, capability gate) → Task 8 (route constructs actor from `req.auth`, enforces `requirePerm`, rejects unsupported capabilities) + Task 12.
- ZeroClaw no-in-process → Task 5 HTTP-only stub.
- MCP-as-transport → Task 6 uses MCP client for Nanobot only.
- Honest degradation → Tasks 4/5 use structured `PartialCapability` with reason/projectionMode/lossiness; dashboard (Task 11) renders each with a colored badge.
- Smoke test → Task 13.
- Docs → Tasks 13, 14.

**Gaps noted:**
- Cross-runtime activity aggregation (single feed across all runtimes) — deferred to Phase 2.
- Dashboard API routes (`apps/dashboard/src/app/api/runtimes/*`) — server components in Tasks 10/11 call the bridge directly server-side via `runtime-client.ts` (matches the existing `bridge-client.ts` / `actorHeaders` pattern).
- `subscribeActivity` + `resolveActor` — deliberately out of the Phase 1 contract; added to Phase 2 roadmap.

**Codex review pass (applied):**
- **must-fix** Task 8 privilege escalation — route now constructs `actor` from `req.auth.user.id` + a bridge-owned `managerServiceId`; body-supplied actor is ignored. Test case asserts this specifically.
- **must-fix** Task 8 authorization — `requirePerm("runtimes.view")` gates reads, `requirePerm("runtimes.view", "runtimes.invoke")` gates `POST /actions`, and the action route additionally rejects capabilities the adapter marked `unsupported`.
- **must-fix** Task 6 Nanobot lifecycle — adapter connects lazily once; repeated calls reuse the connection; `dispose()` closes the transport; failed connects clear the cached promise so a retry can succeed. Tests cover both.
- **should-fix** structured `PartialCapability` with `reason` + `projectionMode` + `lossiness` replaces the flat id list.
- **should-fix** contract `unknown` leaks tightened to `JsonValue`; `InvokeActionResult` is now a discriminated union.
- **should-fix** contract / architecture header mismatch resolved — `subscribeActivity` / `resolveActor` explicitly called out as Phase 2.
- **should-fix** health probes are configurable via `descriptor.healthPath`; empty string disables the probe.
- **should-fix** Hermes/ZeroClaw tests now inject `HttpClient` instead of binding real ports.

**Placeholder scan:** every task carries runnable code. `requireAuthPage("runtimes.view")` in Tasks 10/11 carries an explicit note to verify the dashboard's actual helper name/signature before copying.

**Type consistency:** `RuntimeAdapter` in Task 1 matches implementations in Tasks 3–6; `InvokeActionHttpRequest` is used on the wire (dashboard client + route body) while `InvokeActionRequest` is the adapter-facing shape with the bridge-stamped actor; `PartialCapability` is used consistently across Hermes + ZeroClaw tests and dashboard `CapabilityBadges`.

---

## Phase 2 roadmap (not in this plan)

1. Deep Hermes adapter: real endpoint mapping (skills, scheduler, memory, channels); write actions once we validate auth mode.
2. Deep ZeroClaw adapter: HTTP/MCP introspection; agent matrix; channel status polling.
3. Deep Nanobot adapter: tool invocation through MCP with audited actor; session/execution visibility.
4. Federated per-runtime user mapping: `RuntimeIdentityLink` table, delegated + asserted modes; UI shows who-via-which-service-against-which-runtime.
5. Cross-runtime activity aggregator: `/activity?runtimeId=all` with synthesized event stream and source markers.
6. Subscribe API: WS `/runtimes/:id/subscribe` with backpressure, driven by adapter `subscribeActivity`.

## Phase 3 roadmap

- ZeroClaw companion Rust sidecar (only if HTTP/MCP introspection proves too narrow).
- Cross-runtime orchestration actions (broadcast turn, migrate session context, hand-off between runtimes).
- Upstream PRs to Hermes / ZeroClaw / Nanobot to formalize the introspection surfaces Phase 2 ends up relying on.
