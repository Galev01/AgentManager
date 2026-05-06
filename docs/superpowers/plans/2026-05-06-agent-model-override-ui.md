# Agent Model Override — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow dashboard admins to change the per-agent LLM model from the Settings UI instead of editing `~/.openclaw/openclaw.json` on the host.

**Architecture:** Read-only catalog from gateway `models.list`; mutation via existing `agents.update` gateway RPC, proxied through `PATCH /agents/:name`. No bridge-side override store. Bridge adds catalog-validation pre-write and permission gating (`agents.manage`) on the previously ungated PATCH route. Dashboard ships a new "Agent Models" section in Settings.

**Tech Stack:** Express bridge (Windows NSSM service), Next.js 14 App Router dashboard, TypeScript, `node:test` for bridge tests, monorepo via pnpm workspaces, types in `packages/types`.

**Spec:** `docs/superpowers/specs/2026-05-06-agent-model-override-ui-design.md`.

---

## File Structure

**Create:**
- `packages/types/src/agent-models.ts` — `ModelDescriptor`, `AgentModelSummary`, `AgentModelsSnapshot`.
- `apps/bridge/src/services/agent-models.ts` — composes gateway calls into `AgentModelsSnapshot`.
- `apps/bridge/src/routes/models.ts` — `GET /models` proxy.
- `apps/bridge/src/routes/agent-models.ts` — `GET /agent-models` proxy.
- `apps/bridge/test/agent-models-routes.test.ts` — route tests.
- `apps/bridge/test/agents-routes.test.ts` — tests for the new gate + validation on `PATCH /agents/:name`.
- `apps/dashboard/src/lib/agent-models-client.ts` — bridge fetch helpers.
- `apps/dashboard/src/app/api/agent-models/route.ts` — Next proxy GET.
- `apps/dashboard/src/app/api/models/route.ts` — Next proxy GET.
- `apps/dashboard/src/components/settings/agent-models-section.tsx` — UI section.

**Modify:**
- `packages/types/src/index.ts` — re-export the new types.
- `apps/bridge/src/routes/agents.ts` — convert default export to a factory that accepts deps; add `requirePerm("agents.manage")` on PATCH; add catalog validation when `model` is in body.
- `apps/bridge/src/server.ts` — wire the new routes; switch to factory call for `agentsRouter`.
- `apps/dashboard/src/components/settings/settings-view.tsx` — add `<AgentModelsSection>` slot and TOC link.
- `apps/dashboard/src/app/settings/page.tsx` — fetch snapshot and pass to `SettingsView`.

**Untouched (deliberately):**
- `apps/bridge/src/routes/agents.ts:38-50` (best-effort `agents.update` after `agents.create`) — out of scope.
- `packages/types/src/auth/permissions.ts` — `agents.manage` already exists; no registry change.

---

## Conventions

- All bridge route handlers use the `requirePerm(...)` middleware copied from `apps/bridge/src/routes/runtime-config.ts:8-16` (no shared helper exists yet — keep it inline like the runtime-config route does).
- Tests use `node:test` + `node:assert/strict` and boot a stub Express app with a per-test `(req as any).auth = { user, permissions }` middleware, matching `apps/bridge/test/runtime-config-routes.test.ts`.
- Bridge tests stub `callGateway` by passing it as a dependency (the new routes accept a `callGateway` parameter rather than importing the singleton).
- Dashboard API routes mirror `apps/dashboard/src/app/api/runtime-config/route.ts` (`requirePermissionApi`, `AuthFailure` handling, `bridgeFetch` helper).
- Commit per task. Use the existing `feat`/`fix`/`refactor` prefixes — match recent commits like `dashboard:` or `hermes-shim:`.
- Run `pnpm --filter bridge test` after each bridge task, `pnpm --filter dashboard build` after each dashboard task.
- One commit per task unless a step explicitly says otherwise.

---

## Task 1: New types in `packages/types/src/agent-models.ts`

**Files:**
- Create: `packages/types/src/agent-models.ts`
- Modify: `packages/types/src/index.ts`

- [ ] **Step 1: Create the type module**

Write `packages/types/src/agent-models.ts`:

```ts
// Catalog entries surfaced to the dashboard UI.
export type ModelDescriptor = {
  id: string;            // provider-qualified, e.g. "openai-codex/gpt-5.4"
  displayName: string;
  provider: string;
  contextWindow?: number;
  maxTokens?: number;
  reasoning?: boolean;
  costInput?: number;
  costOutput?: number;
  cacheRead?: number;
  cacheWrite?: number;
};

export type AgentModelSummary = {
  agentId: string;
  agentName?: string;
  effectiveModelId: string | null;       // resolved by gateway (override else default)
  hasExplicitOverride?: boolean;         // reserved for future use; bridge does not populate in Phase 1
};

export type AgentModelsSnapshot = {
  catalog: ModelDescriptor[];
  agents: AgentModelSummary[];
  globalDefaultModelId: string | null;
  catalogStatus: "ok" | "unavailable";
};
```

- [ ] **Step 2: Re-export from the package index**

Edit `packages/types/src/index.ts`. Append at the bottom of the existing `export * from` block:

```ts
export * from "./agent-models.js";
```

- [ ] **Step 3: Build the types package**

Run: `pnpm --filter @openclaw-manager/types build`
Expected: build succeeds with no diagnostics.

- [ ] **Step 4: Commit**

```bash
git add packages/types/src/agent-models.ts packages/types/src/index.ts
git commit -m "types: add agent-models catalog + snapshot shapes"
```

---

## Task 2: Bridge service `agent-models.ts`

**Files:**
- Create: `apps/bridge/src/services/agent-models.ts`
- Test: (covered indirectly by Task 4 route tests; this task creates the unit)

The service is a thin composition layer over `callGateway`. No persistence.

- [ ] **Step 1: Create the service module**

Write `apps/bridge/src/services/agent-models.ts`:

