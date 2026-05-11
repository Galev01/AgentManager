# Runtime-Agnostic Bridge Features Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Convert every OpenClaw-coupled bridge feature to either work runtime-agnostically (via `RuntimeAdapter`) or be explicitly marked OpenClaw-only with structured error responses, capability gating, and dashboard hide/disable behavior.

**Spec:** `docs/superpowers/specs/2026-05-10-runtime-agnostic-features-design.md`

**Architecture:** Typed `invokeAction(action, payload, context)` with closed `RuntimeActionId` union and per-action payload schemas. Hybrid routing helpers resolve runtime per request: catalog defaults to primary, stateful resources use stored `runtimeId`, mutations of existing resources reject `?runtimeId=` override. Capability snapshot is the source of truth; routes return `409 UNSUPPORTED_CAPABILITY` with structured error.

**Tech Stack:** TypeScript strict, Express bridge, `node:test`, Vitest dashboard, existing `RuntimeAdapter`/registry/capability infra in `packages/types/src/runtimes.ts` and `apps/bridge/src/services/runtimes/`.

---

## Phase ordering

```
A    typed actions + helpers                  (sequential, blocks A2)
A2   contract tests + /runtimes/health         (sequential, blocks B/C/D/E)
B    catalog reads                             (after A2)
C    mutations                  } parallel after A2
D    claude-code multi-runtime  } parallel after A2
E    copilot migration          } parallel after A2
F    dashboard capability gating                (after enough of B/C/D/E)
```

Six waves of subagent dispatches. Each phase produces one commit on `Gal/runtime-agnostic` (current branch).

---

## Phase A: typed actions + helpers + adapter signature update

**Files:**
- Modify: `packages/types/src/runtimes.ts` — add `RuntimeReadCapabilityId`, `RuntimeActionId`, `RuntimeActionPayload`, update `CapabilityId`, `RuntimeAdapter.invokeAction` signature.
- Create: `apps/bridge/src/services/runtime-resolver.ts` — `resolveRuntimeForCatalog`, `resolveRuntimeForCreate`, `resolveRuntimeForResource`, `requireCapability`, `UnsupportedCapabilityError`, `InvalidRuntimeOverrideError`.
- Create: `apps/bridge/src/services/runtime-action-schemas.ts` — Zod or hand-rolled validators per action id.
- Modify: `apps/bridge/src/services/runtimes/openclaw.ts` — implement `invokeAction(action, payload, context)` for all action ids by routing internally to `callGateway`.
- Modify: `apps/bridge/src/services/runtimes/hermes.ts` — implement `invokeAction(action, payload, context)` returning structured unsupported for all writes (Hermes Phase 1 has no write capability except `sessions.send` if present).
- Modify: `apps/bridge/src/services/runtimes/zeroclaw.ts` and `nanobot.ts` — adapt to new signature; declare unsupported for actions they don't implement.
- Modify: `apps/bridge/src/services/runtimes/factories.ts` — pass `bearer` from env per runtime kind.

### Task A.1: Type additions

- [ ] Read `packages/types/src/runtimes.ts:151` (existing `RuntimeAdapter` + `InvokeActionRequest` + `InvokeActionResult`).
- [ ] Add the new type unions exactly as specified in the spec (`RuntimeReadCapabilityId`, `RuntimeActionId`, `RuntimeActionPayload`, `CapabilityId = RuntimeReadCapabilityId | RuntimeActionId`).
- [ ] Update `RuntimeAdapter.invokeAction` from `(req: InvokeActionRequest)` to `<A extends RuntimeActionId>(action: A, payload: RuntimeActionPayload[A], context: RuntimeActionContext)`.
- [ ] `RuntimeActionContext = { actor: ActorAssertionRef; resourceRuntimeId?: string }`.
- [ ] `RuntimeActionResult` keeps the existing discriminated union shape.
- [ ] Build types package: `pnpm --filter @openclaw-manager/types build`. Errors will cascade — that's expected.

