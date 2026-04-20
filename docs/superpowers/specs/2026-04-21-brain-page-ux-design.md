# Brain Page UX + Global Brain — Design Spec

**Date:** 2026-04-21
**Branch:** `feat/brain-page-ux` (worktree `.worktrees/brain-page`, off `master@3472e04`)
**Author:** Claude Code + OpenClaw brainstorm

## Goal

Turn `/brain/people/:phone` into a consolidated operational dossier, add a first-class global-brain surface for the WhatsApp agent, and make the people list scannable. Ship three per-person features (promote log → facts, per-person injection preview, silent mode with approval) and three global features (kill switch, global injection preview, do-not-say post-filter).

## Non-goals (v1)

- Pinned Facts (referenced in UI mocks only).
- Follow-up nudges, reply budget, per-contact tone override, per-field injection toggles.
- Dry-run replay, brain changelog, template snippets, allowlist phrase button.
- Batch approvals ("approve all pending drafts").
- Dashboard component test infra (add later if it lands for the rest of the app).

## Architecture

### Where things live

| Concern | Location | Storage |
|---|---|---|
| Per-person notes | `People/<phone>.md` (existing) | Obsidian vault markdown |
| Global brain content | `Brain/WhatsApp.md` (new) | Obsidian vault markdown |
| Kill switch + silent mode + pending drafts + future-version flag | `${MANAGEMENT_DIR}/brain/ops.json` (new) | JSON |
| Do-not-say blocked log | `${MANAGEMENT_DIR}/brain/blocked.log` (new) | append-only JSONL |
| Last-message snippet + unread count | derived from existing conversation store | read-through API |

Config wiring: extend `apps/bridge/src/config.ts` with `config.brainDir = path.join(managementDir, "brain")`, `config.brainOpsPath = path.join(brainDir, "ops.json")`, `config.brainBlockedLogPath = path.join(brainDir, "blocked.log")` — mirrors the existing `youtubeDir` / `claudeCodeDir` convention. Directory is created on first write.

### Precedence (safety rails)

Evaluated at the send boundary, in order. First match wins, and the event emitted reflects the winning rule:

1. **Kill switch ON** — draft parked in `pendingDrafts[phone]` with `source: "kill"`. Event: `brain_kill_switch_suppressed`. Silent-mode state is not checked.
2. **Per-person silent mode ON** — draft parked in `pendingDrafts[phone]` with `source: "silent"`. Event: `brain_agent_draft`.
3. **Do-not-say match** — draft is **not** added to `pendingDrafts`. Event: `brain_do_not_say_blocked` + append to `brain/blocked.log`.

In-flight drafts at the moment a switch flips complete their draft; the send boundary is where suppression is enforced. A draft is never emitted as both `brain_kill_switch_suppressed` and `brain_agent_draft`.

### Package layout

- `packages/brain` — new exports: `createGlobalBrainClient`, `parseGlobalBrain`, `writeGlobalBrain`, `onGlobalBrainChange`, `checkDoNotSay`.
- `apps/bridge` — new routes under `/brain/agent`, `/brain/ops`, `/brain/people/:phone/log/:index/promote`. Outgoing-message hook wraps `send` path in kill / silent / do-not-say checks.
- `apps/dashboard` — new pages `/brain/agent`, rebuilt `/brain/people/:phone` and `/brain/people`. Shared components: `CollapsibleCard`, `InjectionPreview`, `LogLineWithPromote`, `GlobalBrainEditor`, `KillSwitchToggle`, `DoNotSayBlockedList`, `GlobalKillBanner`.
- `packages/types` — new: `GlobalBrain`, `GlobalBrainUpdate`, `BrainOpsConfig`, `BrainInjectionPreview`. Extend `BrainPersonSummary`, `BridgeEvent`.

## Data shapes

### `Brain/WhatsApp.md` (new, vault)

