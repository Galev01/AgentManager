# Runtime-Agnostic Bridge Features — Design

**Date:** 2026-05-10
**Authors:** Claude Code, Hermes (consulted via mcp-hermes, session `7d92f128`)
**Status:** Draft for review
**Builds on:** `2026-05-10-global-distribution-design.md`, `2026-04-23-multi-runtime-control-plane.md`, `2026-05-04-hermes-runtime-integration-design.md`

## Problem

Despite mature multi-runtime infrastructure (`RuntimeAdapter` interface, runtime registry, capability snapshots), 17 bridge routes still hardwire `callGateway(method, params)` directly to the OpenClaw SDK. Adding a non-OpenClaw runtime today exposes only copilot chat and a partial runtime-config view. Every other feature — agents catalog, sessions, channels, tools, cron, logs, Claude Code MCP ask — silently assumes OpenClaw and breaks if the user wires a Hermes (or future) runtime as primary.

This is a product gap, not a refactor. Multi-runtime support is the app's stated core feature; today it's plumbing without payoff.

## Goal

Every bridge feature falls into exactly one of three buckets, with consistent contracts:

1. **Runtime-agnostic via adapter.** Catalog reads (`agents`, `sessions`, `tools`, `cron`, `channels`, `logs`, `models`) and runtime-shaped mutations (`agents.create`, `tools.invoke`, `cron.write`, `compose.create`, `claudeCode.ask`, `sessions.send`) flow through the runtime registry. Capability snapshot gates the call; unsupported returns a structured error.
2. **OpenClaw-only by design.** `gateway` (raw SDK proxy), `gateway-config` (writes `~/.openclaw/openclaw.json`), `gateway-control` (process lifecycle), and the WhatsApp plugin routes (`conversations`, `messages`, `commands`, `settings`, `relay` — filesystem-coupled to the `whatsapp-auto-reply` extension). Marked explicitly. Dashboard hides them when active runtime ≠ OpenClaw.
3. **Bridge-owned (cross-runtime infra).** Runtime registry, runtime-config, capability snapshots, health, copilot session storage, claude-code session storage. Already mostly in place.

## Non-goals

- No new entity-CRUD methods on `RuntimeAdapter`. Mutations stay on `invokeAction` (typed and schema-validated; see §2).
- No "all runtimes" merged-catalog view in v1 (`?runtimeId=all`). Single-runtime override only. Document the namespacing convention (`${runtimeId}:${entityType}:${entityId}`) for a future v2.
- No changes to how the OpenClaw plugin manages WhatsApp state. Its routes stay as-is; we just label them OpenClaw-only.
- No Hermes upstream changes. Where Hermes lacks a capability (e.g., `sessions.send`, `claudeCode.ask`, agents catalog), the route returns a structured `UNSUPPORTED_CAPABILITY` 409 and the dashboard renders an honest "not supported on $runtime" state.
- No dashboard-side data merging across runtimes. Dashboard reads one runtime at a time.

## Architecture

### Routing axis: hybrid

Per Hermes's hard line: `configuredPrimaryRuntimeId` is a **default**, not a source of truth.

- **Catalog/list/read:** `runtimeId = req.query.runtimeId ?? configuredPrimaryRuntimeId`. Override at will.
- **Stateful resources** (sessions, turns, cron jobs, claude-code conversations): the `runtimeId` is **stored on the resource at creation** and used for every follow-up operation. Changing primary runtime never reroutes existing sessions.
- **Mutations of existing resources:** `runtimeId` resolves from the resource's stored metadata, not from query/body. `?runtimeId=hermes` cannot redirect a mutation against an OpenClaw-owned resource.
- **Mutations creating new resources:** `runtimeId = body.runtimeId ?? query.runtimeId ?? configuredPrimaryRuntimeId`.

Three shared helpers (in `apps/bridge/src/services/runtime-resolver.ts`):

```ts
resolveRuntimeForCatalog(req): { runtimeId, source: "query" | "primary" }
resolveRuntimeForCreate(req): { runtimeId, source: "body" | "query" | "primary" }
resolveRuntimeForResource(resource): { runtimeId } // throws if missing on persisted resource
requireCapability(runtimeId, capabilityId): asserts capability is supported (or partial); throws UnsupportedCapabilityError otherwise
```

Routes call these helpers; no per-route hand-rolled logic.

### Mutating ops via typed `invokeAction`

`invokeAction` becomes the single mutation surface across runtimes. Action ids are a closed union; payloads validate against per-action schemas; capability gating is mandatory.

