# Hermes Runtime Integration — Phase 1 Design

Date: 2026-05-04
Status: Draft (awaiting user review)
Owner: Gal
Collaborator: OpenClaw (reviewed via consult-openclaw)

## Context

OpenClaw-Manager is a multi-runtime control plane. Phase 1 of the multi-runtime work shipped a Hermes adapter as an honest stub — health probe + capability declarations only. Gal now runs a real Hermes Agent on a remote host (`gal@192.168.0.10`) and wants to:

1. Promote Hermes to a first-class, usable runtime in the manager.
2. Add a settings UI to enable/disable individual runtime connections.
3. Choose Hermes (or any registered runtime) as the **main agent** — the operator-facing default.

## Reality check

- **Hermes is not an HTTP/bearer service.** It is a Python CLI agent platform (`/home/gal/.local/bin/hermes`) with parallel concepts to OpenClaw: gateway, sessions, dashboard web UI, MCP server, ACP server, WhatsApp/Slack integrations, cron, kanban, skills.
- **Hermes web UI is loopback-bound** with an ephemeral session token, designed for browser use, not service-to-service.
- **Bridge has no runtime-routing abstraction.** `callGateway` is direct-imported across `routes/agents`, `routes/agent-sessions`, `routes/channels`, `routes/compose`, `routes/gateway-config`, `services/claude-code-ask`, `services/claude-code-summarize`, `services/youtube-chat-*`, and `services/openclaw-session-tail`. None of these features go through the `RuntimeAdapter` contract.

A full backend swap (rerouting WhatsApp through Hermes) would require rewriting every `callGateway` site through the registry. That is out of scope for Phase 1.

## Goals

- Hermes is a registered, healthy, useful runtime visible in `/runtimes`.
- Operator can toggle Hermes (or any runtime) on/off in settings without editing files.
- Operator can mark any enabled runtime as the **primary runtime** — the operator-facing default.
- Disabled and unhealthy runtimes are surfaced honestly without being silently skipped.

## Non-goals (locked)

- No `callGateway` rewrite. WhatsApp / Claude-code / YouTube workers continue to talk to OpenClaw directly.
- No write actions through the Hermes adapter (`sessions.send`, `chat.send`, channel ops, skill install, tool invoke, config writes, cron writes, memory writes).
- No MCP-over-SSH transport, no ACP transport, no oneshot CLI transport.
- No federated per-runtime user mapping, no cross-runtime activity merging.
- No automatic health-based fail-over of the effective primary runtime.

## Architecture

```
Bridge (Windows host, 127.0.0.1:3100)
  ├─ runtimes/registry.ts ─┐
  │                        ├─ openclaw adapter ──► OpenClaw SDK ──► OpenClaw gateway (local)
  │                        └─ hermes adapter   ──► HTTP+bearer  ──► Hermes shim (loopback) ──► local Hermes CLI
  │                                                                  on 192.168.0.10
  ├─ /runtime-config (new admin API)
  └─ existing settings (runtime-settings.json) — unchanged
```

Bridge talks HTTP+bearer to a small Python shim daemon Gal runs on 192.168.0.10. The shim wraps a curated subset of `hermes` CLI calls. Bridge-side adapter contract is unchanged from `RuntimeAdapter`.

The default Phase-1 deployment uses an **SSH local forward from the bridge host**:

```
bridge-host$ ssh -L 19119:127.0.0.1:9119 gal@192.168.0.10
# Hermes shim binds 127.0.0.1:9119 on the remote host;
# the local forward exposes it as 127.0.0.1:19119 on the bridge host.
```

The Hermes runtime descriptor's `endpoint` then points at the bridge-local tunnel endpoint (e.g. `http://127.0.0.1:19119`). This preserves the loopback-only posture that Hermes was designed for.

LAN bind on the shim is supported as an explicit opt-in; see "Shim deployment".

## Settings model

Two pieces of state, two files. Connection inventory and primary selection live in `runtimes.json`. Bot-behavior tuning (`relayTarget`, `delayMs`) stays in `runtime-settings.json`. Different cadence, different audience, different blast radius.

### `openclaw-plugin/management/runtimes.json` (extended)

```json
{
  "configuredPrimaryRuntimeId": "oc-main",
  "runtimes": [
    {
      "id": "oc-main",
      "kind": "openclaw",
      "displayName": "OpenClaw (local)",
      "endpoint": "http://127.0.0.1:18789",
      "transport": "sdk",
      "authMode": "token-env",
      "enabled": true,
      "notes": "Primary runtime. Uses existing OPENCLAW_GATEWAY_TOKEN + SDK path."
    },
    {
      "id": "hermes-remote",
      "kind": "hermes",
      "displayName": "Hermes (192.168.0.10)",
      "endpoint": "http://127.0.0.1:19119",
      "transport": "http",
      "authMode": "bearer",
      "enabled": false,
      "notes": "Reached via SSH local forward to 192.168.0.10 shim."
    }
  ]
}
```

