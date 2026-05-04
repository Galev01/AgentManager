# Hermes Runtime Integration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Promote Hermes from Phase-1 stub to first-class runtime with a thin HTTP shim on the remote host, plus settings UI to enable/disable connections and pick a primary runtime.

**Architecture:** Bridge talks HTTP+bearer to a Python FastAPI shim Gal runs on `192.168.0.10` (default deployment uses an SSH local forward `-L 19119:127.0.0.1:9119` to keep Hermes's loopback posture). New `/runtime-config` GET+PATCH on the bridge holds `enabled` + `configuredPrimaryRuntimeId`; effective primary computed every read. WhatsApp / Claude-code / YouTube callsites stay on `callGateway` — no routing-abstraction refactor in this phase.

**Tech Stack:** TypeScript (Node.js + Express on bridge, Next.js 15 App Router on dashboard), Python 3 + FastAPI for the shim, Vitest/`node:test` for backend tests, pnpm monorepo.

**Spec:** `docs/superpowers/specs/2026-05-04-hermes-runtime-integration-design.md`

---

## File Structure

### Shared types (touched by A + C)

- Modify `packages/types/src/runtimes.ts` — extend `RuntimeDescriptor` with `enabled`, extend `CapabilitySnapshot` with `source` + `stale`, add `RuntimeStatus`, `RuntimeConfigSnapshot`, `RuntimeConfigPatch`, `FallbackReason`.
- Modify `packages/types/src/auth/permissions.ts` — add `runtimes.config`.
- Modify `packages/types/src/index.ts` — re-export new symbols if needed.

### Agent A — Settings/config (bridge)

- Create `apps/bridge/src/services/runtime-config.ts` — read/validate/write `runtimes.json` atomically, compute fallback.
- Modify `apps/bridge/src/services/runtimes/registry.ts` — accept extended descriptor, expose status tri-state.
- Modify `apps/bridge/src/services/runtimes/hermes.ts` — short prelude only; full rewrite is C.
- Create `apps/bridge/src/routes/runtime-config.ts` — GET + PATCH.
- Modify `apps/bridge/src/server.ts` — mount the new router.
- Create `apps/bridge/test/runtime-config-service.test.ts`.
- Create `apps/bridge/test/runtime-config-routes.test.ts`.
- Modify `apps/bridge/test/runtimes-registry.test.ts` — back-compat case for missing `enabled`.

### Agent B — Dashboard UX

- Create `apps/dashboard/src/lib/runtime-config-client.ts` — bridge-client wrapper.
- Create `apps/dashboard/src/components/settings/runtimes-section.tsx` — toggle + primary radio + banner.
- Modify `apps/dashboard/src/app/settings/page.tsx` — mount new section.
- Modify `apps/dashboard/src/app/runtimes/page.tsx` — filter disabled, primary badge, fallback banner.
- Modify `apps/dashboard/src/app/runtimes/[runtimeId]/page.tsx` — disabled banner, skip probes.
- Create `apps/dashboard/src/components/runtime-fallback-banner.tsx` — shared banner.

### Agent C — Hermes shim + adapter

- Create `packages/hermes-shim/pyproject.toml`.
- Create `packages/hermes-shim/README.md` — install, run, systemd, security notes.
- Create `packages/hermes-shim/hermes_shim/__init__.py`.
- Create `packages/hermes-shim/hermes_shim/server.py` — FastAPI app, auth, endpoints.
- Create `packages/hermes-shim/hermes_shim/cli.py` — uvicorn entry point with bind-safety.
- Create `packages/hermes-shim/systemd/hermes-shim.service.template`.
- Create `packages/hermes-shim/tests/test_server.py`.
- Rewrite `apps/bridge/src/services/runtimes/hermes.ts` against shim contract.
- Rewrite `apps/bridge/test/runtimes-hermes-adapter.test.ts` with in-memory fake shim.

---

## Shared interface freeze (do this FIRST, before A/B/C diverge)

### Task 0: Freeze shared types and permission

**Files:**
- Modify: `packages/types/src/runtimes.ts`
- Modify: `packages/types/src/auth/permissions.ts`

- [ ] **Step 1: Extend `RuntimeDescriptor` with `enabled`**

In `packages/types/src/runtimes.ts`, change the `RuntimeDescriptor` type to add an optional `enabled` field (default-true via registry, see Task A1):

```ts
export type RuntimeDescriptor = {
  id: string;
  kind: RuntimeKind;
  displayName: string;
  endpoint: string;
  transport: "http" | "ws" | "mcp-stdio" | "sdk";
  authMode: "bearer" | "token-env" | "mcp-none";
  healthPath?: string;
  notes?: string;
  enabled?: boolean;          // missing = true (back-compat)
};
```

- [ ] **Step 2: Add `RuntimeStatus` tri-state**

Append to `packages/types/src/runtimes.ts`:

```ts
export type RuntimeStatus =
  | { state: "disabled" }
  | { state: "healthy"; detail?: string }
  | { state: "unhealthy"; detail: string };
```

- [ ] **Step 3: Extend `CapabilitySnapshot` with provenance**

Modify `CapabilitySnapshot` in `packages/types/src/runtimes.ts`:

```ts
export type CapabilitySnapshot = {
  supported: CapabilityId[];
  partial: PartialCapability[];
  unsupported: CapabilityId[];
  version: string;
  runtimeVersion?: string;
  source: "runtime-reported" | "static-adapter";
  stale: boolean;
};
```

- [ ] **Step 4: Add config snapshot + patch + fallback types**

Append to `packages/types/src/runtimes.ts`:

```ts
export type FallbackReason =
  | "configured_primary_disabled"
  | "configured_primary_missing";

export type RuntimeConfigDescriptor = RuntimeDescriptor & {
  enabled: boolean;             // resolved (defaulted) by registry/service
  status: RuntimeStatus;
};

export type RuntimeConfigSnapshot = {
  configuredPrimaryRuntimeId: string | null;
  effectivePrimaryRuntimeId: string | null;
  fallbackReason: FallbackReason | null;
  runtimes: RuntimeConfigDescriptor[];
};

export type RuntimeConfigPatch = {
  configuredPrimaryRuntimeId?: string;
  enabled?: { [runtimeId: string]: boolean };
};
```

- [ ] **Step 5: Add `runtimes.config` permission**

In `packages/types/src/auth/permissions.ts`, add to `PERMISSION_REGISTRY`:

```ts
"runtimes.config":            { category: "runtimes",       label: "Configure runtimes",        description: "Toggle runtime enable + select primary runtime." },
```

- [ ] **Step 6: Build types package**

Run: `pnpm --filter @openclaw-manager/types build`
Expected: PASS, no type errors.

- [ ] **Step 7: Commit**

```bash
git add packages/types/src/runtimes.ts packages/types/src/auth/permissions.ts
git commit -m "types: extend runtimes with enabled, status, config snapshot, runtimes.config permission"
```

---

## Agent A — Settings/config (bridge)

### Task A1: Registry back-compat for `enabled`

**Files:**
- Modify: `apps/bridge/src/services/runtimes/registry.ts`
- Modify: `apps/bridge/test/runtimes-registry.test.ts`

- [ ] **Step 1: Add failing test — missing `enabled` defaults to true**

Append to `apps/bridge/test/runtimes-registry.test.ts`:

```ts
test("registry treats missing enabled as true", async () => {
  const path = await tempJsonFile({
    runtimes: [{ id: "oc-main", kind: "openclaw", displayName: "OC", endpoint: "x", transport: "sdk", authMode: "token-env" }],
  });
  const r = await createRuntimeRegistry({ configPath: path });
  const list = await r.list();
  assert.equal(list[0].enabled, true);
});
```

(`tempJsonFile` already exists in the test helpers; if not, write a 4-line helper that writes JSON to `os.tmpdir()`.)

- [ ] **Step 2: Run test — confirm FAIL**

Run: `pnpm --filter @openclaw-manager/bridge test runtimes-registry`
Expected: FAIL — `list[0].enabled` is `undefined`.

- [ ] **Step 3: Fix the registry to default `enabled: true`**

In `apps/bridge/src/services/runtimes/registry.ts`, after `parsed.runtimes.forEach(assertDescriptor)`, normalize:

```ts
const descriptors: RuntimeDescriptor[] = (parsed.runtimes as RuntimeDescriptor[]).map((d) => ({
  ...d,
  enabled: d.enabled ?? true,
}));
```

(Replace the existing `const descriptors = parsed.runtimes as RuntimeDescriptor[];` line.)

- [ ] **Step 4: Run test — confirm PASS**

Run: `pnpm --filter @openclaw-manager/bridge test runtimes-registry`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/bridge/src/services/runtimes/registry.ts apps/bridge/test/runtimes-registry.test.ts
git commit -m "bridge(runtimes): default enabled=true for legacy descriptors"
```

---

### Task A2: `runtime-config` service — read + fallback computation

**Files:**
- Create: `apps/bridge/src/services/runtime-config.ts`
- Test: `apps/bridge/test/runtime-config-service.test.ts`

- [ ] **Step 1: Write failing tests — read snapshot + fallback states**

Create `apps/bridge/test/runtime-config-service.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRuntimeConfigService } from "../src/services/runtime-config.js";