```ts
import type { AgentModelsSnapshot, ModelDescriptor, AgentModelSummary } from "@openclaw-manager/types";

export type CallGateway = (method: string, params?: Record<string, unknown>) => Promise<unknown>;

export type AgentModelsService = {
  readSnapshot(): Promise<AgentModelsSnapshot>;
  readCatalog(): Promise<{ models: ModelDescriptor[]; status: "ok" | "unavailable" }>;
  validateModelAgainstCatalog(modelId: string): Promise<{ ok: true } | { ok: false; status: 400 | 503; reason: string }>;
};

type GatewayModelEntry = {
  // gateway returns provider-qualified id at top level; cost/contextWindow optionally
  id?: string;
  key?: string;
  provider?: string;
  name?: string;
  displayName?: string;
  contextWindow?: number;
  maxTokens?: number;
  reasoning?: boolean;
  cost?: { input?: number; output?: number; cacheRead?: number; cacheWrite?: number };
};

type GatewayAgentSummary = {
  id: string;
  name?: string;
  model?: string;
  isDefault?: boolean;
};

function projectModel(raw: GatewayModelEntry): ModelDescriptor | null {
  const id = raw.id ?? raw.key;
  if (typeof id !== "string" || !id.trim()) return null;
  const provider = raw.provider ?? id.split("/")[0] ?? "unknown";
  return {
    id,
    displayName: raw.displayName ?? raw.name ?? id,
    provider,
    contextWindow: raw.contextWindow,
    maxTokens: raw.maxTokens,
    reasoning: raw.reasoning,
    costInput: raw.cost?.input,
    costOutput: raw.cost?.output,
    cacheRead: raw.cost?.cacheRead,
    cacheWrite: raw.cost?.cacheWrite,
  };
}

export function createAgentModelsService(deps: { callGateway: CallGateway }): AgentModelsService {
  const { callGateway } = deps;

  async function readCatalog(): Promise<{ models: ModelDescriptor[]; status: "ok" | "unavailable" }> {
    try {
      const res = (await callGateway("models.list", {})) as { models?: GatewayModelEntry[] };
      const models = Array.isArray(res?.models)
        ? res.models.map(projectModel).filter((m): m is ModelDescriptor => m !== null)
        : [];
      return { models, status: "ok" };
    } catch {
      return { models: [], status: "unavailable" };
    }
  }

  async function readSnapshot(): Promise<AgentModelsSnapshot> {
    const [catalogResult, agentsRaw] = await Promise.all([
      readCatalog(),
      callGateway("agents.list", {}).catch(() => ({ agents: [] as GatewayAgentSummary[] })),
    ]);
    const agents = Array.isArray((agentsRaw as { agents?: GatewayAgentSummary[] })?.agents)
      ? (agentsRaw as { agents: GatewayAgentSummary[] }).agents
      : [];
    const summaries: AgentModelSummary[] = agents.map((a) => ({
      agentId: a.id,
      agentName: a.name,
      effectiveModelId: typeof a.model === "string" && a.model.trim() ? a.model : null,
    }));
    const defaultEntry = agents.find((a) => a.isDefault) ?? agents.find((a) => a.id === "main");
    const globalDefaultModelId = defaultEntry?.model ?? null;
    return {
      catalog: catalogResult.models,
      agents: summaries,
      globalDefaultModelId,
      catalogStatus: catalogResult.status,
    };
  }

  async function validateModelAgainstCatalog(modelId: string) {
    const cat = await readCatalog();
    if (cat.status === "unavailable") {
      return { ok: false, status: 503 as const, reason: "model_catalog_unavailable" };
    }
    if (!cat.models.some((m) => m.id === modelId)) {
      return { ok: false, status: 400 as const, reason: "invalid_model_id" };
    }
    return { ok: true };
  }

  return { readSnapshot, readCatalog, validateModelAgainstCatalog };
}
```

- [ ] **Step 2: Compile-check**

Run: `pnpm --filter bridge build`
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add apps/bridge/src/services/agent-models.ts
git commit -m "bridge: add agent-models service (gateway projection)"
```

---

## Task 3: `GET /models` bridge route

**Files:**
- Create: `apps/bridge/src/routes/models.ts`
- Create: `apps/bridge/test/agent-models-routes.test.ts` (this test file covers Tasks 3 and 4)

- [ ] **Step 1: Write the failing test for `GET /models` happy path**

Create `apps/bridge/test/agent-models-routes.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import http from "node:http";
import { createModelsRouter } from "../src/routes/models.js";
import { createAgentModelsRouter } from "../src/routes/agent-models.js";

type StubCalls = Array<{ method: string; params: unknown }>;

function bootApp(opts: {
  perms: string[];
  gatewayHandler?: (method: string, params: unknown) => unknown | Promise<unknown>;
}): { url: string; calls: StubCalls; close: () => void } {
  const calls: StubCalls = [];
  const callGateway = async (method: string, params?: unknown) => {
    calls.push({ method, params: params ?? {} });
    if (!opts.gatewayHandler) throw new Error(`unstubbed gateway call: ${method}`);
    return opts.gatewayHandler(method, params ?? {});
  };
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).auth = { user: { id: "u1" }, permissions: opts.perms };
    next();
  });
  app.use(createModelsRouter({ callGateway }));
  app.use(createAgentModelsRouter({ callGateway }));
  const server = http.createServer(app).listen(0);
  const addr = server.address() as { port: number };
  return { url: `http://127.0.0.1:${addr.port}`, calls, close: () => server.close() };
}

test("GET /models returns gateway-projected catalog", async () => {
  const a = bootApp({
    perms: [],
    gatewayHandler: (method) => {
      if (method === "models.list") {
        return {
          models: [
            { id: "openai-codex/gpt-5.4", provider: "openai-codex", name: "GPT-5.4", contextWindow: 200000, cost: { input: 1.5, output: 5 } },
            { id: "ollama/gemma4", provider: "ollama", name: "gemma4", contextWindow: 131072 },
          ],
        };
      }
      throw new Error("unexpected");
    },
  });
  const r = await fetch(`${a.url}/models`);
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.equal(body.status, "ok");
  assert.equal(body.models.length, 2);
  assert.equal(body.models[0].id, "openai-codex/gpt-5.4");
  assert.equal(body.models[0].costInput, 1.5);
  a.close();
});

