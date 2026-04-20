# Brain Page UX + Global Brain — Design Spec

**Date:** 2026-04-21
**Branch:** `feat/brain-page-ux` (worktree `.worktrees/brain-page`, off `master@3472e04`)
**Author:** Claude Code + OpenClaw brainstorm
**Revised:** 2026-04-21 — pivot to manager-only v1 after discovering the AI auto-reply pipeline lives in the OpenClaw gateway repo, not in this manager

## Scope boundary (runtime enforcement is NOT in this repo)

While prepping the implementation plan, a grep across `apps/bridge/src` confirmed that nothing here invokes AI auto-replies, consumes `Agent.systemPrompt`, or enforces per-person overrides like "curses". Those behaviors live in the separate OpenClaw gateway. This repo is the **manager plane** — vault-backed content, dashboard UI, and bridge API — but it does not own the send loop.

Consequence for v1: do **not** ship fake runtime controls that look live but don't actually govern the bot. The following were in earlier drafts of this spec and are cut from v1:

- Global kill switch
- Per-person silent mode + pending drafts + approval UI
- Do-not-say post-filter (enforcement, blocked-log file, events)
- `brain/ops.json` and `brain/blocked.log` files, `BrainOpsConfig`, `PendingDraft`, `BlockedEntry` types
- Bridge routes under `/brain/ops/*` and `/brain/agent/blocked`
- Events `brain_ops_changed`, `brain_do_not_say_blocked`, `brain_agent_draft`, `brain_kill_switch_suppressed`
- Dashboard components `KillSwitchToggle`, `DoNotSayBlockedList`, `PendingDraftsPanel`, `GlobalKillBanner`

The **content** behind these features survives in the global brain file — Hard Rules, Do-Not-Say, etc. are all still editable lines in `Brain/WhatsApp.md`, and the gateway is expected to consume them. The enforcement toggles are deferred to a follow-up phase that requires coordinated changes in the OpenClaw gateway repo (out of scope here).

## Goal

Turn `/brain/people/:phone` into a consolidated operational dossier, add a first-class global-brain surface for the WhatsApp agent, and make the people list scannable. Ship:

- **Per-person (v1):** log → facts promote, per-person injection preview.
- **Global brain (v1):** vault-backed `Brain/WhatsApp.md` CRUD + global injection preview.
- **People table (v1):** search, status filter, sort by last-seen, unread badge, last-message snippet.

## Non-goals (v1)

- Runtime enforcement features listed in the scope boundary above (kill switch, silent mode, do-not-say post-filter, pending-draft approvals).
- Pinned Facts (referenced in UI mocks only).
- Follow-up nudges, reply budget, per-contact tone override, per-field injection toggles.
- Dry-run replay, brain changelog, template snippets, allowlist phrase button.
- Dashboard component test infra (add later if it lands for the rest of the app).

## Architecture

### Where things live

| Concern | Location | Storage |
|---|---|---|
| Per-person notes | `People/<phone>.md` (existing) | Obsidian vault markdown |
| Global brain content | `Brain/WhatsApp.md` (new) | Obsidian vault markdown |
| Last-message snippet + unread count | derived from existing conversation store | read-through API |

No new ops/config file in v1. Vault-only.

### Package layout

- `packages/brain` — new exports: `createGlobalBrainClient`, `parseGlobalBrain`, `writeGlobalBrain`, `onGlobalBrainChange`, `renderInjectionPreview`.
- `apps/bridge` — new routes under `/brain/agent` + `/brain/people/:phone/preview` + `/brain/people/:phone/log/:index/promote`. Extended `GET /brain/people` response with conversation-derived fields.
- `apps/dashboard` — new page `/brain/agent`, rebuilt `/brain/people/:phone` and `/brain/people`. Shared components: `CollapsibleCard`, `InjectionPreview`, `LogLineWithPromote`, `GlobalBrainEditor`.
- `packages/types` — new: `GlobalBrain`, `GlobalBrainUpdate`, `BrainInjectionPreview`. Extend `BrainPersonSummary`, `BridgeEvent`.

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

