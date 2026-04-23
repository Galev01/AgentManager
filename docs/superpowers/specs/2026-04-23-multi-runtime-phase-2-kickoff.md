# Phase 2 Kickoff Brief — Multi-Runtime Control Plane

> Origin: consult-openclaw session on 2026-04-23 after Phase 1 shipped on branch `Gal/multi-runtime-control-plane`. Paste into a fresh Claude Code session to start Phase 2 planning without re-consulting OpenClaw.

## Scope Summary

Phase 2 upgrades the Phase 1 MVP from "OpenClaw-first with honest stubs" into a **real multi-runtime control plane** with:
- real adapter research and verified endpoint shapes for Hermes, ZeroClaw, and Nanobot
- federated per-runtime identity mapping
- at least one deep non-OpenClaw adapter with meaningful read support and narrowly scoped write support
- a unified subscribe substrate
- a cross-runtime activity aggregator built on stream semantics, with polling shims only where push is unavailable

### Non-goals
- full write parity across all runtimes
- flattening all runtimes into one fake object model
- replacing native runtime semantics with MCP semantics
- shipping broad service-mode impersonation as a permanent shortcut
- deep ZeroClaw Rust sidecar work unless HTTP/MCP introspection proves insufficient
- perfect normalization of sessions/agents/tasks/tools across runtimes

---

## Recommended Task Order

1. **Adapter research packets (Hermes, ZeroClaw, Nanobot)** — do not plan or code against guessed APIs.
2. **Federated identity substrate** — write actions without identity plumbing hard-code service impersonation and create retrofit pain.
3. **Hermes deep adapter first** — likely richest non-OC target; good proving ground for read surfaces plus minimal writes under explicit auth mode labeling.
4. **Subscribe substrate** — define event ingestion once, then let adapters plug in via native push or polling shim.
5. **Cross-runtime activity aggregator** — build on top of stream-oriented ingestion, not polling-first semantics.
6. **ZeroClaw deep adapter** — after research confirms whether HTTP/MCP is enough or a sidecar is needed.
7. **Nanobot deep adapter** — likely MCP-native; easier to land once identity + subscribe substrate already exist.

---

## Research Packet Spec

Each research task must produce a checked-in markdown packet with verified findings, sample payloads, and explicit unknowns. "Read README" is not enough.

### Hermes research must deliver
- install/run method and local process model
- actual admin/control endpoints or CLI surfaces
- auth model: local trust, token, session, or none
- event model: push, polling, logs, webhooks, or none
- entities exposed: agents, sessions, skills, scheduler jobs, memory, channels
- read actions available today
- write actions available today
- sample request/response payloads for key endpoints
- mapping notes into manager capabilities and envelope taxonomy
- gaps/risks: what cannot be represented cleanly yet

### ZeroClaw research must deliver
- actual HTTP/MCP/control surfaces available locally
- auth model and local trust assumptions
- event model: stream/poll/log/file-based/none
- entities exposed: agents, traits, providers, channels, memory backends, sessions if any
- introspection available over public APIs vs in-process only
- sample payloads for capability, topology, and activity views
- answer on whether Phase 2 can avoid a Rust sidecar
- mapping notes into manager capabilities and envelope taxonomy
- gaps/risks with explicit "requires sidecar" or "does not require sidecar" conclusion

### Nanobot research must deliver
- actual MCP host/tool execution model
- auth and process boundary model
- event/execution visibility available today
- entities exposed: hosts, tools, executions, sessions/tasks if any
- tool invocation surface and result payload shapes
- sample payloads for tool list, invocation, execution state
- limitations of MCP-only integration for audit and identity
- mapping notes into manager capabilities and envelope taxonomy
- gaps/risks for delegated/asserted actor support

---

## Federated Identity Substrate Design

Adopt **1:N identity links** per dashboard user per runtime.

### RuntimeIdentityLink
- `id`
- `userId`
- `runtimeId`
- `runtimeKind`
- `linkName`
- `authMode` (`service` | `delegated` | `asserted`)
- `externalActorId`
- `externalActorLabel`
- `scopeJson`
- `isDefault`
- `status` (`active` | `revoked` | `invalid`)
- `createdAt`
- `updatedAt`
- `lastVerifiedAt`

Rules:
- many links allowed per `(userId, runtimeId)`
- at most one default active link per `(userId, runtimeId)`
- actions resolve against explicit link or default link
- service-mode remains allowed only where policy permits

Audit record for every mutating action must capture:
- human actor
- manager service actor
- runtime actor/link used
- auth mode
- runtime target
- assertion basis/policy result

---

## Subscribe Substrate + Activity Aggregator

Use **one WebSocket per dashboard session**, multiplexed by control messages.

### Control messages
- `subscribe { runtimes/topics, sinceCursor? }`
- `unsubscribe { runtimes/topics }`
- `ack { cursor }`
- `ping/pong`

### Event model
- every event carries `runtimeId`, `runtimeKind`, `topic`, `cursor`, `nativeRef`, `canonicalProjection`
- cursors are per runtime/topic, monotonic where possible
- adapters with native push implement `subscribeActivity`
- adapters without push use an internal polling shim that emits into the same stream contract

### Backpressure / overflow
- bounded per-client queue
- coalesce noisy status events where safe
- if overflow occurs, emit overflow marker and require resume from cursor/backfill
- define replay behavior with `sinceCursor` or equivalent best-effort backfill

Build `/activity?runtimeId=all` on top of this stream substrate, not as a polling-first feature.

---

## Trap List + Mitigation

- **Capability drift** — refresh/version capabilities and test against real installs.
- **Lossy normalization** — store native payloads alongside canonical projections.
- **Service-mode creep** — label service writes explicitly and gate them by policy.
- **Identity UX confusion** — always show who-via-what-against-which-runtime.
- **Backfill gaps** — require cursors/replay semantics before calling subscribe "done".
- **Fake adapter confidence** — add contract tests against live runtime installs, not only stubs.

---

## Exit Criteria for Phase 2

Phase 2 is shippable only if all are true:
- research packets exist for Hermes, ZeroClaw, and Nanobot with verified endpoint shapes and sample payloads
- RuntimeIdentityLink 1:N model is implemented with default selection and audited action provenance
- Hermes deep adapter is real and usable, with meaningful read support and at least minimal authenticated writes
- subscribe substrate exists with WS multiplexing, cursors, bounded queues, and polling shim support
- cross-runtime activity aggregation works from the subscribe substrate with source/runtime markers
- ZeroClaw and Nanobot move beyond stubs with verified capability-backed reads
- UI clearly distinguishes supported / partial / read-only / service-mode surfaces
- tests cover identity resolution, subscribe flow, backpressure behavior, and live adapter contracts

**Next step:** start a fresh session and execute this brief in order, beginning with the three adapter research packets.