```markdown
---
kind: brain
agent: whatsapp
updated: 2026-04-21T13:00:00Z
---

# Persona
One paragraph. Who is the bot, voice, first-person stance.

# Hard Rules
- Never promise delivery dates.
- Always decline to discuss pricing before qualification.

# Global Facts
- Company name: Acme.
- Office hours: Sun–Thu 09:00–18:00 Asia/Jerusalem.

# Tone / Style
One paragraph. Hebrew-first, terse, no emojis, never corporate voice.

# Do Not Say
- lowest price
- money back guarantee
- guaranteed

# Default Goals
- qualify leads
- book intro calls
```

Parser is a line-by-line section splitter mirroring `packages/brain/src/people.ts`. Section order is canonical on write; read tolerates any order. Missing sections → empty arrays / empty strings, not errors; the note is rewritten into canonical form on the next save.

### `ops.json` (new, under `${MANAGEMENT_DIR}/brain/`)

```json
{
  "version": 1,
  "killSwitch": {
    "enabled": false,
    "reason": null,
    "updatedAt": null
  },
  "silentMode": {
    "byPhone": {
      "972501234567": {
        "enabled": true,
        "reason": "VIP — always approve",
        "updatedAt": "2026-04-21T12:00:00Z"
      }
    }
  },
  "pendingDrafts": {
    "972501234567": [
      {
        "draftId": "drf_01HX3Z7A9K0QWERTY",
        "inboundMessageId": "wa-inbound-abc",
        "conversationKey": "972501234567@s.whatsapp.net",
        "draft": "שלום! אחזור אליך…",
        "generatedAt": "2026-04-21T12:05:00Z",
        "source": "silent"
      }
    ]
  }
}
```

- `version = 1` at v1. Missing file → all defaults, empty `pendingDrafts`.
- Atomic write: temp-file + rename.
- `pendingDrafts[phone]` capped at 50 entries (FIFO drop).
- `draftId` is a stable server-minted identifier (e.g. `drf_` + monotonic-ish id / ULID). Approval routes key on `draftId`, not on `inboundMessageId`, because inbound IDs can be absent, duplicated across providers, or non-unique for bursts. `inboundMessageId` is kept for audit + UI context.
- `conversationKey` captures the send target at generate time (the same key used by `/conversations/:conversationKey` + the outbound messaging path). Approving a draft sends via that key; no phone re-normalization at send time.
- `source` is `"silent" | "kill"` — lets the UI tell why a draft exists. Do-not-say blocks are **not** added to `pendingDrafts` in v1; they appear only in `brain/blocked.log` + `brain_do_not_say_blocked` event + dashboard banner.
- **Inbound while a draft is already pending** for the same phone: a new draft is **generated and appended** as its own entry. No replacement, no suppression of generation; FIFO cap trims the oldest if the 50-per-phone ceiling is reached.

### `blocked.log` (new, under `${MANAGEMENT_DIR}/brain/`, append-only JSONL)

```json
{"ts":"2026-04-21T12:05:00Z","phone":"972501234567","conversationKey":"972501234567@s.whatsapp.net","inboundMessageId":"wa-inbound-abc","draft":"…lowest price…","phrase":"lowest price"}
```

One `BlockedEntry` per line. Never trimmed in v1; Gal can rotate manually. Dashboard reads the tail (last 100 lines) for `DoNotSayBlockedList`.

### Type additions (`@openclaw-manager/types`)

```ts
export interface GlobalBrain {
  persona: string;
  hardRules: string[];
  globalFacts: string[];
  toneStyle: string;
  doNotSay: string[];
  defaultGoals: string[];
  parseWarning?: string;
}
export type GlobalBrainUpdate = Partial<Omit<GlobalBrain, "parseWarning">>;

export interface PendingDraft {
  draftId: string;
  inboundMessageId: string | null;
  conversationKey: string;
  draft: string;
  generatedAt: string;
  source: "silent" | "kill";
}

export interface BrainOpsConfig {
  version: 1;
  killSwitch: { enabled: boolean; reason: string | null; updatedAt: string | null };
  silentMode: { byPhone: Record<string, { enabled: boolean; reason?: string; updatedAt: string }> };
  pendingDrafts: Record<string, PendingDraft[]>;
  futureVersion?: true;
}

export interface BlockedEntry {
  ts: string;
  phone: string;
  conversationKey: string;
  inboundMessageId: string | null;
  draft: string;
  phrase: string;
}

export interface BrainInjectionPreview {
  system: string;
  breakdown: Array<{
    source: "global" | "person" | "curses";
    label: string;
    text: string;
  }>;
}
```

