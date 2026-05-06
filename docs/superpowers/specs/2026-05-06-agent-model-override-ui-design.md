# Dashboard Agent Model Override — Phase 1 Design

Date: 2026-05-06
Status: Draft (awaiting Gal review)
Owner: Gal
Collaborator: OpenClaw (reviewed via consult-openclaw)

## Context

Gal currently changes per-agent LLM models by editing `~/.openclaw/openclaw.json` on the Windows host (`agents.list[].model`, e.g. `claude-code` agent set to `openai-codex/gpt-5.4`). This requires file access and process discipline that the dashboard does not need; the dashboard is the natural place to expose model selection.

Initial framing (from Gal) was "per-agent + per-feature, where feature = channel + skill + tool." A handler-existence audit of the OpenClaw SDK and bridge invocation sites narrowed real LLM-injection boundaries:

- **Agent** — real boundary. SDK accepts model via `subagent.run({ model })` (verified at `whatsapp-auto-reply/index.js:1049-1051`). Gateway exposes mutation via `agents.update` RPC.
- **Channel** — not a boundary. Channels route messages, don't invoke LLMs; LLM calls happen one layer down inside the agent.
- **Skill** — needs SDK work. `run(provider, model, runOptions)` exists internally inside `agent-runner` but skills are not exposed via gateway with a per-invocation model override.
- **Tool** — not a boundary. Tools execute inside the agent's active model context.

Channel/skill/tool overrides are deferred. Phase 1 ships per-agent only, which is the only scope with a real, verified injection point today.

## Phase ladder (for context — not implemented in Phase 1)

- **Phase 1 (this spec):** dashboard UI for per-agent model selection, gateway-native mutation path, no bridge-side override store.
- **Phase 2:** per-skill model override — requires SDK work to expose a per-invocation model parameter on skill runs and a gateway RPC to mutate it.
- **Phase 3:** per-channel/per-tool overrides — requires runtime model-routing layer that does not exist today.

The phase ladder is informational. Phase 2 and 3 are not authorized scope for this work.

## Goals

- Authenticated dashboard users with the right permission can change the model for any configured OpenClaw agent without touching the host filesystem.
- Selection is constrained to the gateway's allowed-model catalog, so the UI cannot persist a model the runtime will later refuse.
- Changes take effect on the agent's next run without restarting the gateway.
- Permission is enforced server-side. The UI is constrained to the same set, but the constraint is the bridge's, not the browser's.

## Non-goals (locked)

- No bridge-side override store. The gateway is the single writer of `openclaw.json`.
- No per-call model injection by the bridge. The bridge does not pass `model` per `sessions.send`; persistence is the only mechanism.
- No per-channel, per-skill, or per-tool overrides.
- No catalog editing from the UI. Adding/removing entries from `models.providers.*.models[]` remains a host-side edit.
- No bulk update. One PATCH per agent.
- No model-status diagnostics in the UI (cost/latency/usage charts). Phase 1 is selection only.
- No restart UI or restart workflow. The gateway-native mutation path takes effect without restart.
- **No catalog validation on `POST /agents`.** The existing create path's best-effort `agents.update` runs without bridge-side `models.list` validation. This gap is intentional in Phase 1: tightening it would change agent-creation contract (currently returns `201 + warning` on partial success) and warrants a separate, scoped change. Catalog validation applies only to the new PATCH-driven flow.
- No clearing of a per-agent override. The gateway's `agents.update` cannot remove a stored model. Phase 1 offers "Set to current default" as the closest equivalent; see "Set to current default (no clear-override path in Phase 1)".
- No override/inheritance badge in the UI. Phase 1 surfaces the effective model only.

## Architecture

```
Dashboard (Next.js, 192.168.0.240)
  ├─ Settings → "Agent Models" section          — new
  ├─ <AgentModelTable>                          — per-agent dropdown + reset
  └─ /api/agent-models/...                      — server-side proxy (mirrors /api/runtime-config pattern)
        |
        v
Bridge (Windows, 0.0.0.0:3100)
  GET    /agents                                — already proxies agents.list (no change required if model returned)
  GET    /models                                — NEW; proxies models.list gateway RPC
  PATCH  /agents/:name                          — already proxies agents.update; gain server-side model validation + permission gate
        |
        v
OpenClaw gateway (loopback, 127.0.0.1:18789)
  models.list   — returns allowed-list-filtered catalog
  agents.list   — returns agent summaries with effective model
  agents.update — persists { agentId, model } to ~/.openclaw/openclaw.json
```

