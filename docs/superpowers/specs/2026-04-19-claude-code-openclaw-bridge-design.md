# Claude Code ↔ OpenClaw Bridge — Design

**Date:** 2026-04-19
**Status:** Draft — pending user review
**Author:** Gal (with Claude Code)

## Summary

Enable Claude Code running in any IDE (Antigravity, VSCode, Claude Code CLI) to hold a real collaborative dialogue with OpenClaw — asking questions, brainstorming design options, and working through bugs together. Every exchange is visible, audit-logged, and moderatable in the OpenClaw-manager dashboard. Operator can flip any session from "agent free-flow" to "manual moderation" at any time.

Scope is limited to Claude-Code-initiated dialogue. Proactive OpenClaw-initiated messages are deferred to v2.

## Goals

- Claude Code, from any IDE, can call an MCP tool to send a turn to OpenClaw and get a reply.
- OpenClaw answers with full context of the running thread (shared session), so multi-turn brainstorming and debugging work naturally.
- Every Q&A is auditable in the dashboard with a live transcript.
- Operator can intercept any reply: "take over" holds the next reply as a draft and offers `send-as-is / edit / replace / discard`.
- Setting up a new IDE is a copy-paste from a dashboard page, not hand-crafted JSON.

## Non-goals (v1)

- OpenClaw pushing unsolicited messages to Claude Code (deferred to v2: pending-inbound queue + `openclaw_check_inbox` tool).
- OpenClaw reading files directly from the workspace (v1 relies on Claude Code sending relevant context in each call).
- Multi-user / multi-operator moderation (single-operator dashboard, same auth as today).
- Replacing the existing `mcp__openclaw__*` external plugin. That plugin speaks HTTP directly to the WebSocket gateway and 404s; we ignore it and ship our own.

## Architecture

```
Claude Code (Antigravity / VSCode / CLI)
    │  stdio  (MCP protocol)
    ▼
@openclaw-manager/mcp   (new package in this repo)
    │  HTTP + Bearer token  (same BRIDGE_TOKEN as dashboard)
    ▼
Bridge :3100
    ├─ /claude-code/ask                 POST     — send a turn, block for reply
    ├─ /claude-code/sessions            GET/PATCH — list, rename, toggle mode, end, resurrect
    ├─ /claude-code/pending             GET (SSE) — stream of drafts awaiting operator action
    ├─ /claude-code/pending/:id         POST     — send-as-is / edit / replace / discard
    ├─ /claude-code/transcripts/:id     GET (SSE) — live Q&A stream for one session
    └─ /claude-code/connect-config      GET     — returns per-IDE config snippets
    │
    ├─► gateway chat.send  (SDK / WS, existing path) — for agent replies and drafts
    └─► openclaw-plugin/management/claude-code/      — new on-disk storage
    │
    ▼
Dashboard — new page "Claude Code"
    ├─ /claude-code               — sessions list, Connect-a-new-IDE modal
    └─ /claude-code/[id]          — session detail: live transcript + control rail
```

### Key architectural decisions

- **Bridge is the brain.** Session state, takeover logic, drafting, logging, auth. MCP is thin (~200 LOC). Dashboard is thin (SSE + forms).
- **File-based storage**, matching the rest of the project. No DB.
- **Auth:** MCP uses the existing `BRIDGE_TOKEN` (same as dashboard ↔ bridge). Bearer header on every call.
- **One shared OpenClaw session** (`openclaw_session_id = "oc-shared-claude-code"`) across all Claude Code sessions. Lets you reference prior threads naturally; separate dashboard sessions are the operator/audit view, not the OpenClaw-side memory split.

## Data model

### `openclaw-plugin/management/claude-code/sessions.json`

Single index file, atomic write (temp + rename).