Parser is a line-by-line section splitter mirroring `packages/brain/src/people.ts`. Section order is canonical on write; read tolerates any order. Missing sections → empty arrays / empty strings, not errors; the note is rewritten into canonical form on the next save. The Do-Not-Say section is just edited content in v1 — no filter runs against it in this repo.

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

export interface BrainInjectionPreview {
  system: string;
  breakdown: Array<{
    source: "global" | "person" | "curses";
    label: string;
    text: string;
  }>;
}
```

Extend `BrainPersonSummary` with `unreadCount?: number`, `lastMessageSnippet?: string | null`, `lastMessageAt?: string | null`.

Extend `BridgeEvent` with `brain_agent_changed` (only — no ops or suppression events in v1).

## HTTP contracts

| Method | Path | Purpose |
|---|---|---|
| GET | `/brain/agent` | Load `GlobalBrain` |
| PATCH | `/brain/agent` | Partial update, rewrites `Brain/WhatsApp.md`; emits `brain_agent_changed` |
| GET | `/brain/agent/preview` | Global-only `BrainInjectionPreview` |
| GET | `/brain/people/:phone/preview` | Merged `BrainInjectionPreview` (global + person + optional curses) |
| POST | `/brain/people/:phone/log/:index/promote` | Body: `{ target: "facts" \| "preferences" \| "openThreads" }` |

`GET /brain/people` (existing) is extended in-place: each `BrainPersonSummary` entry now includes `unreadCount`, `lastMessageSnippet`, `lastMessageAt` pulled from the existing conversation store.

## UI

### `/brain/people/:phone` — consolidated dossier

Single scrolling column, `max-w-[900px]`. Each block is a collapsible `CollapsibleCard` (collapse state persisted in `localStorage[brain.collapsed.<phone>]`).

- **Header strip** (non-collapsible): name, phone, relationship, status dropdown, last seen, "Open thread →" link to `/conversations/<jid>`.
- **Global brain snapshot** (read-only, collapsed by default): one-line persona preview + "Edit global →" link to `/brain/agent`.
- **Person brain** (editable, expanded by default): Summary, Facts, Preferences, Open Threads, Notes, Curses block. Same line-editor pattern as today.
- **Injection preview** (read-only, collapsed by default): rendered system prompt, source pills per chunk (`global` / `person` / `curses`). Refresh button; not live.
- **Recent chat** (read-only, live, expanded by default): last 20 messages, bubbles, "Open full thread →" to `/conversations/<conversationKey>`.
- **Log** (append-only, expanded by default): each line has `[Promote ▾]` → Facts / Prefs / OpenThreads. Inline confirm, no modal.
- **Sticky bottom bar**: `[Unsaved changes • N] [Discard] [Save]`. Only appears when person-brain fields are dirty.

### `/brain/agent` — global brain dossier

Same component family, simpler:

- **Header strip**: title only (no kill switch in v1).
- **Global brain** (editable, expanded by default): Persona / Hard Rules / Global Facts / Tone / Do-Not-Say / Default Goals — line-editor pattern.
- **Global injection preview** (collapsed by default).
- **Sticky bottom bar**: Save / Discard.

### `/brain/people` — denser table

- **Toolbar**: search (name / phone / summary), status filter, sort by last-seen, add-person button.
- **Columns**: `● unread | Name | Meta (relationship·language) | Snippet (30ch) | Last seen`. Unread badge red when > 0. Row click → `/brain/people/:phone`.

### Nav

"Global brain" added as a top-level sidebar entry alongside existing "Brain → People".

### Reused components

`ConversationTabs` logic for the chat-preview card (trimmed to 20 msgs), `StatusBadge`, `useBridgeEvents`.

### New components

`CollapsibleCard`, `InjectionPreview`, `LogLineWithPromote`, `GlobalBrainEditor`.

## Feature behavior

### F) Log → Facts promote

Copy, not move. Log line stays as audit trail. If target already contains the exact line verbatim → `{ unchanged: true }` + UI toast. Stale index (note changed on disk between read and promote) → `409 { error: "log entry moved or changed; refresh and retry" }`.

### H) Per-person injection preview

Render order: `global:persona` → `global:hardRules` → `global:globalFacts` → `global:toneStyle` → `global:doNotSay` → `global:defaultGoals` → `person:summary` → `person:facts` → `person:preferences` → `person:openThreads` → `curses:rate` (if cursing on). No live re-render — manual refresh button to avoid chatty polling. The `BrainInjectionPreview.breakdown.source` union is `"global" | "person" | "curses"` in v1.

### J) Global injection preview

Same renderer as H, with only the `global:*` chunks.

### People-table polish

- Search runs client-side over `name`, `phone`, `summary`.
- Status filter: `all | active | archived | blocked` (default `active`).
- Sort: `last-seen desc` (default), `name asc`, `unread desc`.
- Snippet is first ~30 chars of the last inbound or outbound message for the phone's conversation, truncated on word boundary with `…`.
- Unread count comes from the existing conversation store (same source as `/conversations`).

## Error handling + edge cases

- **Vault missing** (`isBrainEnabled()` false): `/brain/agent` and `/brain/people/*` render a dedicated empty state naming the `BRAIN_VAULT_PATH` env var. Global-brain page also shows the empty state.
- **Malformed `Brain/WhatsApp.md`**: parser returns best-effort `GlobalBrain` + `parseWarning`. UI banner mirrors existing person-note parseWarning. Save rewrites canonical form.
- **Promote on stale index**: 409 with refresh-and-retry hint.
- **Concurrent dashboard edits on the global brain**: the existing "note changed on disk" banner pattern in `brain-person-detail.tsx` is ported to `GlobalBrainEditor`. Last writer wins with a dismissable banner.
- **Conversation store unavailable for a phone**: table row renders `unreadCount = 0`, `lastMessageSnippet = null`, `lastMessageAt = null` — not an error. 500s would drown the whole list.

## Testing

### Unit (`packages/brain`)

1. `parseGlobalBrain` — round-trip write→parse; sections in any order; missing sections → empty arrays; malformed frontmatter → `parseWarning` set, best-effort parse.
2. `writeGlobalBrain` — idempotent (`parse → write → parse === first parse`).
3. `renderInjectionPreview` — ordering matches spec; `curses:rate` appears iff cursing is on; breakdown source union is exactly `global | person | curses`.

### Integration (`apps/bridge/test`)

- `brain-global.test.ts` — `GET /brain/agent`, `PATCH /brain/agent` round-trip; WS `brain_agent_changed` fires on PATCH and on external file write (watcher).
- `brain-agent-preview.test.ts` — `GET /brain/agent/preview` returns global-only chunks in the right order.
- `brain-person-preview.test.ts` — `GET /brain/people/:phone/preview` returns merged global + person; `curses:rate` chunk iff cursing on.
- `brain-log-promote.test.ts` — promote to each of facts/prefs/openThreads; stale index → 409; duplicate promote → `{ unchanged: true }`.
- `brain-people-list.test.ts` — `GET /brain/people` includes `unreadCount`, `lastMessageSnippet`, `lastMessageAt`; handles the conversation-store-missing case gracefully.
- Keep existing `brain-cursing-rate.test.ts` passing.

### Manual QA

- Create `Brain/WhatsApp.md` in Obsidian → dashboard `/brain/agent` loads content + preview.
- Edit a Hard Rules line → Save → verify file on disk matches canonical form.
- Promote a log line on a person → verify appears in Facts section on disk + in dashboard editor.
- Open `/brain/people` → verify search filters, status filter, sort order, unread badges, snippets.
- Collapse/expand dossier sections → reload page → collapse state persists via `localStorage`.

## Rollout

- Single PR against master. Schema additive: absent vault file = empty global brain; no new config files to worry about.
- No feature flag.
- Deploy: Windows bridge NSSM restart + CentOS dashboard redeploy per project memory.

## Follow-ups (not v1)

- Runtime enforcement layer (kill switch, silent mode, do-not-say post-filter, pending-draft approval). Requires matching OpenClaw gateway changes — tracked separately as phase 2.
- Pinned facts, follow-up nudges, reply budget, per-contact tone override, per-field injection toggles, dry-run replay.