The gateway is the source of truth for both the catalog and the per-agent model. The bridge is a permission-gated proxy with one piece of added behavior: pre-write validation (described in "Validation").

Why not a bridge-owned override file: the gateway already exposes a clean mutation path (`agents.update`) that persists and applies without restart. Adding a separate bridge-side store would create two writers for the same logical state, with drift, dual reconciliation, and a bespoke precedence rule that doesn't exist anywhere else in the system. The win — overriding the model without persisting to OpenClaw config — is not a Phase 1 requirement.

## Domain model

No new persistent state on the bridge. New types live in `packages/types/src/agent-models.ts`:

```ts
export type ModelDescriptor = {
  id: string;            // "openai-codex/gpt-5.4" — provider-qualified
  displayName: string;   // gateway-provided label
  provider: string;      // "openai-codex" | "openrouter" | "ollama" | ...
  contextWindow?: number;
  maxTokens?: number;
  reasoning?: boolean;
  costInput?: number;    // per-million-tokens, gateway-projected
  costOutput?: number;
  cacheRead?: number;
  cacheWrite?: number;
};

export type AgentModelSummary = {
  agentId: string;
  agentName?: string;
  effectiveModelId: string | null;       // resolved by the gateway (per-agent override else default)
  hasExplicitOverride?: boolean;         // optional opportunistic enhancement; absent if gateway shape doesn't make this trivial — see "Open verification before merge"
};

export type AgentModelsSnapshot = {
  catalog: ModelDescriptor[];
  agents: AgentModelSummary[];
  globalDefaultModelId: string | null;
  catalogStatus: "ok" | "unavailable";
};
```

The bridge composes `AgentModelsSnapshot` from gateway calls. None of it is persisted on the bridge; it is rebuilt on every read.

Phase 1 ships the snapshot with `effectiveModelId` only. `hasExplicitOverride` is reserved in the type for future reuse but **the Phase 1 UI ignores it** — the badge is always absent in Phase 1, regardless of what the gateway returns. This keeps the UI contract single-mode and the test surface small. Re-introducing the badge is a Phase 2-or-later change once a clean gateway path for raw-vs-resolved exists.

## API contract

### `GET /agent-models`

Authenticated. No special permission required to read.

Response: `200 AgentModelsSnapshot`.

The bridge:

1. Calls `models.list` once. On error returns `catalog: []` and `catalogStatus: "unavailable"` but still serves the agent list (the UI degrades to read-only).
2. Calls `agents.list` once. The gateway's `buildAgentSummaries` already returns `model: resolveAgentModel(cfg, id)`, which is the *effective* model. This drives the entire core flow. The bridge does not populate `hasExplicitOverride` in Phase 1 — see "Domain model" for the rationale.
3. Resolves `globalDefaultModelId` from `agents.identity` for the default agent (`main`) or from a documented gateway projection. If neither exposes the global default cleanly, the bridge surfaces `globalDefaultModelId: null` and the UI omits the "inherits default → <name>" hint.

### `GET /models`

Authenticated. No special permission required to read.

Response: `200 { models: ModelDescriptor[]; status: "ok" | "unavailable" }`.

Pure proxy of `models.list`. On gateway error, the bridge returns `502` with `status: "unavailable"` so the UI can present a degraded read-only state.

### `PATCH /agents/:name`

Authenticated **and** requires the new `agents.manage` permission.

Request: existing shape, with the model field validated:

```ts
{
  name?: string;
  workspace?: string;
  model?: string;        // non-empty string only; see "Clearing an override" for clear workflow
  // ...other agents.update fields
}
```

Pre-write validation:

1. If `model` is present, it must be a non-empty string. Empty/null `model` is rejected with `400 invalid model id` — clearing is a UI workflow, not a wire shape.
2. The bridge calls `models.list` and checks that `model` matches some `ModelDescriptor.id` in the allowed catalog.
3. If the catalog is unavailable (gateway error on `models.list`), the bridge **rejects the write** with `503 model catalog unavailable`. This is a write-path safety property: the dashboard does not get to install models the runtime will refuse.
4. If `model` is in the catalog, the bridge proxies `agents.update` and returns the gateway response.
5. If `model` is missing from the body, the bridge proxies `agents.update` unchanged (other fields like `name`/`workspace` may still mutate; no model validation runs).

