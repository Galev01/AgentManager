# Log Center Design

**Date:** 2026-04-22
**Status:** Draft — post-brainstorm, pre-plan
**Owner:** Gal (observing) / Claude Code (driving) / OpenClaw (consulted)

## Goal

Unified semantic-action telemetry for the dashboard. Every intentional user action emits a structured event. Events feed a new `Log Center` page that supports debugging, audit review, and (later) analytics views.

Primary purpose: **debugging + audit first, analytics later**. One event stream, filter views per use. (Decision D from brainstorm.)

## Non-Goals (Phase 1)

- Global DOM-click interception.
- WebSocket / SSE streaming. Polling only.
- SQLite / indexed queries. JSONL only.
- Cleanup cron. Config surface ships now; enforcement deferred.
- Full-text search over event context. Search scope is fixed (see Reader).
- Backfill of historical clicks.
- Instrumentation of all 16 pages in one burst. Phase 1 covers 4 representative pages.

## Event Schema (v1)

Defined in `packages/types/src/telemetry.ts`:

```ts
// Client → server submission shape (no canonical ts)
export interface TelemetryEventInput {
  schemaVersion: 1;
  eventId: string;                   // uuidv4, client-generated
  clientTs?: string;                 // optional ISO-8601 UTC from browser; audit reference only
  source: "dashboard";               // extensible: "dashboard" | "bridge" | ...
  surface?: "web";                   // optional, extensible later
  sessionId?: string;                // browser-tab session (sessionStorage uuid)
  actor: { type: "user" | "system"; id: string };  // user id from dashboard auth; "anon" if absent
  feature: string;                   // stable namespace, may contain dots: "conversations", "reviews.inbox"
  action: string;                    // snake_case verb phrase: "opened", "item_opened", "run_requested"
  target?: { type: string; id?: string };
  route: string;                     // window.location.pathname at event time
  outcome?: "invoked" | "succeeded" | "failed";
  errorCode?: string;                // sanitized stable code on outcome="failed"
  traceId?: string;                  // correlate invoked→succeeded/failed; reuse eventId for single-phase
  context?: Record<string, string | number | boolean>;  // transport shape; server validates per (feature, action)
}

// Stored/queried shape after bridge ingest
export interface TelemetryEvent extends TelemetryEventInput {
  ts: string;                        // canonical ISO-8601 UTC, stamped by bridge on ingest
}
```

### Clock source

`ts` is **bridge-stamped** on ingest. This is the canonical timestamp for sort, cursor, and audit semantics. Client may include `clientTs` as an optional audit-only reference; it is never used for ordering.

### Naming rule

- `feature`: stable namespace, dots allowed. Examples: `conversations`, `reviews.inbox`, `brain.people`.
- `action`: snake_case semantic verb. Examples: `opened`, `item_opened`, `run_requested`, `rule_saved`.
- Display identity is `${feature}.${action}`. No further grammar enforced.

### Context validation

- `context` is transport-loose (`Record<string, string|number|boolean>`).
- Server validates against a registry keyed by `(feature, action)`.
- Unknown keys are dropped. Invalid typed values dropped. The event itself is **accepted**; a validator warning is written to the bridge log.
- Telemetry fails soft: ingestion never rejects for context issues. Events missing required top-level fields (`feature`, `action`, `ts`, `eventId`) are rejected with HTTP 400.

### Size limits

- Max event payload (JSON-serialized): **8 KB**. Oversized events are rejected with HTTP 413.
- Max `context` key count: **16**. Excess keys dropped by validator; event accepted.
- Max string length for `feature`, `action`, `target.id`, `traceId`, `errorCode`, `actor.id`, `sessionId`: **128 chars** each. Oversized → event rejected (HTTP 400) because these are identity/index fields.
- Max `route`: **512 chars**. Oversized → truncated.
- Max `context` value string length: **512 chars**. Oversized → field dropped; event accepted.
- Rule: reject grossly oversized or identity-corrupt events; drop oversized optional context fields otherwise.

### Idempotency

Phase 1 accepts duplicates as-is. No dedupe on write. UI may group by `eventId` / `traceId` if needed. Retries from browser or Next route that succeed after a network flake produce duplicate lines; the operator is expected to understand this.

### Redaction policy

