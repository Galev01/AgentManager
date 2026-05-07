# Dashboard perf + realtime fix

**Date:** 2026-05-06
**Owner:** Gal (controller: Claude Code via consult-openclaw → subagent-driven-development)
**Reported symptom:** "Open the Claude Code chat can take a couple of minutes to load. Opening the chat on the bottom right takes 30-60 seconds. Almost every UI element is extremely slow."

## Verified root causes

1. **SSR-blocking LLM summary on every Claude Code session page load.**
   `apps/dashboard/src/app/claude-code/[id]/page.tsx:194` awaits `summarizeClaudeCodeSession(id)` before rendering. Bridge endpoint `/claude-code/sessions/<id>/summarize` runs an LLM call. Measured 13.56 s and 14.06 s; page TTFB measured 14.87 s and 15.73 s. The same summary is also computed on the client by `claude-code-session-detail.tsx:128-161` (debounced 800 ms `useEffect`). Duplicated work; the client path can stand alone.

2. **`/api/ws` route does not exist; raw `WebSocket` to non-existent endpoint.**
   `apps/dashboard/src/components/claude-code-session-detail.tsx:82` opens `new WebSocket("ws://<host>/api/ws")`. There is no `apps/dashboard/src/app/api/ws/` route — only `/api/events` SSE. nginx has WS Upgrade headers wired but the path resolves to a 404 on Next.js. Probe via nginx with `Upgrade: websocket` timed out at 5 s. Realtime delivery on the chat page has therefore never worked.

3. **`/api/events` SSE proxy uses the wrong bridge auth scheme.**
   `apps/dashboard/src/app/api/events/route.ts:8` connects to `${bridge}/ws?token=${BRIDGE_TOKEN}`. Bridge WS handler at `apps/bridge/src/ws.ts:16-20` rejects unless `?ticket=<one-shot>` is passed (issued by `/auth/ws-ticket`). Bridge calls `ws.close(4001, "Unauthorized")`. SSE returns 200, sends one `{"type":"connected"}` frame, closes after ~10 ms. Six client components (`auto-refresh`, brain views, settings) loop reconnect every 3 s, never receive any events. Affects: live conversation refresh, brain editor live indicators, settings live state.

## Out of scope

- Copilot launcher 30-60 s symptom: not yet reproducibly isolated. `/api/copilot/sessions` measures 11-14 ms cold. Probable secondary effect of (1) when the panel is opened on a page that is mid-SSR. Re-test after (1) lands; if still slow, file a separate ticket.
- The hash-versioned OpenClaw SDK path concern. Unrelated.
- Any bridge-side change. Bridge already broadcasts the right `WsMessage` types and gates WS auth correctly.

## Interface contract (must hold across all tasks)

- **Realtime transport for the dashboard:** SSE only, via `/api/events`. No raw browser-side WebSockets to bridge or to phantom Next.js routes.
- **SSE proxy auth flow (one-shot per SSE connection):**
  1. Resolve current user session via `resolveCurrentSession()` (existing helper). Reject with 401 if absent.
  2. Mint a ws-ticket: `POST {BRIDGE_URL}/auth/ws-ticket` with service bearer + signed actor assertion (`actorHeaders()`), receive `{ ticket, expiresAt }`.
  3. Open bridge WS at `${BRIDGE_URL}/ws?ticket=<ticket>`.
  4. Forward each bridge `WsMessage` to the SSE stream as `data: ${JSON.stringify(msg)}\n\n`. Close SSE on bridge WS close/error.
- **SSE message envelope on the wire:** unchanged from today — JSON-encoded `WsMessage` (`{ type, payload }`). No new schema.
- **Client API:** `useBridgeEvents(onMessage)` from `apps/dashboard/src/lib/ws-client.ts` is the only realtime entry point. Components stop instantiating raw `WebSocket`.
- **Permission gate:** `/api/events` keeps `requirePermissionApi("conversations.view")`. Claude Code chat page consumes the same SSE; if needed, broaden permission later — out of scope for this fix.
- **Compatibility with existing listeners:** `WsMessage` union in `packages/types/src/index.ts:98-110` already includes the four `claude_code_*` event types. No type changes.

## Tasks

### Task A — Drop SSR-blocking summarize from Claude Code session page

**File:** `apps/dashboard/src/app/claude-code/[id]/page.tsx`

**Change:**
- Remove line 194: `const llmSummary = await summarizeClaudeCodeSession(id).catch(() => null);`
- Pass `llmSummary={null}` (or omit, if the prop becomes optional) when rendering `ClaudeCodeSessionDetail`.
- Remove the now-unused `summarizeClaudeCodeSession` import.

**Why this is safe:**
- `claude-code-session-detail.tsx:122-161` already runs the summary on the client after hydration with an 800 ms debounce, keyed on `events.length` and `session.id`. The same useEffect already handles initial load and refresh-on-new-events. Server-side seeding only saves the first 800 ms but costs the user 13-14 s. Bad trade.
- `lastSummaryEventCountRef.current = llmSummary ? initialEvents.length : 0` (line 79) means: when `llmSummary === null`, the client immediately fires a summary fetch, exactly mirroring today's behavior.
- The summary feature still works; the only user-visible diff is "Summary" card shows `OpenClaw is generating a summary...` for ~14 s after first paint instead of being filled in at first paint after a 14 s blank screen. That is the desired outcome.

