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
