# Dashboard Redesign — "Operator Console"

**Date:** 2026-04-19
**Status:** Approved for planning
**Prototype:** `apps/dashboard/src/new_ui/` (Claude Design output, user-approved)

## Problem

The current dashboard looks like a generic admin template (Fillow lineage): no product identity, 17 sidebar items across 6 groups for a single-user tool, an Overview of four stat-cards with no focal point, and a visual language that reads as "SaaS kit" rather than "operator tool." Direction: ship a console that feels purpose-built — typography-driven, data-forward, with a focal *"what needs my attention right now"* panel.

The prototype in `new_ui/` realizes this direction. This spec defines how to port it into the production Next.js + Tailwind + TypeScript dashboard, wired to the bridge.

## Scope

**In scope (v1):**
- Full visual refresh of the app shell (sidebar, header, layout tokens, typography)
- Rewrite of the 4 hero screens: Overview, Conversations, Sessions, Agents
- Style-only pass on the remaining 11 screens so they adopt the new tokens/primitives without structural redesign
- Tweaks panel (theme / density / sidebar-style / overview-layout) persisted to `localStorage`
- `⌘K` command palette scaffolding (search across screens + core quick actions: takeover, release, compose, restart bridge)
- Sidebar badge counts wired to real data (pending review count, needs-takeover count)

**Out of scope (v1):**
- Streaming live-activity feed — v1 uses polled last-N from the bridge log
- Mobile / small-screen layout — desktop console only
- Light theme polish beyond the token flip already present in the prototype
- Any backend/bridge API changes beyond what the hero screens demand
- Custom logo/brand mark beyond the monogram glyph from the prototype

## Design language

**Typography.** Inter for UI; JetBrains Mono for IDs, timestamps, phone numbers, log lines, all monospace-appropriate values. Loaded via `<link>` in `app/layout.tsx`; Roboto removed.

**Color.** Warm-neutral dark palette in `oklch()`. Single saturated accent (purple, `oklch(0.70 0.15 300)`) used for identity + selected state. Semantic colors (ok / warn / err / info) each have a full + dim variant for badge pills and status lamps. Light theme is a token flip only.

**Tokens.** Live in `:root` in `app/globals.css`. Tailwind config is rewritten so its named colors reference those CSS variables (e.g. `colors.panel = "var(--panel)"`, `colors.text.muted = "var(--text-muted)"`). This means both `style={{ background: "var(--panel)" }}` and `className="bg-panel"` produce identical output — new CSS can use either.

**Spacing/density.** `html.compact` flips row padding and gap tokens. Default density = 7/10 (data-forward but readable). Compact = ~9/10.

**Motion.** Three named keyframes only: `pulse` (2s health lamp), `pulse2` (2s accent lamp on the attention panel), `blink` (1.4s thinking dots). No page transitions, no hover scales.

## App shell

Grid: `var(--sb-w) 1fr`, where `--sb-w = 240px` (icons mode: `60px`). Sidebar is sticky, full-height, scrollable. Header is sticky, 52px, with `backdrop-filter: blur(14px)` and an alpha-reduced background color.

### Sidebar