### Task A.2: Schemas

- [ ] Create `apps/bridge/src/services/runtime-action-schemas.ts`:
  ```ts
  export type RuntimeActionSchema<A extends RuntimeActionId> = (input: unknown) => RuntimeActionPayload[A];
  export const runtimeActionSchemas: { [A in RuntimeActionId]: RuntimeActionSchema<A> } = {
    "agents.create": (i) => { /* validate & cast */ },
    // ...one per action id
  };
  export class InvalidActionPayloadError extends Error { /* carries action, fieldErrors */ }
  ```
- [ ] Hand-rolled validators (no Zod dep yet): each function checks required string/object fields, throws `InvalidActionPayloadError` with structured `fieldErrors` array.
- [ ] Test: `apps/bridge/test/runtime-action-schemas.test.ts` — every action id has a schema; valid input passes, missing fields throw with `fieldErrors`.

### Task A.3: Resolver helpers + custom errors

- [ ] Create `apps/bridge/src/services/runtime-resolver.ts`:
  ```ts
  export class UnsupportedCapabilityError extends Error {
    constructor(public runtimeId: string, public capabilityId: CapabilityId, public reason: string) {
      super(`Runtime '${runtimeId}' does not support ${capabilityId}: ${reason}`);
    }
  }
  export class InvalidRuntimeOverrideError extends Error {
    constructor(public resourceRuntimeId: string, public attempted: string) {
      super(`?runtimeId=${attempted} cannot override resource-stored runtimeId=${resourceRuntimeId}`);
    }
  }
  export async function resolveRuntimeForCatalog(req, registry, runtimeConfig): Promise<{ runtimeId, source }>;
  export async function resolveRuntimeForCreate(req, registry, runtimeConfig): Promise<{ runtimeId, source }>;
  export function resolveRuntimeForResource(resource: { runtimeId?: string }, query?: { runtimeId?: string }): { runtimeId };
  export async function requireCapability(adapter: RuntimeAdapter, capabilityId: CapabilityId): Promise<{ partial?: PartialCapability }>;
  ```
- [ ] `resolveRuntimeForResource` throws `InvalidRuntimeOverrideError` when query override mismatches stored.
- [ ] `requireCapability` reads `getCapabilities()`, throws `UnsupportedCapabilityError` if `unsupported` includes the id; returns partial info if in `partial`.
- [ ] Test: `apps/bridge/test/runtime-resolver.test.ts` — covers each helper, override mismatch case, missing-runtime fallback to primary, primary-disabled fallback behavior matches `runtime-config` service.

### Task A.4: Update OpenClaw adapter `invokeAction`

- [ ] Read `apps/bridge/src/services/runtimes/openclaw.ts`.
- [ ] Replace existing `invokeAction(req)` with typed signature. Implement all action ids by mapping to `callGateway`:
  - `agents.create` → `callGateway("agents.create", payload)`
  - `agents.update` → `callGateway("agents.update", { name: payload.name, ...payload.updates })`
  - `agents.delete` → `callGateway("agents.delete", { name: payload.name })`
  - `channels.connect` → `callGateway("channels.connect", payload)`
  - `channels.disconnect` → `callGateway("channels.disconnect", payload)`
  - `tools.invoke` → `callGateway("tools.invoke", payload)`
  - `cron.write` → `callGateway("cron.upsert", payload)`
  - `cron.delete` → `callGateway("cron.delete", payload)`
  - `claudeCode.ask` → existing claude-code-ask orchestrator entry point (keep current behavior; just route through here)
  - `sessions.send` → `callGateway("sessions.send", payload)`
  - `memory.write`, `skills.install`, `config.set` — declare unsupported (OpenClaw has these as gateway methods but are out of v1 scope; safer to declare unsupported and add later than misimplement).