test("GET /models returns status 'unavailable' on gateway error", async () => {
  const a = bootApp({
    perms: [],
    gatewayHandler: () => { throw new Error("gateway down"); },
  });
  const r = await fetch(`${a.url}/models`);
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.equal(body.status, "unavailable");
  assert.deepEqual(body.models, []);
  a.close();
});
```

- [ ] **Step 2: Run the test to confirm it fails**

Run: `pnpm --filter bridge test --test-name-pattern "GET /models"`
Expected: FAIL — `Cannot find module '.../routes/models.js'`.

- [ ] **Step 3: Implement the route**

Create `apps/bridge/src/routes/models.ts`:

```ts
import { Router, type Router as ExpressRouter } from "express";
import { createAgentModelsService, type CallGateway } from "../services/agent-models.js";

export type ModelsRouterDeps = { callGateway: CallGateway };

export function createModelsRouter(deps: ModelsRouterDeps): ExpressRouter {
  const r: ExpressRouter = Router();
  const service = createAgentModelsService({ callGateway: deps.callGateway });

  r.get("/models", async (_req, res) => {
    const result = await service.readCatalog();
    res.json(result);
  });

  return r;
}
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `pnpm --filter bridge test --test-name-pattern "GET /models"`
Expected: both `GET /models` tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/bridge/src/routes/models.ts apps/bridge/test/agent-models-routes.test.ts
git commit -m "bridge: add GET /models proxying gateway models.list"
```

---

## Task 4: `GET /agent-models` bridge route

**Files:**
- Create: `apps/bridge/src/routes/agent-models.ts`
- Modify: `apps/bridge/test/agent-models-routes.test.ts` (extend with new tests)

- [ ] **Step 1: Append failing tests to the existing test file**

Append to `apps/bridge/test/agent-models-routes.test.ts`:

```ts
test("GET /agent-models composes catalog + agents + global default", async () => {
  const a = bootApp({
    perms: [],
    gatewayHandler: (method) => {
      if (method === "models.list") {
        return { models: [{ id: "openai-codex/gpt-5.4", provider: "openai-codex" }] };
      }
      if (method === "agents.list") {
        return {
          agents: [
            { id: "main", name: "main", model: "openai-codex/gpt-5.4-mini", isDefault: true },
            { id: "claude-code", name: "claude-code", model: "openai-codex/gpt-5.4" },
          ],
        };
      }
      throw new Error("unexpected");
    },
  });
  const r = await fetch(`${a.url}/agent-models`);
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.equal(body.catalogStatus, "ok");
  assert.equal(body.globalDefaultModelId, "openai-codex/gpt-5.4-mini");
  assert.equal(body.agents.length, 2);
  assert.equal(body.agents.find((x: any) => x.agentId === "claude-code").effectiveModelId, "openai-codex/gpt-5.4");
  assert.equal(body.agents[0].hasExplicitOverride, undefined);
  a.close();
});

test("GET /agent-models survives catalog outage", async () => {
  const a = bootApp({
    perms: [],
    gatewayHandler: (method) => {
      if (method === "models.list") throw new Error("gateway");
      if (method === "agents.list") return { agents: [{ id: "main", model: "x" }] };
      throw new Error("unexpected");
    },
  });
  const r = await fetch(`${a.url}/agent-models`);
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.equal(body.catalogStatus, "unavailable");
  assert.deepEqual(body.catalog, []);
  assert.equal(body.agents.length, 1);
  a.close();
});
```

- [ ] **Step 2: Run the failing tests**

Run: `pnpm --filter bridge test --test-name-pattern "GET /agent-models"`
Expected: FAIL — `Cannot find module '.../routes/agent-models.js'`.

- [ ] **Step 3: Implement the route**

Create `apps/bridge/src/routes/agent-models.ts`:

```ts
import { Router, type Router as ExpressRouter } from "express";
import { createAgentModelsService, type CallGateway } from "../services/agent-models.js";

export type AgentModelsRouterDeps = { callGateway: CallGateway };

export function createAgentModelsRouter(deps: AgentModelsRouterDeps): ExpressRouter {
  const r: ExpressRouter = Router();
  const service = createAgentModelsService({ callGateway: deps.callGateway });

  r.get("/agent-models", async (_req, res) => {
    res.json(await service.readSnapshot());
  });

  return r;
}
```

- [ ] **Step 4: Run all agent-models tests**

Run: `pnpm --filter bridge test --test-name-pattern "agent-models|GET /models"`
Expected: all four tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/bridge/src/routes/agent-models.ts apps/bridge/test/agent-models-routes.test.ts
git commit -m "bridge: add GET /agent-models composed snapshot"
```

---

## Task 5: Convert `routes/agents.ts` to factory + permission gate

**Files:**
- Modify: `apps/bridge/src/routes/agents.ts`
- Modify: `apps/bridge/src/server.ts`
- Create: `apps/bridge/test/agents-routes.test.ts`

The current `routes/agents.ts` exports a default `Router` that imports `callGateway` directly. Convert to a factory so tests can inject a stub.

- [ ] **Step 1: Write the failing permission-gate test**

Create `apps/bridge/test/agents-routes.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import http from "node:http";
import { createAgentsRouter } from "../src/routes/agents.js";

type StubCalls = Array<{ method: string; params: unknown }>;

function bootApp(opts: {
  perms: string[];
  gatewayHandler?: (method: string, params: unknown) => unknown | Promise<unknown>;
}): { url: string; calls: StubCalls; close: () => void } {
  const calls: StubCalls = [];
  const callGateway = async (method: string, params?: unknown) => {
    calls.push({ method, params: params ?? {} });
    if (!opts.gatewayHandler) throw new Error(`unstubbed gateway call: ${method}`);
    return opts.gatewayHandler(method, params ?? {});
  };
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).auth = { user: { id: "u1" }, permissions: opts.perms };
    next();
  });
  app.use(createAgentsRouter({ callGateway }));
  const server = http.createServer(app).listen(0);
  const addr = server.address() as { port: number };
  return { url: `http://127.0.0.1:${addr.port}`, calls, close: () => server.close() };
}