```json
{
  "sessions": [
    {
      "id": "a3f1c0b9e2d4",
      "display_name": "antigravity@OpenClaw-manager",
      "ide": "antigravity",
      "workspace": "C:\\Users\\GalLe\\Cursor projects\\OpenClaw-manager",
      "mode": "agent",
      "state": "active",
      "openclaw_session_id": "oc-shared-claude-code",
      "created_at": "2026-04-19T10:42:01Z",
      "last_activity_at": "2026-04-19T10:44:20Z",
      "message_count": 7
    }
  ]
}
```

- `id`: `sha256(ide + ":" + workspace).slice(0,12)` — stable across IDE restarts.
- `display_name`: auto-derived `ide@basename(workspace)`, renameable from dashboard.
- `mode`: `"agent" | "manual"`. Default `"agent"`.
- `state`: `"active" | "ended"`. Ended sessions are hidden from the main list but kept on disk.

### `openclaw-plugin/management/claude-code/<id>.jsonl`

Append-only transcript, one JSON object per line. Event kinds:

```jsonl
{"t":"...","kind":"ask","msg_id":"m1","question":"...","context":{"selection":"...","file":"..."}}
{"t":"...","kind":"draft","msg_id":"m1","draft":"..."}
{"t":"...","kind":"answer","msg_id":"m1","answer":"...","source":"agent"}
{"t":"...","kind":"mode_change","from":"agent","to":"manual","by":"dashboard"}
{"t":"...","kind":"answer","msg_id":"m2","answer":"...","source":"operator","action":"edit"}
{"t":"...","kind":"discarded","msg_id":"m3"}
{"t":"...","kind":"ended","by":"operator"}
```

- `source: "agent"` — OpenClaw produced it unmodified.
- `source: "operator"` — operator intervened. `action` is one of `send-as-is | edit | replace`.
- Dashboard SSE tails this file.

### `openclaw-plugin/management/claude-code/pending.json`

Short-lived items waiting for operator action. Each item:

```json
{
  "id": "pend-xyz",
  "session_id": "a3f1c0b9e2d4",
  "msg_id": "m5",
  "question": "...",
  "draft": "...",
  "created_at": "2026-04-19T11:02:00Z"
}
```