Explicit forbidden content in any field (including `errorCode`, `target.id`, `context` values):

- API tokens, session cookies, bearer tokens, bridge tokens, OpenClaw tokens.
- Passwords, password hashes, 2FA codes.
- Raw message bodies (WhatsApp, YouTube chat, conversation content).
- Raw config values, raw environment-variable values, raw secret material.
- Full paths to user-home directories or secret-bearing files.
- Phone numbers in cleartext (use hashed / truncated / `wa:<last-4>` form).
- Email addresses in cleartext (use `<hashed>` identifiers).
- Error messages copied verbatim from downstream systems may contain any of the above — use stable `errorCode` values from a defined set, not free-text.

Implementation: the registry schema for each `(feature, action)` enumerates allowed `context` keys and their types. A key not in the allowlist is dropped server-side, ensuring accidental secret leaks via `context` are neutralized even if client code regresses.

## Scope of Instrumented Actions

**Log:** explicit commands, meaningful navigation, state-changing selections.
- `<button>` clicks that trigger a named operation.
- Form submissions.
- Menu / dropdown / toolbar actions.
- Bulk actions, destructive confirmations.
- Sidebar / nav link clicks (route changes).
- Tab changes, pagination, filter apply/reset.
- Row/card clicks only when they open a named target (e.g., `conversations.opened`, `reviews.inbox.item_opened`).

**Do not log:** passive focus/hover/blur, typing, drag/resize, raw keyboard events (unless they trigger a named command also reachable from a button), generic non-semantic container clicks.

Rule of thumb: if a user would describe it as "I did X", emit an event.

## Architecture

Bridge-centric JSONL append. Dashboard proxies ingestion server-side to keep the bridge bearer token off the browser.

### Flow

```
browser: logAction({...})
  ↓ fetch POST /api/telemetry/actions
Next.js route handler (reads OPENCLAW_BRIDGE_TOKEN server-side)
  ↓ POST /telemetry/actions (Bearer)
bridge route handler
  ↓ telemetry-log.append(event)
${MANAGEMENT_DIR}/telemetry/actions-YYYY-MM-DD.jsonl
```

Read path mirrors: `Log Center → GET /api/telemetry/actions?...` → bridge `GET /telemetry/actions?...` → `telemetry-log.query()`.

### Rationale for proxy (not browser-direct)

- `apps/dashboard/src/lib/bridge-client.ts` uses `OPENCLAW_BRIDGE_TOKEN` server-side only. Bridge bearer token never reaches the browser.
- Browser-direct would require either leaking the token or a new unauthenticated endpoint. Not justified by the hot-path cost of one extra hop.

### Trust boundaries and auth path

1. **Browser → Next route** (`/api/telemetry/actions`): authenticated via the existing dashboard session cookie (`ocm_session`, HMAC-signed). Unauthenticated browser requests are rejected with HTTP 401.
2. **Next route → Bridge** (`/telemetry/actions`): authenticated with `OPENCLAW_BRIDGE_TOKEN` bearer (server-side env only). Next route also injects `actor.id` from the verified session; it does **not** trust `actor` from the client body.
3. **Bridge**: rejects any request without a valid bearer (existing bridge auth middleware). There is no unauthenticated telemetry path on bridge.
4. **Client `actor` field**: overwritten by Next route. Clients may send `actor.id` but the server replaces it with the verified session user. Anonymous session → `actor = { type: "user", id: "anon" }`.

## Components

### packages/types

- `packages/types/src/telemetry.ts` — `TelemetryEventInput` / `TelemetryEvent` interfaces, `ContextSchema` type.
- `packages/types/src/telemetry-registry.ts` — allowlisted `(feature, action) → context schema` registry. **Single source of truth.** Bridge imports for enforcement (drop unknown keys, validate types). Dashboard imports for TypeScript typing of `logAction` / `trackOperation` callsites. Enforcement lives on the bridge; the dashboard copy is advisory and kept aligned via the shared package.

### Bridge

- `apps/bridge/src/services/telemetry-log.ts` — new service:
  - `append(event: TelemetryEvent): Promise<void>` — serialized single-writer via an in-service promise chain. Best-effort append; not claimed as cross-process atomic.
  - `query(opts: { feature?, action?, outcome?, actor?, traceId?, targetId?, since?, cursor?, limit? }): Promise<{ events, nextCursor }>` — newest-file-first scan with stop-when-full. Max scan horizon = 14 days (configurable).
  - Reader tolerates truncated trailing line.
  - Per-file line-count metadata cached in memory between requests.