test("PATCH /agents/:name returns 403 without agents.manage", async () => {
  const a = bootApp({ perms: [] });
  const r = await fetch(`${a.url}/agents/claude-code`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model: "openai-codex/gpt-5.4" }),
  });
  assert.equal(r.status, 403);
  a.close();
});
```

- [ ] **Step 2: Run the failing test**

Run: `pnpm --filter bridge test --test-name-pattern "PATCH /agents"`
Expected: FAIL — `createAgentsRouter` not exported.

- [ ] **Step 3: Convert the route file to a factory and add the gate**

Replace the entire contents of `apps/bridge/src/routes/agents.ts` with:

```ts
import { Router, type Router as ExpressRouter, type Request, type Response, type NextFunction, type RequestHandler } from "express";
import type { PermissionId } from "@openclaw-manager/types";
import { createAgentModelsService, type CallGateway } from "../services/agent-models.js";

export type AgentsRouterDeps = { callGateway: CallGateway };

function requirePerm(...perms: PermissionId[]): RequestHandler<any> {
  return (req: Request, res: Response, next: NextFunction): void => {
    const eff = (req as any).auth?.permissions ?? [];
    for (const p of perms) {
      if (!eff.includes(p)) { res.status(403).json({ error: "forbidden", missing: p }); return; }
    }
    next();
  };
}

export function createAgentsRouter(deps: AgentsRouterDeps): ExpressRouter {
  const router: ExpressRouter = Router();
  const { callGateway } = deps;
  const modelsService = createAgentModelsService({ callGateway });

  router.get("/agents", async (_req: Request, res: Response) => {
    try {
      const result = await callGateway("agents.list", {});
      res.json(result);
    } catch (err: any) {
      res.status(502).json({ error: err.message || "Failed to list agents" });
    }
  });

  router.post("/agents", async (req: Request, res: Response) => {
    try {
      const { name, workspace, emoji, avatar, model } = req.body;
      if (typeof name !== "string" || !name.trim()) {
        res.status(400).json({ error: "name is required" });
        return;
      }
      if (typeof workspace !== "string" || !workspace.trim()) {
        res.status(400).json({ error: "workspace is required" });
        return;
      }
      const createParams: Record<string, unknown> = {
        name: name.trim(),
        workspace: workspace.trim(),
      };
      if (typeof emoji === "string" && emoji.trim()) createParams.emoji = emoji.trim();
      if (typeof avatar === "string" && avatar.trim()) createParams.avatar = avatar.trim();
      const created = (await callGateway("agents.create", createParams)) as {
        ok?: boolean;
        agentId?: string;
        name?: string;
        workspace?: string;
      };
      if (typeof model === "string" && model.trim() && created?.agentId) {
        try {
          await callGateway("agents.update", {
            agentId: created.agentId,
            model: model.trim(),
          });
        } catch (updateErr: any) {
          res.status(201).json({
            ...created,
            warning: `created but failed to set model: ${updateErr?.message || "update failed"}`,
          });
          return;
        }
      }
      res.status(201).json(created);
    } catch (err: any) {
      res.status(502).json({ error: err.message || "Failed to create agent" });
    }
  });

  router.get("/agents/:name", async (req: Request, res: Response) => {
    try {
      const name = req.params.name as string;
      const result = await callGateway("agents.identity", { name });
      res.json(result);
    } catch (err: any) {
      res.status(502).json({ error: err.message || "Failed to get agent" });
    }
  });

  router.patch("/agents/:name", requirePerm("agents.manage"), async (req: Request, res: Response) => {
    try {
      const name = req.params.name as string;
      const updates = (req.body ?? {}) as Record<string, unknown>;
      if ("model" in updates) {
        const m = updates.model;
        if (typeof m !== "string" || !m.trim()) {
          res.status(400).json({ error: "invalid_model_id", detail: "model must be a non-empty string" });
          return;
        }
        const validation = await modelsService.validateModelAgainstCatalog(m.trim());
        if (!validation.ok) {
          if (validation.status === 503) {
            res.status(503).json({ error: validation.reason, detail: "gateway models.list unavailable; cannot validate model id" });
          } else {
            res.status(400).json({ error: validation.reason, detail: `model "${m}" not in current allowed catalog` });
          }
          return;
        }
        updates.model = m.trim();
      }
      const result = await callGateway("agents.update", { name, ...updates });
      res.json(result);
    } catch (err: any) {
      res.status(502).json({ error: err.message || "Failed to update agent" });
    }
  });

  router.delete("/agents/:name", async (req: Request, res: Response) => {
    try {
      const name = req.params.name as string;
      const result = await callGateway("agents.delete", { name });
      res.json(result);
    } catch (err: any) {
      res.status(502).json({ error: err.message || "Failed to delete agent" });
    }
  });

  return router;
}
```

- [ ] **Step 4: Update `server.ts` to use the factory**

In `apps/bridge/src/server.ts`:

Replace:
```ts
import agentsRouter from "./routes/agents.js";
```
with:
```ts
import { createAgentsRouter } from "./routes/agents.js";
```

Replace:
```ts
app.use(agentsRouter);
```
with:
```ts
app.use(createAgentsRouter({ callGateway }));
```

(The `callGateway` import already exists at line 41.)

- [ ] **Step 5: Re-run the test**

Run: `pnpm --filter bridge test --test-name-pattern "PATCH /agents"`
Expected: 403-without-permission test passes.

- [ ] **Step 6: Commit**

```bash
git add apps/bridge/src/routes/agents.ts apps/bridge/src/server.ts apps/bridge/test/agents-routes.test.ts
git commit -m "bridge: gate PATCH /agents/:name with agents.manage; convert to factory"
```

---

## Task 6: PATCH validation against models.list

**Files:**
- Modify: `apps/bridge/test/agents-routes.test.ts`

The validation logic was implemented in Task 5; this task adds the rest of its test coverage.

- [ ] **Step 1: Append the validation tests**

Append to `apps/bridge/test/agents-routes.test.ts`:

```ts
test("PATCH /agents/:name 400 when model not in catalog", async () => {
  const a = bootApp({
    perms: ["agents.manage"],
    gatewayHandler: (method) => {
      if (method === "models.list") {
        return { models: [{ id: "openai-codex/gpt-5.4", provider: "openai-codex" }] };
      }
      throw new Error(`unexpected: ${method}`);
    },
  });
  const r = await fetch(`${a.url}/agents/claude-code`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model: "ollama/does-not-exist" }),
  });
  assert.equal(r.status, 400);
  const body = await r.json();
  assert.equal(body.error, "invalid_model_id");
  // gateway agents.update must NOT have been called
  assert.equal(a.calls.find((c) => c.method === "agents.update"), undefined);
  a.close();
});