### Schema rules (validated at registry load and on every PATCH)

- `enabled` defaults to `true` for descriptors missing the field (back-compat with the legacy single-OC config).
- `runtimes` MUST be a non-empty array. PATCHes that would empty it or disable every runtime are rejected with **409 `cannot_disable_all`**.
- `configuredPrimaryRuntimeId` MAY reference an existing runtime that is currently disabled. The fallback machinery handles this by computing `effectivePrimaryRuntimeId` for the GET response. Pointing at an **unknown** id is rejected with **400 `unknown_runtime_id`**.
- `enabled[id]` keys in a PATCH MUST reference existing runtime ids. Unknown ids → **400 `unknown_runtime_id`**.

### What "primary runtime" actually does in Phase 1

Concrete consumers of `effectivePrimaryRuntimeId`:

- Settings "Runtimes" section renders the corresponding row's "Set as primary" radio as selected.
- `/runtimes` list page sorts the effective primary first and stamps it with a "primary" badge.
- `/runtimes` and Settings pages render a fallback banner when `fallbackReason !== null`.

That is the entire Phase-1 effect. Future "send-to-primary" command flows, runtime-aware compose UI, etc. are explicitly Phase 2 and not consumed by any backend code path in this phase.

### Effective primary computation

Computed on every read of `/runtime-config`. No file rewrite.

| Configured primary state | Effective primary | `fallbackReason` | Dashboard banner |
| --- | --- | --- | --- |
| enabled, healthy | configured | `null` | none |
| enabled, **unhealthy** | configured (no rebind) | `null` | inline red status, no banner |
| **disabled** | first `enabled` openclaw runtime, else first `enabled` runtime overall | `configured_primary_disabled` | banner |
| **dangling / not in list** | same fallback chain | `configured_primary_missing` | banner |
| **no `configuredPrimaryRuntimeId` set** | same fallback chain | `configured_primary_missing` | banner |

The unhealthy state intentionally does not rebind. Health is volatile; rebinding the operator default on every flap creates UX churn without operational benefit.

### Bridge endpoints (new)

| Method | Path | Permission | Purpose |
| --- | --- | --- | --- |
| GET | `/runtime-config` | `runtimes.view` | Returns full snapshot incl. disabled + fallback state |
| PATCH | `/runtime-config` | `runtimes.config` | Atomic, all-or-nothing partial update |

`runtimes.view` is the existing permission used by `/runtimes`. `runtimes.config` is **new**; granted to the existing admin role only at first.

### Response shape

```jsonc
{
  "configuredPrimaryRuntimeId": "hermes-remote",
  "effectivePrimaryRuntimeId": "oc-main",
  "fallbackReason": "configured_primary_disabled",
  "runtimes": [
    {
      "id": "oc-main",
      "kind": "openclaw",
      "displayName": "OpenClaw (local)",
      "endpoint": "...",
      "transport": "sdk",
      "authMode": "token-env",
      "enabled": true,
      "status": { "state": "healthy" }
    },
    {
      "id": "hermes-remote",
      "kind": "hermes",
      "displayName": "Hermes (192.168.0.10)",
      "endpoint": "...",
      "transport": "http",
      "authMode": "bearer",
      "enabled": false,
      "status": { "state": "disabled" }
    }
  ]
}
```

`status` is the tri-state described in "Health vs disabled". Disabled runtimes are returned (settings UX needs them); clients filter for the operational view.

### PATCH semantics

```ts
type RuntimeConfigPatch = {
  configuredPrimaryRuntimeId?: string;
  enabled?: { [runtimeId: string]: boolean };
};
```

Algorithm:

1. Read current config from disk.
2. Deep-clone, apply patch fields to a candidate snapshot.
3. Validate the **final** snapshot against the schema rules above. Order-of-fields in the patch body is irrelevant.
4. On any validation failure → return appropriate 400/409 with stable error code; nothing written.
5. Atomic write: temp file + rename (existing pattern in `runtime-settings.ts`).
6. On rename success: emit `runtime.config.changed` info-level log line (see "Observability").
7. On rename failure: emit `runtime.config.write_failed` error log with the attempted diff.
8. PATCH return body = the new full GET-shaped snapshot.
9. Idempotent: re-PATCHing the same body is a no-op.

There is no multi-writer locking beyond filesystem rename atomicity. This matches the existing single-bridge model.

## Health vs disabled

`disabled` is a configuration state. `health()` is **not called** on disabled runtimes. The registry exposes a tri-state status:

```ts
type RuntimeStatus =
  | { state: "disabled" }
  | { state: "healthy"; detail?: string }
  | { state: "unhealthy"; detail: string };
```