- `apps/bridge/src/routes/telemetry.ts` — new route file. Do **not** extend existing `logs.ts` (different concern — gateway/session logs).
  - `POST /telemetry/actions` — ingest single event. Validates schema. Runs registry validator. Appends.
  - `GET /telemetry/actions` — list/filter/paginate.
- Config keys (in `apps/bridge/src/config.ts`):
  - `TELEMETRY_DIR` → defaults to `${MANAGEMENT_DIR}/telemetry`.
  - `TELEMETRY_RETENTION_DAYS` → default `30` (surfaced; enforcement deferred).
  - `TELEMETRY_MAX_DISK_MB` → default `200` (surfaced; enforcement deferred).

### Dashboard

- `apps/dashboard/src/app/api/telemetry/actions/route.ts` — Next.js route handler. POST + GET proxies to bridge with bearer token.
- `apps/dashboard/src/lib/telemetry.ts`:
  - `logActionRaw(event)` — pure fn, fire-and-forget `fetch`, catches errors silently.
  - `useTelemetry()` hook — wraps `logActionRaw`, auto-fills `route`, `sessionId` (from `sessionStorage`), `actor` (from session context).
  - `trackOperation(feature, action, fn)` helper — emits `invoked` before `fn()`, `succeeded` or `failed` (with `errorCode`) after, reusing `traceId`.

#### `trackOperation` failure semantics

- The wrapped business `fn()` must **never** depend on telemetry success.
- Telemetry calls are fire-and-forget, non-blocking, and never re-thrown.
- If the `invoked` emit succeeds but `succeeded`/`failed` emit fails (network drop, browser unload), the operator sees a half-trace in the Log Center — acceptable failure mode.
- If `fn()` throws synchronously before telemetry emits `invoked`, the event is still sent (handler emits `invoked` before awaiting `fn()`), then `failed` with `errorCode = "threw"`.
- If the browser tab closes mid-operation, the `succeeded`/`failed` record is simply absent. Log Center UI shows the dangling `invoked` row normally.

#### `sessionId` lifecycle

- Generated on first read of `sessionStorage.ocm_tab_session_id`; if absent, set to a fresh uuidv4.
- Lives in `sessionStorage` — scoped to the tab. Closing the tab clears it; refresh keeps it; new tab gets a new id (intentional — multi-tab disambiguation).
- Logout clears `sessionStorage` as a side effect of the existing logout flow; next login generates a new `sessionId`.
- `apps/dashboard/src/app/logs/page.tsx` — Log Center UI.
  - Filters: feature multi-select, action filter, outcome filter, actor filter, date range, trace-id filter, fixed-scope search (matches `feature | action | target.id | traceId | actor.id`).
  - Table: `ts | feature.action | actor | target | outcome | expand`.
  - Expand row → context, route, sessionId, errorCode.
  - Pagination: cursor = `(ts, eventId)`, page size 200.
  - Live toggle: polls `GET /api/telemetry/actions?since=<cursor>` every 3s, prepends new events.
  - Click `traceId` in a row → filters view to that trace.

### GET `/telemetry/actions` API contract

**Query params** (all optional, AND-combined):

- `feature` — exact match (repeatable for OR within feature).
- `action` — exact match.
- `outcome` — one of `invoked | succeeded | failed`.
- `actor` — exact match on `actor.id`.
- `traceId` — exact match.
- `targetId` — exact match on `target.id`.
- `q` — fixed-scope search over `feature | action | target.id | traceId | actor.id` (substring, case-insensitive).
- `since` — opaque cursor token (base64-encoded `{ts, eventId}`) returned by a prior response; returns events strictly newer than cursor.
- `until` — same encoding; returns events strictly older than cursor.
- `limit` — 1..500, default 200, max 500. Values outside range are clamped.

**Response shape:**

```json
{
  "events": [ TelemetryEvent, ... ],
  "nextCursor": "base64(...)" | null,
  "prevCursor": "base64(...)" | null
}
```

**Sort order:** newest-first (reverse chronological by canonical `ts`, tiebreak by `eventId`).