- [ ] Update OpenClaw `getCapabilities()` `supported` list to include all the action ids it supports + the existing read ids.
- [ ] Update `apps/bridge/test/runtimes-openclaw-adapter.test.ts` to exercise each new action through the adapter with a mock `callGateway`.

### Task A.5: Update Hermes adapter `invokeAction`

- [ ] Read `apps/bridge/src/services/runtimes/hermes.ts`.
- [ ] Replace `invokeAction(req)` with typed signature. Hermes Phase 1 has no write actions; return structured unsupported for every action id:
  ```ts
  invokeAction: async (action, payload, context) => ({
    ok: false,
    error: `hermes phase 1 has no '${action}' action`,
    projectionMode: "exact",
  }),
  ```
- [ ] Update Hermes `getCapabilities()` `unsupported` list to include all action ids from `RuntimeActionId`.
- [ ] Update `apps/bridge/test/runtimes-hermes-adapter.test.ts` accordingly.

### Task A.6: Update Zeroclaw + Nanobot adapters

- [ ] Same pattern: typed signature, declare unsupported for unimplemented actions, keep existing behavior for any action they did implement.
- [ ] Update tests.

### Task A.7: Build + commit

- [ ] `pnpm -r build` clean.
- [ ] `pnpm --filter bridge test` passes (332+ tests; existing routes still work because no route changes yet — adapters internally route old calls through new typed paths, but route handlers still call old `callGateway` directly).
- [ ] Commit:
  ```
  feat(types,bridge): typed RuntimeActionId + invokeAction + resolver helpers

  Add closed RuntimeActionId union with per-action payload schemas. Update
  RuntimeAdapter.invokeAction signature to typed (action, payload, context).
  Add runtime-resolver helpers (resolveRuntimeForCatalog/Create/Resource +
  requireCapability) and structured UnsupportedCapabilityError /
  InvalidRuntimeOverrideError. Adapters: OpenClaw implements all writes,
  Hermes/Zeroclaw/Nanobot declare unsupported.

  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
  ```

---

## Phase A2: contract tests + /runtimes/health aggregate

**Files:**
- Create: `apps/bridge/src/routes/runtimes-health.ts`
- Modify: `apps/bridge/src/server.ts` — mount the new route after the existing `runtimes` router.
- Create: `apps/bridge/test/runtimes-health-route.test.ts`
- Create: `apps/bridge/test/runtime-resolver-contract.test.ts` — broader contract tests covering combinations.

### Task A2.1: `/runtimes/health` aggregate

- [ ] Route returns:
  ```json
  {
    "ok": true,
    "primaryRuntimeId": "oc-main",
    "runtimes": [
      { "runtimeId": "oc-main", "ok": true, "status": "healthy",
        "capabilities": { "supported": [...], "partial": [...], "unsupported": [...] } },
      { "runtimeId": "hermes-prod", "ok": false, "status": "unhealthy",
        "error": "ECONNREFUSED", "capabilities": { ... } }
    ]
  }
  ```
- [ ] Iterates `runtimeConfig.list()`, calls `adapter.health()` + `adapter.getCapabilities()` for each. Disabled runtimes show `status: "disabled"`. Adapter errors caught per-runtime; one runtime down does not 500 the endpoint.
- [ ] Public-ish read; same auth as other `/runtimes/*` routes (requires `runtimes.view` or whatever existing perm).
- [ ] Test: route returns shape; one disabled runtime shows disabled; one timing-out adapter shows unhealthy with reason; aggregate `ok` is true if every enabled runtime healthy.

### Task A2.2: Contract test suite

- [ ] `apps/bridge/test/runtime-resolver-contract.test.ts` covers:
  - Catalog read: no `?runtimeId` → uses primary; `?runtimeId=foo` → uses foo; unknown id → 400; primary disabled → falls back per `runtime-config` service.
  - Create: `body.runtimeId` overrides query overrides primary.
  - Resource: stored runtimeId honored; query override matching stored is OK; query override mismatching stored throws `InvalidRuntimeOverrideError`.
  - Capability check: supported → OK; partial → returns partial info; unsupported → throws `UnsupportedCapabilityError`.
  - Action schema: valid payload OK; missing required field throws `InvalidActionPayloadError` with `fieldErrors`.