Four groups, fifteen items, one `⌘K` entry at the top of the scroll area (the prototype's switcher is a prototype-only chrome and is not ported).

| Group | Items |
|---|---|
| Monitor | Overview, Conversations *(badge: needs-takeover)*, Review Inbox *(badge: pending reviews)* |
| Runtime | Agents, Sessions, YouTube Relay, Cron |
| Configure | Channels, Tools, Routing Rules, Brain · People |
| Advanced | Capabilities, Commands, Raw Config, Settings |

Badge counts come from existing bridge endpoints. Reviews list page (`/reviews`) folds into the Review Inbox flow — no route deletion, just removed from the sidebar. Relay recipients form becomes a tab inside YouTube Relay.

Footer: user/instance chip (`KV · local · :3100` equivalent).

### Header

Breadcrumbs (left) → spacer → `⌘K` search field (320px) → gateway/bridge/relay health strip (three pulse-dot pills, clickable to the matching detail) → user menu (logout).

## Hero screens

### Overview

Two-column grid, 2fr/1fr on the upper section:

- **Left (focal):** `AttentionCard`. Eyebrow *"Needs your attention"* with a pulsing accent dot. Large mono number = pending review count. Descriptive paragraph. List of up to five pending-review rows, each with agent badge, snippet, flag reason, "Open →" button routing to the review detail.
- **Right:** `SystemStatus` mini (gateway, bridge, relay, llm — each a status lamp + label + latency/throughput line + badge) and `ActivityFeed` mini (last-50 log lines, mono, color-coded by level).

Below, a 4-column `stat` row: *Active Conversations, Replies / 24h, Avg Response, Tokens / min.* Each stat has label, big mono value, sparkline, delta subtext.

Tweak: `overviewLayout` switches upper section to a 1fr/1fr split (wider System panel, shorter attention panel).

### Conversations

Three-pane grid: `320px 1fr 320px`, full-viewport height minus header, min-height 600px.

- **Left:** filter chips (All / Needs-you / Active / Cold) + search + virtualized list. Each item: avatar circle, name, phone/status, timestamp, unread badge.
- **Middle:** thread. Header with avatar, name, phone, status badge, "Take Over / Release" toggle. Body is a sunken-background chat log with `.msg.them` / `.msg.us` / `.msg-sys` / `.thinking` variants. Compose bar at bottom.
- **Right:** contact KV (phone, channel, first-seen, tags), routing diagram (channel → rule → agent chain), recent actions, brain notes.

No route changes — this replaces the current table at `/conversations` and inlines the detail view.

### Sessions

Four-stat hero row (Running, Idle, Stalled, Total-today). Below: a single dense table with columns (status lamp, agent, session ID mono, uptime bar, started, last tick, actions). Uptime bar is a 30-segment strip colored by per-minute health.

### Agents

3-column card grid. Primary (active) agent gets a gradient background. Each card: 38px avatar-square with monogram, agent name, mono ID, description, per-agent stats (conversations, replies, tokens), capability chips, toggle switch top-right.

## Other eleven screens — visual pass only

For YouTube, Cron, Channels, Tools, Routing Rules, Brain · People, Capabilities, Commands, Raw Config, Settings, and the existing Reviews detail pages:

- Wrap containers in `.card`
- Replace buttons with `.btn` / `.btn-pri`
- Replace status pills with `.badge.{ok,warn,err,info,acc,mute}`
- Tables use `.tbl` (with sunken `<thead>`)
- Forms adopt the sunken-input style
- No layout redesign, no field additions, no copy rewrites

## Component inventory

**Rewrite (shell + hero):**
- `app-shell.tsx`, `sidebar.tsx`, `header.tsx`
- `overview-cards.tsx` → split into `attention-card.tsx`, `system-status.tsx`, `activity-feed.tsx`, `stat-row.tsx`
- `conversation-table.tsx` → replaced by a new `conversations-workspace.tsx` (3-pane)
- `session-table.tsx` → replaced by `sessions-workspace.tsx` (hero row + table)
- `agent-table.tsx` → replaced by `agents-grid.tsx`

**New:**
- `command-palette.tsx`
- `tweaks-panel.tsx`
- `health-strip.tsx` (header pulse pills)
- `status-lamp.tsx`, `uptime-bar.tsx`, `sparkline.tsx`, `badge.tsx`, `stat.tsx` (primitive set)

**Style-pass only (no logic changes):**
- `cron-table.tsx`, `channel-cards.tsx`, `tools-panel.tsx`, `config-editor.tsx`, `settings-form.tsx`, `routing-rules-table.tsx`, `brain-people-table.tsx`, `brain-person-detail.tsx`, `capabilities-view.tsx`, `capability-card.tsx`, `command-runner.tsx`, `relay-recipients-form.tsx`, `inbox-table.tsx`, `reviews-table.tsx`, `review-report-viewer.tsx`, `reviews-empty-state.tsx`, `ideas-backlog.tsx`, `compose-dialog.tsx`, `log-viewer.tsx`, `message-timeline.tsx`, `recommended-action-panel.tsx`, `severity-badge.tsx`, `triage-actions.tsx`, `triage-badge.tsx`, `session-chat.tsx`, `takeover-controls.tsx`, `conversation-tabs.tsx`, `agent-form.tsx`, `gateway-status.tsx`, `auto-refresh.tsx`, `degraded-banner.tsx`, `live-indicator.tsx`, `status-badge.tsx`

## Data wiring

The prototype reads `window.DATA` fakes. In production, each hero screen fetches via existing `apps/dashboard/src/lib/bridge-client.ts` server helpers. Mapping:

| Prototype field | Production source |
|---|---|
| `DATA.overview.stats` | `getOverview()` (extend with delta + sparkline series — new bridge endpoint `overview.series`) |
| `DATA.overview.pendingReviews` | existing reviews inbox endpoint, capped to 5 |
| `DATA.overview.activity` | new endpoint that tails the last 50 lines of `bridge.out.log` + structured gateway events |
| `DATA.gateway / bridge / relay / llm` | `getOverview()` + new `health.ping` on bridge |
| Conversations list/thread/context | existing conversation endpoints, no change |
| Sessions table | existing sessions endpoint + new `uptime.buckets` (30-minute bucketed health) |
| Agents grid stats | existing agents endpoint + per-agent aggregates from sessions |

New bridge endpoints needed: `overview.series`, `health.ping`, `activity.tail`, `uptime.buckets`. Each is a thin read over state the bridge already has.

## Tweaks panel

Floating FAB bottom-right → panel. Persists to `localStorage` key `ocm-tweaks`. Keys:

- `theme`: `"dark" | "light"` — toggles `html.light`
- `density`: `"comfortable" | "compact"` — toggles `html.compact`
- `sidebar`: `"labels" | "icons"` — toggles `.app.icons`
- `overviewLayout`: `"balanced" | "system-wide"` — passed as prop to `OverviewScreen`

No server persistence in v1; per-browser only.

## Rollout

Single branch, single deploy — no feature flag. The current dashboard is operator-only (single user) and the visual refresh doesn't change data contracts, so gated rollout adds cost without reducing risk.

Order:
1. Tokens + globals.css + tailwind config rewrite + font swap (non-visual until consumed)
2. New primitives (`badge`, `stat`, `status-lamp`, `uptime-bar`, `sparkline`)
3. Shell rewrite (sidebar, header, app-shell)
4. Hero screens, one at a time: Overview → Conversations → Sessions → Agents
5. New bridge endpoints in parallel with the screen that needs each
6. Style pass on the 11 other screens
7. Tweaks panel + `⌘K` palette
8. Deploy (Windows bridge rebuild + CentOS dashboard rebuild per `reference_infrastructure.md`)

## Risks

- **Token collision.** Existing components reference `bg-dark-card`, `text-text-primary`, etc. If a style-pass screen isn't updated in lockstep with the token removal, it renders blank. Mitigation: keep old token aliases as deprecated pass-throughs for one commit, then delete.
- **Tailwind-CSS variable interop quirks.** Not all Tailwind utilities compose cleanly with arbitrary CSS variables (e.g. hover color blending). Mitigation: define explicit named colors in the config, not only arbitrary-value escapes.
- **Activity feed volume.** Tailing the bridge log on every poll is cheap for 50 lines but expensive for 5,000. Mitigation: bridge endpoint returns only lines since a timestamp cursor.
- **⌘K scope creep.** Command palette can absorb unbounded features. Mitigation: v1 = six commands + nav search, no fuzzy action recording, no extensibility API.

## Success criteria

- Overview page on first paint answers *"what do I need to do right now?"* in under 2 seconds of eye-tracking — the review count + top three pending rows are visible above the fold.
- Visual QA comparing screenshots against `new_ui/` prototype shows ≤ 5% pixel drift on the four hero screens at 1440×900.
- No regressions in existing flows (takeover, release, compose, review-release, session-restart) — verified by click-through on each.
- Gal's own verdict: "this feels like my tool, not a template."