**Live-since semantics:** the Log Center live toggle uses `since=<last-seen-cursor>` to fetch events newer than the most recent row in the current view. Polling frequency 3s. The cursor encodes `(ts, eventId)` so repeat polls with the same cursor are idempotent.

**Reader consistency model:** best-effort reverse-chronological listing. Events may arrive during a read; they appear in subsequent polls. No snapshot isolation. The UI is expected to prepend new rows via `since` polling rather than expecting a frozen view.

### Sidebar

Add "Logs" item to dashboard sidebar navigation, route `/logs`.

## Storage

- Location: `${MANAGEMENT_DIR}/telemetry/actions-YYYY-MM-DD.jsonl` (one file per UTC day).
- Format: one `TelemetryEvent` JSON per line, newline-terminated.
- Write discipline: single-writer in-process (promise chain). Best-effort append via `fs.appendFile`. Reader tolerates truncated trailing line.
- Rotation: implicit by date — next day opens a new file.
- Retention config surface ships in phase 1. Cleanup cron = follow-up task.

### Behavior when limits exceeded (phase 1)

- `telemetry.retentionDays` and `telemetry.maxDiskMB` are surfaced as config but **not enforced** in phase 1.
- If `maxDiskMB` is exceeded, the bridge logs a warning (`[telemetry] disk usage X MB exceeds cap Y MB`) on every append past the cap, but continues to write. No truncation, no reject.
- An optional bridge-side metric `telemetry_disk_mb_gauge` can be surfaced via existing health/overview routes in a follow-up.
- Phase 3 adds the enforcement cron.

## Instrumentation Rollout (phased)

**Phase 1** (this spec):
- Framework (types, bridge service + routes, dashboard proxy, telemetry client, Log Center page).
- Instrument 4 representative pages. Initial action matrix (non-exhaustive — these are the named actions to cover in the phase-1 PR; further actions on these pages can batch in phase 2):

  | Page          | feature            | initial actions                                                                    |
  |---------------|--------------------|------------------------------------------------------------------------------------|
  | Conversations | `conversations`    | `opened`, `list_filtered`, `reply_sent`, `conversation_archived`                    |
  | Review Inbox  | `reviews.inbox`    | `item_opened`, `item_triaged`, `bulk_triaged`, `filter_applied`                     |
  | Agents        | `agents`           | `opened`, `run_requested`, `run_cancelled`, `prompt_edited`                         |
  | Routing Rules | `routing`          | `rule_created`, `rule_saved`, `rule_deleted`, `rules_reordered`                     |

**Phase 2** (follow-up tasks, batched per PR):
- Claude Code, Sessions, YouTube Relay, Cron, Channels, Tools, Brain: People, Brain: Global, Capabilities, Commands, Raw Config, Settings.

**Phase 3** (only if justified by volume):
- Cleanup cron enforcement.
- Analytics aggregations (hot/cold heatmap).
- Optional SQLite index-rebuild from JSONL.

## Testing Strategy

Per superpowers:test-driven-development:

- `telemetry-log.ts`: unit tests for append serialization, newest-first reader, truncated-line tolerance, cursor pagination.
- Registry validator: unit tests for unknown-key drop, invalid-type drop, event-still-accepted.
- Bridge routes: integration tests against a tmp `MANAGEMENT_DIR`.
- Dashboard proxy: integration test with a mocked bridge.
- `trackOperation` helper: unit test for invoked→succeeded / invoked→failed paths with shared traceId.

## Open Questions (none blocking)

- Retention enforcement schedule — defer to phase 3 when volume justifies.
- Whether to expose a per-event-type summary dashboard — defer.

## Implementation Plan Shape (for writing-plans)

Per subagent-driven-development, subagents dispatched in order:

1. Types + event schema + context registry (`packages/types`).
2. Bridge `telemetry-log.ts` service + `/telemetry/actions` routes + config.
3. Dashboard `/api/telemetry/actions` proxy + `lib/telemetry.ts` + `trackOperation` helper.
4. Log Center page (`/logs`) + sidebar entry.
5. Instrumentation of 4 phase-1 pages (Conversations, Review Inbox, Agents, Routing Rules) — single subagent, grouped.

Two-stage review after each task: spec-compliance pass, then code-quality pass.