Extend `BrainPersonSummary` with `unreadCount?: number`, `lastMessageSnippet?: string | null`, `lastMessageAt?: string | null`, `silentMode?: boolean` (derived from `brain/ops.json` at response-assembly time).

Extend `BridgeEvent` with `brain_agent_changed`, `brain_ops_changed`, `brain_do_not_say_blocked`, `brain_agent_draft`, `brain_kill_switch_suppressed`.

## HTTP contracts

| Method | Path | Purpose |
|---|---|---|
| GET | `/brain/agent` | Load `GlobalBrain` |
| PATCH | `/brain/agent` | Partial update, rewrites `Brain/WhatsApp.md` |
| GET | `/brain/agent/preview` | Global-only `BrainInjectionPreview` |
| GET | `/brain/agent/blocked` | `{ items: BlockedEntry[] }` (newest first, last 100) |
| GET | `/brain/people/:phone/preview` | Merged `BrainInjectionPreview` |
| POST | `/brain/people/:phone/log/:index/promote` | Body: `{ target: "facts" \| "preferences" \| "openThreads" }` |
| GET | `/brain/ops` | Full `BrainOpsConfig` |
| PUT | `/brain/ops/kill` | Body: `{ enabled: boolean, reason?: string }` |
| PUT | `/brain/ops/silent/:phone` | Body: `{ enabled: boolean, reason?: string }` |
| GET | `/brain/ops/pending` | `{ items: PendingDraft[] }` flat list across phones (WS reconnect hydration) |
| POST | `/brain/ops/pending/:draftId/send` | Promote draft → send via its stored `conversationKey`; remove from `pendingDrafts` |
| POST | `/brain/ops/pending/:draftId/discard` | Drop draft |
| PATCH | `/brain/ops/pending/:draftId` | Body: `{ draft: string }` — edit draft text in place (no send) |

**Event semantics.** Every mutation of `ops.json` — `PUT /brain/ops/kill`, `PUT /brain/ops/silent/:phone`, draft send / discard / edit — emits a single `brain_ops_changed` event. `/brain/agent` mutations also emit `brain_agent_changed`. The generate-time events `brain_agent_draft` (on a draft being added) and `brain_kill_switch_suppressed` / `brain_do_not_say_blocked` (on suppression) are independent of `brain_ops_changed` and fire even when the ops file is not being mutated by the dashboard. No finer-grained per-action events in v1.

**Send source-of-truth.** Approving a pending draft calls the existing outbound messaging path with `(conversationKey, draft)` stored on the `PendingDraft`. No re-lookup of the person note; no channel guessing. If the outbound path fails the draft stays in `pendingDrafts` and the error is returned to the caller (UI shows banner). If it succeeds the draft is removed atomically.

## UI

### `/brain/people/:phone` — consolidated dossier

Single scrolling column, `max-w-[900px]`. Each block is a collapsible `CollapsibleCard` (collapse state persisted in `localStorage[brain.collapsed.<phone>]`).

- **Header strip** (non-collapsible): name, phone, relationship, status dropdown, last seen, silent-mode toggle, "Open thread →" link to `/conversations/<jid>`.
- **Global brain snapshot** (read-only, collapsed by default): one-line persona + "Edit global →" link to `/brain/agent`.
- **Person brain** (editable, expanded by default): Summary, Facts, Preferences, Open Threads, Notes, Curses block. Same line-editor pattern as today.
- **Injection preview** (read-only, collapsed by default): rendered system prompt, source pills per chunk. Refresh button; not live.
- **Recent chat** (read-only, live, expanded by default): last 20 messages, bubbles, "Open full thread →". If silent mode or kill are on → banner with pending-drafts count + inline list with Send / Edit / Discard.
- **Log** (append-only, expanded by default): each line has `[Promote ▾]` → Facts / Prefs / OpenThreads. Inline confirm, no modal.
- **Sticky bottom bar**: `[Unsaved changes • N] [Discard] [Save]`. Only appears when person-brain fields are dirty.