async function tempConfig(json: unknown) {
  const dir = await mkdtemp(path.join(tmpdir(), "rc-"));
  const p = path.join(dir, "runtimes.json");
  await writeFile(p, JSON.stringify(json), "utf8");
  return p;
}

const probe = async () => ({ state: "healthy" as const });

test("reads snapshot with all enabled, configured primary healthy", async () => {
  const p = await tempConfig({
    configuredPrimaryRuntimeId: "oc-main",
    runtimes: [
      { id: "oc-main", kind: "openclaw", displayName: "OC", endpoint: "x", transport: "sdk", authMode: "token-env", enabled: true },
      { id: "hermes-remote", kind: "hermes", displayName: "H", endpoint: "y", transport: "http", authMode: "bearer", enabled: true },
    ],
  });
  const svc = createRuntimeConfigService({ configPath: p, probeStatus: probe });
  const s = await svc.read();
  assert.equal(s.configuredPrimaryRuntimeId, "oc-main");
  assert.equal(s.effectivePrimaryRuntimeId, "oc-main");
  assert.equal(s.fallbackReason, null);
  assert.equal(s.runtimes.length, 2);
});

test("falls back when configured primary is disabled", async () => {
  const p = await tempConfig({
    configuredPrimaryRuntimeId: "hermes-remote",
    runtimes: [
      { id: "oc-main", kind: "openclaw", displayName: "OC", endpoint: "x", transport: "sdk", authMode: "token-env", enabled: true },
      { id: "hermes-remote", kind: "hermes", displayName: "H", endpoint: "y", transport: "http", authMode: "bearer", enabled: false },
    ],
  });
  const svc = createRuntimeConfigService({ configPath: p, probeStatus: probe });
  const s = await svc.read();
  assert.equal(s.effectivePrimaryRuntimeId, "oc-main");
  assert.equal(s.fallbackReason, "configured_primary_disabled");
});

test("falls back when configured primary is missing", async () => {
  const p = await tempConfig({
    configuredPrimaryRuntimeId: "nonexistent",
    runtimes: [
      { id: "oc-main", kind: "openclaw", displayName: "OC", endpoint: "x", transport: "sdk", authMode: "token-env", enabled: true },
    ],
  });
  const svc = createRuntimeConfigService({ configPath: p, probeStatus: probe });
  const s = await svc.read();
  assert.equal(s.effectivePrimaryRuntimeId, "oc-main");
  assert.equal(s.fallbackReason, "configured_primary_missing");
});

test("disabled runtime has status disabled, probe NOT called", async () => {
  const p = await tempConfig({
    runtimes: [
      { id: "oc-main", kind: "openclaw", displayName: "OC", endpoint: "x", transport: "sdk", authMode: "token-env", enabled: true },
      { id: "hermes-remote", kind: "hermes", displayName: "H", endpoint: "y", transport: "http", authMode: "bearer", enabled: false },
    ],
  });
  let probeCalls = 0;
  const probeCounting = async (id: string) => {
    probeCalls++;
    return { state: "healthy" as const };
  };
  const svc = createRuntimeConfigService({ configPath: p, probeStatus: probeCounting });
  const s = await svc.read();
  assert.equal(s.runtimes.find((r) => r.id === "hermes-remote")!.status.state, "disabled");
  assert.equal(probeCalls, 1); // only oc-main
});
```

- [ ] **Step 2: Run tests — confirm FAIL**

Run: `pnpm --filter @openclaw-manager/bridge test runtime-config-service`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement `runtime-config.ts`**

Create `apps/bridge/src/services/runtime-config.ts`:

```ts
import fs from "node:fs/promises";
import type {
  RuntimeDescriptor, RuntimeConfigSnapshot, RuntimeConfigDescriptor,
  RuntimeStatus, FallbackReason, RuntimeKind,
} from "@openclaw-manager/types";

type FileShape = {
  configuredPrimaryRuntimeId?: string | null;
  runtimes: RuntimeDescriptor[];
};

export type RuntimeConfigServiceDeps = {
  configPath: string;
  probeStatus: (id: string) => Promise<RuntimeStatus>;
};

export type RuntimeConfigService = {
  read(): Promise<RuntimeConfigSnapshot>;
};

function assertDescriptor(d: unknown): asserts d is RuntimeDescriptor {
  const o = d as Record<string, unknown>;
  if (!o || typeof o.id !== "string" || typeof o.kind !== "string"
    || typeof o.displayName !== "string" || typeof o.endpoint !== "string"
    || typeof o.transport !== "string" || typeof o.authMode !== "string") {
    throw new Error("invalid runtime config: missing required descriptor field");
  }
  if (!["openclaw", "hermes", "zeroclaw", "nanobot"].includes(o.kind as RuntimeKind)) {
    throw new Error(`invalid runtime config: unknown kind '${o.kind}'`);
  }
}

async function loadFile(configPath: string): Promise<FileShape> {
  let raw: string;
  try { raw = await fs.readFile(configPath, "utf8"); }
  catch (e) { throw new Error(`invalid runtime config: cannot read ${configPath}: ${(e as Error).message}`); }
  let parsed: { runtimes?: unknown; configuredPrimaryRuntimeId?: unknown };
  try { parsed = JSON.parse(raw); }
  catch { throw new Error("invalid runtime config: not valid JSON"); }
  if (!Array.isArray(parsed.runtimes)) throw new Error("invalid runtime config: runtimes array missing");
  parsed.runtimes.forEach(assertDescriptor);
  return {
    configuredPrimaryRuntimeId:
      typeof parsed.configuredPrimaryRuntimeId === "string" ? parsed.configuredPrimaryRuntimeId :
      parsed.configuredPrimaryRuntimeId === null ? null : undefined,
    runtimes: parsed.runtimes as RuntimeDescriptor[],
  };
}

function computeEffective(
  descriptors: RuntimeDescriptor[],
  configured: string | null | undefined,
): { effective: string | null; reason: FallbackReason | null } {
  const enabled = descriptors.filter((d) => (d.enabled ?? true));
  const fallbackPick = () => {
    const oc = enabled.find((d) => d.kind === "openclaw");
    return oc?.id ?? enabled[0]?.id ?? null;
  };
  if (!configured) {
    return { effective: fallbackPick(), reason: "configured_primary_missing" };
  }
  const target = descriptors.find((d) => d.id === configured);
  if (!target) {
    return { effective: fallbackPick(), reason: "configured_primary_missing" };
  }
  if (!(target.enabled ?? true)) {
    return { effective: fallbackPick(), reason: "configured_primary_disabled" };
  }
  return { effective: target.id, reason: null };
}

export function createRuntimeConfigService(deps: RuntimeConfigServiceDeps): RuntimeConfigService {
  return {
    async read(): Promise<RuntimeConfigSnapshot> {
      const file = await loadFile(deps.configPath);
      const descriptors = file.runtimes.map((d) => ({ ...d, enabled: d.enabled ?? true }));

      const probed: RuntimeConfigDescriptor[] = await Promise.all(
        descriptors.map(async (d) => {
          if (!d.enabled) return { ...d, status: { state: "disabled" } as RuntimeStatus };
          const status = await deps.probeStatus(d.id);
          return { ...d, status };
        }),
      );

      const { effective, reason } = computeEffective(descriptors, file.configuredPrimaryRuntimeId ?? null);
      return {
        configuredPrimaryRuntimeId: file.configuredPrimaryRuntimeId ?? null,
        effectivePrimaryRuntimeId: effective,
        fallbackReason: reason,
        runtimes: probed,
      };
    },
  };
}
```

- [ ] **Step 4: Run tests — confirm PASS**

Run: `pnpm --filter @openclaw-manager/bridge test runtime-config-service`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/bridge/src/services/runtime-config.ts apps/bridge/test/runtime-config-service.test.ts
git commit -m "bridge: runtime-config service with fallback computation"
```

---

### Task A3: PATCH semantics — atomic candidate-snapshot validation

**Files:**
- Modify: `apps/bridge/src/services/runtime-config.ts`
- Modify: `apps/bridge/test/runtime-config-service.test.ts`

