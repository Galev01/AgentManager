# Runtime-Agnostic Migration — Finish Phase A2 (write paths + workers)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to execute this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Finish migrating user-facing flows to dispatch through `RuntimeAdapter.invokeAction` / `listEntities` instead of legacy `callGateway`. Cover all 7 high-severity findings from the 2026-05-10 Codex adversarial review of `Gal/runtime-agnostic`.

**Architecture:** Routes resolve a runtime via `runtime-resolver.ts` helpers, gate the relevant `CapabilityId`, then dispatch through the adapter. Background workers (YouTube chat, Review Inbox, Claude Code orchestrator) carry a `runtimeId` on their persisted state and dispatch through that runtime's adapter. New `RuntimeActionId` entries cover session lifecycle operations the legacy gateway exposed (create/reset/abort/compact/delete + usage). OpenClaw adapter absorbs the JSONL session-tail logic so workers no longer import `openclaw-session-tail` directly.

**Tech Stack:** Node 20+, TypeScript, Express, `node:test` (bridge), Vitest (dashboard). pnpm workspace. No new runtime dependencies expected.

**Branch:** `Gal/runtime-agnostic` (already 12 commits ahead of `main`, PR #6 has A2.1).

---

## Phasing

```
Wave 1 — Contract additions (blocks Wave 2-4):
  Task 1: Extend RuntimeActionId / RuntimeActionPayload for session lifecycle
  Task 2: OpenClaw adapter implements new actions + absorbs session-tail
  Task 3: Hermes / Zeroclaw / Nanobot adapters declare unsupported

Wave 2 — Quick route fixes (parallel after Wave 1):
  Task 4: agent-models service — accept runtimeId
  Task 5: tools.ts route — migrate /tools/effective + /skills + /skills/install
  Task 6: cron.ts route — migrate POST/run/status/delete
  Task 7: agent-sessions.ts route — migrate POST/send/usage/reset/abort/compact/delete

Wave 3 — Worker migration (parallel after Wave 1):
  Task 8: YouTube chat worker — persist runtimeId, dispatch via adapter
  Task 9: Review Inbox runner — persist runtimeId, dispatch via adapter

Wave 4 — Claude Code orchestrator (after Wave 1):
  Task 10: Claude Code session record carries runtimeId; orchestrator + summarize dispatch via adapter

Wave 5 — Verification:
  Task 11: Cross-runtime regression tests — assert no callGateway path on non-OpenClaw runtime
  Task 12: Update docs/spec; commit; verify build + tests; surface for PR
```

Wave 1 is the only strict dependency. Waves 2–4 can run in parallel with separate sub-agents but each must rebase onto Wave 1's commits.

---

## File map

**Modified:**
- `packages/types/src/runtimes.ts` — extend `RuntimeActionId` + `RuntimeActionPayload`.
- `apps/bridge/src/services/runtimes/openclaw.ts` — add invokeAction handlers; absorb session-tail.
- `apps/bridge/src/services/runtimes/hermes.ts` — declare new action ids unsupported.
- `apps/bridge/src/services/runtimes/zeroclaw.ts` — same.
- `apps/bridge/src/services/runtimes/nanobot.ts` — same.
- `apps/bridge/src/routes/agent-sessions.ts` — migrate write paths.
- `apps/bridge/src/routes/cron.ts` — migrate write paths.
- `apps/bridge/src/routes/tools.ts` — migrate /effective, /skills, /skills/install.
- `apps/bridge/src/routes/models.ts` — pass resolved runtimeId to service.
- `apps/bridge/src/services/agent-models.ts` — accept runtimeId in readCatalog.
- `apps/bridge/src/services/youtube-chat-worker.ts` — adapter dispatch.
- `apps/bridge/src/services/youtube-chat-session.ts` — persist runtimeId/agentId.
- `apps/bridge/src/services/youtube-store-v2.ts` (or metadata) — runtimeId/agentId column.
- `apps/bridge/src/services/codebase-reviewer/runner.ts` — adapter dispatch.
- `apps/bridge/src/routes/codebase-reviewer.ts` — accept runtimeId on create.
- `apps/bridge/src/services/codebase-reviewer/store.ts` (or wherever review state persists) — runtimeId column.
- `apps/bridge/src/routes/claude-code.ts` — orchestrator deps.
- `apps/bridge/src/services/claude-code-ask.ts` — accept runtimeId.
- `apps/bridge/src/services/claude-code-summarize.ts` — accept runtimeId.
- `apps/bridge/src/services/claude-code-sessions.ts` — runtimeId on session record.

**Created:**
- `apps/bridge/test/agent-sessions-write-routes.test.ts`
- `apps/bridge/test/cron-write-routes.test.ts`
- `apps/bridge/test/tools-effective-skills-routes.test.ts`
- `apps/bridge/test/agent-models-service-runtime-id.test.ts`
- `apps/bridge/test/youtube-chat-worker-runtime.test.ts`
- `apps/bridge/test/codebase-reviewer-runner-runtime.test.ts`
- `apps/bridge/test/claude-code-orchestrator-runtime.test.ts`
- `apps/bridge/test/runtime-action-payload-schemas.test.ts`

**Deleted/relocated:**
- Logic in `apps/bridge/src/services/openclaw-session-tail.ts` moves into the OpenClaw adapter (`runtimes/openclaw.ts`). The file may stay as a re-export shim or be deleted once no caller imports it.

---

## Wave 1: Contract additions

### Task 1: Extend `RuntimeActionId` / `RuntimeActionPayload`

**File:** `packages/types/src/runtimes.ts`

Add the session-lifecycle actions used by routes today via `callGateway`. Each must have a payload entry. Result type stays `RuntimeActionResult`; per-action `nativeResult` shape declared in JSDoc on the payload entry.

- [ ] **Step 1: Add ids to `RuntimeActionId` union**

```ts
export type RuntimeActionId =
  | "agents.create" | "agents.update" | "agents.delete"
  | "channels.connect" | "channels.disconnect"
  | "tools.invoke"
  | "cron.write" | "cron.delete" | "cron.run"          // NEW: cron.run
  | "claudeCode.ask"
  | "sessions.create"                                    // NEW
  | "sessions.send"                                      // existing
  | "sessions.reset"                                     // NEW
  | "sessions.abort"                                     // NEW
  | "sessions.compact"                                   // NEW
  | "sessions.delete"                                    // NEW
  | "memory.write" | "skills.install" | "config.set";
```

Also extend `RuntimeReadCapabilityId` with reads we touch:

```ts
export type RuntimeReadCapabilityId =
  | "agents.list" | "agents.read"
  | "sessions.list" | "sessions.read"
  | "sessions.usage"                                     // NEW
  | "cron.list" | "cron.status"                          // NEW: cron.status
  | "tools.list" | "tools.effective"                     // NEW: tools.effective
  | "skills.list"
  | "channels.list" | "channels.status"
  | "memory.query" | "models.list" | "logs.tail" | "config.get";
```

- [ ] **Step 2: Add payload entries**

```ts
export type RuntimeActionPayload = {
  // ... existing entries unchanged ...
  "sessions.create": {
    agentName?: string;     // gateway uses `agent`; adapter can map
  };
  "sessions.send": {
    sessionKey: string;
    message: string;
    awaitCompletion?: boolean;   // when true, adapter waits for terminal status and returns assistantText
    timeoutMs?: number;          // default 120000
  };
  "sessions.reset":   { sessionKey: string };
  "sessions.abort":   { sessionKey: string };
  "sessions.compact": { sessionKey: string };
  "sessions.delete":  { sessionKey: string };
  "cron.run":         { id: string };
};
```

Result `nativeResult` shapes (informal — document as JSDoc, no separate types):

| action | `nativeResult` |
|---|---|
| `sessions.create` | `{ sessionKey, sessionId?, ...verbatim }` |
| `sessions.send` (awaitCompletion=false) | `{ ack: true, sessionKey }` |
| `sessions.send` (awaitCompletion=true) | `{ assistantText, elapsedMs, sessionKey }` |
| `sessions.reset/abort/compact/delete` | `{ ok: true }` |
| `cron.run` | `{ ok: true, ... }` |

- [ ] **Step 3: Run typecheck across workspace**

`pnpm -r build` — expect type errors in adapters that haven't yet declared the new ids. Those errors are addressed in Tasks 2–3.

- [ ] **Step 4: Commit**

```
feat(types): session lifecycle + cron.run + capability ids

Extends RuntimeActionId with sessions.{create,reset,abort,compact,delete}
plus cron.run; extends RuntimeReadCapabilityId with sessions.usage,
cron.status, tools.effective. Adapter implementations follow.
```

### Task 2: OpenClaw adapter implements new actions + absorbs session-tail

**File:** `apps/bridge/src/services/runtimes/openclaw.ts`

The OpenClaw adapter currently handles `sessions.send` (and others?) — verify what's already there and add what's missing. Crucially, fold `openclaw-session-tail.ts` into `invokeAction("sessions.send", { awaitCompletion: true, ... })` so workers get a runtime-neutral completion API.

- [ ] **Step 1: Inspect current adapter** to see which actions and capabilities are declared.

Read `apps/bridge/src/services/runtimes/openclaw.ts` end-to-end. Note the entries in `STATIC_CAPS.supported` and the `invokeAction` switch. Map onto the new ids.

- [ ] **Step 2: Update STATIC_CAPS** to add `supported: ["sessions.create", "sessions.reset", "sessions.abort", "sessions.compact", "sessions.delete", "sessions.usage", "cron.status", "cron.run", "tools.effective", ...]`.

- [ ] **Step 3: Implement each new action**

For each, call the existing `callGateway` underneath but expose the typed surface. Example skeleton:

```ts
case "sessions.create": {
  const params: Record<string, unknown> = {};
  if (typeof payload.agentName === "string") params.agent = payload.agentName;
  const raw = await callGateway("sessions.create", params);
  return { ok: true, nativeResult: raw as JsonValue, projectionMode: "exact" };
}
case "sessions.reset":   return wrapGw("sessions.reset",   { session: payload.sessionKey });
case "sessions.abort":   return wrapGw("sessions.abort",   { session: payload.sessionKey });
case "sessions.compact": return wrapGw("sessions.compact", { session: payload.sessionKey });
case "sessions.delete":  return wrapGw("sessions.delete",  { session: payload.sessionKey });
case "cron.run":         return wrapGw("cron.run", { id: payload.id });
```

Where `wrapGw(method, params)` is:

```ts
async function wrapGw(method: string, params: Record<string, unknown>): Promise<RuntimeActionResult> {
  try {
    const raw = await callGateway(method, params);
    return { ok: true, nativeResult: raw as JsonValue, projectionMode: "exact" };
  } catch (e) {
    return { ok: false, error: (e as Error).message ?? String(e), projectionMode: "exact" };
  }
}
```

- [ ] **Step 4: Implement awaitCompletion for `sessions.send`**

Move logic out of `apps/bridge/src/services/openclaw-session-tail.ts` into the adapter. New private helpers inside `runtimes/openclaw.ts`:

```ts
async function sessionsSendAwaiting(
  sessionKey: string,
  message: string,
  timeoutMs: number,
): Promise<{ assistantText: string; elapsedMs: number; sessionKey: string }> {
  const started = Date.now();
  await callGateway("sessions.send", { key: sessionKey, message });
  // Resolve sessionId via sessions.list (existing pattern).
  // Poll status; on terminal, read JSONL session file via fs.
  // Return { assistantText, elapsedMs, sessionKey }.
  // Throws on timeout / no assistant text.
}
```

`invokeAction("sessions.send", { ..., awaitCompletion: true })` calls this helper and wraps in `RuntimeActionResult`.

The pre-existing helpers `waitForSessionTerminal`, `sessionFilePath`, `readLastAssistantMessage`, `pollSessionStatus` move from worker code into this file (or a sibling private module imported only by this adapter).

- [ ] **Step 5: Implement reads `sessions.usage`, `cron.status`, `tools.effective` via `listEntities` extension or adapter-private read helpers**

These are reads, so the cleanest pattern is to extend `RuntimeEntityKind` is overkill. Instead, add them to the adapter's internal capability table and expose lightweight read helpers used by routes:

Decision: keep as part of `invokeAction`-style "fetch" semantics is wrong for reads. Use a new method on `RuntimeAdapter`:

```ts
// in packages/types/src/runtimes.ts (Task 1, append)
read?(capabilityId: RuntimeReadCapabilityId, params?: JsonValue): Promise<JsonValue>;
```

Adapters that implement this support arbitrary per-capability reads. Routes call:

```ts
await requireCapability(adapter, "sessions.usage", resolvedId);
const out = await adapter.read?.("sessions.usage", { sessionKey: id });
```

If `adapter.read` is undefined, treat as unsupported.

- [ ] **Step 6: Add OpenClaw adapter unit tests** at `apps/bridge/test/runtimes-openclaw-adapter.test.ts` covering: all new action ids dispatch through `callGateway` with the expected method/params; awaitCompletion path returns assistantText.

- [ ] **Step 7: Commit**

```
feat(bridge/openclaw): session lifecycle actions + sessions.send awaitCompletion

Implements sessions.{create,reset,abort,compact,delete}, cron.run, and
the awaitCompletion variant of sessions.send (folds the JSONL session
tail logic into the adapter so workers can be runtime-neutral).
```

### Task 3: Hermes / Zeroclaw / Nanobot adapters declare unsupported

**Files:** `runtimes/hermes.ts`, `runtimes/zeroclaw.ts`, `runtimes/nanobot.ts`.

Each must list the new ids in `unsupported` (or `partial` with reason) so routes return `409 UNSUPPORTED_CAPABILITY` rather than throwing.

- [ ] **Step 1: For each non-OpenClaw adapter, add ids to `STATIC_CAPS.unsupported`** (or `partial` if there's a real subset). Hermes likely supports `sessions.send` (synchronous via /v1/chat) — declare supported with `awaitCompletion` always-on semantics. Make sure the Hermes adapter's `invokeAction("sessions.send", ...)` returns `{ assistantText, sessionKey }` already; if not, add the wrapping.

- [ ] **Step 2: Update existing adapter tests** (e.g. `apps/bridge/test/runtimes-hermes-adapter.test.ts`) to assert new ids are correctly classified.

- [ ] **Step 3: Commit**

```
feat(bridge/{hermes,zeroclaw,nanobot}): declare new action ids

Sessions lifecycle + cron.run are not supported by these runtimes today.
Hermes synchronizes sessions.send via /v1/chat; the adapter exposes the
awaitCompletion form natively.
```

---

## Wave 2: Route fixes

### Task 4: agent-models service accepts runtimeId

**Files:** `apps/bridge/src/services/agent-models.ts`, `apps/bridge/src/routes/models.ts`.

The bug: `readCatalog()` reads `effectivePrimaryRuntimeId` from config instead of using the resolved runtimeId the route passed.

- [ ] **Step 1: Add `runtimeId` parameter to `readCatalog` + `readCatalogViaAdapter`**

```ts
async function readCatalog(opts?: { runtimeId?: string }): Promise<{ models, status }> {
  if (registry && runtimeConfig) return readCatalogViaAdapter(opts?.runtimeId);
  return readCatalogViaGateway();
}

async function readCatalogViaAdapter(forcedRuntimeId?: string) {
  if (!registry || !runtimeConfig) return readCatalogViaGateway();
  const runtimeId = forcedRuntimeId ?? (await runtimeConfig.read()).effectivePrimaryRuntimeId;
  if (!runtimeId) return { models: [], status: "unavailable" };
  // ... rest unchanged
}
```

- [ ] **Step 2: Pass `resolved.runtimeId` into the route**

```ts
// routes/models.ts
const result = await service.readCatalog({ runtimeId: resolved.runtimeId });
res.json({ ...result, runtimeId: resolved.runtimeId, source: resolved.source });
```

- [ ] **Step 3: Add `readSnapshot` overload for runtimeId** — agents endpoint passes through the same runtimeId param so default-model evaluation is also runtime-correct.

- [ ] **Step 4: Test** at `apps/bridge/test/agent-models-service-runtime-id.test.ts`:
  - Stub registry with two runtimes (primary=openclaw, alt=hermes).
  - Each adapter's `listEntities("model")` returns distinct models.
  - Assert `readCatalog({ runtimeId: "hermes" })` returns hermes models, NOT openclaw's.
  - Assert validation against `runtimeId: "hermes"` rejects an openclaw-only model id.

- [ ] **Step 5: Commit**

```
fix(bridge/models): readCatalog honors resolved runtimeId

Previously /models?runtimeId=hermes passed Hermes capability checks but
returned the primary runtime's catalog stamped with the requested
runtimeId. Threads the resolved id through to readCatalog so route
resolution and data source cannot diverge.
```

### Task 5: tools.ts route migrate /effective + /skills + /skills/install

**File:** `apps/bridge/src/routes/tools.ts`.

- [ ] **Step 1: GET /tools/effective** — use `resolveRuntimeForCatalog`, gate `tools.effective`, call `adapter.read?.("tools.effective", {})`. If `adapter.read` undefined or call throws Unsupported, return 409.

- [ ] **Step 2: GET /skills** — same pattern, gate `skills.list`, call `adapter.listEntities("skill")`, project to dashboard wire shape (bare array of `{ id, name, ... }`).

- [ ] **Step 3: POST /skills/install** — use `resolveRuntimeForCreate` (body.runtimeId allowed), gate `skills.install`, call `adapter.invokeAction("skills.install", { ref: name }, { actor })`. Build `actor` from `req.auth` like other action routes. Map adapter result to JSON.

- [ ] **Step 4: Test** at `apps/bridge/test/tools-effective-skills-routes.test.ts`:
  - Migrated routes use adapter (mock registry, mock adapter, assert no callGateway invocation).
  - Unsupported runtime returns 409.
  - Body runtimeId override on install works.

- [ ] **Step 5: Commit**

```
feat(bridge/tools): runtime-aware /tools/effective, /skills, /skills/install
```

### Task 6: cron.ts route migrate POST/run/status/delete

**File:** `apps/bridge/src/routes/cron.ts`.

- [ ] **Step 1: POST /cron** — `resolveRuntimeForCreate`, gate `cron.write`, call `invokeAction("cron.write", { spec: { cron, payload, enabled } })` (or stay closer to legacy shape: `{ id?: undefined, spec: ... }`). Persist `runtimeId` on the response so subsequent reads can use `resolveRuntimeForResource`. **Decision needed:** does the bridge maintain a cron job index keyed on id with stored runtimeId? If not, this task adds it: `apps/bridge/src/services/cron-store.ts` (new file) writes `{ id, runtimeId }` to `apps/bridge/data/cron-jobs.json`.

- [ ] **Step 2: GET /cron/:id/status** — load cron record from store, `resolveRuntimeForResource`, gate `cron.status`, call `adapter.read?.("cron.status", { id })`.

- [ ] **Step 3: POST /cron/:id/run** — same resolver, gate `cron.run`, call `invokeAction("cron.run", { id })`.

- [ ] **Step 4: DELETE /cron/:id** — same resolver, gate `cron.delete`, call `invokeAction("cron.delete", { id })`.

- [ ] **Step 5: Test** at `apps/bridge/test/cron-write-routes.test.ts`:
  - Run/delete with `?runtimeId=hermes` mismatch on a job stored with `runtimeId=openclaw` → 400 InvalidRuntimeOverride.
  - All four endpoints dispatch through the resolved adapter.
  - Disabled adapter capability → 409.

- [ ] **Step 6: Commit**

```
feat(bridge/cron): runtime-aware add/run/status/delete with stored runtimeId
```

### Task 7: agent-sessions.ts route migrate write paths

**File:** `apps/bridge/src/routes/agent-sessions.ts`.

Same pattern as Task 6, but session records already have ids supplied by the runtime. Need a small bridge-side index recording `id → runtimeId` so subsequent calls can resolve.

- [ ] **Step 1: New service** `apps/bridge/src/services/agent-sessions-index.ts`:

```ts
export interface AgentSessionsIndex {
  remember(id: string, runtimeId: string): Promise<void>;
  lookup(id: string): Promise<{ id: string; runtimeId: string } | null>;
  forget(id: string): Promise<void>;
}
```

Backed by `apps/bridge/data/agent-sessions-index.json`.

- [ ] **Step 2: POST /agent-sessions** — `resolveRuntimeForCreate`, gate `sessions.create`, call `invokeAction("sessions.create", { agentName })`, take returned id, `index.remember(id, resolved.runtimeId)`, return normalized session.

- [ ] **Step 3: POST /agent-sessions/:id/send** — load `record = index.lookup(id)`, fall back to `resolveRuntimeForCatalog` if missing (back-compat: pre-existing OpenClaw sessions); gate `sessions.send`; call `invokeAction("sessions.send", { sessionKey: id, message })` (no awaitCompletion — this endpoint is fire-and-ack).

- [ ] **Step 4: GET /agent-sessions/:id/usage** — index lookup, gate `sessions.usage`, call `adapter.read?.("sessions.usage", { sessionKey: id })`.

- [ ] **Step 5: POST /agent-sessions/:id/reset|abort|compact + DELETE** — index lookup, gate the matching capability, dispatch the matching `invokeAction`. On DELETE success, `index.forget(id)`.

- [ ] **Step 6: Test** at `apps/bridge/test/agent-sessions-write-routes.test.ts`:
  - Each verb dispatches through stored runtime's adapter.
  - Mismatched `?runtimeId=` on existing session → 400.
  - Unsupported capability → 409.
  - Pre-existing sessions without index entry fall back gracefully (resolve to primary).

- [ ] **Step 7: Commit**

```
feat(bridge/agent-sessions): runtime-aware create/send/reset/abort/compact/delete/usage
```

---

## Wave 3: Worker migration

### Task 8: YouTube chat worker — runtime-aware

**Files:** `apps/bridge/src/services/youtube-chat-worker.ts`, `apps/bridge/src/services/youtube-chat-session.ts`, `apps/bridge/src/services/youtube-store-v2.ts` (or wherever metadata lives).

- [ ] **Step 1: Persist `runtimeId` + `agentId` per chat session**

`youtube-chat-session.ts` currently caches a `sessionKey` per videoId. Extend to store `{ sessionKey, runtimeId, agentId }`. Default `runtimeId` to primary runtime if not provided when the session is created. Where? Look at the route that creates the chat session.

- [ ] **Step 2: Worker accepts adapter + sessionKey**

```ts
async function processChat(job: Job, deps: { registry: RuntimeRegistry; runtimeConfig: RuntimeConfigService }) {
  const sess = await getOrCreateSessionKey(job.videoId);
  const adapter = await deps.registry.adapter(sess.runtimeId);
  if (!adapter) throw new Error(`runtime ${sess.runtimeId} unavailable`);
  await requireCapability(adapter, "sessions.send", sess.runtimeId);
  const result = await adapter.invokeAction(
    "sessions.send",
    { sessionKey: sess.sessionKey, message: contextBlock, awaitCompletion: true, timeoutMs: 120_000 },
    { actor: SYSTEM_ACTOR },
  );
  if (!result.ok) throw new Error(result.error);
  const { assistantText } = result.nativeResult as { assistantText: string };
  // ... append to chat log ...
}
```

- [ ] **Step 3: Drop `import("./openclaw-session-tail.js")` and `callGateway` imports.**

- [ ] **Step 4: Rename `openclawSessionKey` field on `YoutubeChatMessageRow` to `runtimeSessionKey`** (and add optional `runtimeId` for clarity). Migration plan for existing data: leave old field readable, write new field; add fallback projection. Document as "phase-1 dual-read, phase-2 dual-write" if needed; for now, dual-write is enough since rows are append-only.

- [ ] **Step 5: Wire `registry` + `runtimeConfig` into `enqueueChatJob` callers** (the route handler that enqueues). Pass through.

- [ ] **Step 6: Test** at `apps/bridge/test/youtube-chat-worker-runtime.test.ts`:
  - Job with `runtimeId=hermes` dispatches through the Hermes adapter, never callGateway.
  - Job with `runtimeId=openclaw` still works (regression-safe).
  - Adapter throwing UnsupportedCapability is surfaced as an error chat row.

- [ ] **Step 7: Commit**

```
feat(bridge/youtube): chat worker dispatches via runtime adapter

Each YouTube chat session carries a runtimeId; worker resolves the
adapter and uses sessions.send awaitCompletion semantics. Eliminates
the direct callGateway / openclaw-session-tail dependency.
```

### Task 9: Review Inbox runner — runtime-aware

**Files:** `apps/bridge/src/services/codebase-reviewer/runner.ts`, `apps/bridge/src/services/codebase-reviewer/store.ts` (verify path), `apps/bridge/src/routes/codebase-reviewer.ts`.

- [ ] **Step 1: Persist `runtimeId` + `agentId` on each review run record**

Default `runtimeId` to primary if not specified at create time. Default `agentId` to `config.reviewerAgent` for back-compat.

- [ ] **Step 2: `runReview(opts)` accepts `{ registry, runtimeConfig, runtimeId, agentName }`**

```ts
const adapter = await registry.adapter(runtimeId);
await requireCapability(adapter, "sessions.create", runtimeId);
const create = await adapter.invokeAction("sessions.create", { agentName }, { actor: SYSTEM_ACTOR });
if (!create.ok) throw new Error(create.error);
const sessionKey = (create.nativeResult as any).key ?? (create.nativeResult as any).sessionKey;

await requireCapability(adapter, "sessions.send", runtimeId);
const send = await adapter.invokeAction(
  "sessions.send",
  { sessionKey, message: prompt, awaitCompletion: true, timeoutMs: config.reviewerTimeoutMs },
  { actor: SYSTEM_ACTOR },
);
if (!send.ok) throw new Error(send.error);
const assistantText = (send.nativeResult as any).assistantText as string;
const idx = assistantText.indexOf("# Codebase Review");
if (idx < 0) throw new Error("agent output did not include a '# Codebase Review' heading");
return { sessionId: sessionKey, markdown: assistantText.slice(idx) };
```

- [ ] **Step 3: Drop `pollSessionStatus`, `readLastAssistantMessage`, `sessionFilePath`** from the runner — handled inside the OpenClaw adapter now.

- [ ] **Step 4: Update route** to accept optional `runtimeId` + `agentName` on create.

- [ ] **Step 5: Test** at `apps/bridge/test/codebase-reviewer-runner-runtime.test.ts`:
  - Run with `runtimeId=hermes` dispatches through Hermes adapter.
  - Run with `runtimeId=openclaw` (default) still produces markdown.
  - Adapter timeout surfaced as run-level error.

- [ ] **Step 6: Commit**

```
feat(bridge/codebase-reviewer): runner dispatches via runtime adapter

Each review run carries runtimeId; default remains OpenClaw + reviewerAgent.
Removes direct callGateway and openclaw-session-tail from the runner.
```

---

## Wave 4: Claude Code orchestrator

### Task 10: Claude Code session record carries runtimeId; orchestrator + summarize dispatch via adapter

**Files:** `apps/bridge/src/routes/claude-code.ts`, `apps/bridge/src/services/claude-code-ask.ts`, `apps/bridge/src/services/claude-code-summarize.ts`, `apps/bridge/src/services/claude-code-sessions.ts`.

- [ ] **Step 1: Extend `ClaudeCodeSession` record schema** to carry `runtimeId` + `agentName`. Default `runtimeId = primary`, `agentName = config.claudeCodeOpenclawAgentId` for back-compat. (See `claude-code-sessions.ts`.)

- [ ] **Step 2: `createAskOrchestrator` accepts `{ registry, runtimeConfig }`** instead of (or in addition to) `callGateway` + `openclawAgentId`. The orchestrator resolves the runtime per session — newly-created sessions use the primary; existing sessions use their stored `runtimeId`.

- [ ] **Step 3: orchestrator.ask** dispatches `invokeAction("claudeCode.ask", { ide, workspace, msgId, question, sessionId })` on the resolved adapter.

- [ ] **Step 4: summarize**

```ts
const session = await loadSession(id);
const adapter = await registry.adapter(session.runtimeId);
await requireCapability(adapter, "sessions.create", session.runtimeId);   // creates a temp summary session
// or: introduce a dedicated "summary" capability if the gateway has one
```

If summarization is just a one-shot `sessions.send awaitCompletion`, factor into a thin helper using existing capabilities. Simpler: keep summarize as gateway-only for OpenClaw and return `null` for non-OpenClaw runtimes (capability-gated). Document as Phase-1 limit.

- [ ] **Step 5: Update `routes/claude-code.ts`** — wire in registry + runtimeConfig, drop the OpenClaw-only `openclawAgentId` from orchestrator deps (or pass as fallback when session has no `runtimeId`).

- [ ] **Step 6: Test** at `apps/bridge/test/claude-code-orchestrator-runtime.test.ts`:
  - Session created with `runtimeId=hermes` → ask dispatches through Hermes adapter.
  - Session without `runtimeId` (legacy) → resolves to primary.
  - Summarize on a session whose runtime lacks capability → returns `{ summary: null }` without 500.

- [ ] **Step 7: Commit**

```
feat(bridge/claude-code): orchestrator + summarize dispatch via runtime adapter

Each Claude Code session record carries runtimeId; orchestrator resolves
the runtime per ask and dispatches claudeCode.ask through the adapter.
Summarize gracefully no-ops on runtimes that lack the capability.
```

---

## Wave 5: Verification

### Task 11: Cross-runtime regression tests

**File:** `apps/bridge/test/runtime-no-callgateway-leaks.test.ts` (new).

- [ ] **Step 1: Ban list test** — for each focus surface (agent-sessions/cron/tools/youtube/review/claude-code), instantiate the route or worker with a registry whose adapters are spies. Run a representative request with `runtimeId=hermes`. Assert: zero invocations of the legacy `callGateway` symbol (e.g. by passing a `callGateway` spy that fails the test if called). Adapter spies record the dispatch; assert their `invokeAction` was called with the expected action id.

- [ ] **Step 2: Build + full test suite**

```
pnpm --filter bridge build
cd apps/bridge && pnpm exec tsx --test test/**/*.test.ts
```

Expected: zero new failures relative to `main` baseline. The pre-existing `youtube-rebuild.test.ts` failure on main is unrelated and remains.

- [ ] **Step 3: Commit**

```
test(bridge): runtime-agnostic regression suite

Each focus surface — agent-sessions, cron, tools, youtube chat, review
inbox, claude-code orchestrator — passes a callGateway spy that fails
on invocation. Asserts dispatch through the adapter only.
```

### Task 12: Update spec/docs; surface for PR

- [ ] **Step 1: Update `docs/superpowers/specs/2026-05-10-runtime-agnostic-features-design.md`** with: new RuntimeActionIds, the awaitCompletion contract, the resource-runtime persistence pattern (cron index, agent-sessions index, youtube chat sessions, review runs, claude-code sessions).

- [ ] **Step 2: Run final verification** — `pnpm --filter bridge build` clean, suite green except for pre-existing youtube-rebuild fail.

- [ ] **Step 3: Surface to Gal** for explicit go-ahead before push (per project convention; pushes to shared remote require Gal sign-off).

- [ ] **Step 4: Push branch + open PR**

PR title: `feat(bridge): finish runtime-agnostic migration (Phase A2.x — write paths + workers)`
PR body references this plan + the Codex review findings.

---

## Self-Review Notes

- **Coverage vs Codex findings:**
  - Finding 1 (agent-sessions write) → Task 7 (after Wave 1).
  - Finding 2 (cron write) → Task 6.
  - Finding 3 (tools effective/skills) → Task 5.
  - Finding 4 (models runtimeId) → Task 4.
  - Finding 5 (YouTube chat) → Task 8.
  - Finding 6 (Review Inbox) → Task 9.
  - Finding 7 (Claude Code orchestrator) → Task 10.
- **Type consistency:** `RuntimeActionId` additions in Task 1 are referenced by Tasks 2, 3, 6, 7, 8, 9, 10. The `awaitCompletion` flag added to `sessions.send` payload in Task 1 is consumed by Tasks 8, 9 (workers) and Task 10 (orchestrator).
- **Persistence additions** (cron-store, agent-sessions-index, runtimeId on YouTube chat session, on review run, on claude-code session) are listed per task. Each needs a small JSON-file store; reuse `apps/bridge/data/` directory pattern that other services use.
- **Back-compat:** sessions/cron/youtube records that pre-date this migration get resolved to primary runtime when no stored runtimeId exists. Tests cover this fallback.
- **Open question for the implementing engineer:** does the OpenClaw gateway actually expose `sessions.usage`, `cron.status`, `tools.effective`, `cron.run` as RPC methods? If yes, the OpenClaw adapter just wraps. If a subset is missing, the adapter declares them unsupported and the routes return 409 — that's still a correctness improvement over today's silent failure.
- **PR splitting strategy:** Wave 1 + Wave 2 (Tasks 1–7) ships as one PR (foundational contract + small route fixes). Wave 3 (workers) and Wave 4 (claude-code) ship as separate PRs to keep diffs reviewable. Tests for each surface land with the surface's PR.

---

## Execution

After this plan is saved, hand off via subagent-driven-development. Recommended dispatch order:

1. **Sub-agent A (sonnet, sequential):** Task 1 → Task 2 → Task 3. (Single agent because Tasks 2–3 build directly on Task 1's types.)
2. **Sub-agents B/C/D/E in parallel after A merges:**
   - B: Tasks 4 + 5 (small route fixes, can be one agent).
   - C: Task 6 (cron + cron-store).
   - D: Task 7 (agent-sessions + index).
3. **Sub-agents F/G in parallel after Wave 1:**
   - F: Task 8 (YouTube).
   - G: Task 9 (Review Inbox).
4. **Sub-agent H after Wave 1:** Task 10 (Claude Code).
5. **Sub-agent I:** Task 11 (regression suite) — runs after all above merge.
6. **Coordinator (this session):** Task 12 (spec update + final verification + PR).