- [ ] Use a synthetic registry with two adapter fakes (one supporting `agents.create`, one declaring unsupported).

### Task A2.3: Build + commit

- [ ] `pnpm --filter bridge test` passes including new tests.
- [ ] Commit:
  ```
  feat(bridge): /runtimes/health aggregate + contract test slice

  GET /runtimes/health returns per-runtime health + capability snapshot.
  One unhealthy runtime does not 500 the endpoint. Adds shared contract
  tests for resolver helpers, capability gating, and action-payload
  schema validation — stable canonical semantics for downstream phases.

  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
  ```

---

## Phase B: catalog reads through adapter

**Files:**
- Modify: `apps/bridge/src/routes/agents.ts` — `GET /agents`, `GET /agents/:name` route through adapter.
- Modify: `apps/bridge/src/routes/agent-sessions.ts`
- Modify: `apps/bridge/src/routes/channels.ts`
- Modify: `apps/bridge/src/routes/tools.ts`
- Modify: `apps/bridge/src/routes/cron.ts` (read paths only — write deferred to Phase C)
- Modify: `apps/bridge/src/routes/logs.ts`
- Modify: `apps/bridge/src/routes/models.ts` + `apps/bridge/src/routes/agent-models.ts` + `apps/bridge/src/services/agent-models.ts` — `models.list` becomes a capability-gated read.
- Modify: `apps/bridge/src/server.ts` — pass `runtimeRegistry` + `runtimeConfigService` into route factories that need them.

### Task B.1: Refactor route factories to accept runtime deps

Most route files currently `import { callGateway } from "../services/gateway.js"`. They become factories that take `{ registry, runtimeConfig, callGateway }` so they can resolve runtime first and fall back to direct gateway calls when staying OpenClaw-only.

- [ ] Add `createAgentsRouter` (already a factory) signature update: `(deps: { registry, runtimeConfig })`.
- [ ] Convert non-factory routers to factories one at a time: `agentSessionsRouter`, `channelsRouter`, `toolsRouter`, `cronRouter`, `logsRouter`, `models` router via `createModelsRouter`.
- [ ] Mount in `server.ts` with proper deps.

### Task B.2: Convert each catalog read

For each catalog GET handler:

- [ ] Resolve `{ runtimeId }` via `resolveRuntimeForCatalog(req, registry, runtimeConfig)`.
- [ ] Get `adapter = await registry.adapter(runtimeId)`. 404 if null.
- [ ] `await requireCapability(adapter, capabilityId)`. Catches `UnsupportedCapabilityError` → 409.
- [ ] Call `adapter.listEntities(kind)` or `adapter.getEntity(kind, id)`.
- [ ] Return normalized response: `{ runtimeId, source, items: RuntimeEntity[] }` (catalog wrapping signals which runtime served the request).
- [ ] Backwards-compat: existing dashboard callers that don't read the `runtimeId` field still work because `items` shape is the established `RuntimeEntity` shape.

### Task B.3: `models.list` capability

- [ ] Add `models.list` to OpenClaw adapter's `supported` list.
- [ ] Add to Hermes adapter's `unsupported` list.
- [ ] Implement `OpenClawAdapter.listEntities("model")` — currently the adapter doesn't have a "model" entity kind; add to `RuntimeEntityKind` union if needed, or use `invokeAction("models.list", {})` returning a typed payload (decision: prefer extending `RuntimeEntityKind` with `"model"` since it's a read, not a write). Update `packages/types/src/runtimes.ts` accordingly.
- [ ] Convert `routes/models.ts` to use the catalog-read pattern.
- [ ] Convert `services/agent-models.ts:validateModelAgainstCatalog` to consume the new shape.