### `/brain/agent` — global brain dossier

Same component family, simpler:

- **Header strip**: title + kill switch toggle.
- **Global brain** (editable): Persona / Hard Rules / Global Facts / Tone / Do-Not-Say / Default Goals — line-editor pattern.
- **Global injection preview** (collapsed by default).
- **Blocked messages** (last 20): phone · phrase · full draft · timestamp. No allowlist button in v1.
- **Sticky bottom bar**: Save / Discard.

### `/brain/people` — denser table

- **Toolbar**: search (name / phone / summary), status filter, sort by last-seen, add-person button.
- **Columns**: `● unread` | Name | Meta (relationship·language) | Snippet (30ch) | Last seen. Silent-mode icon next to name when on. Unread badge red when > 0. Row click → `/brain/people/:phone`.

### Nav

"Global brain" added as a top-level sidebar entry alongside existing "Brain → People". Kill switch banner renders app-wide when `killSwitch.enabled === true`.

### Reused components

`ConversationTabs` logic for the chat-preview card (trimmed to 20 msgs), `StatusBadge`, `useBridgeEvents`.

### New components

`CollapsibleCard`, `InjectionPreview`, `LogLineWithPromote`, `GlobalBrainEditor`, `KillSwitchToggle`, `DoNotSayBlockedList`, `GlobalKillBanner`, `PendingDraftsPanel`.

## Feature behavior

### F) Log → Facts promote

Copy, not move. Log line stays as audit trail. If target already contains the exact line verbatim → `{ unchanged: true }` + UI toast. Stale index (note changed on disk between read and promote) → `409 { error: "log entry moved or changed; refresh and retry" }`.

### H) Per-person injection preview

Render order: `global:persona` → `global:hardRules` → `global:globalFacts` → `global:toneStyle` → `global:doNotSay` → `global:defaultGoals` → `person:summary` → `person:facts` → `person:preferences` → `person:openThreads` → `curses:rate` (if cursing on). No live re-render — manual refresh button to avoid chatty polling. Kill switch and silent mode are send-time controls, not prompt content, and do not appear in the breakdown; the `BrainInjectionPreview.breakdown.source` union is therefore `"global" | "person" | "curses"` in v1 (no `"ops"`).

### J) Global injection preview

Same renderer as H, with only the `global:*` chunks.

### C) Per-person silent mode

Toggle persists to `ops.json.silentMode.byPhone[phone]`. When on, outgoing sends for that phone are suppressed; drafts stored in `pendingDrafts[phone]` and emitted via `brain_agent_draft`. Approval UI: `PendingDraftsPanel` inline on conversation + dossier banner. v1 actions: **Send**, **Discard**, **Edit** (textarea in-place; Edit is a local mutation via `PATCH /brain/ops/pending/:draftId`, does not send). Approval routes are keyed on `draftId`. No batch approvals.

### I) Global kill switch

Banner app-wide when on. Primary control on `/brain/agent` header. Outgoing sends suppressed; drafts go into `pendingDrafts[phone]` with `source: "kill"`. Event `brain_kill_switch_suppressed` fires per suppressed send. Kill takes precedence over silent: when kill is ON the event is `brain_kill_switch_suppressed` regardless of per-phone silent state.

### L) Do-not-say post-filter

`checkDoNotSay(text, phrases)`:
- `phrases` filtered to non-empty trimmed strings.
- For each phrase: if the phrase matches `/^[A-Za-z0-9]+$/` → word-boundary regex, case-insensitive. Otherwise (multi-word, punctuation, non-Latin including Hebrew) → case-insensitive substring.
- First match wins; returns `{ ok: false, phrase }`. No match → `{ ok: true }`.
- Empty phrase list or empty/whitespace text → `{ ok: true }` with no work.

On block: suppress send, emit `brain_do_not_say_blocked`, append `BlockedEntry` to `brain/blocked.log` (fsync not required; append + flush). In-memory ring buffer (100 entries) for fast dashboard reads. Blocked drafts are **not** added to `pendingDrafts` — v1 treats a do-not-say block as a hard rejection; Gal inspects the blocked log and, if needed, rewords and re-triggers manually.

