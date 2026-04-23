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