- Disabled → registry skips network probe entirely; status is `{ state: "disabled" }`.
- Enabled → adapter `health()` is called; result mapped to `healthy` or `unhealthy`.
- Dashboard renders three distinct visual states. No code path treats `disabled` as `healthy`.

## Hermes shim contract (Phase 1)

Small FastAPI service Gal runs on `192.168.0.10`, bound `127.0.0.1:<port>` by default. Sole consumer is the bridge.

```
GET /v1/health
  → 200 { "ok": true, "hermes_version": "x.y.z" }

GET /v1/version
  → 200 { "hermes": "x.y.z", "shim": "0.1.0" }

GET /v1/capabilities
  → 200 {
      "supported":   ["sessions.list", "sessions.read", "skills.list"],
      "partial":     [{ "id": "logs.tail", "reason": "lines-only projection of /v1/activity",
                        "projectionMode": "inferred", "lossiness": "lossy" }],
      "unsupported": ["sessions.send", "chat.send", "channels.list", "channels.status",
                      "memory.query", "memory.write", "skills.install",
                      "tools.list", "tools.invoke", "cron.list", "cron.write",
                      "config.get", "config.set", "agents.list", "agents.read"]
    }

GET /v1/sessions
  → 200 [ { id, name, lastActivityAt, ... } ]

GET /v1/sessions/{id}
  → 200 { id, transcript: [...], usage: {...} }

GET /v1/skills
  → 200 [ { id, name, version } ]

GET /v1/activity?since=<epoch_ms>&limit=<n>
  → 200 [ { kind, at, entityId?, text?, native_ref? } ]
```

Auth: every request requires `Authorization: Bearer <HERMES_SHIM_TOKEN>`. Mismatch → **401**. Token lives in shim env on remote host and bridge env (`HERMES_TOKEN` already wired through `factories.ts`); rotation is operator-driven.

Timeouts: bridge default 5 s; `/v1/sessions/{id}` allowed 8 s for transcript size.

Errors: shim returns `{ "error": "<message>" }` plus appropriate HTTP status. Adapter maps to `health.detail` and `InvokeActionResult.error`.

## Adapter scope mapped to `RuntimeAdapter`

Phase 1 implementation, mapped to the contract in `packages/types/src/runtimes.ts`:

| Adapter method | Phase 1 behavior |
| --- | --- |
| `describeRuntime()` | returns descriptor |
| `getCapabilities()` | reads from shim `/v1/capabilities` (provenance `runtime-reported`); on shim failure returns adapter-declared static snapshot with `source: "static-adapter"` and `stale: true` |
| `health()` | calls shim `/v1/health` (only when enabled — disabled runtimes never reach this method) |
| `listEntities("session")` | shim `/v1/sessions` |
| `listEntities("skill")` | shim `/v1/skills` |
| `listEntities("agent" \| "channel" \| "tool" \| "cron" \| "memory")` | returns `[]`; capabilities mark these `unsupported` |
| `getEntity("session", id)` | shim `/v1/sessions/:id` |
| `getEntity(other, ...)` | returns `null` |
| `listActivity(since?, limit?)` | shim `/v1/activity?since=&limit=` |
| `invokeAction(...)` | always returns `{ ok: false, error: "hermes phase 1 has no write actions", projectionMode: "exact" }` |
| `getAuthModes()` | `[{ id: "service", label: "Bearer (shim)", description: "Bearer via env HERMES_SHIM_TOKEN." }]` |
| `getExtensions()` | `["sessions", "skills", "activity"]` |
| `dispose()` | undefined (no long-lived resources) |

### Capability provenance

`CapabilitySnapshot` is extended with explicit provenance metadata so consumers cannot mistake static fallback for verified runtime state:

```ts
type CapabilitySnapshot = {
  supported: CapabilityId[];
  partial: PartialCapability[];
  unsupported: CapabilityId[];
  version: string;
  runtimeVersion?: string;
  source: "runtime-reported" | "static-adapter";
  stale: boolean;
};
```

When the adapter cannot reach the shim, it returns a hard-coded "best-known" snapshot matching the actual Phase-1 endpoint set, with `source: "static-adapter"` and `stale: true`. The dashboard displays a "Capabilities (cached, runtime offline)" label when these flags are set.

`logs.tail` appears in `partial`, **not** in `supported`, because `/v1/activity` is a lossy projection. `supported` therefore lists only `sessions.list`, `sessions.read`, `skills.list`.

## Dashboard changes

### Settings page → new "Runtimes" section

Lists **all** registered runtimes (enabled + disabled). Per row:

- runtime display name + kind badge
- current status (healthy / unhealthy / disabled)
- toggle for `enabled`
- "Set as primary" radio (radios across all rows; selected row corresponds to `configuredPrimaryRuntimeId`)