test("PATCH /agents/:name 503 when catalog unavailable and model in body", async () => {
  const a = bootApp({
    perms: ["agents.manage"],
    gatewayHandler: (method) => {
      if (method === "models.list") throw new Error("gateway down");
      throw new Error(`unexpected: ${method}`);
    },
  });
  const r = await fetch(`${a.url}/agents/claude-code`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model: "openai-codex/gpt-5.4" }),
  });
  assert.equal(r.status, 503);
  const body = await r.json();
  assert.equal(body.error, "model_catalog_unavailable");
  assert.equal(a.calls.find((c) => c.method === "agents.update"), undefined);
  a.close();
});

test("PATCH /agents/:name happy path proxies to agents.update", async () => {
  const a = bootApp({
    perms: ["agents.manage"],
    gatewayHandler: (method, params) => {
      if (method === "models.list") {
        return { models: [{ id: "openai-codex/gpt-5.4", provider: "openai-codex" }] };
      }
      if (method === "agents.update") {
        assert.equal((params as any).name, "claude-code");
        assert.equal((params as any).model, "openai-codex/gpt-5.4");
        return { ok: true, agentId: "claude-code" };
      }
      throw new Error(`unexpected: ${method}`);
    },
  });
  const r = await fetch(`${a.url}/agents/claude-code`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model: "openai-codex/gpt-5.4" }),
  });
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.equal(body.ok, true);
  a.close();
});

test("PATCH /agents/:name without model field skips validation and passes through", async () => {
  const a = bootApp({
    perms: ["agents.manage"],
    gatewayHandler: (method) => {
      if (method === "agents.update") return { ok: true };
      throw new Error(`unexpected: ${method}`);
    },
  });
  const r = await fetch(`${a.url}/agents/claude-code`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "renamed" }),
  });
  assert.equal(r.status, 200);
  // models.list not called
  assert.equal(a.calls.find((c) => c.method === "models.list"), undefined);
  a.close();
});

test("PATCH /agents/:name 400 when model is empty string", async () => {
  // Empty string is intentionally rejected: the gateway's `applyAgentConfig`
  // ignores empty/null model values (`...params.model ? { model } : {}`),
  // so passing one is ambiguous "clear-like" input that the bridge will not
  // proxy. Clearing is not supported in Phase 1; the UI uses "Set to current
  // default" instead. See spec § "Set to current default".
  const a = bootApp({
    perms: ["agents.manage"],
    gatewayHandler: () => { throw new Error("should not reach gateway"); },
  });
  const r = await fetch(`${a.url}/agents/claude-code`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model: "" }),
  });
  assert.equal(r.status, 400);
  a.close();
});

test("PATCH /agents/:name 403 even when body has no model field", async () => {
  // Permission is required for any PATCH; the gate is on the route, not just
  // on the model branch. Confirms the gate is not accidentally bypassed when
  // body is, e.g., a name-only update.
  const a = bootApp({ perms: [] });
  const r = await fetch(`${a.url}/agents/claude-code`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "renamed" }),
  });
  assert.equal(r.status, 403);
  a.close();
});
```

- [ ] **Step 2: Run all bridge tests**

Run: `pnpm --filter bridge test`
Expected: all pre-existing bridge tests + new agents-routes tests pass.

- [ ] **Step 3: Commit**

```bash
git add apps/bridge/test/agents-routes.test.ts
git commit -m "bridge: cover PATCH /agents/:name model validation paths"
```

---

## Task 7: Wire models + agent-models routes in `server.ts`

**Files:**
- Modify: `apps/bridge/src/server.ts`

- [ ] **Step 1: Add imports**

In `apps/bridge/src/server.ts`, after the existing route imports (around line 27), add:

```ts
import { createModelsRouter } from "./routes/models.js";
import { createAgentModelsRouter } from "./routes/agent-models.js";
```

- [ ] **Step 2: Mount the routers**

After `app.use(createAgentsRouter({ callGateway }));` (the line you changed in Task 5), insert:

```ts
app.use(createModelsRouter({ callGateway }));
app.use(createAgentModelsRouter({ callGateway }));
```

- [ ] **Step 3: Compile-check**

Run: `pnpm --filter bridge build`
Expected: no diagnostics.

- [ ] **Step 4: Smoke check the bridge boots**

Run: `pnpm --filter bridge dev`
Expected: log line `Bridge listening on 0.0.0.0:3100` within 5s. Stop the dev server (Ctrl+C) once you see it.

- [ ] **Step 5: Commit**

```bash
git add apps/bridge/src/server.ts
git commit -m "bridge: register /models and /agent-models routes"
```

---

## Task 8: Dashboard fetch helpers

**Files:**
- Create: `apps/dashboard/src/lib/agent-models-client.ts`

- [ ] **Step 1: Create the client lib**

Write `apps/dashboard/src/lib/agent-models-client.ts`:

```ts
import { actorHeaders } from "./auth/bridge-actor";
import type { AgentModelsSnapshot, ModelDescriptor } from "@openclaw-manager/types";