Other fields (`name`, `workspace`, etc.) pass through unchanged. The permission gate covers the whole route — adding a permission gate here closes the existing ungated mutation surface that the route inherited.

Failure responses:

- `400 invalid model id` — model not in catalog.
- `403` — caller lacks `agents.manage`.
- `404` — agent not found.
- `502` — gateway returned an error (e.g. allowed-list rejected the model server-side anyway). Body includes the gateway error string.
- `503 model catalog unavailable` — gateway returned an error from `models.list` and the request included a model field.

### "Set to current default" (no clear-override path in Phase 1)

The gateway's `applyAgentConfig` writes `model` only when truthy: `...params.model ? { model: params.model } : {}`. There is no exposed gateway path that removes a stored model through `agents.update`. Phase 1 therefore does **not** support clearing a per-agent override. The UI must not present the action as "clear" or "reset to inherited."

The provided action is "Set to current default":

1. Reads `globalDefaultModelId` from `GET /agent-models`.
2. PATCHes the agent with `model: <globalDefaultModelId>`.

If `globalDefaultModelId` is `null` (gateway did not surface a usable default — see "Open verification before merge" item 3), the action is disabled and the row tooltip explains "default model not available from runtime."

Behavior consequence: the agent ends up with an *explicit* model entry equal to the current global default. If the global default later changes, this agent does **not** follow the new default — it remains pinned to the value persisted at click-time. This consequence is surfaced both in the action label ("Set to **current** default" — the word "current" is load-bearing) and in adjacent helper text on the UI: "This saves the current default as this agent's model. It does not restore inheritance — future changes to the global default will not follow automatically." Tooltip alone is too weak for a behavior that can surprise later, so this copy appears as visible helper text under the table, not only on hover.

A true clear would require either a new gateway RPC that calls `pruneAgentConfig`-style logic on the model field, or a `model: null` semantic for `agents.update`. Out of scope for Phase 1.

## Permission

Reuse the existing permission `agents.manage` (already in `packages/types/src/auth/permissions.ts` with description "Create/update/delete" in category `agents`).

- The permission ID already exists in the registry and is part of the standard admin grant. No registry or migration change is needed.
- Required by `PATCH /agents/:name` for any field, not only `model`. This is intentional: the existing route had no gate, and "model only" is a weaker stance than "all mutating agent fields." The route is small enough that scoping the gate to one field would invent a per-field permission system that has no other use in the codebase.
- Read endpoints (`GET /agents`, `GET /agent-models`, `GET /models`) do not require `agents.manage`; reading uses `agents.view`. Only mutators need the manage permission.

If a finer-grained "model-only" permission is ever needed, that is a deliberate broader auth design pass, not a one-off exception on this feature.

## UI

New section in Settings: "Agent Models". Lives next to "Runtimes" in the existing Settings layout.

Layout:

```
Agent Models
  Catalog source: OpenClaw runtime
  Default model: openai-codex/gpt-5.4-mini

  ┌──────────────┬─────────────────────────┬─────────────────────────────┐
  │ Agent        │ Model                   │ Actions                     │
  ├──────────────┼─────────────────────────┼─────────────────────────────┤
  │ main         │ [gpt-5.4-mini ▼]        │ [Set to current default]    │
  │ reviewer     │ [gpt-5.4 ▼]             │ [Set to current default]    │
  │ claude-code  │ [gpt-5.4 ▼]             │ [Set to current default]    │
  └──────────────┴─────────────────────────┴─────────────────────────────┘
```

The Model column shows the effective model only — no override/inheritance badge in Phase 1.

Underneath the table, a small helper line:

> "Set to current default" saves the current default as this agent's model. It does not restore inheritance — future changes to the global default will not follow automatically.

The same copy appears as a confirmation tooltip on hover/focus of any per-row "Set to current default" button.


Per-row dropdown:

- Grouped by provider (`openai-codex`, `openrouter`, `ollama`, ...).
- Each option shows: model id, context window, input cost (where the gateway provides it).
- Selecting an option immediately PATCHes; the row shows a per-row pending spinner until the response returns.
- On error (`400`, `403`, `502`, `503`) the row reverts and shows an inline error.