```ts
// packages/types/src/runtimes.ts (additions)

// Reads are capability-gated but never go through invokeAction.
export type RuntimeReadCapabilityId =
  | "agents.list" | "agents.read"
  | "sessions.list" | "sessions.read"
  | "channels.list" | "channels.status"
  | "memory.query"
  | "skills.list"
  | "tools.list"
  | "cron.list"
  | "models.list"
  | "logs.tail"
  | "config.get";

// Writes flow through invokeAction with typed payloads.
export type RuntimeActionId =
  | "agents.create" | "agents.update" | "agents.delete"
  | "channels.connect" | "channels.disconnect"
  | "tools.invoke"
  | "cron.write" | "cron.delete"
  | "claudeCode.ask"
  | "sessions.send"
  | "memory.write"
  | "skills.install"
  | "config.set";

// Every capability id (read OR action) is gated through the same matrix.
export type CapabilityId = RuntimeReadCapabilityId | RuntimeActionId;

export type RuntimeActionPayload = {
  "agents.create": { name: string; workspace: string; emoji?: string; avatar?: string; model?: string };
  "agents.update": { name: string; updates: Record<string, unknown> };
  "agents.delete": { name: string };
  "channels.connect": { channelId: string; config?: JsonValue };
  "channels.disconnect": { channelId: string };
  "tools.invoke": { toolId: string; input: JsonValue };
  "cron.write": { id?: string; spec: { cron: string; payload: JsonValue; enabled: boolean } };
  "cron.delete": { id: string };
  "claudeCode.ask": { ide: string; workspace: string; msgId: string; question: string; sessionId?: string };
  "sessions.send": { sessionKey: string; message: string };
  "memory.write": { key: string; value: JsonValue };
  "skills.install": { ref: string };
  "config.set": { path: string; value: JsonValue };
};

// Action context: bridge-stamped, never caller-supplied.
export type RuntimeActionContext = {
  actor: ActorAssertionRef;
  resourceRuntimeId?: string; // when mutating an existing resource
};

// Updated adapter signature.
export interface RuntimeAdapter {
  // existing read methods unchanged...
  invokeAction<A extends RuntimeActionId>(
    action: A,
    payload: RuntimeActionPayload[A],
    context: RuntimeActionContext,
  ): Promise<RuntimeActionResult>;
}
```

The bridge validates `(action, payload)` against the schema **before** dispatching to the adapter. Unknown actions are rejected at the route layer; adapters never see arbitrary strings.

Capability gating layered on top:

```ts
const cap = await registry.adapter(runtimeId).getCapabilities();
if (cap.unsupported.includes(action)) throw new UnsupportedCapabilityError(...);
const partial = cap.partial.find(p => p.id === action);
if (partial) {
  // proceed; route response includes partial { reason, projectionMode, lossiness }
}
```

### Structured unsupported-capability error

Every route uses a single error shape:

```ts
// HTTP 409
{
  ok: false,
  error: {
    code: "UNSUPPORTED_CAPABILITY",
    message: "Runtime 'hermes' does not support agents.create",
    runtimeId: "hermes",
    capabilityId: "agents.create",
    reason: "Hermes adapter is read-only; agent catalog mutations not implemented"
  }
}
```

HTTP status conventions:
- `400` — invalid runtime id / invalid action id
- `404` — resource not found / runtime not found
- `409` — supported runtime, unsupported capability
- `422` — supported capability, invalid payload (schema validation)
- `502` / `503` — runtime unavailable / unhealthy

Health vs capability vs enabled stay distinct. A runtime can be: configured-but-disabled, enabled-but-unhealthy, healthy-but-unsupported-capability, supported-but-partial. Never collapse to one boolean.

### Component-by-component routing