- [ ] **Step 1: Write failing tests for PATCH cases**

Append to `apps/bridge/test/runtime-config-service.test.ts`:

```ts
test("PATCH toggles enabled; idempotent", async () => {
  const p = await tempConfig({
    runtimes: [
      { id: "oc-main", kind: "openclaw", displayName: "OC", endpoint: "x", transport: "sdk", authMode: "token-env", enabled: true },
      { id: "hermes-remote", kind: "hermes", displayName: "H", endpoint: "y", transport: "http", authMode: "bearer", enabled: false },
    ],
  });
  const svc = createRuntimeConfigService({ configPath: p, probeStatus: probe });
  const after = await svc.patch({ enabled: { "hermes-remote": true } });
  assert.equal(after.runtimes.find((r) => r.id === "hermes-remote")!.enabled, true);
  const again = await svc.patch({ enabled: { "hermes-remote": true } });
  assert.equal(again.runtimes.find((r) => r.id === "hermes-remote")!.enabled, true);
});

test("PATCH rejects unknown id with code unknown_runtime_id", async () => {
  const p = await tempConfig({
    runtimes: [{ id: "oc-main", kind: "openclaw", displayName: "OC", endpoint: "x", transport: "sdk", authMode: "token-env", enabled: true }],
  });
  const svc = createRuntimeConfigService({ configPath: p, probeStatus: probe });
  await assert.rejects(
    svc.patch({ enabled: { "ghost": true } }),
    (e: any) => e.code === "unknown_runtime_id",
  );
});

test("PATCH rejects disabling all runtimes with code cannot_disable_all", async () => {
  const p = await tempConfig({
    runtimes: [{ id: "oc-main", kind: "openclaw", displayName: "OC", endpoint: "x", transport: "sdk", authMode: "token-env", enabled: true }],
  });
  const svc = createRuntimeConfigService({ configPath: p, probeStatus: probe });
  await assert.rejects(
    svc.patch({ enabled: { "oc-main": false } }),
    (e: any) => e.code === "cannot_disable_all",
  );
});

test("PATCH allows configured primary pointing at disabled runtime; fallback applies", async () => {
  const p = await tempConfig({
    runtimes: [
      { id: "oc-main", kind: "openclaw", displayName: "OC", endpoint: "x", transport: "sdk", authMode: "token-env", enabled: true },
      { id: "hermes-remote", kind: "hermes", displayName: "H", endpoint: "y", transport: "http", authMode: "bearer", enabled: false },
    ],
  });
  const svc = createRuntimeConfigService({ configPath: p, probeStatus: probe });
  const after = await svc.patch({ configuredPrimaryRuntimeId: "hermes-remote" });
  assert.equal(after.configuredPrimaryRuntimeId, "hermes-remote");
  assert.equal(after.effectivePrimaryRuntimeId, "oc-main");
  assert.equal(after.fallbackReason, "configured_primary_disabled");
});

test("PATCH atomic: change primary AND disable old primary in one call", async () => {
  const p = await tempConfig({
    configuredPrimaryRuntimeId: "oc-main",
    runtimes: [
      { id: "oc-main", kind: "openclaw", displayName: "OC", endpoint: "x", transport: "sdk", authMode: "token-env", enabled: true },
      { id: "hermes-remote", kind: "hermes", displayName: "H", endpoint: "y", transport: "http", authMode: "bearer", enabled: true },
    ],
  });
  const svc = createRuntimeConfigService({ configPath: p, probeStatus: probe });
  const after = await svc.patch({
    configuredPrimaryRuntimeId: "hermes-remote",
    enabled: { "oc-main": false },
  });
  assert.equal(after.configuredPrimaryRuntimeId, "hermes-remote");
  assert.equal(after.effectivePrimaryRuntimeId, "hermes-remote");
  assert.equal(after.runtimes.find((r) => r.id === "oc-main")!.enabled, false);
});
```

- [ ] **Step 2: Run tests — confirm FAIL**

Run: `pnpm --filter @openclaw-manager/bridge test runtime-config-service`
Expected: FAIL — `svc.patch` does not exist.

- [ ] **Step 3: Implement `patch` with candidate-snapshot validation**

In `apps/bridge/src/services/runtime-config.ts`:

Add to the `RuntimeConfigService` type:

```ts
export type RuntimeConfigService = {
  read(): Promise<RuntimeConfigSnapshot>;
  patch(p: RuntimeConfigPatch): Promise<RuntimeConfigSnapshot>;
};
```

Add an internal `RuntimeConfigError` class at module top:

```ts
export class RuntimeConfigError extends Error {
  constructor(public code: "unknown_runtime_id" | "cannot_disable_all", message: string) {
    super(message);
  }
}
```

Add inside `createRuntimeConfigService`'s returned object:

```ts
async patch(input: RuntimeConfigPatch): Promise<RuntimeConfigSnapshot> {
  const file = await loadFile(deps.configPath);
  const descriptors = file.runtimes.map((d) => ({ ...d, enabled: d.enabled ?? true }));

  // Build candidate snapshot
  const candidate = descriptors.map((d) => ({ ...d }));
  if (input.enabled) {
    for (const [id, want] of Object.entries(input.enabled)) {
      const target = candidate.find((d) => d.id === id);
      if (!target) {
        throw new RuntimeConfigError("unknown_runtime_id", `unknown runtime id: ${id}`);
      }
      target.enabled = want;
    }
  }
  const nextConfigured =
    input.configuredPrimaryRuntimeId !== undefined ? input.configuredPrimaryRuntimeId : (file.configuredPrimaryRuntimeId ?? null);
  if (nextConfigured && !candidate.find((d) => d.id === nextConfigured)) {
    throw new RuntimeConfigError("unknown_runtime_id", `unknown runtime id: ${nextConfigured}`);
  }
  if (!candidate.some((d) => d.enabled)) {
    throw new RuntimeConfigError("cannot_disable_all", "at least one runtime must remain enabled");
  }

  // Atomic write
  const out: FileShape = {
    configuredPrimaryRuntimeId: nextConfigured,
    runtimes: candidate,
  };
  const tmp = deps.configPath + ".tmp";
  await fs.writeFile(tmp, JSON.stringify(out, null, 2) + "\n", "utf8");
  await fs.rename(tmp, deps.configPath);

  return this.read();
},
```

(Methods inside the returned object can call `this.read()` because TS uses `this`-typed object literals fine here; if your TS settings disallow it, store `read` in a const above the return and call that instead.)

- [ ] **Step 4: Run tests — confirm PASS**

Run: `pnpm --filter @openclaw-manager/bridge test runtime-config-service`
Expected: PASS (9 tests total).

- [ ] **Step 5: Commit**

```bash
git add apps/bridge/src/services/runtime-config.ts apps/bridge/test/runtime-config-service.test.ts
git commit -m "bridge: runtime-config PATCH with candidate-snapshot validation"
```

---

### Task A4: Wire the registry into status probe

**Files:**
- Modify: `apps/bridge/src/services/runtimes/registry.ts`
- Modify: `apps/bridge/src/services/runtime-config.ts` (consume registry adapter)

- [ ] **Step 1: Add a `probeStatus` helper that wraps the adapter health**

Open `apps/bridge/src/services/runtime-config.ts`. The service currently takes a `probeStatus` injection. To wire it into the live registry, expose a factory in the same file:

Add at the bottom of `runtime-config.ts`:

```ts
import type { RuntimeRegistry } from "./runtimes/registry.js";

export function probeFromRegistry(registry: RuntimeRegistry) {
  return async (id: string): Promise<RuntimeStatus> => {
    const a = await registry.adapter(id);
    if (!a) return { state: "unhealthy", detail: "adapter unavailable" };
    try {
      const h = await a.health();
      return h.ok
        ? { state: "healthy", detail: h.detail }
        : { state: "unhealthy", detail: h.detail ?? "unhealthy" };
    } catch (e) {
      return { state: "unhealthy", detail: (e as Error).message };
    }
  };
}
```

No new tests needed; covered by integration in Task A5.

- [ ] **Step 2: Commit**

```bash
git add apps/bridge/src/services/runtime-config.ts
git commit -m "bridge: probeFromRegistry helper for runtime-config service"
```

---

### Task A5: HTTP routes — `/runtime-config` GET + PATCH

**Files:**
- Create: `apps/bridge/src/routes/runtime-config.ts`
- Modify: `apps/bridge/src/server.ts`
- Test: `apps/bridge/test/runtime-config-routes.test.ts`

- [ ] **Step 1: Write failing test — GET returns snapshot, PATCH updates**