const BRIDGE_URL = process.env.OPENCLAW_BRIDGE_URL || "http://localhost:3100";
const BRIDGE_TOKEN = process.env.OPENCLAW_BRIDGE_TOKEN || "";

async function bridgeFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const url = `${BRIDGE_URL}${path}`;
  const actor = await actorHeaders();
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${BRIDGE_TOKEN}`,
      ...actor,
      ...(options?.headers as Record<string, string> | undefined),
    },
    next: { revalidate: 0 },
  });
  if (!res.ok) throw new Error(`Bridge ${res.status}: ${await res.text()}`);
  return res.json();
}

export async function getAgentModelsSnapshot(): Promise<AgentModelsSnapshot> {
  return bridgeFetch<AgentModelsSnapshot>("/agent-models");
}

export async function getModelsCatalog(): Promise<{ models: ModelDescriptor[]; status: "ok" | "unavailable" }> {
  return bridgeFetch("/models");
}

export async function patchAgentModel(agentName: string, modelId: string): Promise<unknown> {
  return bridgeFetch(`/agents/${encodeURIComponent(agentName)}`, {
    method: "PATCH",
    body: JSON.stringify({ model: modelId }),
  });
}
```

- [ ] **Step 2: Compile-check the dashboard**

Run: `pnpm --filter dashboard typecheck` (or if no separate target, `pnpm --filter dashboard build`).
Expected: no diagnostics.

- [ ] **Step 3: Commit**

```bash
git add apps/dashboard/src/lib/agent-models-client.ts
git commit -m "dashboard: add agent-models-client (snapshot + patch)"
```

---

## Task 9: Dashboard `/api/models` and `/api/agent-models` proxies

**Files:**
- Create: `apps/dashboard/src/app/api/models/route.ts`
- Create: `apps/dashboard/src/app/api/agent-models/route.ts`

- [ ] **Step 1: Create `/api/models` proxy**

Create `apps/dashboard/src/app/api/models/route.ts`:

```ts
import { NextResponse } from "next/server";
import { getModelsCatalog } from "@/lib/agent-models-client";
import { requireAuthApi, AuthFailure } from "@/lib/auth/current-user";

export async function GET() {
  try {
    await requireAuthApi();
    return NextResponse.json(await getModelsCatalog());
  } catch (err) {
    if (err instanceof AuthFailure) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "Bridge unreachable" }, { status: 503 });
  }
}
```

- [ ] **Step 2: Create `/api/agent-models` proxy with PATCH support**

Create `apps/dashboard/src/app/api/agent-models/route.ts`:

```ts
import { NextResponse } from "next/server";
import { getAgentModelsSnapshot, patchAgentModel } from "@/lib/agent-models-client";
import { requireAuthApi, requirePermissionApi, AuthFailure } from "@/lib/auth/current-user";

export async function GET() {
  try {
    await requireAuthApi();
    return NextResponse.json(await getAgentModelsSnapshot());
  } catch (err) {
    if (err instanceof AuthFailure) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "Bridge unreachable" }, { status: 503 });
  }
}

export async function PATCH(req: Request) {
  try {
    await requirePermissionApi("agents.manage");
    const body = (await req.json()) as { agentName?: string; modelId?: string };
    if (typeof body.agentName !== "string" || !body.agentName.trim()) {
      return NextResponse.json({ error: "agentName required" }, { status: 400 });
    }
    if (typeof body.modelId !== "string" || !body.modelId.trim()) {
      return NextResponse.json({ error: "modelId required" }, { status: 400 });
    }
    return NextResponse.json(await patchAgentModel(body.agentName, body.modelId));
  } catch (err) {
    if (err instanceof AuthFailure) {
      return NextResponse.json({ error: err.message, missing: err.missing }, { status: err.status });
    }
    // bridge-fetch error path: surface 502 so the UI can read the message
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
```

- [ ] **Step 3: Compile-check**

Run: `pnpm --filter dashboard build`
Expected: no diagnostics.

- [ ] **Step 4: Commit**

```bash
git add apps/dashboard/src/app/api/models/route.ts apps/dashboard/src/app/api/agent-models/route.ts
git commit -m "dashboard: add /api/models and /api/agent-models proxies"
```

---

## Task 10: `<AgentModelsSection>` component

**Files:**
- Create: `apps/dashboard/src/components/settings/agent-models-section.tsx`

- [ ] **Step 1: Create the component**

Write `apps/dashboard/src/components/settings/agent-models-section.tsx`:

```tsx
"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { AgentModelsSnapshot, ModelDescriptor } from "@openclaw-manager/types";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui";
import { PermissionGate } from "@/components/permission-gate";
import { useToast } from "./use-toast";

interface Props { snapshot: AgentModelsSnapshot }

function formatProviderLabel(provider: string): string {
  return provider.replace(/-/g, " ");
}

function buildGroupedCatalog(catalog: ModelDescriptor[]): Map<string, ModelDescriptor[]> {
  const map = new Map<string, ModelDescriptor[]>();
  for (const m of catalog) {
    const list = map.get(m.provider) ?? [];
    list.push(m);
    map.set(m.provider, list);
  }
  return map;
}

export function AgentModelsSection({ snapshot }: Props) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [local, setLocal] = useState(snapshot);
  const [rowPending, setRowPending] = useState<string | null>(null);

  const grouped = useMemo(() => buildGroupedCatalog(local.catalog), [local.catalog]);
  const catalogIds = useMemo(() => new Set(local.catalog.map((m) => m.id)), [local.catalog]);

  async function patch(agentName: string, modelId: string) {
    setRowPending(agentName);
    try {
      const res = await fetch("/api/agent-models", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ agentName, modelId }),
      });
      if (!res.ok) {
        const text = await res.text();
        let friendly: string;
        try {
          const body = JSON.parse(text) as { error?: string; detail?: string };
          if (body.error === "invalid_model_id") friendly = body.detail ?? "Model not in current allowed catalog.";
          else if (body.error === "model_catalog_unavailable") friendly = "Model catalog is unavailable; try again later.";
          else friendly = body.detail ?? body.error ?? text;
        } catch {
          friendly = text;
        }
        throw new Error(friendly);
      }
      // Optimistic local update
      setLocal((prev) => ({
        ...prev,
        agents: prev.agents.map((a) =>
          a.agentId === agentName ? { ...a, effectiveModelId: modelId } : a,
        ),
      }));
      startTransition(() => router.refresh());
      toast.push("success", `Model updated for ${agentName}.`);
    } catch (e) {
      toast.push("error", e instanceof Error ? e.message : "Save failed");
    } finally {
      setRowPending(null);
    }
  }

  const catalogUnavailable = local.catalogStatus === "unavailable";
  const defaultModelId = local.globalDefaultModelId;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Agent Models</CardTitle>
      </CardHeader>
      <CardBody>
        <div className="grid gap-3">
          {catalogUnavailable && (
            <div className="rounded border border-amber-700 bg-amber-950/30 px-3 py-2 text-sm text-amber-200">
              Model catalog is unavailable from the runtime. Selection is read-only until it returns.
            </div>
          )}
          <div className="text-xs text-neutral-400">
            Catalog source: OpenClaw runtime
            {defaultModelId && <> · Default model: <span className="text-neutral-200">{defaultModelId}</span></>}
          </div>
          <div className="grid gap-2">
            {local.agents.map((a) => {
              const inCatalog = a.effectiveModelId ? catalogIds.has(a.effectiveModelId) : true;
              const disabled = catalogUnavailable || pending || rowPending === a.agentId;
              return (
                <div key={a.agentId} className="flex items-center gap-3 rounded border border-neutral-800 p-3">
                  <div className="flex-1">
                    <div className="font-medium text-neutral-100">{a.agentName ?? a.agentId}</div>
                    <div className="text-xs text-neutral-400">
                      {a.effectiveModelId ?? "(no model set)"}
                      {!inCatalog && a.effectiveModelId && (
                        <span className="ml-2 text-amber-400">model not in current catalog</span>
                      )}
                    </div>
                  </div>
                  <PermissionGate perm="agents.manage">
                    <select
                      className="bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-sm text-neutral-100"
                      value={a.effectiveModelId ?? ""}
                      disabled={disabled}
                      onChange={(e) => patch(a.agentId, e.target.value)}
                    >
                      <option value="" disabled>
                        {a.effectiveModelId ? "" : "Select a model…"}
                      </option>
                      {Array.from(grouped.entries()).map(([provider, models]) => (
                        <optgroup key={provider} label={formatProviderLabel(provider)}>
                          {models.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.id}
                              {m.contextWindow ? ` · ctx ${Math.round(m.contextWindow / 1000)}k` : ""}
                              {typeof m.costInput === "number" ? ` · in $${m.costInput}/M` : ""}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                      {a.effectiveModelId && !inCatalog && (
                        <option value={a.effectiveModelId}>{a.effectiveModelId} (not in catalog)</option>
                      )}
                    </select>
                    <button
                      type="button"
                      className="rounded border border-neutral-700 px-2 py-1 text-sm text-neutral-200 disabled:opacity-50"
                      disabled={disabled || !defaultModelId}
                      title={!defaultModelId ? "default model not available from runtime" : undefined}
                      onClick={() => defaultModelId && patch(a.agentId, defaultModelId)}
                    >
                      Set to current default
                    </button>
                  </PermissionGate>
                </div>
              );
            })}
          </div>
          <div className="text-xs text-neutral-500">
            "Set to current default" saves the current default as this agent's model. It does not restore inheritance — future changes to the global default will not follow automatically.
          </div>
        </div>
      </CardBody>
    </Card>
  );
}
```

- [ ] **Step 2: Compile-check**

Run: `pnpm --filter dashboard build`
Expected: no diagnostics.

- [ ] **Step 3: Commit**

```bash
git add apps/dashboard/src/components/settings/agent-models-section.tsx
git commit -m "dashboard: add AgentModelsSection (per-agent dropdown + Set to current default)"
```

---

## Task 11: Wire `<AgentModelsSection>` into Settings page

**Files:**
- Modify: `apps/dashboard/src/app/settings/page.tsx`
- Modify: `apps/dashboard/src/components/settings/settings-view.tsx`

- [ ] **Step 1: Fetch the snapshot in the page**

In `apps/dashboard/src/app/settings/page.tsx`, after the existing `getRuntimeConfig` import block, add:

```ts
import { getAgentModelsSnapshot } from "@/lib/agent-models-client";
import type { AgentModelsSnapshot } from "@openclaw-manager/types";
```

Inside `SettingsPage`, after the existing `runtimeConfig` fetch block, add:

```ts
let agentModels: AgentModelsSnapshot | null = null;
try {
  agentModels = await getAgentModelsSnapshot();
} catch {
  // bridge unreachable for agent models — render section in degraded state
}
```

In the JSX, change:

```tsx
<SettingsView
  initialSettings={settings}
  initialRecipients={recipients}
  initialRules={rules}
  initialChannels={channels}
  initialRuntimeConfig={runtimeConfig}
/>
```

to:

```tsx
<SettingsView
  initialSettings={settings}
  initialRecipients={recipients}
  initialRules={rules}
  initialChannels={channels}
  initialRuntimeConfig={runtimeConfig}
  initialAgentModels={agentModels}
/>
```

- [ ] **Step 2: Render the section in `settings-view.tsx`**

In `apps/dashboard/src/components/settings/settings-view.tsx`:

Add to imports:
```ts
import type { AgentModelsSnapshot } from "@openclaw-manager/types";
import { AgentModelsSection } from "./agent-models-section";
```