| Bucket | Route | Handling | Capability id |
|---|---|---|---|
| Agnostic | `GET /agents` | `adapter.listEntities("agent")` | `agents.list` |
| Agnostic | `GET /agents/:name` | `adapter.getEntity("agent", name)` | `agents.read` |
| Agnostic | `POST /agents` | `adapter.invokeAction("agents.create", payload)` | `agents.create` |
| Agnostic | `PATCH /agents/:name` | `invokeAction("agents.update", payload)` (resource-scoped) | `agents.update` |
| Agnostic | `DELETE /agents/:name` | `invokeAction("agents.delete", payload)` | `agents.delete` |
| Agnostic | `GET /agent-sessions` | `adapter.listEntities("session")` | `sessions.list` |
| Agnostic | `GET /agent-sessions/:id` | `adapter.getEntity("session", id)` | `sessions.read` |
| Agnostic | `GET /channels` | `adapter.listEntities("channel")` | `channels.list` |
| Agnostic | `POST /channels/:id/connect` | `invokeAction("channels.connect", payload)` | `channels.connect` |
| Agnostic | `POST /channels/:id/disconnect` | `invokeAction("channels.disconnect", payload)` | `channels.disconnect` |
| Agnostic | `GET /tools` | `adapter.listEntities("tool")` | `tools.list` |
| Agnostic | `POST /tools/:id/invoke` | `invokeAction("tools.invoke", payload)` | `tools.invoke` |
| Agnostic | `GET /cron` | `adapter.listEntities("cron")` | `cron.list` |
| Agnostic | `POST /cron` / `PATCH /cron/:id` | `invokeAction("cron.write", payload)` | `cron.write` |
| Agnostic | `DELETE /cron/:id` | `invokeAction("cron.delete", payload)` | `cron.delete` |
| Agnostic | `GET /logs` | `adapter.listActivity(sinceMs, limit)` | `logs.tail` |
| OpenClaw-only | `POST /compose` | unchanged; writes WhatsApp plugin command file | n/a |
| Agnostic | `POST /claude-code/ask` | resolve runtime from session metadata; `invokeAction("claudeCode.ask", payload)` | `claudeCode.ask` |
| Agnostic (catalog) | `GET /models` | `adapter.invokeAction("models.list", {})` returning `{models: ModelDescriptor[]}`; OR new dedicated `adapter.listCatalog(kind)` — see open question §1 | `models.list` |
| OpenClaw-only | `POST /gateway` | unchanged; mark route metadata `runtimeSpecific: "openclaw"` | n/a |
| OpenClaw-only | `GET/PUT /gateway-config` | unchanged; gated on active runtime kind | n/a |
| OpenClaw-only | `POST /gateway-control/*` | unchanged; gated | n/a |
| OpenClaw-only | conversations / messages / commands / settings / relay | unchanged; mark plugin-extension; dashboard hides when runtime ≠ openclaw | n/a |
| Bridge-owned | `/runtimes`, `/runtime-config`, `/copilot/*` | unchanged | n/a |
| Bridge-owned | `GET /health` | **stays boring**: process liveness only. No downstream-runtime dependency. | n/a |
| Bridge-owned | `GET /runtimes/health` | **new**: aggregate per-runtime health + capability summary. Dashboard consumes this. | n/a |

### Resource scoping rules

Hermes's strict line, formalized as an invariant: **a `?runtimeId=` query override on an existing-resource mutation is rejected with `400 INVALID_RUNTIME_OVERRIDE`.** Silent ignore creates UI bugs; explicit reject does not. Catalog reads and resource creates may use overrides freely.

Three resolution paths for a route handling `:id`:

1. **Resource id is namespaced:** `runtimeId:entityType:nativeId`. Decode at the route. (Future-friendly; not required v1.)
2. **Resource record carries `runtimeId`:** look up via store before dispatching the mutation. Used for sessions, copilot/claude-code records.
3. **No namespace, no record:** route is unscoped; `?runtimeId=` may steer it for catalog mutations only when the entity is owned by the runtime (not by our store). Document explicitly per route.

For v1 we use path 2 for sessions/turns and path 3 with primary-default for catalog mutations on entities that aren't persisted in our store (e.g., agents — OpenClaw owns the data). When a single dashboard becomes responsible for multiple runtimes simultaneously, we revisit path 1.