Create `apps/bridge/test/runtime-config-routes.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import http from "node:http";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRuntimeConfigService } from "../src/services/runtime-config.js";
import { createRuntimeConfigRouter } from "../src/routes/runtime-config.js";

async function bootApp(opts: { perms: string[] }) {
  const dir = await mkdtemp(path.join(tmpdir(), "rc-rt-"));
  const cfg = path.join(dir, "runtimes.json");
  await writeFile(cfg, JSON.stringify({
    configuredPrimaryRuntimeId: "oc-main",
    runtimes: [
      { id: "oc-main", kind: "openclaw", displayName: "OC", endpoint: "x", transport: "sdk", authMode: "token-env", enabled: true },
      { id: "hermes-remote", kind: "hermes", displayName: "H", endpoint: "y", transport: "http", authMode: "bearer", enabled: false },
    ],
  }), "utf8");
  const svc = createRuntimeConfigService({
    configPath: cfg,
    probeStatus: async () => ({ state: "healthy" }),
  });
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).auth = { user: { id: "u1" }, permissions: opts.perms };
    next();
  });
  app.use(createRuntimeConfigRouter({ service: svc }));
  const server = http.createServer(app).listen(0);
  const addr = server.address() as { port: number };
  return { url: `http://127.0.0.1:${addr.port}`, close: () => server.close() };
}

test("GET /runtime-config returns snapshot when permitted", async () => {
  const a = await bootApp({ perms: ["runtimes.view"] });
  const r = await fetch(`${a.url}/runtime-config`);
  const body = await r.json();
  assert.equal(r.status, 200);
  assert.equal(body.configuredPrimaryRuntimeId, "oc-main");
  a.close();
});

test("GET /runtime-config 403 without runtimes.view", async () => {
  const a = await bootApp({ perms: [] });
  const r = await fetch(`${a.url}/runtime-config`);
  assert.equal(r.status, 403);
  a.close();
});

test("PATCH /runtime-config applies changes", async () => {
  const a = await bootApp({ perms: ["runtimes.view", "runtimes.config"] });
  const r = await fetch(`${a.url}/runtime-config`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ enabled: { "hermes-remote": true } }),
  });
  const body = await r.json();
  assert.equal(r.status, 200);
  assert.equal(body.runtimes.find((x: any) => x.id === "hermes-remote").enabled, true);
  a.close();
});

test("PATCH /runtime-config 409 when disabling all", async () => {
  const a = await bootApp({ perms: ["runtimes.view", "runtimes.config"] });
  const r = await fetch(`${a.url}/runtime-config`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ enabled: { "oc-main": false, "hermes-remote": false } }),
  });
  const body = await r.json();
  assert.equal(r.status, 409);
  assert.equal(body.error, "cannot_disable_all");
  a.close();
});

test("PATCH /runtime-config 400 unknown id", async () => {
  const a = await bootApp({ perms: ["runtimes.view", "runtimes.config"] });
  const r = await fetch(`${a.url}/runtime-config`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ enabled: { "ghost": true } }),
  });
  assert.equal(r.status, 400);
  a.close();
});
```

- [ ] **Step 2: Run test — confirm FAIL**

Run: `pnpm --filter @openclaw-manager/bridge test runtime-config-routes`
Expected: FAIL — router does not exist.

- [ ] **Step 3: Implement the router**

Create `apps/bridge/src/routes/runtime-config.ts`:

```ts
import { Router, type Router as ExpressRouter, type Request, type Response, type NextFunction, type RequestHandler } from "express";
import type { RuntimeConfigService } from "../services/runtime-config.js";
import { RuntimeConfigError } from "../services/runtime-config.js";
import type { PermissionId, RuntimeConfigPatch } from "@openclaw-manager/types";

export type RuntimeConfigRouterDeps = { service: RuntimeConfigService };

function requirePerm(...perms: PermissionId[]): RequestHandler<any> {
  return (req: Request, res: Response, next: NextFunction): void => {
    const eff = (req as any).auth?.permissions ?? [];
    for (const p of perms) {
      if (!eff.includes(p)) { res.status(403).json({ error: "forbidden", missing: p }); return; }
    }
    next();
  };
}

export function createRuntimeConfigRouter(deps: RuntimeConfigRouterDeps): ExpressRouter {
  const r: ExpressRouter = Router();

  r.get("/runtime-config", requirePerm("runtimes.view"), async (_req, res) => {
    res.json(await deps.service.read());
  });

  r.patch("/runtime-config", requirePerm("runtimes.config"), async (req, res) => {
    const body = (req.body ?? {}) as RuntimeConfigPatch;
    try {
      const before = await deps.service.read();
      const after = await deps.service.patch(body);
      console.log("runtime.config.changed", JSON.stringify({
        user: (req as any).auth?.user?.id ?? null,
        oldConfiguredPrimary: before.configuredPrimaryRuntimeId,
        newConfiguredPrimary: after.configuredPrimaryRuntimeId,
        enabledChanges: body.enabled ?? {},
        effectivePrimaryAfter: after.effectivePrimaryRuntimeId,
        fallbackReasonAfter: after.fallbackReason,
      }));
      res.json(after);
    } catch (e) {
      if (e instanceof RuntimeConfigError) {
        const status = e.code === "cannot_disable_all" ? 409 : 400;
        res.status(status).json({ error: e.code, detail: e.message });
        return;
      }
      console.warn("runtime.config.write_failed", (e as Error).message);
      res.status(500).json({ error: "write_failed", detail: (e as Error).message });
    }
  });

  return r;
}
```

- [ ] **Step 4: Run tests — confirm PASS**

Run: `pnpm --filter @openclaw-manager/bridge test runtime-config-routes`
Expected: PASS (5 tests).

- [ ] **Step 5: Mount in `server.ts`**

In `apps/bridge/src/server.ts`:

Add import near the other route imports:

```ts
import { createRuntimeConfigRouter } from "./routes/runtime-config.js";
import { createRuntimeConfigService, probeFromRegistry } from "./services/runtime-config.js";
```

Just after the `runtimeRegistry` block (around line 106, where `createRuntimesRouter` is mounted), add:

```ts
const runtimeConfigService = createRuntimeConfigService({
  configPath: config.runtimesConfigPath,
  probeStatus: probeFromRegistry(runtimeRegistry),
});
app.use(createRuntimeConfigRouter({ service: runtimeConfigService }));
```

- [ ] **Step 6: Run all bridge tests**

Run: `pnpm --filter @openclaw-manager/bridge test`
Expected: PASS (full suite).

- [ ] **Step 7: Commit**

```bash
git add apps/bridge/src/routes/runtime-config.ts apps/bridge/src/server.ts apps/bridge/test/runtime-config-routes.test.ts
git commit -m "bridge: GET/PATCH /runtime-config with permission gates and audit log"
```

---

## Agent B — Dashboard UX

### Task B1: Bridge-client method for `/runtime-config`

**Files:**
- Create: `apps/dashboard/src/lib/runtime-config-client.ts`

- [ ] **Step 1: Implement the client wrapper**

Pattern: see `apps/dashboard/src/lib/runtime-client.ts` for an example of the existing server-side fetch helper.

Create `apps/dashboard/src/lib/runtime-config-client.ts`:

```ts
import { bridgeFetch } from "./bridge-client";
import type { RuntimeConfigSnapshot, RuntimeConfigPatch } from "@openclaw-manager/types";

export async function getRuntimeConfig(): Promise<RuntimeConfigSnapshot> {
  const res = await bridgeFetch("/runtime-config", { method: "GET" });
  if (!res.ok) throw new Error(`runtime-config GET failed: ${res.status}`);
  return res.json();
}

export async function patchRuntimeConfig(patch: RuntimeConfigPatch): Promise<RuntimeConfigSnapshot> {
  const res = await bridgeFetch("/runtime-config", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`runtime-config PATCH ${res.status}: ${body}`);
  }
  return res.json();
}
```

(If `bridgeFetch` is not exported from `bridge-client.ts`, follow the existing pattern in `runtime-client.ts` — wrap whatever helper that file uses.)

- [ ] **Step 2: Build dashboard**

Run: `pnpm --filter @openclaw-manager/dashboard build`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/dashboard/src/lib/runtime-config-client.ts
git commit -m "dashboard: runtime-config bridge client"
```

---

### Task B2: Fallback banner component

**Files:**
- Create: `apps/dashboard/src/components/runtime-fallback-banner.tsx`

- [ ] **Step 1: Implement the banner**

Create `apps/dashboard/src/components/runtime-fallback-banner.tsx`:

```tsx
import type { FallbackReason } from "@openclaw-manager/types";

const REASON_TEXT: Record<FallbackReason, string> = {
  configured_primary_disabled:
    "Configured primary runtime is disabled. Effective primary has fallen back.",
  configured_primary_missing:
    "Configured primary runtime is missing or not set. Effective primary has fallen back.",
};

export function RuntimeFallbackBanner({
  reason, configured, effective,
}: {
  reason: FallbackReason | null;
  configured: string | null;
  effective: string | null;
}) {
  if (!reason) return null;
  return (
    <div className="rounded border border-amber-700 bg-amber-950/40 p-3 text-sm text-amber-200">
      <div className="font-medium">{REASON_TEXT[reason]}</div>
      <div className="text-amber-300/80 mt-1">
        Configured: <code>{configured ?? "—"}</code> · Effective: <code>{effective ?? "—"}</code>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/dashboard/src/components/runtime-fallback-banner.tsx
git commit -m "dashboard: runtime fallback banner component"
```

---

### Task B3: Settings "Runtimes" section — toggle + primary radio

**Files:**
- Create: `apps/dashboard/src/components/settings/runtimes-section.tsx`
- Modify: `apps/dashboard/src/app/settings/page.tsx`

- [ ] **Step 1: Implement the section component**

Create `apps/dashboard/src/components/settings/runtimes-section.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { RuntimeConfigSnapshot } from "@openclaw-manager/types";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui";
import { PermissionGate } from "@/components/permission-gate";
import { RuntimeFallbackBanner } from "@/components/runtime-fallback-banner";
import { useToast } from "./use-toast";

interface Props { snapshot: RuntimeConfigSnapshot }

export function RuntimesSection({ snapshot }: Props) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [local, setLocal] = useState(snapshot);

  async function patch(body: any) {
    try {
      const res = await fetch("/api/runtime-config", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await res.text());
      const next: RuntimeConfigSnapshot = await res.json();
      setLocal(next);
      startTransition(() => router.refresh());
      toast.push("success", "Runtime config saved.");
    } catch (e) {
      setLocal(snapshot); // rollback
      toast.push("error", e instanceof Error ? e.message : "Save failed");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Runtimes</CardTitle>
      </CardHeader>
      <CardBody>
        <div className="grid gap-3">
          <RuntimeFallbackBanner
            reason={local.fallbackReason}
            configured={local.configuredPrimaryRuntimeId}
            effective={local.effectivePrimaryRuntimeId}
          />
          <div className="grid gap-2">
            {local.runtimes.map((r) => {
              const isPrimary = local.configuredPrimaryRuntimeId === r.id;
              return (
                <div key={r.id} className="flex items-center gap-3 rounded border border-neutral-800 p-3">
                  <div className="flex-1">
                    <div className="font-medium text-neutral-100">{r.displayName}</div>
                    <div className="text-xs text-neutral-400">{r.kind} · {r.endpoint}</div>
                    <div className="text-xs mt-1">
                      Status: <span className={
                        r.status.state === "healthy" ? "text-emerald-400" :
                        r.status.state === "unhealthy" ? "text-red-400" :
                        "text-neutral-500"
                      }>{r.status.state}</span>
                    </div>
                  </div>
                  <PermissionGate perm="runtimes.config">
                    <label className="flex items-center gap-1 text-sm text-neutral-300">
                      <input type="radio" name="primary"
                        checked={isPrimary} disabled={pending}
                        onChange={() => patch({ configuredPrimaryRuntimeId: r.id })} />
                      primary
                    </label>
                    <label className="flex items-center gap-1 text-sm text-neutral-300 ml-3">
                      <input type="checkbox"
                        checked={r.enabled} disabled={pending}
                        onChange={(e) => patch({ enabled: { [r.id]: e.target.checked } })} />
                      enabled
                    </label>
                  </PermissionGate>
                </div>
              );
            })}
          </div>
        </div>
      </CardBody>
    </Card>
  );
}
```

- [ ] **Step 2: Add API route proxying to bridge**

Pattern: existing `apps/dashboard/src/app/api/settings/route.ts` does the same thing for settings.

Create `apps/dashboard/src/app/api/runtime-config/route.ts`:

```ts
import { NextResponse } from "next/server";
import { getRuntimeConfig, patchRuntimeConfig } from "@/lib/runtime-config-client";

export async function GET() {
  return NextResponse.json(await getRuntimeConfig());
}

export async function PATCH(req: Request) {
  const body = await req.json();
  try {
    return NextResponse.json(await patchRuntimeConfig(body));
  } catch (e) {
    return new NextResponse((e as Error).message, { status: 400 });
  }
}
```

- [ ] **Step 3: Mount in settings page**

In `apps/dashboard/src/app/settings/page.tsx`, fetch the snapshot server-side and render the new section. Add to the imports:

```ts
import { getRuntimeConfig } from "@/lib/runtime-config-client";
import { RuntimesSection } from "@/components/settings/runtimes-section";
```

In the page body where existing settings sections are rendered, add:

```tsx
<RuntimesSection snapshot={await getRuntimeConfig()} />
```

- [ ] **Step 4: Build dashboard**

Run: `pnpm --filter @openclaw-manager/dashboard build`
Expected: PASS.

- [ ] **Step 5: Manual smoke**

Run: `pnpm dev:bridge` (terminal 1), `pnpm dev:dashboard` (terminal 2). Visit `http://localhost:3000/settings`. Verify Runtimes card appears with the OpenClaw row, toggle disabled by default for non-admin, enabled for admin.

- [ ] **Step 6: Commit**

```bash
git add apps/dashboard/src/components/settings/runtimes-section.tsx \
        apps/dashboard/src/app/api/runtime-config/route.ts \
        apps/dashboard/src/app/settings/page.tsx
git commit -m "dashboard: settings runtimes section with toggle + primary radio"
```

---

### Task B4: `/runtimes` list — filter disabled, primary badge, banner

**Files:**
- Modify: `apps/dashboard/src/app/runtimes/page.tsx`

- [ ] **Step 1: Switch the page to use `/runtime-config`**

Replace the current body of `apps/dashboard/src/app/runtimes/page.tsx` so it consumes `RuntimeConfigSnapshot` instead of just `listRuntimes`:

```tsx
import { AppShell } from "@/components/app-shell";
import { RuntimeCard } from "@/components/runtime-card";
import { RuntimeFallbackBanner } from "@/components/runtime-fallback-banner";
import { getRuntimeConfig } from "@/lib/runtime-config-client";
import { requirePermission } from "@/lib/auth/current-user";

export const metadata = { title: "Runtimes" };
export const dynamic = "force-dynamic";

export default async function RuntimesPage() {
  await requirePermission("runtimes.view");
  const cfg = await getRuntimeConfig();
  const enabled = cfg.runtimes.filter((r) => r.enabled);
  // primary first
  enabled.sort((a, b) =>
    a.id === cfg.effectivePrimaryRuntimeId ? -1 :
    b.id === cfg.effectivePrimaryRuntimeId ? 1 : 0,
  );

  return (
    <AppShell title="Runtimes">
      <div className="p-6 space-y-4">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-100">Runtimes</h1>
          <p className="text-sm text-neutral-400">Local agent runtimes wired into this manager.</p>
        </div>
        <RuntimeFallbackBanner
          reason={cfg.fallbackReason}
          configured={cfg.configuredPrimaryRuntimeId}
          effective={cfg.effectivePrimaryRuntimeId}
        />
        {enabled.length === 0 ? (
          <div className="text-neutral-400 text-sm">
            No enabled runtimes. Enable one in <a href="/settings" className="underline">Settings</a>.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {enabled.map((r) => (
              <RuntimeCard
                key={r.id}
                descriptor={r}
                healthy={r.status.state === "healthy" ? true : r.status.state === "unhealthy" ? false : null}
                isPrimary={r.id === cfg.effectivePrimaryRuntimeId}
              />
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
```

- [ ] **Step 2: Update `RuntimeCard` to accept `isPrimary`**

In `apps/dashboard/src/components/runtime-card.tsx`, add an optional `isPrimary?: boolean` prop and render a "primary" badge near the title when true. (One-liner; keep visual change minimal — match existing badge styling.)

- [ ] **Step 3: Build dashboard**

Run: `pnpm --filter @openclaw-manager/dashboard build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/dashboard/src/app/runtimes/page.tsx apps/dashboard/src/components/runtime-card.tsx
git commit -m "dashboard: /runtimes filters disabled, sorts primary first, shows fallback banner"
```

---

### Task B5: Disabled-runtime detail behavior

**Files:**
- Modify: `apps/dashboard/src/app/runtimes/[runtimeId]/page.tsx`

- [ ] **Step 1: Add disabled banner + skip probes**

Read the current file, then in the body — before the existing `getRuntime`/`getCapabilities`/`listActivity` calls — fetch the snapshot and check `enabled`:

```tsx
import { getRuntimeConfig } from "@/lib/runtime-config-client";
// ...
const cfg = await getRuntimeConfig();
const desc = cfg.runtimes.find((r) => r.id === runtimeId);
const isDisabled = desc ? !desc.enabled : false;
```

If `isDisabled`, render a banner card and skip the capability/activity fetches:

```tsx
if (isDisabled) {
  return (
    <AppShell title={`Runtime: ${runtimeId}`}>
      <div className="p-6 space-y-4">
        <div className="rounded border border-neutral-700 bg-neutral-900 p-3 text-sm text-neutral-300">
          This runtime is disabled in <a href="/settings" className="underline">Settings</a>. Probes are skipped.
        </div>
      </div>
    </AppShell>
  );
}
```

- [ ] **Step 2: Build dashboard**

Run: `pnpm --filter @openclaw-manager/dashboard build`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/dashboard/src/app/runtimes/[runtimeId]/page.tsx
git commit -m "dashboard: disabled runtime detail page shows banner, skips probes"
```

---

## Agent C — Hermes shim + adapter

### Task C1: Scaffold the Python shim

**Files:**
- Create: `packages/hermes-shim/pyproject.toml`
- Create: `packages/hermes-shim/README.md`
- Create: `packages/hermes-shim/hermes_shim/__init__.py`
- Create: `packages/hermes-shim/hermes_shim/server.py`
- Create: `packages/hermes-shim/hermes_shim/cli.py`
- Create: `packages/hermes-shim/systemd/hermes-shim.service.template`
- Create: `packages/hermes-shim/tests/test_server.py`

- [ ] **Step 1: `pyproject.toml`**

```toml
[project]
name = "openclaw-hermes-shim"
version = "0.1.0"
description = "HTTP shim exposing a curated subset of Hermes Agent CLI for OpenClaw-Manager."
requires-python = ">=3.11"
dependencies = ["fastapi>=0.115", "uvicorn[standard]>=0.30", "pydantic>=2"]

[project.scripts]
hermes-shim = "hermes_shim.cli:main"

[build-system]
requires = ["setuptools>=68"]
build-backend = "setuptools.build_meta"

[tool.setuptools.packages.find]
where = ["."]
include = ["hermes_shim*"]
```

- [ ] **Step 2: `README.md`**

Write a short README covering:

- Purpose: HTTP+bearer shim for Hermes CLI on a remote host.
- Install: `pip install -e packages/hermes-shim` on the remote.
- Run: `HERMES_SHIM_TOKEN=... hermes-shim` (binds 127.0.0.1:9119 by default).
- Network exposure: default loopback; LAN bind requires `HERMES_SHIM_BIND_LAN=1`.
- Default deployment: SSH local forward from bridge host: `ssh -L 19119:127.0.0.1:9119 gal@192.168.0.10`.
- systemd template path.

(Roughly 60–80 lines; mirror the tone of existing READMEs in the repo.)

- [ ] **Step 3: `__init__.py` empty**

```python
"""Hermes Agent HTTP shim for OpenClaw-Manager."""
```

- [ ] **Step 4: `cli.py` with bind safety**

```python
import os
import sys
import uvicorn
from .server import app


def main() -> int:
    bind_lan = os.environ.get("HERMES_SHIM_BIND_LAN") == "1"
    host = os.environ.get("HERMES_SHIM_HOST", "127.0.0.1")
    port = int(os.environ.get("HERMES_SHIM_PORT", "9119"))
    if host != "127.0.0.1" and not bind_lan:
        print(
            f"refusing to bind {host}:{port} without HERMES_SHIM_BIND_LAN=1",
            file=sys.stderr,
        )
        return 2
    if not os.environ.get("HERMES_SHIM_TOKEN"):
        print("HERMES_SHIM_TOKEN required", file=sys.stderr)
        return 2
    uvicorn.run(app, host=host, port=port, log_level="info")
    return 0


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 5: systemd template**

```ini
[Unit]
Description=OpenClaw-Manager Hermes shim
After=network.target

[Service]
Type=simple
EnvironmentFile=%h/.hermes/shim.env
ExecStart=%h/.local/bin/hermes-shim
Restart=on-failure
RestartSec=2s

[Install]
WantedBy=default.target
```

`shim.env` should contain at minimum:
```
HERMES_SHIM_TOKEN=...
HERMES_SHIM_HOST=127.0.0.1
HERMES_SHIM_PORT=9119
```

- [ ] **Step 6: Commit scaffold**

```bash
git add packages/hermes-shim/
git commit -m "hermes-shim: scaffold (pyproject, cli with bind safety, systemd template, README)"
```

---

### Task C2: Shim auth + `/v1/health` + `/v1/version` + `/v1/capabilities`

**Files:**
- Create/modify: `packages/hermes-shim/hermes_shim/server.py`
- Create: `packages/hermes-shim/tests/test_server.py`

- [ ] **Step 1: Failing tests**

Create `packages/hermes-shim/tests/test_server.py`:

```python
import os
import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setenv("HERMES_SHIM_TOKEN", "secret")
    # late import so env is in place
    from hermes_shim.server import app
    return TestClient(app)


def test_health_requires_bearer(client):
    r = client.get("/v1/health")
    assert r.status_code == 401


def test_health_ok(client):
    r = client.get("/v1/health", headers={"authorization": "Bearer secret"})
    assert r.status_code == 200
    assert r.json()["ok"] is True


def test_version(client):
    r = client.get("/v1/version", headers={"authorization": "Bearer secret"})
    assert r.status_code == 200
    body = r.json()
    assert "shim" in body
    assert "hermes" in body


def test_capabilities_shape(client):
    r = client.get("/v1/capabilities", headers={"authorization": "Bearer secret"})
    assert r.status_code == 200
    body = r.json()
    assert "supported" in body
    assert "partial" in body
    assert "unsupported" in body
    assert "sessions.list" in body["supported"]
    assert any(p["id"] == "logs.tail" for p in body["partial"])
```

- [ ] **Step 2: Run tests — confirm FAIL**

Run: `cd packages/hermes-shim && python -m pytest -q`
Expected: FAIL — module/endpoints missing.

- [ ] **Step 3: Implement `server.py`**

```python
import os
import shutil
import subprocess
from typing import Any

from fastapi import Depends, FastAPI, HTTPException, Request

SHIM_VERSION = "0.1.0"

app = FastAPI(title="OpenClaw Hermes Shim", version=SHIM_VERSION)


def require_bearer(request: Request) -> None:
    expected = os.environ.get("HERMES_SHIM_TOKEN")
    if not expected:
        raise HTTPException(status_code=500, detail="HERMES_SHIM_TOKEN not configured")
    auth = request.headers.get("authorization", "")
    if auth != f"Bearer {expected}":
        raise HTTPException(status_code=401, detail="unauthorized")


def hermes_version() -> str:
    bin_path = shutil.which("hermes") or os.path.expanduser("~/.local/bin/hermes")
    try:
        out = subprocess.run(
            [bin_path, "--version"], capture_output=True, text=True, timeout=5,
        )
        return out.stdout.strip() or "unknown"
    except Exception:
        return "unknown"


@app.get("/v1/health")
def health(_: None = Depends(require_bearer)) -> dict[str, Any]:
    return {"ok": True, "hermes_version": hermes_version()}


@app.get("/v1/version")
def version(_: None = Depends(require_bearer)) -> dict[str, str]:
    return {"shim": SHIM_VERSION, "hermes": hermes_version()}


@app.get("/v1/capabilities")
def capabilities(_: None = Depends(require_bearer)) -> dict[str, Any]:
    return {
        "supported": ["sessions.list", "sessions.read", "skills.list"],
        "partial": [
            {
                "id": "logs.tail",
                "reason": "lines-only projection of /v1/activity",
                "projectionMode": "inferred",
                "lossiness": "lossy",
            }
        ],
        "unsupported": [
            "sessions.send", "channels.list", "channels.status",
            "memory.query", "memory.write", "skills.install",
            "tools.list", "tools.invoke", "cron.list", "cron.write",
            "config.get", "config.set", "agents.list", "agents.read",
        ],
    }
```

- [ ] **Step 4: Run tests — confirm PASS**

Run: `cd packages/hermes-shim && python -m pytest -q`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/hermes-shim/hermes_shim/server.py packages/hermes-shim/tests/test_server.py
git commit -m "hermes-shim: bearer auth, /v1/health /v1/version /v1/capabilities"
```

---

### Task C3: Shim `/v1/sessions` + `/v1/sessions/:id`

**Files:**
- Modify: `packages/hermes-shim/hermes_shim/server.py`
- Modify: `packages/hermes-shim/tests/test_server.py`

- [ ] **Step 1: Failing tests**

Append to `tests/test_server.py`:

```python
def test_sessions_list_requires_auth(client):
    r = client.get("/v1/sessions")
    assert r.status_code == 401


