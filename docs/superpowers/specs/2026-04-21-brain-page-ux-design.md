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
| Kill switch + silent mode + pending drafts + future-version flag | `<config-dir>/brain-ops.json` (new) | JSON |
| Do-not-say blocked log | `<config-dir>/brain-blocked.log` (new) | append-only JSONL |
| Last-message snippet + unread count | derived from existing conversation store | read-through API |

### Precedence (safety rails)

1. **Kill switch ON** — drafts allowed, send blocked globally.
2. **Per-person silent mode ON** — drafts allowed, send blocked for that phone.
3. **Do-not-say match** — draft suppressed, block event + log entry emitted.

Checks happen at the send step, not the generate step. In-flight drafts at the moment a switch flips complete their draft; the send boundary is where suppression is enforced.

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

### `brain-ops.json` (new)

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
        "messageId": "wa-inbound-abc",
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
- `source` is `"silent" | "kill"` — lets the UI tell why a draft exists.

### `brain-blocked.log` (new, append-only JSONL)

```json
{"ts":"2026-04-21T12:05:00Z","phone":"972501234567","messageId":"wa-inbound-abc","draft":"…lowest price…","phrase":"lowest price"}
```

One line per block. Never trimmed in v1; Gal can rotate manually. Dashboard reads the tail (last 100 lines) for `DoNotSayBlockedList`.

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

export interface BrainOpsConfig {
  version: 1;
  killSwitch: { enabled: boolean; reason: string | null; updatedAt: string | null };
  silentMode: { byPhone: Record<string, { enabled: boolean; reason?: string; updatedAt: string }> };
  pendingDrafts: Record<string, Array<{ messageId: string; draft: string; generatedAt: string; source: "silent" | "kill" }>>;
  futureVersion?: true;
}

export interface BrainInjectionPreview {
  system: string;
  breakdown: Array<{
    source: "global" | "person" | "curses" | "ops";
    label: string;
    text: string;
  }>;
}
```

Extend `BrainPersonSummary` with `unreadCount?: number`, `lastMessageSnippet?: string | null`, `lastMessageAt?: string | null`, `silentMode?: boolean` (derived from `brain-ops.json` at response-assembly time).

Extend `BridgeEvent` with `brain_agent_changed`, `brain_ops_changed`, `brain_do_not_say_blocked`, `brain_agent_draft`, `brain_kill_switch_suppressed`.

## HTTP contracts

| Method | Path | Purpose |
|---|---|---|
| GET | `/brain/agent` | Load `GlobalBrain` |
| PATCH | `/brain/agent` | Partial update, rewrites `Brain/WhatsApp.md` |
| GET | `/brain/agent/preview` | Global-only `BrainInjectionPreview` |
| GET | `/brain/agent/blocked` | Tail of blocked log (last 100) |
| GET | `/brain/people/:phone/preview` | Merged `BrainInjectionPreview` |
| POST | `/brain/people/:phone/log/:index/promote` | Body: `{ target: "facts" \| "preferences" \| "openThreads" }` |
| GET | `/brain/ops` | Full `BrainOpsConfig` |
| PUT | `/brain/ops/kill` | Body: `{ enabled: boolean, reason?: string }` |
| PUT | `/brain/ops/silent/:phone` | Body: `{ enabled: boolean, reason?: string }` |
| GET | `/brain/ops/pending` | All `pendingDrafts` (WS reconnect hydration) |
| POST | `/brain/ops/pending/:phone/:messageId/send` | Promote draft → actually send |
| POST | `/brain/ops/pending/:phone/:messageId/discard` | Drop draft |
| PATCH | `/brain/ops/pending/:phone/:messageId` | Body: `{ draft: string }` — edit before send |

All endpoints emit `brain_ops_changed` on mutation; `/brain/agent` mutations also emit `brain_agent_changed`.

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

Render order: `global:persona` → `global:hardRules` → `global:globalFacts` → `global:toneStyle` → `global:doNotSay` → `global:defaultGoals` → `person:summary` → `person:facts` → `person:preferences` → `person:openThreads` → `curses:rate` (if cursing on). No live re-render — manual refresh button to avoid chatty polling. The `"ops"` breakdown source is reserved for future operational overlays; in v1 no chunk is emitted with `source: "ops"` (kill switch and silent mode are send-time controls, not prompt content).

### J) Global injection preview

Same renderer as H, with only the `global:*` chunks.

### C) Per-person silent mode

Toggle persists to `brain-ops.json.silentMode.byPhone[phone]`. When on, outgoing sends for that phone are suppressed; drafts stored in `pendingDrafts[phone]` and emitted via `brain_agent_draft`. Approval UI: `PendingDraftsPanel` inline on conversation + dossier banner. v1 actions: **Send**, **Discard**, **Edit** (textarea in-place then Send). No batch approvals.

### I) Global kill switch

Banner app-wide when on. Primary control on `/brain/agent` header. Outgoing sends suppressed; drafts go into `pendingDrafts[phone]` with `source: "kill"`. Event `brain_kill_switch_suppressed` fires per suppressed send.

### L) Do-not-say post-filter

`checkDoNotSay(text, phrases)`:
- `phrases` filtered to non-empty trimmed strings.
- For each phrase: if the phrase matches `/^[A-Za-z0-9]+$/` → word-boundary regex, case-insensitive. Otherwise (multi-word, punctuation, non-Latin including Hebrew) → case-insensitive substring.
- First match wins; returns `{ ok: false, phrase }`. No match → `{ ok: true }`.
- Empty phrase list or empty/whitespace text → `{ ok: true }` with no work.

On block: suppress send, emit `brain_do_not_say_blocked`, append to `brain-blocked.log` (fsync not required; append + flush). In-memory ring buffer (100 entries) for fast dashboard reads.

## Error handling + edge cases

- **Vault missing** (`isBrainEnabled()` false): `/brain/agent` and `/brain/people/*` render a dedicated empty state naming the `BRAIN_VAULT_PATH` env var. `/brain/ops/*` and `/brain/agent/blocked` remain available.
- **Malformed `Brain/WhatsApp.md`**: parser returns best-effort `GlobalBrain` + `parseWarning`. UI banner mirrors existing person-note parseWarning. Save rewrites canonical form.
- **Malformed `brain-ops.json`**: unparseable/corrupt → back up to `brain-ops.json.broken-<ts>` + start from defaults. Valid JSON with unknown future `version` → fail-closed: load defaults, set `killSwitch.enabled = true`, set `futureVersion: true`, emit a dashboard banner "Ops file schema is from a newer version; kill switch forced on." Do **not** auto-downgrade semantics.
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

- Decide canonical paths for `brain-ops.json` and `brain-blocked.log` under the existing `<config-dir>` convention used by the agents config.
- Confirm the exact outgoing-send boundary in `apps/bridge` where kill / silent / do-not-say checks are inserted.
- Decide whether `pendingDrafts` editing uses an in-place textarea (cheap) or a modal (rejected as heavier). Spec assumes in-place textarea.