**Mandatory ordering for existing-resource mutations:**
1. Load resource by id from store.
2. If missing → `404 NOT_FOUND` (return immediately; do not surface unsupported-capability for a resource that doesn't exist).
3. Read stored/backfilled `runtimeId`.
4. If `?runtimeId=` query override is present and ≠ stored → `400 INVALID_RUNTIME_OVERRIDE`.
5. Resolve runtime adapter.
6. Check capability via `requireCapability`.
7. Validate payload schema.
8. Dispatch via `invokeAction`.
9. On success, persist any `runtimeId` backfill.

### Persistence migration

Today persisted records (copilot sessions, claude-code sessions, conversations) carry implicit OpenClaw assumption.

**Copilot sessions** already carry `backend: "openclaw" | "hermes"`. Promote to `runtimeId: string` (richer; supports multiple OpenClaw instances). Backwards-compat:
- Read-time backfill: `backend: "openclaw"` → `runtimeId: configuredPrimaryRuntimeId` (or first runtime of kind `openclaw`); `backend: "hermes"` → first runtime of kind `hermes`. Backfill is computed on each `readMeta` for legacy records.
- **Persist on write**: any successful mutation that touches the session record writes `runtimeId` to disk so the next read doesn't recompute. Test coverage: legacy record with only `backend` → first write commits `runtimeId` → subsequent reads return persisted value, not recomputed.
- Keep `backend` field as a UI-display alias only; routing uses `runtimeId`.

**Claude-code sessions** today have no runtime field. Add `runtimeId: string`. Read-time backfill defaults to primary; persist on write same as copilot. Test coverage: a legacy record routed to a now-disabled primary surfaces a clear error rather than 500.

**Cron / conversations / commands** stay OpenClaw-coupled (plugin-extension features); no migration.

### Capability projection: don't pretend equivalence

Hermes "agents" ≠ OpenClaw agents. The Hermes adapter today returns no agents; the new world doesn't change that. Where projection might tempt (e.g., "Hermes skills could appear under tools"), do not. Each adapter declares its own capability set; if Hermes wants to expose skills, it does so under `skills.list`. The route layer does not paper over differences.

The capability snapshot's `partial` slot is for cases where a runtime supports a capability with documented lossiness (e.g., Hermes `logs.tail` is a lines-only projection of `/v1/activity`).

### Test strategy

- **Adapter contract tests** extended for new actions: every adapter implements `invokeAction(action, payload, context)` returning either typed result or structured `UNSUPPORTED_CAPABILITY` for unsupported actions. Tests exist per adapter in `apps/bridge/test/runtimes-*-adapter.test.ts`; extend.
- **Route tests** with both an OpenClaw fake and a Hermes fake, asserting:
  - `?runtimeId=` override works for catalog reads
  - missing runtime falls back to primary
  - resource lookup uses stored `runtimeId`, not query
  - unsupported capability returns 409 with the error shape
  - invalid payload returns 422
  - unknown action returns 400
- **Dashboard component tests** (Vitest) for capability-gated render. Switch active runtime, confirm unsupported features render disabled state with reason.
- **Migration tests** for copilot/claude-code session backfill from `backend` to `runtimeId`.

### Dashboard impact

Two surfaces:

1. **Active runtime selector.** Already exists in some form; promote to a global header control. State stored client-side; `?runtimeId=` parameter passed on read endpoints; resource-scoped pages use the resource's stored `runtimeId`.
2. **Unsupported-capability rendering.** New shared component `<CapabilityGate runtimeId={...} capabilityId={...}>` reads cached capability snapshot; renders children if supported, partial badge with reason if partial, disabled state if unsupported. Used on every page that touches a gated route.

OpenClaw-only pages (gateway control, gateway config, WhatsApp plugin views) gain an "OpenClaw" badge in the page header and are accessible only when an OpenClaw runtime is enabled. The route returns 404/409 if hit against another runtime; UI hides them by default but exposes them under an "OpenClaw integrations" section to keep them discoverable.

## Phase plan (high level — implementation plan covers details)

1. **Phase A — typed actions + helpers.** Add `RuntimeReadCapabilityId` + `RuntimeActionId` unions, `RuntimeActionPayload` schemas, `invokeAction` signature update on `RuntimeAdapter`. Add `runtime-resolver` helpers + `requireCapability` + `UnsupportedCapabilityError` + `InvalidRuntimeOverrideError`. Update OpenClaw and Hermes adapters to handle the new typed actions (OpenClaw: implement all writes; Hermes: declare unsupported for write actions).
2. **Phase A2 — contract tests.** Stable contract for downstream parallel work. Tests cover: action schema validation, helper routing behavior (catalog/create/resource flows), unsupported-capability error shape, existing-resource runtime resolution + 400 on override mismatch, capability matrix shared between read and action ids. Also adds `GET /runtimes/health` aggregate endpoint. Must land before C/D/E parallelize.
3. **Phase B — convert catalog reads.** `agents`, `agent-sessions`, `tools`, `cron`, `channels`, `logs`, `models` route handlers go through `resolveRuntimeForCatalog` + `adapter.listEntities`. Tests assert override + default + unsupported behavior. `models.list` becomes a runtime-agnostic capability (OpenClaw supports, Hermes declares unsupported).
4. **Phase C — convert mutations.** `POST/PATCH/DELETE /agents`, `/channels`, `/tools`, `/cron` route through `invokeAction`. Adapter implementations route-internal to existing OpenClaw `callGateway` calls; Hermes returns structured unsupported. `POST /compose` stays OpenClaw-only.
5. **Phase D — Claude Code multi-runtime.** Sessions store `runtimeId`. `/claude-code/ask` resolves runtime from session, capability-gates `claudeCode.ask`, dispatches via `invokeAction`. Hermes returns structured unsupported with documentation pointer. MCP server (`packages/mcp-openclaw`) accepts a `runtimeId` env var or per-request param.
6. **Phase E — copilot migration.** Backfill `backend → runtimeId` on read; persist on write. Routing already pluggable; just rename internally.
7. **Phase F — dashboard capability gating.** `<CapabilityGate>` component reads from `/runtimes/health` aggregate so dashboard and routes share the same capability matrix (no frontend enum drift). Active-runtime selector in header. OpenClaw-only pages get a kind badge and hide-by-default behavior with an "OpenClaw integrations" section for discoverability. Render unsupported states with `reason`.

Phases A → A2 are sequential. B depends on A2. C/D/E run in parallel after A2. F lands after enough of B/C/D for the snapshot endpoint to be useful.

## Open questions

1. **`models.list` capability.** OpenClaw exposes a model catalog; Hermes doesn't (its concept is "skills"). Options:
   - (a) Add `models.list` as a capability; OpenClaw supports, Hermes declares unsupported. Dashboard hides model picker for non-OpenClaw runtimes.
   - (b) Treat `models` as OpenClaw-only (bucket 2). Move `routes/models.ts` and `routes/agent-models.ts` next to gateway routes; gate UI accordingly.
   - I lean (a) — we already have `agents.create` payload with optional `model` field, so the concept generalizes; runtimes that don't support model selection just declare unsupported.

2. **Compose / outbound message.** **Resolved (Hermes verdict):** OpenClaw-only for v1. `routes/compose.ts` writes a `compose-*.json` command file in `MANAGEMENT_DIR` for the WhatsApp plugin — vendor-coupled, not a generic messaging abstraction. `compose.create` is **not** in the `RuntimeActionId` union. A separate `messages.send` or `channels.sendMessage` action can be introduced later when there's an actual non-WhatsApp consumer.

3. **`/health` aggregation.** **Resolved (Hermes verdict):** split. `GET /health` stays boring — process liveness only, no downstream-runtime dependency. `GET /runtimes/health` is new and bridge-owned, returning `{ ok, primaryRuntimeId, runtimes: [{ runtimeId, ok, status, capabilities, error? }] }`. Dashboard `<CapabilityGate>` consumes the latter; doctor command (prior PR's Task 4) reads `/health` for liveness and `/runtimes/health` for capability detail.

4. **Permissions.** **Resolved (Hermes verdict):** defer enforcement for v1 — `runtime:openclaw:agents.manage`-style scoped permissions multiply complexity across guards/UI/migration/tests. Keep coarse `agents.manage`, `cron.manage` etc. **However:** pass `runtimeId` through the auth context now (every route handler that resolves a runtime stamps `req.runtimeContext.runtimeId`) so a future scoped-permission layer slots in without rewriting routes. Document the eventual shape (`scope:runtime:<id>:<perm>`) in `SECURITY.md` as a planned hardening item.

## Risks

- **Adapter signature change is a breaking interface.** `invokeAction(action, payload, context)` replaces today's `invokeAction(req: InvokeActionRequest)`. Callers across the bridge update in lockstep. Mitigation: handle in Phase A as a single coordinated commit; type errors are the safety net.
- **Hermes feature gap visibility.** Once routing is in place, every OpenClaw-only feature is a visible 409 on Hermes. Users may interpret as "the app is broken on Hermes" rather than "Hermes upstream doesn't expose these". Mitigation: dashboard renders a clear "Hermes does not support agents.create — file an issue against the Hermes shim" message with a link.
- **Resource ownership confusion in mixed deployments.** A user with two OpenClaw runtimes (`oc-main`, `oc-staging`) may try to view `oc-main` agents from the `oc-staging` page. Resource-scoped lookup catches this with 404; UI must surface the runtime id on every entity row.
- **Backwards-compat for in-flight copilot sessions.** Backfill on read is forgiving; backfill on write commits. If the registry can't resolve a fallback runtime (no openclaw kind configured), reads fail. Mitigation: log warning, skip session in list rather than 500.

## Out of scope (deferred)

- Multi-runtime aggregated views (`?runtimeId=all`).
- Resource-id namespacing (`oc-main:agent:claude-code`).
- Runtime-scoped permissions.
- Hermes write capability upstream.
- Generalizing the WhatsApp plugin to be host-runtime-agnostic.
- Telemetry-side runtime tagging beyond what already exists.