**Acceptance:**
- `curl -w '%{time_total}'` against `/claude-code/<id>` (authed) drops from ≈15 s to <500 ms TTFB.
- Loading the page in a browser shows the transcript instantly; "Summary" card transitions from generating placeholder → text.
- Existing typecheck/build passes (`pnpm --filter dashboard build` if cheap; otherwise just `tsc`).

**Risk:** trivial. One file, one removal.

---

### Task B — Switch Claude Code session detail to SSE via `useBridgeEvents`

**File:** `apps/dashboard/src/components/claude-code-session-detail.tsx`

**Change:**
- Remove the `useEffect` block at lines 81-113 that constructs `new WebSocket(.../api/ws)`.
- Replace with a call to `useBridgeEvents` (from `@/lib/ws-client`), passing a callback that performs the same `setEvents` / `setPending` / `router.refresh()` updates currently inside `ws.onmessage`.
- Convert client-component if not already (`"use client"` is present at line 1, OK).
- Drop the `try { ws = new WebSocket(...); } catch { return; }` defensive scaffolding — the hook handles its own errors.

**Behavior must be unchanged for these message types** (filter inside callback):
- `claude_code_transcript_appended` with matching `payload.sessionId` → `setEvents(prev => [...prev, payload.event])`
- `claude_code_pending_upserted` with matching `payload.sessionId` → upsert into `pending`
- `claude_code_pending_resolved` → drop by `payload.id`
- `claude_code_session_upserted` → `router.refresh()`

**Acceptance:**
- Typecheck/build clean.
- `useBridgeEvents` is the only realtime entrypoint in the file. Grep `WebSocket` in this file returns zero hits.
- Manual smoke (after Task C): paste a question via Claude Code, the live transcript bubble appears without page refresh.

**Risk:** low. Same payloads, different transport. The hook is already used by 6 other components.

---

### Task C — Fix `/api/events` SSE proxy auth (ticket flow)

**File:** `apps/dashboard/src/app/api/events/route.ts`

**Change:**
- Before opening the bridge WS, mint a ws-ticket. Reuse the existing helper `bridgeIssueWsTicket(sub, sid)` from `apps/dashboard/src/lib/auth/bridge-auth-client.ts:73`, OR inline the equivalent (POST `/auth/ws-ticket` with service bearer + actor headers from `actorHeaders()`).
- The current `requirePermissionApi("conversations.view")` already runs first; on success, `resolveCurrentSession()` is cached and returns the resolved session — fetch it again to obtain `sub` and `sid`.
- Build WS URL as `${BRIDGE_URL.replace(/^http/, "ws")}/ws?ticket=${encodeURIComponent(ticket)}`. Drop the `?token=BRIDGE_TOKEN` form entirely.
- On ticket fetch failure (network / 401), return 502 SSE-style or close with an explanatory event before terminating, so client `onerror` triggers normally.

**Acceptance:**
- `curl -N -H 'Cookie: ocm_sid=…' http://192.168.0.240/api/events` stays open for >5 s, periodically receives `data: {…}` frames when activity occurs (file change, conversation update). Today it closes after ~10 ms.
- Bridge log shows successful WS connection (no `4001 Unauthorized` close on dashboard-originated SSE proxy connections).
- Existing components using `useBridgeEvents` start delivering events again.

**Risk:** medium. Must not regress permissions; must handle ticket TTL across reconnects (each new SSE request issues its own ticket — fine, ticket is one-shot).

## Validation pass (after all three tasks)

Run from 240, with a logged-in cookie:
```bash
SID=...
# A: claude-code page TTFB
curl -sS -o /dev/null -w "%{time_total}\n" -H "Cookie: ocm_sid=$SID" \
  "http://192.168.0.240/claude-code/<known-id>"
# Expect: <0.5 s
# B + C: SSE stays open, delivers events
timeout 10 curl -sN -H "Cookie: ocm_sid=$SID" http://192.168.0.240/api/events
# Expect: connection stays open >5 s; receives `connected` plus subsequent updates
```

## Deploy + rollback

- Deploy via `git push server main` → systemd restart of `openclaw-dashboard`. No bridge restart, no DB migrations.
- Rollback: `git revert` the commit, redeploy. Each task is in a separate commit so partial rollback is possible if Task C regresses auth.

## Status flags (per OpenClaw signoff requirements)

- After Task A merges: `safe-to-keep-building` + `safe-to-merge` + `safe-to-deploy` (independently valuable).
- After Tasks B+C merge: `safe-to-keep-building` + `safe-to-merge` + `safe-to-deploy` only after live SSE smoke passes from a real browser.

## Future-reuse (not in this scope)

- Server-side cache + throttle for `/claude-code/sessions/<id>/summarize` so the client useEffect can poll a memoized result instead of triggering a fresh LLM call on every page open.
- Possible move from raw SSE to a single dashboard-side WS multiplexer if more bidirectional realtime needs emerge.