### Task B.4: Tests

- [ ] Per-route test: catalog read with default primary, with override, with unsupported runtime (returns 409).
- [ ] Contract: `GET /agents?runtimeId=hermes-prod` returns `409 UNSUPPORTED_CAPABILITY` with the structured error.
- [ ] Models: `GET /models?runtimeId=hermes-prod` returns 409.

### Task B.5: Build + commit

- [ ] `pnpm --filter bridge test` passes.
- [ ] Single commit:
  ```
  feat(bridge): catalog reads route through RuntimeAdapter

  agents/agent-sessions/channels/tools/cron/logs/models GETs resolve
  runtime via resolveRuntimeForCatalog, capability-gate via
  requireCapability, dispatch via adapter.listEntities. ?runtimeId=
  override supported; unsupported runtime returns 409. models.list
  becomes a runtime-agnostic capability (OpenClaw supported, Hermes
  unsupported).

  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
  ```

---

## Phase C: mutations through invokeAction

**Files:**
- Modify: `apps/bridge/src/routes/agents.ts` — `POST/PATCH/DELETE` route through `invokeAction`.
- Modify: `apps/bridge/src/routes/channels.ts` — `POST /channels/:id/connect|disconnect`.
- Modify: `apps/bridge/src/routes/tools.ts` — `POST /tools/:id/invoke`.
- Modify: `apps/bridge/src/routes/cron.ts` — `POST/PATCH/DELETE`.

### Task C.1: Convert each mutation handler

For each mutation:

- [ ] **Create flows** (`POST /agents`, `POST /cron`, etc.):
  - Resolve via `resolveRuntimeForCreate`.
  - Validate payload via `runtimeActionSchemas[actionId](req.body)`.
  - `requireCapability(adapter, actionId)`.
  - Build `context: RuntimeActionContext = { actor: req.actorAssertion, resourceRuntimeId: undefined }`.
  - Call `adapter.invokeAction(actionId, validated, context)`.
  - On `{ok: false}` from adapter, propagate as 502/503 (runtime-side failure) or 409 (declared unsupported).
- [ ] **Update flows** on existing resources (`PATCH /agents/:name`):
  - Per spec resource-mutation ordering: load resource (if applicable — agents are OpenClaw-owned, no local store), validate runtime override mismatch, etc.
  - For agents, OpenClaw owns the data; treat as catalog mutation with override.
  - For cron jobs: if we keep our own store of cron metadata, lookup applies; otherwise treat as catalog mutation.
- [ ] **Delete flows**: same.

### Task C.2: Tests

- [ ] Each mutation: happy path on OpenClaw, unsupported on Hermes, invalid payload returns 422 with `fieldErrors`.
- [ ] `?runtimeId=` override on a create flow honored.
- [ ] Existing-resource mutation with mismatched override: 400 `INVALID_RUNTIME_OVERRIDE` (when applicable — agents/cron may be catalog-style and not have local stored runtime; document per route).

### Task C.3: Build + commit

- [ ] `pnpm --filter bridge test` clean.
- [ ] Commit:
  ```
  feat(bridge): mutations route through typed invokeAction

  POST/PATCH/DELETE for agents, channels, tools, cron flow through
  RuntimeAdapter.invokeAction with typed payloads, schema validation,
  and capability gating. Hermes returns structured 409 for write
  actions; payload validation errors return 422 with fieldErrors.

  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
  ```

---

## Phase D: Claude Code multi-runtime

**Files:**
- Modify: `apps/bridge/src/services/claude-code-sessions.ts` — session record gains `runtimeId: string`.
- Modify: `apps/bridge/src/services/claude-code-ask.ts` — orchestrator resolves runtime from session, dispatches via adapter.
- Modify: `apps/bridge/src/routes/claude-code.ts` — `/claude-code/ask` capability-gates `claudeCode.ask`.
- Modify: `packages/types/src/index.ts` (or wherever `ClaudeCodeAskRequest` lives) — extend type with optional `runtimeId`.
- Modify: `packages/mcp-openclaw/src/server.ts` — accept `OPENCLAW_RUNTIME_ID` env var; pass through to bridge.