"Set to current default" behavior: see "Set to current default (no clear-override path in Phase 1)".

If `catalogStatus === "unavailable"`:

- Dropdowns are disabled.
- Banner: "Model catalog is unavailable from the runtime. Selection is read-only until it returns."
- The current effective model is still displayed.

If a row shows an effective model that is no longer in the catalog (drift between a previous selection and the current allowed list), the row badges "model not in current catalog" and disables the dropdown. The user sees what is configured and can clear/reset, but cannot select a fresh value until the catalog is restored or the model is re-allowed in OpenClaw.

## Validation

Two-layer validation:

1. **Bridge pre-write** (Phase 1, new): `PATCH /agents/:name` with a `model` field rejects unless `model` is in the current `models.list` allowed catalog. This prevents persisting a model the runtime would later refuse on agent run.
2. **Gateway runtime** (already exists): on agent run, `agent-command-BwUGaHZD.js` checks `allowedModelKeys` and throws `Model override "..." is not allowed for agent "..."` if the stored model is not allowed at run time. This is the safety net if the catalog changes between write and run.

The bridge does NOT trust the UI for validation. UI-side disabling exists for UX but does not replace the server-side check.

Note on policy asymmetry: the gateway is permissive at write time (any string accepted by `agents.update`) and restrictive at run time (allowed-list throws). The bridge intentionally enforces a *stronger* policy than the underlying write API at the write boundary. This is a deliberate UX/admin tightening; the gateway's permissive write contract is unchanged.

## Concurrency

`PATCH /agents/:name` proxies a single gateway call. The gateway serializes config writes via `writeConfigFile`. Two simultaneous PATCHes against the same agent resolve to whichever write the gateway sees second. Phase 1 does not add per-agent locking on the bridge — the dashboard is single-tenant in practice and the gateway's write is atomic.

## Failure and degraded modes

- **Gateway down, catalog unavailable:** read endpoints return `catalogStatus: "unavailable"`; UI degrades to read-only; PATCH with `model` is rejected with `503`.
- **Gateway down, full outage:** all endpoints return `502`; UI shows full-page error consistent with existing dashboard runtime errors.
- **Model not in catalog at write time:** `400`. UI surfaces inline error; row reverts.
- **Model in catalog at write but disallowed at run time** (catalog drifted): the runtime error surfaces in the agent log; UI does not detect it. Out of scope for Phase 1.

## Integration points

- `apps/bridge/src/routes/agents.ts` — add `agents.manage` permission middleware to the existing `PATCH /agents/:name`. Add pre-write `models.list` validation when `model` is in the body. The existing best-effort `agents.update` after `agents.create` (line 38-50) is **left untouched** — its create-path partial-success semantics (`warning` on response when model-set fails) are out of scope for this spec; tightening them would change agent-creation contract and warrants a separate change.
- `apps/bridge/src/routes/` — add `agent-models.ts` (composes `agents.list`, `agents.identity` per agent, `models.list`).
- `apps/bridge/src/routes/` — add `models.ts` (proxies `models.list`).
- `apps/bridge/src/server.ts` — register the two new routers.
- `packages/types/src/agent-models.ts` — new types listed above.
- `apps/dashboard/src/components/settings/agent-models-section.tsx` — new component.
- `apps/dashboard/src/components/settings/index.tsx` (or wherever Runtimes lives) — register the new section.
- `apps/dashboard/src/app/api/agent-models/route.ts` and `apps/dashboard/src/app/api/models/route.ts` — Next.js proxy routes that forward to the bridge with the dashboard's existing bridge-token auth pattern.
- Permission registry — no change needed. `agents.manage` already exists in `packages/types/src/auth/permissions.ts` and is part of the standard admin grant.

## Testing

- **Bridge route tests** (`apps/bridge/src/routes/__tests__/`): integration-style with a mocked `callGateway`:
  - `GET /agent-models` happy path — catalog + agents.
  - `GET /agent-models` with `models.list` failure — `catalogStatus: "unavailable"`, agents still served.
  - `PATCH /agents/:name` with valid model — proxied to `agents.update`.
  - `PATCH /agents/:name` with model not in catalog — `400`.
  - `PATCH /agents/:name` with `models.list` unavailable + model in body — `503`.
  - `PATCH /agents/:name` without `agents.manage` permission — `403`.