def test_sessions_list_returns_array(client, monkeypatch):
    monkeypatch.setattr(
        "hermes_shim.server._run_hermes_json",
        lambda args: [{"id": "s1", "name": "demo", "lastActivityAt": 0}],
    )
    r = client.get("/v1/sessions", headers={"authorization": "Bearer secret"})
    assert r.status_code == 200
    body = r.json()
    assert isinstance(body, list)
    assert body[0]["id"] == "s1"


def test_session_detail_returns_object(client, monkeypatch):
    monkeypatch.setattr(
        "hermes_shim.server._run_hermes_json",
        lambda args: {"id": "s1", "transcript": [{"role": "user", "text": "hi"}]},
    )
    r = client.get("/v1/sessions/s1", headers={"authorization": "Bearer secret"})
    assert r.status_code == 200
    body = r.json()
    assert body["id"] == "s1"
    assert body["transcript"][0]["text"] == "hi"
```

- [ ] **Step 2: Run tests — confirm FAIL**

Run: `cd packages/hermes-shim && python -m pytest -q`
Expected: FAIL — endpoints missing.

- [ ] **Step 3: Implement endpoints + `_run_hermes_json` helper**

Append to `hermes_shim/server.py`:

```python
import json


def _hermes_bin() -> str:
    return shutil.which("hermes") or os.path.expanduser("~/.local/bin/hermes")


def _run_hermes_json(args: list[str]) -> Any:
    """Run hermes CLI and parse JSON stdout. Override in tests via monkeypatch."""
    out = subprocess.run(
        [_hermes_bin(), *args], capture_output=True, text=True, timeout=15,
    )
    if out.returncode != 0:
        raise HTTPException(status_code=502, detail=f"hermes CLI failed: {out.stderr.strip()[:300]}")
    try:
        return json.loads(out.stdout) if out.stdout.strip() else []
    except json.JSONDecodeError as e:
        raise HTTPException(status_code=502, detail=f"hermes CLI returned non-JSON: {e}")


@app.get("/v1/sessions")
def sessions_list(_: None = Depends(require_bearer)) -> Any:
    return _run_hermes_json(["sessions", "list", "--json"])


@app.get("/v1/sessions/{session_id}")
def session_detail(session_id: str, _: None = Depends(require_bearer)) -> Any:
    return _run_hermes_json(["sessions", "show", session_id, "--json"])
```

(NOTE for the implementer: the exact `hermes sessions list` JSON-output flag may differ. Verify against the local `hermes sessions --help` output before merging. If the CLI does not emit JSON, parse text or wrap with a thin Python adapter — but flag any deviation in the README.)

- [ ] **Step 4: Run tests — confirm PASS**

Run: `cd packages/hermes-shim && python -m pytest -q`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/hermes-shim/hermes_shim/server.py packages/hermes-shim/tests/test_server.py
git commit -m "hermes-shim: /v1/sessions list + detail via hermes CLI"
```

---

### Task C4: Shim `/v1/skills` + `/v1/activity`

**Files:**
- Modify: `packages/hermes-shim/hermes_shim/server.py`
- Modify: `packages/hermes-shim/tests/test_server.py`

- [ ] **Step 1: Failing tests**

Append to `tests/test_server.py`:

```python
def test_skills_list(client, monkeypatch):
    monkeypatch.setattr(
        "hermes_shim.server._run_hermes_json",
        lambda args: [{"id": "skill1", "name": "ping", "version": "1.0"}],
    )
    r = client.get("/v1/skills", headers={"authorization": "Bearer secret"})
    assert r.status_code == 200
    assert r.json()[0]["id"] == "skill1"


def test_activity_query_params(client, monkeypatch):
    captured = {}
    def fake(args):
        captured["args"] = args
        return [{"kind": "message_in", "at": 1, "text": "hello"}]
    monkeypatch.setattr("hermes_shim.server._run_hermes_json", fake)
    r = client.get("/v1/activity?since=100&limit=5", headers={"authorization": "Bearer secret"})
    assert r.status_code == 200
    assert "100" in captured["args"]
    assert "5" in captured["args"]
```

- [ ] **Step 2: Run tests — confirm FAIL**

Run: `cd packages/hermes-shim && python -m pytest -q`
Expected: FAIL.

- [ ] **Step 3: Implement endpoints**

Append to `hermes_shim/server.py`:

```python
@app.get("/v1/skills")
def skills_list(_: None = Depends(require_bearer)) -> Any:
    return _run_hermes_json(["skills", "list", "--json"])


@app.get("/v1/activity")
def activity(since: int | None = None, limit: int | None = None,
             _: None = Depends(require_bearer)) -> Any:
    args = ["logs", "tail", "--json"]
    if since is not None:
        args.extend(["--since", str(since)])
    if limit is not None:
        args.extend(["--limit", str(limit)])
    return _run_hermes_json(args)
```

- [ ] **Step 4: Run tests — confirm PASS**

Run: `cd packages/hermes-shim && python -m pytest -q`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/hermes-shim/hermes_shim/server.py packages/hermes-shim/tests/test_server.py
git commit -m "hermes-shim: /v1/skills + /v1/activity"
```

---

### Task C5: Rewrite the bridge Hermes adapter against the shim

**Files:**
- Modify: `apps/bridge/src/services/runtimes/hermes.ts`
- Modify: `apps/bridge/test/runtimes-hermes-adapter.test.ts`

- [ ] **Step 1: Failing tests against an in-memory shim fake**

Replace the body of `apps/bridge/test/runtimes-hermes-adapter.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHermesAdapter } from "../src/services/runtimes/hermes.js";
import type { HttpClient } from "../src/services/runtimes/adapter-base.js";
import type { RuntimeDescriptor } from "@openclaw-manager/types";

const desc: RuntimeDescriptor = {
  id: "hermes-remote",
  kind: "hermes",
  displayName: "Hermes",
  endpoint: "http://127.0.0.1:19119",
  transport: "http",
  authMode: "bearer",
};

function fakeHttp(routes: Record<string, unknown>): HttpClient {
  return {
    async json(url, _req) {
      const path = url.replace(/^https?:\/\/[^/]+/, "");
      if (!(path in routes)) throw new Error(`no fake for ${path}`);
      return routes[path] as any;
    },
  };
}

test("getCapabilities reports runtime-reported on success", async () => {
  const a = createHermesAdapter({
    descriptor: desc,
    bearer: "tok",
    http: fakeHttp({
      "/v1/capabilities": {
        supported: ["sessions.list", "sessions.read", "skills.list"],
        partial: [{ id: "logs.tail", reason: "lossy", projectionMode: "inferred", lossiness: "lossy" }],
        unsupported: [],
      },
    }),
  });
  const caps = await a.getCapabilities();
  assert.equal(caps.source, "runtime-reported");
  assert.equal(caps.stale, false);
});

test("getCapabilities returns static-adapter snapshot when shim down", async () => {
  const a = createHermesAdapter({
    descriptor: desc,
    bearer: "tok",
    http: { json: async () => { throw new Error("network down"); } },
  });
  const caps = await a.getCapabilities();
  assert.equal(caps.source, "static-adapter");
  assert.equal(caps.stale, true);
  assert.ok(caps.supported.includes("sessions.list"));
});

test("listEntities('session') hits /v1/sessions", async () => {
  const a = createHermesAdapter({
    descriptor: desc,
    bearer: "tok",
    http: fakeHttp({
      "/v1/sessions": [{ id: "s1", name: "demo", lastActivityAt: 1 }],
    }),
  });
  const ents = await a.listEntities("session");
  assert.equal(ents[0].entityId, "s1");
  assert.equal(ents[0].entityKind, "session");
  assert.equal(ents[0].runtimeKind, "hermes");
});

test("listEntities('agent') returns []", async () => {
  const a = createHermesAdapter({ descriptor: desc, bearer: "tok", http: fakeHttp({}) });
  assert.deepEqual(await a.listEntities("agent"), []);
});

test("invokeAction always returns ok:false in Phase 1", async () => {
  const a = createHermesAdapter({ descriptor: desc, bearer: "tok", http: fakeHttp({}) });
  const r = await a.invokeAction({
    action: "sessions.send",
    payload: {},
    actor: { humanActorUserId: "u", managerServiceId: "m", basis: "service-principal" },
  });
  assert.equal(r.ok, false);
});