### Task D.1: Session-record runtimeId

- [ ] `ClaudeCodeSession` type gains `runtimeId: string`.
- [ ] Read-time backfill: missing `runtimeId` defaults to `runtimeConfig.primaryRuntimeId`. Persist on next write.
- [ ] Test: legacy session with no `runtimeId` reads with backfilled value; subsequent `setSessionMode` write commits the field.

### Task D.2: Orchestrator dispatch

- [ ] `claude-code-ask.ts:createAskOrchestrator` deps gain `{ registry }`.
- [ ] On ask: load session, get its `runtimeId`, resolve adapter, `requireCapability(adapter, "claudeCode.ask")`, validate payload, `adapter.invokeAction("claudeCode.ask", validated, context)`.
- [ ] Adapter implementations:
  - OpenClaw: existing implementation, just routed through `invokeAction("claudeCode.ask", ...)`.
  - Hermes: structured unsupported with reason "Hermes Phase 1 has no claudeCode.ask integration; see hermes-shim upstream issue #N".

### Task D.3: MCP server runtime hint

- [ ] `packages/mcp-openclaw/src/server.ts` reads `OPENCLAW_RUNTIME_ID` from env. Passes as request param when calling bridge `/claude-code/ask`.
- [ ] If env unset, bridge uses session's stored runtimeId (or primary for new sessions).

### Task D.4: Tests + commit

- [ ] Bridge test: ask against OpenClaw session works; ask against (synthetically constructed) Hermes session returns 409.
- [ ] Migration test: legacy session reads with backfill, write commits, second read returns persisted runtimeId.
- [ ] Commit:
  ```
  feat(bridge,mcp): claude-code routes per-session runtime

  Claude-code session records gain runtimeId (read-time backfill from
  primary, persist on write). /claude-code/ask resolves runtime from
  session, capability-gates claudeCode.ask, dispatches via adapter.
  Hermes declares claudeCode.ask unsupported. mcp-openclaw forwards
  OPENCLAW_RUNTIME_ID env to bridge requests.

  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
  ```

---

## Phase E: copilot migration

**Files:**
- Modify: `packages/types/src/copilot.ts` — `CopilotSessionMeta.runtimeId: string` (additive; keep `backend` for UI display).
- Modify: `apps/bridge/src/services/copilot/store.ts` — backfill on read, persist on write.
- Modify: `apps/bridge/src/services/copilot/orchestrator.ts` — use `runtimeId` for dispatch decisions; `backend` becomes a derived field (`backend = runtime.kind`).
- Modify: `apps/bridge/src/routes/copilot.ts` — accept `runtimeId` in `CopilotSessionCreateInput`; if absent, derive from `backend`.

### Task E.1: Type + store

- [ ] Add `runtimeId` to `CopilotSessionMeta`.
- [ ] `readMeta` backfills missing `runtimeId` from `backend`:
  - `backend === "openclaw"` → first runtime with `kind === "openclaw"` from registry, else primary.
  - `backend === "hermes"` → first runtime with `kind === "hermes"` from registry.
- [ ] `updateMeta` persists `runtimeId` on disk.
- [ ] Test: legacy meta without `runtimeId` reads with backfilled value; update commits.

### Task E.2: Orchestrator + route

- [ ] Orchestrator selects backend by looking up adapter by `runtimeId`.
- [ ] `POST /copilot/sessions` accepts `runtimeId` (preferred) or `backend` (legacy).
- [ ] If both present, `runtimeId` wins.

### Task E.3: Tests + commit