- **Dashboard component tests**: `<AgentModelsSection>` renders catalog + override badge; selection triggers PATCH; error states render.
- **Manual end-to-end**: change `claude-code` agent model in the dashboard; observe `~/.openclaw/openclaw.json` updated; run the agent; observe new model used in session.

## Open verification before merge

These are checks against live SDK behavior, not design decisions:

1. **`agents.list` shape.** Confirmed via `buildAgentSummaries` (`agents.config-Dl4yUGQh.js:34-63`) that the response includes `model` per agent. Need to verify at runtime that the bridge's existing `GET /agents` path returns it as expected. If yes, no change to that route.
2. **Raw vs resolved model.** `buildAgentSummaries` returns the resolved value with default fallback. If `agents.identity` per-agent does not include the raw `agents.list[].model` entry as written (no fallback), the bridge cannot reliably distinguish "explicit override" from "inheriting default" without a separate gateway addition. Fallback for Phase 1 if this is the case: drop `hasExplicitOverride` from the snapshot and present every agent as showing its effective model with a single Reset action that re-asserts the global default.
3. **Global default surface.** Need a clean read of `agents.defaults.model.primary` over the gateway. If no RPC exposes it directly, the bridge can read it from any agent's `resolveAgentModel` fallback — but that requires picking an agent without an explicit override, which is fragile. If this is messy, either surface it as `null` and skip the "default = X" hint in the UI, or add a small gateway RPC in the same change. Decision: surface `null` and skip the hint in Phase 1; do not add a gateway RPC here.
4. **`agents.update` accepting a clear/null.** Confirmed in `applyAgentConfig` that null/empty does not clear. Phase 1 limitation documented in "Clearing an override".

If verification 1 or 2 produces a worse-than-expected gateway shape, the spec degrades gracefully (drop `hasExplicitOverride`, show effective only). The mutation path is unaffected.

## Out of scope (explicit)

- Per-channel, per-skill, per-tool overrides.
- Catalog editing from UI.
- Cost/usage telemetry surfacing.
- Per-session model overrides (the wire would be `sessions.send { model }` if exposed; not relevant to this work).
- Audit log of model changes (the dashboard's existing audit pattern can capture PATCH events but no UI surfaces them in Phase 1).
- Migration tooling for existing agents in `openclaw.json` (no migration needed; the file remains canonical and gateway-managed).

## Security notes

- The new permission gate on `PATCH /agents/:name` closes an existing ungated mutation surface. Any caller previously able to hit the route (by virtue of the bridge token) keeps working only if granted `agents.manage`. The default admin role gets the permission; document the change in the deploy notes.
- Pre-write catalog validation is a defense against a privilege-narrow caller persisting a model that the runtime allows-list rejects. It is not a replacement for the runtime check; both are required.
- The bridge does not log full request bodies for PATCH; model id is short and uninteresting from an auditing standpoint, but the server's existing access log captures path + method + status.

### Rollout impact of the permission gate

- **Compat impact:** any role that currently hits `PATCH /agents/:name` (only via the bridge token, since the dashboard's role system is the only consumer) will receive `403` after deploy unless it has `agents.manage`. The admin role already has this permission; non-admin roles that depend on the route will need it granted (or, more likely, the route was simply not in use because the dashboard had no UI for it).
- **Deploy step:** verify the admin role already grants `agents.manage`. No registry change is required.
- **Rollback:** if the gate blocks legitimate automation that we did not foresee, the permission can be temporarily granted to a lower role without code revert. If broader rollback is needed, drop the middleware on the route — the rest of the feature (catalog read, validation, UI) functions correctly without the permission gate.
- **Compatibility nuance:** this is a case of newly *enforcing* an existing-but-unused permission on a previously ungated route. The permission itself is not new, but the enforcement is. Watch for any non-dashboard caller (scripts, ad-hoc tooling) that hits the route with a bearer that lacks `agents.manage` after deploy.
- The `POST /agents` create path still runs its internal best-effort `agents.update` without bridge-side model validation; the catalog check applies only to the new PATCH-driven flow. Tightening the create path is deliberately deferred to avoid changing agent-creation contract in this spec.