## Error handling + edge cases

- **Vault missing** (`isBrainEnabled()` false): `/brain/agent` and `/brain/people/*` render a dedicated empty state naming the `BRAIN_VAULT_PATH` env var. `/brain/ops/*` and `/brain/agent/blocked` remain available.
- **Malformed `Brain/WhatsApp.md`**: parser returns best-effort `GlobalBrain` + `parseWarning`. UI banner mirrors existing person-note parseWarning. Save rewrites canonical form.
- **Malformed `brain/ops.json`**: unparseable/corrupt → back up to `brain/ops.json.broken-<ts>` + start from defaults. Valid JSON with unknown future `version` → fail-closed: load defaults, set `killSwitch.enabled = true`, set `futureVersion: true`, emit a dashboard banner "Ops file schema is from a newer version; kill switch forced on." Do **not** auto-downgrade semantics.
- **Ops write fails**: 500 with error string; UI banner; in-memory state preserved.
- **Promote on stale index**: 409 with refresh-and-retry hint.
- **Concurrent dashboard edits**: existing "note changed on disk" banner pattern in `brain-person-detail.tsx`, extended to the new sections.
- **WS reconnect**: clients re-hydrate pending drafts via `GET /brain/ops/pending`.
- **Do-not-say empty list / empty text**: short-circuit, no filter overhead.

## Testing

### Unit (`packages/brain`)

1. `parseGlobalBrain` — round-trip write→parse; sections in any order; missing sections → empty arrays; malformed frontmatter → `parseWarning` set, best-effort parse.
2. `writeGlobalBrain` — idempotent (`parse→write→parse === first parse`).
3. `checkDoNotSay` — substring; case-insensitive; word-boundary for `/^[A-Za-z0-9]+$/` phrases; substring for multi-word + Hebrew; empty list → pass; empty text → pass.
4. `loadBrainOps` — missing file → defaults; corrupt JSON → backup + defaults; future version → defaults + `killSwitch.enabled = true` + `futureVersion: true`.

### Integration (`apps/bridge/test`)

- `brain-global.test.ts` — GET/PATCH round-trip; WS `brain_agent_changed` fires on PATCH and on external file write (watcher).
- `brain-injection-preview.test.ts` — preview ordering matches spec; `curses:rate` appears iff cursing is on; no `ops` chunk is emitted in v1.
- `brain-do-not-say.test.ts` — block suppresses send + emits event + appends to blocked log; unblock passes through; concurrent blocks append atomically; **restart persistence**: block once, recreate service, blocked log still readable from disk.
- `brain-ops.test.ts` — kill on → all sends suppressed + draft emitted with `source: "kill"`; silent on for phone X → only X suppressed; both on → kill precedence in event type.
- `brain-log-promote.test.ts` — promote to each of facts/prefs/openThreads; stale index → 409; duplicate promote → `unchanged: true`.
- Keep existing `brain-cursing-rate.test.ts` passing.

### Manual QA

- Kill ON → inbound → draft emitted, banner visible, no WhatsApp send.
- Silent ON for phone X → inbound from X → draft with Send/Edit/Discard; Send actually sends.
- Edit `Brain/WhatsApp.md` in Obsidian → dashboard refreshes.
- Add "lowest price" to Do Not Say → force draft → suppression + banner + blocked-log entry.
- Promote log line → Facts → verify note on disk + dashboard editor.

## Rollout

- Single PR against master. Schema additive: absent vault file = empty global brain; absent ops file = all-defaults.
- No feature flag — kill switch itself is the operational safety net.
- Deploy: Windows bridge NSSM restart + CentOS dashboard redeploy per project memory.

## Open items for the implementation plan

- Confirm the exact outgoing-send boundary in `apps/bridge` where kill / silent / do-not-say checks are inserted (likely whatever function currently posts an outbound WhatsApp message — plan step 1 locates it).
- `draftId` minter: ULID vs nanoid vs `crypto.randomUUID()` + `drf_` prefix — spec assumes ULID for monotonic-ish order; fine to swap at implementation time.
