# Dashboard Copilot Chat — Phase A1 Design

Date: 2026-05-06
Status: Draft (awaiting Gal review)
Owner: Gal
Collaborator: OpenClaw (reviewed via consult-openclaw)

## Context

Gal wants a pop-out chatbot in the dashboard, anchored bottom-right of every page. The agent should eventually have "full control over the dashboard" — configure it, change settings, improve itself, run pen tests. Backend selectable per user preference between Hermes (just integrated, runs at the LAN-bound shim on `192.168.0.10:9119`) and OpenClaw (existing gateway at `127.0.0.1:18789`).

The full ambition spans at least four independent dimensions: chat UI, session/routing, multi-backend coverage, and a tool/control surface that grants the agent dashboard authority. Designing all of them in one spec produces a vague design and a security-fragile control surface.

This spec covers **Phase A1 only**: the pop-out chat shell and the bridge-managed chat-session contract, with **OpenClaw as the only implemented backend**. The wire format is forward-compatible with later tool calls (so we don't re-architect when Phase C lands) but no tools are exposed and no mutation surface exists.

## Phase ladder (for context — not implemented in A1)

- **Phase A1 (this spec):** dashboard chat shell + session/routing contract + OpenClaw backend, no tools.
- **Phase A2:** Hermes backend implementing the same chat adapter interface (extends shim with chat endpoint or proxies `hermes -z` / ACP / MCP).
- **Phase C1:** read-only dashboard tools (e.g. `runtimes.status`, `settings.get`, `logs.tail`) exposed to the agent.
- **Phase C2:** low-risk mutations within the existing permission model.
- **Phase D:** sensitive operational actions (restart bridge, redeploy) behind explicit approval gates.
- **Phase E:** self-modification + pen-test under separate explicit owner authorization with auditability.

The capability ladder MUST NOT be collapsed: informational reads, dashboard mutations, and host/system actions are different security models with different approval surfaces.

## Goals

- Authenticated dashboard users can open a chat panel from any page.
- Each chat session is owned by one user and bound to one backend at create time.
- OpenClaw backend works end-to-end: create session, send turn, observe assistant reply, render in panel.
- Wire format already supports `tool_call` / `tool_result` events for future phases — but Phase A1 emits and accepts only `text` events.

## Non-goals (locked)

- No tool execution. The bridge ignores any `tool_call` event from any backend in Phase A1.
- No dashboard mutation. No settings PATCH from chat, no service restart, no deploy, no code edit.
- No self-modification, no pen-test capability.
- No backend switching mid-session.
- No streaming / SSE / WebSocket. Polling only.
- No Hermes backend.
- No transcript export, no chat search, no shared sessions.
- No manual-mode operator override (the lifecycle machinery is reusable from claude-code-ask, but the moderation hook path is not generic-ready).

## Architecture

```
Dashboard (Next.js, 192.168.0.240)
  ├─ <CopilotLauncher>     — floating button bottom-right (in AppShell)
  ├─ <CopilotPanel>        — popover, slide-up; empty state | session | error
  └─ /api/copilot/...      — server-side proxy (mirrors /api/runtime-config pattern)
        |
        v
Bridge (Windows, 0.0.0.0:3100)
  /copilot/sessions                          GET (list)   POST (create)
  /copilot/sessions/:id                      GET (snapshot)   DELETE
  /copilot/sessions/:id/turn                 POST (submit user turn)
  /copilot/sessions/:id/turn/:msgId          GET  (poll for assistant reply)
        |
        v
  copilotChatService              (durable session + transcript + per-session lock)
        |
        v
  ChatBackendAdapter              (interface)
        ├─ openclawChatBackend    — wraps existing sessions.create / sessions.send / sessions.get
        └─ hermesChatBackend      — DEFERRED to A2 (returns 501)
```

Sessions persist on disk under `${MANAGEMENT_DIR}/copilot/sessions/<sessionId>/`:

- `meta.json` — backend, owner, createdAt, lastTurnAt, optional title, gateway session key (when backend is OpenClaw).
- `transcript.jsonl` — append-only ordered events.
- `pending.json` — durable in-flight-turn state (recovery across bridge restart).

Turn lifecycle reuses the pending-state shape from `apps/bridge/src/services/claude-code-pending.ts` but the orchestration is bridge-internal. Manual-mode operator override (the moderator workflow used by Claude-Code) is **not** part of A1.

## Chat domain model

New types live in `packages/types/src/copilot.ts`. Imported wherever the bridge or dashboard needs them.

```ts
import type { JsonValue } from "./runtimes.js"; // already exported

export type BackendKind = "openclaw" | "hermes";

export type CopilotSessionMeta = {
  id: string;                          // server-assigned uuid v4
  ownerUserId: string;                 // bridge-stamped from req.auth.user.id
  backend: BackendKind;                // frozen at create
  title: string | null;                // null => UI derives from first user turn
  createdAt: number;
  lastTurnAt: number | null;
  openclawSessionKey?: string;         // gateway-assigned session id for the openclaw backend
};

export type CopilotMessageRole = "user" | "assistant" | "system";

export type CopilotToolCall = {
  type: "tool_call";
  call_id: string;
  tool: string;
  arguments: JsonValue;
};

export type CopilotToolResult = {
  type: "tool_result";
  call_id: string;
  ok: boolean;
  result?: JsonValue;
  error?: string;
};

export type CopilotMessageEvent =
  | { type: "text"; text: string }
  | CopilotToolCall
  | CopilotToolResult;

export type CopilotMessage = {
  msg_id: string;
  role: CopilotMessageRole;
  events: CopilotMessageEvent[];       // ordered
  createdAt: number;
};

export type CopilotPendingState =
  | "pending"      // received, not yet dispatched to backend
  | "running"      // backend call in flight
  | "done"         // assistant reply landed
  | "error"        // adapter error
  | "timeout";     // exceeded deadline

export type CopilotPendingTurn = {
  msg_id: string;                      // user turn that started this
  state: CopilotPendingState;
  startedAt: number;
  finishedAt?: number;
  errorDetail?: string;
};

export type CopilotSessionSnapshot = {
  meta: CopilotSessionMeta;
  messages: CopilotMessage[];          // tail; default last 50
  pending: CopilotPendingTurn | null;
};

export type CopilotTurnPollResponse = {
  pending: CopilotPendingTurn;
  assistantMessage: CopilotMessage | null;   // populated when state === "done"
  lastMessageId: string | null;              // newest message_id known to server
};
```

Wire-format guarantees:

- Every `CopilotMessage` carries a discriminated `events` list. Phase A1 emits only `{type:"text"}` events; the bridge silently drops `tool_call` / `tool_result` events from any backend before persisting.
- `lastMessageId` in the poll response lets the client diff cheaply rather than reloading the full transcript when a turn lands.

## Session lifecycle and ownership

- `POST /copilot/sessions` body: `{ backend: BackendKind, title?: string }`.
  - Validates backend ∈ `{openclaw, hermes}`.
  - In Phase A1, `hermes` returns **400 `backend_not_supported`** with body `{detail: "Hermes backend lands in Phase A2"}`.
  - Server stamps `ownerUserId = req.auth.user.id`. Never trusts the body.
  - Generates `id` (uuid v4); creates the directory; writes initial `meta.json`.
  - For `backend: "openclaw"`:
    - Calls `callGateway("sessions.create", { key: deriveOpenclawSessionKey(id) })` where `deriveOpenclawSessionKey(id) = "copilot-${id}"`. The gateway accepts caller-chosen keys (verified pattern in `claude-code-ask.ts`).
    - Stores the actual key in `meta.openclawSessionKey`. If the gateway returns a different key on create (it shouldn't, but defensively), store the returned value.
- `GET /copilot/sessions` returns ONLY sessions where `meta.ownerUserId === req.auth.user.id`. No admin cross-read in Phase A1.
- `GET /copilot/sessions/:id`, `DELETE /copilot/sessions/:id`, and the turn endpoints all verify caller-owns-session. Mismatch returns **404** (not 403, to avoid leaking session existence).
- `DELETE /copilot/sessions/:id` **hard-deletes** the directory: `meta.json`, `transcript.jsonl`, `pending.json`. The OpenClaw gateway session is left alone (it has its own retention; tombstoning that is out of scope).

Backend swap on existing session: not allowed. PATCH endpoint is not implemented in Phase A1 (no field is mutable).

## Turn lifecycle

```
client POST /copilot/sessions/:id/turn  { message: string }
  bridge:
    1. verify caller owns session
    2. acquire per-session lock (in-memory Map<sessionId, Promise>)
       — already locked → return 409 turn_in_progress
    3. mint msgId (uuid v4)
    4. append user CopilotMessage to transcript.jsonl
       (events: [{type: "text", text: <message>}], role: "user")
    5. write pending.json: { msg_id, state: "pending", startedAt: now }
    6. return { msg_id, state: "pending" }
    7. async (off the response thread):
         backend.dispatchTurn({ session, message, msgId })
         on result → append assistant message; pending → "done"; finishedAt = now
         on adapter error → pending → "error", errorDetail
         on timeout → pending → "timeout"

client GET /copilot/sessions/:id/turn/:msgId   (polls every ~1.5 s)
  bridge:
    read pending.json for that session
    if pending.msg_id !== :msgId → 404 (a previous turn the client lost track of)
    response shape: CopilotTurnPollResponse
      pending: <full state>
      assistantMessage: when state === "done", the assistant CopilotMessage
      lastMessageId: newest message_id in transcript
```

Per-session lock prevents interleaving. Two concurrent UIs (laptop + phone) on the same session see 409 on the second `POST /turn`.

### Crash-consistency

Write order during a turn:

1. Append user message to `transcript.jsonl` (atomic `appendFile` with `flag: "a"`).
2. Atomic write `pending.json` (temp file + rename) with state `pending`.
3. Update `pending.json` (temp file + rename) to state `running` when the adapter call starts.
4. Append assistant message to `transcript.jsonl`.
5. Update `pending.json` to `done` (or `error`/`timeout`) and update `meta.lastTurnAt`.

If the bridge crashes between steps:

- Crash before (4): on session load, the orchestrator finds `pending.state ∈ {"pending","running"}` with `startedAt` older than `pendingTimeoutMs` (default 180 s) → bridge marks it `timeout` and emits an audit log line.
- Crash after (4) before (5): orchestrator detects an assistant message exists in transcript newer than `pending.startedAt` → marks `pending` as `done` and updates `meta.lastTurnAt`.

This recovery runs once at bridge boot for each session whose `pending.json` is in a non-terminal state. Per session, no more than ~2 file reads; cheap.

## Backend adapter contract

```ts
// apps/bridge/src/services/copilot/backend.ts

export type ChatTurnRequest = {
  session: CopilotSessionMeta;
  userMessageText: string;
  msgId: string;                     // user turn msg_id (idempotency)
};

export type ChatTurnResult = {
  ok: true;
  assistantText: string;
} | {
  ok: false;
  error: string;
};

export interface ChatBackendAdapter {
  /**
   * Called once when a session is created with this backend. Bootstraps any
   * backend-side state (e.g. OpenClaw `sessions.create`). Returns optional
   * fields to merge into `CopilotSessionMeta` — for OpenClaw, the gateway key.
   */
  createSession(args: {
    sessionId: string;
    ownerUserId: string;
  }): Promise<Partial<CopilotSessionMeta>>;

  /**
   * Submits a user turn and returns the assistant text. The adapter is
   * responsible for backend-native session resumption: it does NOT receive
   * the local transcript history, only the new user message and the session
   * meta. OpenClaw is authoritative for its own session memory.
   */
  sendTurn(req: ChatTurnRequest): Promise<ChatTurnResult>;
}
```

Phase A1 implementations:

| Backend | Implementation |
|---|---|
| `openclaw` | `apps/bridge/src/services/copilot/backends/openclaw.ts`. `createSession` calls `callGateway("sessions.create", { key: "copilot-${sessionId}" })`. `sendTurn` calls `sessions.send` with `idempotencyKey = msgId`, then polls `sessions.get` for length growth (baseline + 2), extracts last assistant text — same pattern as `claude-code-ask.ts:163-208`. Default reply timeout 120 s, poll interval 500 ms. On first turn (gateway baseline length === 0), prepend a system preamble (see "System prompt" below). |
| `hermes` | `apps/bridge/src/services/copilot/backends/hermes.ts`. Phase A1 stub: returns `{ ok: false, error: "hermes backend not yet implemented (Phase A2)" }`. The route layer rejects `backend: "hermes"` at create time so this stub is never reached in production; it exists as a contract placeholder so Phase A2 is a single-file change. |

The adapter does **not** receive local transcript history. Backend-native session memory is authoritative. This matters for OpenClaw because the gateway tracks its own conversation; we'd duplicate history (and break consistency) by replaying it.

## System prompt for OpenClaw backend

On the first turn of a new OpenClaw-backed Copilot session (gateway baseline length === 0), the bridge prepends a one-shot system preamble to the user's first message. The preamble is **not** added to the local transcript — only the gateway sees the wrapped first message. Same shape as `claude-code-ask.ts` `wrapFirstMessage`, with different content.

Draft preamble (final wording lands in implementation):

```
[Persistent system instructions for this OpenClaw session]

You are the Dashboard Copilot for OpenClaw-Manager. You are talking to a
human operator (Gal or another admin) inside a dashboard chat panel.

Tone:
- Helpful, terse, technical. No warm-up pleasantries.
- Lead with the answer or the specific clarifying question.
- Reply in English unless the operator writes in another language.

Scope:
- You can explain the system, suggest changes, walk through code, interpret
  logs, and propose runbooks.
- You CANNOT make dashboard changes, edit files, restart services, or run
  arbitrary commands from this chat. The dashboard does not yet expose those
  tools to you. If the operator asks you to perform such an action, say so
  clearly and offer the closest informational answer.
- If the operator asks for a destructive action, do not pretend you executed
  it. State the limitation honestly.

Grounding:
- Distinguish what you have been told vs. what you would need to look up.
  When you are uncertain, say so.
- Refer to files by absolute path or the canonical repo path. Do not invent
  file names.
```

The preamble is **not the safety boundary**. The bridge contract itself exposes no tools. The preamble shapes UX.

## API surface

All endpoints require strict actor assertion (existing `actorAssertionAuth` middleware) plus the new permission `copilot.chat`.

| Method | Path | Permission | Purpose |
|---|---|---|---|
| GET | `/copilot/sessions` | `copilot.chat` | List caller's sessions (newest first, max 50) |
| POST | `/copilot/sessions` | `copilot.chat` | Create session. Body: `{backend, title?}`. Returns `CopilotSessionMeta`. |
| GET | `/copilot/sessions/:id` | `copilot.chat` (caller-owns-session) | Snapshot. Returns `CopilotSessionSnapshot`. |
| DELETE | `/copilot/sessions/:id` | `copilot.chat` (caller-owns-session) | Hard-delete session directory. |
| POST | `/copilot/sessions/:id/turn` | `copilot.chat` (caller-owns-session) | Submit user turn. Body: `{message: string}`. Returns `{msg_id, state}`. |
| GET | `/copilot/sessions/:id/turn/:msgId` | `copilot.chat` (caller-owns-session) | Poll. Returns `CopilotTurnPollResponse`. |

Error contract:

| Status | Error code | When |
|---|---|---|
| 400 | `backend_not_supported` | POST /sessions with `backend: "hermes"` in A1 |
| 400 | `invalid_message` | turn body missing or non-string `message` |
| 403 | `forbidden` | caller lacks `copilot.chat` |
| 404 | `session_not_found` | id doesn't exist OR not caller-owned (uniform response, no leakage) |
| 404 | `turn_not_found` | poll for a msgId not in pending |
| 409 | `turn_in_progress` | concurrent POST /turn |
| 500 | `adapter_error` | backend.sendTurn rejected (logged) |

Dashboard surface (`/api/copilot/...`) is a thin server-side proxy that mirrors the existing `/api/runtime-config` pattern: bearer + actor-assertion forwarding from the user's session cookie.

## UI scope

### Floating launcher

A `<CopilotLauncher>` component anchored bottom-right of `AppShell`. Tailwind `fixed bottom-4 right-4 z-50`. Shows a chat-bubble icon. Only renders when:

- The user is authenticated (already gated by AppShell).
- The user has the `copilot.chat` permission.

A small accent dot appears on the icon when there's an in-flight turn (any session). Click toggles the panel.

### Panel (`<CopilotPanel>`)

A slide-up popover, fixed to the lower-right corner. ~440 × 620 px on desktop; full-width drawer below `768px` viewport. Three states:

1. **Empty.** Renders:
   - "New chat" form: backend radio (default = user pref; Hermes radio is **visible but disabled** with tooltip "available in next phase"); optional title input; "Start" button.
   - Below: list of the 5 most recent sessions (title, backend badge, last activity time, click to open).

2. **Session.** Renders:
   - Header: session title (or `"Untitled — ${formatDateShort(createdAt)}"`) + backend badge. Right-side overflow menu: "Delete session", "Close".
   - Message timeline: scrollable, user right-aligned, assistant left-aligned. Markdown rendered with the existing markdown component.
   - Pending indicator: a typing animation while `pending.state ∈ {pending, running}`.
   - Composer: textarea at bottom; Enter sends; Shift+Enter inserts newline. Send button disabled while pending.

3. **Error.** Adapter unavailable / 5xx → friendly card with error message + retry button.

### Persistence across navigation

`localStorage` key `copilot-ui-state`:

```ts
type CopilotUiState = {
  open: boolean;
  activeSessionId: string | null;
};
```

On mount, the panel reads this. If `open && activeSessionId`, the panel re-fetches the session snapshot. If the snapshot 404s (session was deleted in another tab), state resets to `{open: true, activeSessionId: null}`.

### Per-user default backend

New field on the user record at `${MANAGEMENT_DIR}/auth/users.json`:

```jsonc
{
  "users": {
    "<user_id>": {
      "...": "...",
      "preferences": {
        "copilot": { "defaultBackend": "openclaw" }
      }
    }
  }
}
```

`preferences` is optional; missing keys default to `{copilot: {defaultBackend: "openclaw"}}`. UI surfaces this in the existing user-edit form (`/admin/users/:id/edit`) as a single "Copilot default backend" radio. In Phase A1 the only practical value is `openclaw`; Hermes is selectable but unused until A2.

Why on the user record and not in `runtime-settings.json`: it's per-user, not global. Future phases may add per-user tool-permission grants in the same `preferences` slot.

## Audit log

For every meaningful chat-session lifecycle event, the bridge writes a structured info-level log line consumed by `/logs/tail`:

```
copilot.session.created   { user, sessionId, backend }
copilot.turn.accepted     { user, sessionId, backend, msgId }
copilot.turn.completed    { user, sessionId, backend, msgId, latencyMs, assistantLength }
copilot.turn.error        { user, sessionId, backend, msgId, errorDetail }
copilot.turn.timeout      { user, sessionId, backend, msgId, elapsedMs }
copilot.session.deleted   { user, sessionId, backend }
```

`assistantLength` is the assistant text byte length, not its content. Audit log does NOT include user message bodies (privacy / size). For full content audit, the transcript file is on disk and inspectable.

## Permission

New permission `copilot.chat`:

| Permission | Category | Description |
|---|---|---|
| `copilot.chat` | `copilot` | Open the dashboard Copilot chat panel and create/use sessions. |

Granted to the existing admin role at first. Phase C will add finer-grained `copilot.tools.*` permissions when tools land.

## Reality-audit per UI control

| Control | Behavior verified at | How |
|---|---|---|
| Launcher button | Server-side permission check via existing `<PermissionGate perm="copilot.chat">` | renders `null` when missing |
| New chat | Default backend reflects user pref; rejects `hermes` | Server returns 400; UI tooltip on disabled radio |
| Backend selector | Locked to OpenClaw in A1 | Hermes radio `disabled` |
| Transcript load | Snapshot returns last 50 messages + pending | `useSessionSnapshot(sessionId)` fetches `/api/copilot/sessions/:id` on mount |
| Pending state | Polls until terminal | `usePollingTurn(sessionId, msgId)` 1.5s interval; stops on done/error/timeout |
| Reconnect/resume | localStorage open-state + active id; refetch snapshot on mount | hook reads localStorage + fetch |
| Crash recovery | Bridge boot reconciles `pending.json` non-terminal states | `copilotChatService.recoverOnBoot()` |

## Decomposition

Subagent-driven development. Interface freeze (Unit 0) precedes A/B/C/D/E.

| Unit | Owns | Frozen interface artifact |
|---|---|---|
| **0 — Interface freeze** | `packages/types/src/copilot.ts`, new `copilot.chat` permission, file-layout doc | Exported types + permission |
| **A — Bridge service** | `services/copilot/store.ts` (file IO), `services/copilot/orchestrator.ts` (per-session lock + turn lifecycle + crash recovery), `services/copilot/backend.ts` interface, `services/copilot/backends/openclaw.ts` impl, `services/copilot/backends/hermes.ts` Phase-A1 stub | consumed by route + tests |
| **B — Bridge routes** | `routes/copilot.ts` 6 endpoints + permission gates + audit log lines + server.ts wiring | consumed by dashboard client |
| **C — Dashboard chrome** | `lib/copilot-client.ts`, `components/copilot/launcher.tsx`, `components/copilot/panel.tsx`, hooks (`useCopilotSessions`, `useSessionSnapshot`, `usePollingTurn`, `useCopilotUiState`), AppShell wiring, `app/api/copilot/[...path]/route.ts` proxy | depends on A's TS types |
| **D — User pref extension** | `preferences.copilot.defaultBackend` field on user record, admin user-edit form addition | |
| **E — Tests** | Service unit tests (orchestrator state machine, crash-recovery), route integration tests, openclaw backend test against an in-memory `callGateway` fake, dashboard component tests, e2e smoke (login → open panel → send turn → poll → assistant reply) | |

Crash-recovery has its own dedicated test path: simulate a `pending.json` left in `running` state on disk + bridge restart → assert the orchestrator transitions it to `timeout` and writes the audit line.

## Test plan

Backend (existing `node:test` harness):

- `copilot-store.test.ts` — atomic write of meta and pending; transcript append; deletion is recursive.
- `copilot-orchestrator.test.ts` — happy path; per-session lock returns 409; crash recovery transitions stale pending to timeout; transcript append before pending state change.
- `copilot-openclaw-backend.test.ts` — fake `callGateway` returns growing `messages` array; backend extracts assistant text; system preamble is sent only on first turn (baseline 0).
- `copilot-routes.test.ts` — auth + permission gates; ownership check returns 404 (not 403); turn 409; backend `hermes` 400.

Dashboard:

- Component-level: launcher hidden without permission; panel localStorage round-trip; backend radio defaults to user pref; Hermes radio disabled with tooltip.
- E2E smoke (Playwright if available; otherwise manual): login → open panel → start chat → send "hello" → wait for assistant reply → verify it renders.

## Rollout / safe-disable

- Permission `copilot.chat` is opt-in: existing roles do not get it automatically except `admin`.
- The launcher renders `null` when the permission is absent. Other dashboards continue working unchanged.
- Disable path: revoke the permission. No data loss; transcripts on disk remain.
- Bridge boot: if `${MANAGEMENT_DIR}/copilot/sessions/` does not exist, the service creates it on first session create. No migration needed.

## Open questions

None blocking spec freeze.