Update `interface Props`:
```ts
interface Props {
  initialSettings: RuntimeSettingsV2;
  initialRecipients: RelayRecipient[];
  initialRules: RoutingRule[];
  initialChannels: Channel[];
  initialRuntimeConfig: RuntimeConfigSnapshot | null;
  initialAgentModels: AgentModelsSnapshot | null;
}
```

Update the function signature destructure:
```ts
export function SettingsView({
  initialSettings,
  initialRecipients,
  initialRules,
  initialChannels,
  initialRuntimeConfig,
  initialAgentModels,
}: Props) {
```

In the TOC strip (the `<a href="#runtime">…</a>` block around line 92-104), add a new entry between `#runtimes` and `#recipients`:

```tsx
<a href="#agent-models">Agent Models</a>
<span>·</span>
```

In the section list (around line 107-114), insert after the runtimes block:

```tsx
{initialAgentModels && (
  <div id="agent-models"><AgentModelsSection snapshot={initialAgentModels} /></div>
)}
```

- [ ] **Step 3: Compile-check**

Run: `pnpm --filter dashboard build`
Expected: no diagnostics.

- [ ] **Step 4: Commit**

```bash
git add apps/dashboard/src/app/settings/page.tsx apps/dashboard/src/components/settings/settings-view.tsx
git commit -m "dashboard: render Agent Models section in Settings"
```

---

## Task 12: Manual end-to-end smoke

This task validates the round trip against the live OpenClaw gateway. No automated coverage exists for the gateway integration; this gate replaces it.

- [ ] **Step 1: Start the bridge in dev mode**

Run: `pnpm dev:bridge`
Expected: `Bridge listening on 0.0.0.0:3100`. Leave running.

- [ ] **Step 2: Probe the new endpoints with curl**

In a second terminal, run:
```bash
curl -s -H "Authorization: Bearer $OPENCLAW_BRIDGE_TOKEN" http://127.0.0.1:3100/models | head -c 500
curl -s -H "Authorization: Bearer $OPENCLAW_BRIDGE_TOKEN" http://127.0.0.1:3100/agent-models | head -c 800
```

(Pull `OPENCLAW_BRIDGE_TOKEN` from `apps/bridge/.env`.)

Expected:
- `/models` returns a JSON object with `status: "ok"` and a non-empty `models` array.
- `/agent-models` returns `catalog`, `agents` (at least `main` plus any others from `openclaw.json`), and `globalDefaultModelId` non-null.

If `/models` returns `status: "unavailable"`, the gateway is not running or `models.list` is not exposed — investigate before continuing.

- [ ] **Step 3: Start the dashboard in dev mode**

Run: `pnpm dev:dashboard`
Expected: dashboard available at `http://localhost:3000`.

- [ ] **Step 4: Walk the UI**

1. Sign in to the dashboard.
2. Navigate to Settings.
3. Confirm the new "Agent Models" section appears with rows for all agents.
4. Pick an agent (e.g. `claude-code`), change the model in its dropdown.
5. Confirm the toast shows success and the row reflects the new model.
6. Inspect `~/.openclaw/openclaw.json` to confirm `agents.list` entry for that agent now has the new `model` value.
7. Click "Set to current default" on the same row. Confirm the model goes back to the global default and the file reflects it.

- [ ] **Step 5: Try a failure path**

In dev tools, use the network panel or a temporary tweak: PATCH `/api/agent-models` with a `modelId` that is not in the catalog (or temporarily set the gateway down).
Expected: row reverts (no client-side change), toast shows the bridge's error message.

- [ ] **Step 6: Stop dev servers**

Stop both `pnpm dev:bridge` and `pnpm dev:dashboard`.

- [ ] **Step 7: No commit; this task does not produce code.**

---

## Task 13: Final integration check + branch push

**Files:**
- None modified

- [ ] **Step 1: Run the full bridge test suite**

Run: `pnpm --filter bridge test`
Expected: all tests pass.

- [ ] **Step 2: Run the dashboard build**

Run: `pnpm --filter dashboard build`
Expected: no diagnostics, no warnings about unused props.

- [ ] **Step 3: Run any repo-wide lint**

Run: `pnpm -r lint` (skip if no lint target exists at the workspace root).

- [ ] **Step 4: Push the branch**

Run:
```bash
git push -u origin Gal/agent-model-override-ui
```

(This pushes to the GitHub `origin` remote. Do NOT push to `server`; that's the deploy remote and it expects merges through main per CLAUDE memory.)

- [ ] **Step 5: Open a PR**

Use the standard PR template. Title: `feat(dashboard): per-agent model override UI`. Body should reference the spec at `docs/superpowers/specs/2026-05-06-agent-model-override-ui-design.md` and call out the rollout impact: new `agents.manage` enforcement on `PATCH /agents/:name`.

- [ ] **Step 6: Do not deploy yet**

The deploy step (`git push server main`, `pnpm --filter dashboard build` on the CentOS host, `systemctl restart openclaw-dashboard`, plus `nssm restart OpenClaw-Bridge` on Windows) happens after PR merge. Do not run those commands as part of this plan.

---

## Self-review summary

- All spec sections covered: catalog read (Task 3), agent snapshot (Task 4), permission gate (Task 5), validation (Task 6), wiring (Task 7), dashboard layers (Tasks 8-11), manual e2e (Task 12).
- No placeholders. Every step contains either runnable code or a concrete command.
- Type names consistent across tasks: `AgentModelsSnapshot`, `ModelDescriptor`, `AgentModelSummary`, `getAgentModelsSnapshot`, `patchAgentModel`.
- `agents.manage` permission is reused, not added (per OpenClaw's review feedback).
- `hasExplicitOverride` is in the type but the bridge does not populate it and the UI does not render a badge in Phase 1 (per OpenClaw's review).
- The post-create best-effort `agents.update` in `routes/agents.ts` is preserved verbatim (per OpenClaw's review feedback).
- Reset action is labeled "Set to current default" with explicit helper text (per OpenClaw's review).