Server-rendered initial state from `GET /runtime-config`. Toggle/radio handlers issue PATCH. Optimistic UI with rollback on PATCH failure. Fallback banner is rendered from the server-side response, visible on first paint.

The section is hidden unless the viewer has `runtimes.config`. Read-only views (`/runtimes`) require only `runtimes.view`.

### `/runtimes` list page

Filters out disabled runtimes — this is the operational surface. Renders the fallback banner if `fallbackReason !== null`. If the configured primary is unhealthy, shows the configured primary's row with red status but no banner.

### `/runtimes/:id` direct URL

Allowed regardless of `enabled` state. If disabled, the page renders a "Disabled in settings" banner and skips capability/health probes. Operator can navigate to it from the settings link.

## Shim deployment

Repo location: in-tree at `packages/hermes-shim/`. The shim contract co-evolves with the adapter, so versioning together prevents drift.

Layout:

```
packages/hermes-shim/
  pyproject.toml
  README.md           # install, run, systemd, security notes
  hermes_shim/
    __init__.py
    server.py         # FastAPI app
    cli.py            # entry point
  systemd/
    hermes-shim.service.template
```

Process manager: systemd user unit on the remote host. Bind defaults to `127.0.0.1:9119`. The shim **refuses to start** if `0.0.0.0` is requested without `HERMES_SHIM_BIND_LAN=1` set explicitly.

Secret distribution: `HERMES_SHIM_TOKEN` lives in the shim's systemd environment file and the bridge's process environment (existing `HERMES_TOKEN` wiring). `runtimes.json` carries no secret.

Observability: shim writes `~/.hermes/shim.log`. Bridge logs adapter calls at `info`, errors at `warn`.

## Observability for config changes

After a successful PATCH and atomic rename, the bridge logs:

```
info runtime.config.changed {
  user, oldConfiguredPrimary, newConfiguredPrimary,
  enabledChanges: { [id]: bool },
  effectivePrimaryAfter, fallbackReasonAfter
}
```

If the rename fails, the bridge logs an error with the same diff under `runtime.config.write_failed`.

These lines surface in `/logs/tail`. No separate audit store in Phase 1.

## Migration of existing repos

- Legacy `runtimes.json` without `enabled` per descriptor → registry treats missing `enabled` as `true` in-memory. **No file rewrite on load.**
- Legacy file without top-level `configuredPrimaryRuntimeId` → registry computes effective primary in-memory using the same fallback chain. `fallbackReason: "configured_primary_missing"` in GET. **No file rewrite on load.**
- First successful PATCH normalizes the file (writes the full canonical shape).

## Decomposition

Three independent units. Interface contract frozen before parallel work begins.

| Agent | Owns | Frozen interface artifact |
| --- | --- | --- |
| **A — Settings/config** | `runtimes.json` schema migration, registry validation, `/runtime-config` GET+PATCH routes, fallback computation, audit log lines, `RuntimeStatus` tri-state in registry output | `RuntimeConfigSnapshot`, `RuntimeConfigPatch`, fallback semantics doc |
| **B — Dashboard UX** | Settings "Runtimes" section, `/runtimes` list filtering, fallback banner, disabled-runtime detail page behavior, permission gating | consumes A's TS types only |
| **C — Hermes shim + adapter** | `packages/hermes-shim/` Python package, real `hermes.ts` adapter replacing the Phase-1 stub, contract tests against recorded shim fixtures, capability-provenance handling | OpenAPI sketch of the shim, fixture corpus |

## Test plan

Backend (Vitest / Node test runner — match existing pattern in `apps/bridge/test`):

- `runtimes-config.test.ts` — schema validation, PATCH atomicity, `cannot_disable_all`, `unknown_runtime_id`, fallback computation across all five primary-state cases.
- `runtimes-hermes-adapter.test.ts` — adapter against an in-memory fake of the shim API; covers capability provenance flag flipping when shim "down".
- `hermes_shim/` Python tests — endpoint-level happy path + auth failure.

Dashboard:

- Component-level tests for the Settings "Runtimes" section: toggle persistence, radio change persistence, optimistic rollback on 409.
- Integration smoke: toggle currently-primary runtime → banner appears; re-enable → banner disappears; disable last enabled → blocked at PATCH with 409 message rendered.

## Rollout / safe-disable path

- Default `runtimes.json` ships with `oc-main` only, `enabled: true`. No behavior change for existing installs.
- Operator adds Hermes descriptor + sets `enabled: true` after the shim is reachable.
- Disable path: setting `enabled: false` for Hermes is a config-only change, no service restart, immediately reflected in `/runtimes` and settings UI.
- If the bridge is started with a bad `runtimes.json` (e.g. invalid JSON), the existing registry behavior throws on construction; bridge boot fails loudly. This matches today's behavior.

## Open questions

None blocking spec freeze.