test("health hits /v1/health", async () => {
  const a = createHermesAdapter({
    descriptor: desc,
    bearer: "tok",
    http: fakeHttp({ "/v1/health": { ok: true, hermes_version: "1.0" } }),
  });
  const h = await a.health();
  assert.equal(h.ok, true);
});
```

- [ ] **Step 2: Run tests — confirm FAIL**

Run: `pnpm --filter @openclaw-manager/bridge test runtimes-hermes-adapter`
Expected: FAIL — adapter still returns Phase-1 stub shape.

- [ ] **Step 3: Rewrite the adapter**

Replace `apps/bridge/src/services/runtimes/hermes.ts`:

```ts
/**
 * Hermes Agent adapter — Phase 2 (talks to local hermes-shim over HTTP+bearer).
 *
 * The shim must be reachable at the descriptor.endpoint. Default deployment
 * tunnels Hermes's loopback shim through SSH local forward to a bridge-side
 * loopback port. See packages/hermes-shim/README.md.
 */
import type {
  RuntimeAdapter, RuntimeActivityEvent, InvokeActionRequest, InvokeActionResult,
  RuntimeAuthMode, CapabilitySnapshot, RuntimeEntity, RuntimeEntityKind,
} from "@openclaw-manager/types";
import { ADAPTER_CONTRACT_VERSION, defaultHttp, type AdapterConfig } from "./adapter-base.js";

const STATIC_CAPS = {
  supported: ["sessions.list", "sessions.read", "skills.list"] as const,
  partial: [{
    id: "logs.tail" as const,
    reason: "lines-only projection of /v1/activity",
    projectionMode: "inferred" as const,
    lossiness: "lossy" as const,
  }],
  unsupported: [
    "sessions.send", "channels.list", "channels.status",
    "memory.query", "memory.write", "skills.install",
    "tools.list", "tools.invoke", "cron.list", "cron.write",
    "config.get", "config.set", "agents.list", "agents.read",
  ] as const,
};

export function createHermesAdapter(cfg: AdapterConfig): RuntimeAdapter {
  const { descriptor, bearer, timeoutMs } = cfg;
  const http = cfg.http ?? defaultHttp;
  const base = descriptor.endpoint.replace(/\/$/, "");
  const headers: Record<string, string> = bearer ? { Authorization: `Bearer ${bearer}` } : {};

  const get = (path: string, t = timeoutMs ?? 5000) =>
    http.json(`${base}${path}`, { method: "GET", headers, timeoutMs: t });

  return {
    async describeRuntime() { return descriptor; },

    async getCapabilities(): Promise<CapabilitySnapshot> {
      try {
        const live = await get("/v1/capabilities") as any;
        return {
          supported: live.supported ?? [],
          partial: live.partial ?? [],
          unsupported: live.unsupported ?? [],
          version: ADAPTER_CONTRACT_VERSION,
          source: "runtime-reported",
          stale: false,
        };
      } catch {
        return {
          supported: [...STATIC_CAPS.supported],
          partial: [...STATIC_CAPS.partial],
          unsupported: [...STATIC_CAPS.unsupported],
          version: ADAPTER_CONTRACT_VERSION,
          source: "static-adapter",
          stale: true,
        };
      }
    },

    async listEntities(kind: RuntimeEntityKind): Promise<RuntimeEntity[]> {
      if (kind === "session") {
        const rows = (await get("/v1/sessions")) as any[];
        return rows.map((r) => ({
          runtimeKind: "hermes",
          runtimeId: descriptor.id,
          entityKind: "session",
          entityId: String(r.id),
          displayName: String(r.name ?? r.id),
          lastActivityAt: r.lastActivityAt,
          nativeRef: r,
        }));
      }
      if (kind === "skill") {
        const rows = (await get("/v1/skills")) as any[];
        return rows.map((r) => ({
          runtimeKind: "hermes",
          runtimeId: descriptor.id,
          entityKind: "skill",
          entityId: String(r.id ?? r.name),
          displayName: String(r.name ?? r.id),
          nativeRef: r,
        }));
      }
      return [];
    },

    async getEntity(kind, id) {
      if (kind !== "session") return null;
      const r = (await get(`/v1/sessions/${encodeURIComponent(id)}`, 8000)) as any;
      return {
        runtimeKind: "hermes",
        runtimeId: descriptor.id,
        entityKind: "session",
        entityId: String(r.id),
        displayName: String(r.name ?? r.id),
        nativeRef: r,
      };
    },

    async listActivity(sinceMs?, limit?): Promise<RuntimeActivityEvent[]> {
      const qs = new URLSearchParams();
      if (sinceMs != null) qs.set("since", String(sinceMs));
      if (limit != null) qs.set("limit", String(limit));
      const path = `/v1/activity${qs.toString() ? `?${qs}` : ""}`;
      const rows = (await get(path)) as any[];
      return rows.map((r) => ({
        runtimeKind: "hermes",
        runtimeId: descriptor.id,
        eventKind: r.kind ?? "message_in",
        at: Number(r.at ?? Date.now()),
        entityId: r.entityId,
        text: r.text,
        projectionMode: "inferred",
        lossiness: "lossy",
        nativeRef: r,
      }));
    },

    async invokeAction(_req: InvokeActionRequest): Promise<InvokeActionResult> {
      return {
        ok: false,
        error: "hermes phase 1 has no write actions",
        projectionMode: "exact",
      };
    },

    async getAuthModes(): Promise<RuntimeAuthMode[]> {
      return [{
        id: "service",
        label: "Bearer (shim)",
        description: "Bearer via env HERMES_TOKEN; shim verifies HERMES_SHIM_TOKEN.",
      }];
    },

    async getExtensions() { return ["sessions", "skills", "activity"]; },

    async health() {
      try {
        const r = (await get("/v1/health")) as any;
        return r?.ok ? { ok: true } : { ok: false, detail: "shim returned not-ok" };
      } catch (e) {
        return { ok: false, detail: (e as Error).message };
      }
    },
  };
}
```

- [ ] **Step 4: Run tests — confirm PASS**

Run: `pnpm --filter @openclaw-manager/bridge test runtimes-hermes-adapter`
Expected: PASS (6 tests).

- [ ] **Step 5: Run all bridge tests**

Run: `pnpm --filter @openclaw-manager/bridge test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/bridge/src/services/runtimes/hermes.ts apps/bridge/test/runtimes-hermes-adapter.test.ts
git commit -m "bridge(hermes): adapter against shim with capability provenance fallback"
```

---

### Task C6: Sample `runtimes.json` + AGENTS.md update

**Files:**
- Modify: `openclaw-plugin/management/runtimes.json` (Gal-local; document the shape in repo via AGENTS.md only — the actual file is per-install)
- Modify: `AGENTS.md`
- Modify: `docs/RUNTIMES.md`

- [ ] **Step 1: Document the new schema in `docs/RUNTIMES.md`**

Add a section "runtimes.json — extended schema" showing the full `configuredPrimaryRuntimeId` + `runtimes[].enabled` shape and the SSH-tunnel deployment example.

- [ ] **Step 2: Update `AGENTS.md`**

In the "Runtimes" section of `AGENTS.md`, add a bullet:

> Runtime registry now supports `enabled: boolean` per descriptor and a top-level `configuredPrimaryRuntimeId`. See `docs/RUNTIMES.md` and `docs/superpowers/specs/2026-05-04-hermes-runtime-integration-design.md`.

- [ ] **Step 3: Commit**

```bash
git add docs/RUNTIMES.md AGENTS.md
git commit -m "docs: extended runtime schema (enabled + configuredPrimaryRuntimeId)"
```

---

## Self-Review (perform after writing the plan)

1. **Spec coverage:**
   - Settings model (file schema, primary semantics, fallback) → Tasks 0, A2, A3
   - Health vs disabled tri-state → Task A2 (status field), A4 (probe wiring)
   - PATCH atomicity → Task A3
   - `/runtime-config` endpoints + permissions → Task A5
   - "What primary does in Phase 1" (radio, badge, banner) → Tasks B2, B3, B4
   - Disabled-runtime detail behavior → Task B5
   - Shim deployment + bind safety → Task C1
   - Shim contract endpoints → Tasks C2–C4
   - Hermes adapter rewrite + capability provenance → Task C5
   - Doc updates → Task C6

2. **Placeholder scan:** none.

3. **Type consistency:**
   - `RuntimeStatus` used identically in service (Task A2) and section component (B3).
   - `RuntimeConfigSnapshot` shape consistent across A2/A3 service, A5 routes, B1 client, B2 banner.
   - `CapabilitySnapshot` provenance fields used identically in C5 adapter and Task 0 type.
   - Permission id `runtimes.config` referenced consistently in Tasks 0, A5, B3.