Removed on resolution. Survives bridge restart (held HTTP connection doesn't, but pending row is re-surfaced to dashboard on reconnect; Claude Code must retry).

## Flows

### Agent mode (default, ~synchronous)

1. Claude Code calls `openclaw_say` → MCP → `POST /claude-code/ask { ide, workspace, msg_id, question, context }`.
2. Bridge resolves session by `(ide, workspace)`, creating it if new; appends `kind:"ask"` to transcript.
3. Bridge calls `gateway.chat.send({ session_id: session.openclaw_session_id, message: question })` via SDK (existing path).
4. Bridge appends `kind:"answer", source:"agent"`, responds `200 { answer }`.
5. MCP returns `answer` to Claude Code. Dashboard SSE has already streamed the exchange.

### Manual mode (moderation)

1. Same steps 1–2 as agent mode; bridge appends `kind:"ask"`.
2. Bridge still calls `gateway.chat.send` to get a draft; appends `kind:"draft"`.
3. Bridge writes a pending item to `pending.json` and **holds** the `/ask` HTTP response open.
4. Dashboard SSE on `/claude-code/pending` pushes the item to the operator's screen: shows question, draft, and four buttons — **Send as-is / Edit / Replace / Discard**.
5. Operator picks an action → `POST /claude-code/pending/:id` with `{ action, text? }`.
6. Bridge:
   - On `send-as-is | edit | replace`: appends `kind:"answer", source:"operator", action:<>`, removes the pending row, unblocks the held `/ask` with `{ answer }`.
   - On `discard`: appends `kind:"discarded"`, removes the pending row, unblocks the held `/ask` with HTTP `409` (error body `{ error: "operator discarded reply" }`), **and flips the session to `manual` if it wasn't already**. MCP throws a tool error that Claude Code sees.
7. Session mode persists. Operator must flip back to `agent` manually when done moderating.

### Mode flip mid-flight

- Operator flips agent → manual while an `/ask` is being processed: the in-flight call becomes a pending draft at step 3 (if bridge hasn't returned yet). If the bridge has already returned, only subsequent asks are held.
- Operator flips manual → agent while pending items exist: pending items stay pending (finish moderating them). Only new asks flow as agent replies.

### Timeouts & failure modes

- Held `/ask` timeout: **5 minutes** (env: `CLAUDE_CODE_PENDING_TIMEOUT_MS`, default `300000`). On timeout: append `kind:"timeout"`, remove pending row, return HTTP `504`.
- Gateway offline during agent call: bridge returns HTTP `503 { error: "openclaw gateway offline" }`. Session detail page shows a banner; operator can still take over and reply manually (bridge skips the draft step when gateway is down).
- Bridge restart while holding a call: the socket dies; Claude Code's MCP tool call fails with a connection error and can retry. Pending items on disk are rehydrated and re-streamed to the dashboard.
- Concurrent writes to `sessions.json`: in-process mutex per file (simple async lock), atomic rename on write.

### Session end

Triggered by any of:
1. Operator clicks **End session** on dashboard → `PATCH /claude-code/sessions/:id { state: "ended" }`.
2. Claude Code calls the `openclaw_conclude` MCP tool.
3. OpenClaw's reply contains the sentinel token `[[OPENCLAW_DONE]]` (bridge strips it before returning to Claude Code and ends the session).

Ended → `state: "ended"`, hidden from main list. A "Resurrect" button re-opens with the same id and full transcript. If Claude Code calls `openclaw_say` for a session that has been ended, the bridge auto-resurrects it (simpler than telling Claude Code about ended state).

## MCP server package

**Location:** `packages/mcp-openclaw/` (new workspace package, `"@openclaw-manager/mcp"`).

**Runtime:** stdio MCP server using `@modelcontextprotocol/sdk`. ~200 LOC, one file.

### Tools exposed

| Tool | Parameters | Returns |
|---|---|---|
| `openclaw_say` | `message: string`, `context?: object` | `{ answer: string }` or MCP error on discard/timeout |
| `openclaw_conclude` | `reason?: string` | `{ ok: true }` |
| `openclaw_session_info` | — | `{ session_id, display_name, mode, message_count }` |

Note: `openclaw_takeover` is deliberately **not** exposed — takeover is operator-only.

### Environment variables (passed by IDE on launch)

```
OPENCLAW_BRIDGE_URL=http://127.0.0.1:3100
OPENCLAW_BRIDGE_TOKEN=<bearer>
OPENCLAW_IDE=antigravity
OPENCLAW_WORKSPACE=${workspaceFolder}
```

### Per-IDE install

- **Antigravity / VSCode:** MCP config block pointing at the built `server.js`. Generated from the dashboard "Connect a new IDE" page, copy-paste.
- **Claude Code CLI:** `claude mcp add openclaw -e OPENCLAW_IDE=cli -e OPENCLAW_WORKSPACE=$PWD -e OPENCLAW_BRIDGE_URL=... -e OPENCLAW_BRIDGE_TOKEN=... -- node /path/to/dist/server.js`.

## Dashboard

New top-nav item **"Claude Code"**.

### `/claude-code` — sessions list

Table columns: `Name` (click to detail, pencil to rename inline) · `Mode` (toggle switch) · `State` · `Activity` (`N msgs · X ago`) · `Pending` (red dot + count) · `Actions` (End / Resurrect).

Top-right button **"Connect a new IDE"** opens a modal with three pre-filled copy-paste blocks (Antigravity, VSCode, Claude Code CLI) fetched from `GET /claude-code/connect-config`.

### `/claude-code/[id]` — session detail

- **Left pane (70%):** live transcript via SSE on `/claude-code/transcripts/:id`. Chat-thread layout with Claude Code vs OpenClaw vs operator turns visually distinguished. Context payloads rendered as collapsible code blocks. Auto-scroll on new turn; paused if user scrolls up.
- **Right pane (30%) control rail:**
  - Mode toggle.
  - Pending-draft card (visible only when a draft is awaiting action): shows the question, the draft, and the four action buttons. Edit/Replace open a textarea.
  - End session button.
  - Session metadata: id, ide, workspace, created, OpenClaw session id.

Degraded states handled by the existing `degraded-banner` component.

## Environment & config

New env vars on the bridge:

| Variable | Default | Purpose |
|---|---|---|
| `CLAUDE_CODE_SESSIONS_PATH` | `<MANAGEMENT_DIR>/../claude-code/sessions.json` | Sessions index |
| `CLAUDE_CODE_TRANSCRIPTS_DIR` | `<MANAGEMENT_DIR>/../claude-code` | Transcripts + `pending.json` |
| `CLAUDE_CODE_PENDING_TIMEOUT_MS` | `300000` | Max hold time for a manual-mode `/ask` |
| `CLAUDE_CODE_SHARED_OPENCLAW_SESSION_ID` | `oc-shared-claude-code` | OpenClaw-side session id all Claude Code sessions share |

## Testing strategy

**Bridge (Vitest, existing convention):**
- Service-level unit tests: `session-registry` (create/resolve-by-hint/rename/end/resurrect), `transcript` (append + tail), `pending-store` (write/resolve/timeout), `ask-orchestrator` (agent path happy + gateway-offline; manual path happy + discard + timeout + mode-flip-midflight).
- Route-level integration: exercise `/claude-code/*` endpoints against a mocked gateway.

**MCP package:**
- One protocol test: spawn the MCP server, send `tools/list`, assert the three tools appear; send a `tools/call openclaw_say` with a mocked bridge, assert the answer round-trips.

**Dashboard:**
- Manual play-through in local dev: open two IDEs (or two mocked MCP clients) against the bridge, verify sessions appear, flip mode, go through each of the four moderation actions, verify transcript matches.

**End-to-end smoke:**
- With the real gateway up, start the bridge in dev mode, run an MCP client once, confirm the answer round-trips and shows in the dashboard.

## Open questions / risks

- **OpenClaw replies may be very long.** Dashboard needs to render without choking (truncate + expand). Not architectural — noted for UI implementation.
- **The sentinel `[[OPENCLAW_DONE]]`** must be injected into OpenClaw's system prompt so it knows when to use it. Depends on how `chat.send` context/system prompt is composed. To verify during implementation — if the bridge can't inject a system prompt per-call, fall back to options 1 and 2 only for session end.
- **`openclaw_session_id = "oc-shared-claude-code"`** must be creatable via `sessions.create` on the gateway on first use. If it's already been created by a human, we reuse it. If not, bridge creates it lazily.
- **Workspace path on Windows** contains backslashes. Hash input must be normalized (lowercase, forward slashes) so the same workspace from different shells hashes to the same id.

## Deliverables checklist

- [ ] `packages/mcp-openclaw/` — new package with stdio MCP server.
- [ ] Bridge: new service modules (`claude-code-sessions`, `claude-code-transcript`, `claude-code-pending`, `claude-code-ask`).
- [ ] Bridge: new route file `apps/bridge/src/routes/claude-code.ts`, mounted in `server.ts`.
- [ ] Shared types: add to `packages/types/src/index.ts`.
- [ ] Dashboard: new pages `/claude-code` and `/claude-code/[id]`.
- [ ] Dashboard: new components (sessions table, session detail, pending-draft card, connect-IDE modal).
- [ ] `bridge-client.ts`: new methods for the `/claude-code/*` endpoints.
- [ ] Env vars documented in `AGENTS.md` and `.env.example`.
- [ ] Dev-mode smoke test script: `scripts/smoke-claude-code.mjs` that sends one `openclaw_say` end-to-end.

## v2 preview (not in this spec)

- **Pending-inbound queue** per session: dashboard / OpenClaw push a turn that gets prepended on Claude Code's next `openclaw_say`.
- **`openclaw_check_inbox` MCP tool** for Claude Code to poll proactively.
- **OpenClaw "Send to session" compose box** in the dashboard.
- Possibly: workspace hooks so Claude Code can notify OpenClaw of errors/test failures without being asked.