- [ ] Existing copilot tests pass with no behavioral change.
- [ ] New test: create session with `runtimeId` directly; old test path with `backend` still works.
- [ ] Commit:
  ```
  feat(bridge): copilot session runtimeId migration

  CopilotSessionMeta carries runtimeId; backend kept as UI-display alias.
  Read-time backfill from backend → runtimeId; persist on write.
  POST /copilot/sessions accepts runtimeId (preferred) or backend (legacy).

  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
  ```

---

## Phase F: dashboard capability gating

**Files:**
- Create: `apps/dashboard/src/components/runtime/capability-gate.tsx` — wrapper consuming `/runtimes/health`.
- Create: `apps/dashboard/src/hooks/use-runtime-health.ts` — SWR-style hook caching the snapshot.
- Modify: `apps/dashboard/src/components/header.tsx` — active-runtime selector.
- Modify: `apps/dashboard/src/lib/runtime-client.ts` — add `?runtimeId=` propagation helper.
- Modify: every dashboard page that touches a gated route — wrap in `<CapabilityGate>`.
- Modify: OpenClaw-only pages (`/conversations`, `/settings`, `/cron` if WhatsApp-coupled, `/config` for gateway-config) — add OpenClaw badge + hide/disable when active runtime ≠ openclaw.

### Task F.1: `<CapabilityGate>` component

- [ ] Reads `/runtimes/health` snapshot via `useRuntimeHealth(runtimeId)` hook (SWR caching, refetch on focus).
- [ ] Props: `runtimeId`, `capabilityId`, `children`, optional `unsupportedFallback`.
- [ ] Renders `children` if supported. Renders partial badge + reason + `children` if partial. Renders fallback (or default disabled state) if unsupported.
- [ ] Test: each branch.

### Task F.2: Active-runtime selector

- [ ] Header dropdown listing runtimes from the snapshot.
- [ ] Active runtime stored in URL query (`?runtimeId=`) so deep links preserve choice.
- [ ] Sidebar nav highlights OpenClaw-only items dimmed when active runtime ≠ openclaw, with an "OpenClaw integrations" expandable group exposing them.

### Task F.3: Wire pages

- [ ] `/agents`: catalog read + create button gated on `agents.create`.
- [ ] `/agent-sessions`: catalog read.
- [ ] `/channels`, `/tools`, `/cron`, `/logs`: catalog reads.
- [ ] `/copilot`: backend dropdown sources runtimes from snapshot.
- [ ] `/runtimes`: existing page; surface health status from snapshot.
- [ ] `/conversations`, `/settings`, `/relay` (WhatsApp plugin): mark OpenClaw-only via badge; hide from primary nav when active ≠ openclaw.

### Task F.4: Tests + commit

- [ ] Vitest component tests for `<CapabilityGate>` and the active-runtime selector.
- [ ] Commit:
  ```
  feat(dashboard): capability gating + active-runtime selector

  <CapabilityGate> consumes /runtimes/health and renders supported,
  partial-with-reason, or unsupported states uniformly. Header dropdown
  selects active runtime via ?runtimeId= URL param. OpenClaw-only pages
  get a kind badge and dim/hide when active runtime is non-OpenClaw.

  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
  ```

---

## Self-review

After all phases land:

- [ ] All 17 originally OpenClaw-coupled routes accounted for: 13 agnostic-via-adapter, 4 OpenClaw-only with explicit marking.
- [ ] `pnpm --filter bridge test` passes (modulo the documented pre-existing `youtube-rebuild.test.ts` failure).
- [ ] `pnpm --filter dashboard test` passes.
- [ ] `pnpm -r build` clean.
- [ ] No route bypasses `requireCapability` for a gated capability.
- [ ] No adapter receives an unknown action string (route-layer schema validation enforced).
- [ ] Resource mutations reject `?runtimeId=` override mismatch with 400.
- [ ] `GET /runtimes/health` aggregates correctly.
- [ ] Dashboard does not render unsupported features as if they were broken — explicit "not supported on $runtime" with reason.
