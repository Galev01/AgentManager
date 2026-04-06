# OpenClaw WhatsApp Manager — Design Spec

## Overview

A three-part admin system for managing OpenClaw's WhatsApp auto-reply plugin:

1. **Dashboard** — Next.js 15 dark-mode-first admin UI on CentOS VM (Fillow design system)
2. **Bridge** — Express/TypeScript REST API on Windows alongside OpenClaw
3. **Plugin Extensions** — Management surface added to the existing `whatsapp-auto-reply` plugin

## Architecture

```
Browser ──(cookie auth)──> CentOS Dashboard (Next.js SSR)
                                  │
                           (bearer token, server-side only)
                                  │
                                  v
                    Windows Bridge API (Express)
                                  │
                           (file read/write)
                                  │
                                  v
                    Management Files on disk
                         ▲               ▲
                         │               │
                    Plugin reads    Plugin writes
                    commands.jsonl  events.jsonl
                    runtime-settings.json
                    state.json (existing)
```

Browser never talks to the bridge directly.

## Monorepo Structure

```
openclaw-whatsapp-manager/
  pnpm-workspace.yaml
  package.json
  .env.example
  tsconfig.base.json
  packages/
    types/
      package.json
      tsconfig.json
      src/index.ts          # Shared types: ConversationEvent, RuntimeSettings, ConversationRow, Commands
  apps/
    dashboard/
      package.json
      next.config.ts
      tsconfig.json
      tailwind.config.ts
      src/
        app/
          layout.tsx
          login/page.tsx
          page.tsx                          # Overview
          conversations/page.tsx
          conversations/[conversationKey]/page.tsx
          settings/page.tsx
          api/auth/login/route.ts
          api/auth/logout/route.ts
        lib/
          session.ts
          bridge-client.ts
          format.ts
        components/
          app-shell.tsx
          sidebar.tsx
          header.tsx
          overview-cards.tsx
          conversation-table.tsx
          message-timeline.tsx
          takeover-controls.tsx
          settings-form.tsx
          status-badge.tsx
          degraded-banner.tsx
        styles/
          globals.css                      # Fillow design tokens as CSS variables
        types.ts
    bridge/
      package.json
      tsconfig.json
      src/
        server.ts
        config.ts
        auth.ts
        routes/
          health.ts
          overview.ts
          conversations.ts
          messages.ts
          settings.ts
          commands.ts
        services/
          openclaw-state.ts
          runtime-settings.ts
          event-log.ts
          command-queue.ts
        types.ts
  openclaw-plugin/
    management/
      runtime-settings.json
      commands.jsonl
      events.jsonl
```

## Shared Types (packages/types)

```ts
// Runtime settings managed via dashboard
type RuntimeSettings = {
  relayTarget: string
  delayMs: number
  summaryDelayMs: number
  updatedAt: number
  updatedBy: string
}

// Conversation row for list/overview
type ConversationRow = {
  conversationKey: string
  phone: string
  displayName: string | null
  status: "cold" | "waking" | "active" | "human"
  lastRemoteAt: number | null
  lastRemoteContent: string | null
  lastAgentReplyAt: number | null
  lastHumanReplyAt: number | null
  awaitingRelay: boolean
}

// Event log entry
type ConversationEvent = {
  id: string
  type:
    | "message_in"
    | "message_out"
    | "summary_sent"
    | "takeover_enabled"
    | "takeover_released"
    | "wake_requested"
    | "settings_updated"
    | "command_failed"
  conversationKey: string | null
  phone: string | null
  displayName: string | null
  text: string | null
  actor: "user" | "bot" | "human_admin" | "system"
  at: number
  meta?: Record<string, unknown>
}

// Management commands
type ManagementCommand = {
  id: string
  type: "set_takeover" | "release_takeover" | "wake_now" | "update_runtime_settings"
  conversationKey?: string
  payload?: Record<string, unknown>
  at: number
  issuedBy: string
}

// Overview response
type OverviewData = {
  totalConversations: number
  activeCount: number
  humanCount: number
  coldCount: number
  wakingCount: number
  lastActivityAt: number | null
  relayTarget: string
}
```

## Bridge API Surface

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Returns `{ ok: true, uptime }` |
| GET | `/overview` | Aggregated conversation counts + relay target |
| GET | `/conversations` | All conversation rows with status |
| GET | `/conversations/:conversationKey` | Single conversation detail |
| GET | `/messages?conversationKey=...&limit=50&before=<ts>` | Paged events for a conversation |
| GET | `/settings` | Current runtime settings |
| PATCH | `/settings` | Update runtime settings (partial) |
| POST | `/conversations/:conversationKey/takeover` | Enqueue set_takeover command |
| POST | `/conversations/:conversationKey/release` | Enqueue release_takeover command |
| POST | `/conversations/:conversationKey/wake-now` | Enqueue wake_now command |

Security:
- Binds to Windows LAN IP only (not 0.0.0.0)
- Requires `Authorization: Bearer <token>` from `BRIDGE_TOKEN` env
- Windows firewall restricts to CentOS VM IP

## Dashboard UI Design

### Design System (Fillow-based)

**Colors:**
- Primary: `#886CC0` (purple)
- Secondary: `#FFA7D7` (pink)
- Success: `#09BD3C` (active threads)
- Warning: `#FFBF00` (waking threads)
- Danger: `#FC2E53` (human takeover)
- Dark background: `#161717`
- Card background: `#202020`
- Border: `#2B2B2B`
- Text: `#ffffff`, muted: `#828690`

**Typography:**
- Font: Roboto, sans-serif
- Base size: 0.875rem (14px)
- Headings: weight 600, tracking-tight
- Card titles: 1.25rem

**Spacing:**
- 4-point grid (multiples of 4px)
- Card padding: 1.875rem
- Card margin-bottom: 1.875rem
- Border-radius: 0.625rem

**Shadows:**
- Light mode: `0 5px 5px 0 rgba(82,63,105,0.05)`
- Dark mode: `0 0 0 1px rgba(255,255,255,0.1)` (border glow, no shadow)

**Buttons:**
- Horizontal padding = 2x vertical (`py-3 px-6`)
- Loading spinner on all async actions
- Disabled: `opacity-50 cursor-not-allowed`

### Layout

Fixed sidebar (16.5rem, collapsible) + fixed header (4.5rem) + scrollable content body. Dark mode by default.

### Pages

**Login (`/login`):**
- Centered card on dark background with purple gradient accent
- Password-only field + submit button
- Cookie-based session (httpOnly, secure, sameSite=strict)

**Overview (`/`):**
- 4 stat cards: Total, Active (green), Human (red), Cold (gray)
- Waking count shown as subtitle on Active card
- Last activity timestamp
- Current relay recipient badge

**Conversations (`/conversations`):**
- Table with columns: Contact, Phone, Status, Last Message, Last Reply, Actions
- Status badges: green=active, red=human, yellow=waking, gray=cold
- Row hover effect
- Click row to navigate to detail

**Conversation Detail (`/conversations/[key]`):**
- Card header: contact name, phone, status badge, action buttons (takeover/release/wake-now)
- Message timeline: chat bubble layout, inbound left (dark card), outbound right (primary tint)
- Timestamps on each message
- Reverse-chronological, load-more pagination
- 10s polling interval

**Settings (`/settings`):**
- Form card with 3 fields: relay target, cold delay (minutes), summary delay (minutes)
- Save button with loading spinner
- Last updated timestamp + updated-by shown below

### Degraded State

When bridge is unreachable, all pages show a banner: "Bridge connection lost — data may be stale." Pages still render with cached/empty data.

## Plugin Extensions

Changes to `C:\Users\GalLe\.openclaw\workspace\.openclaw\extensions\whatsapp-auto-reply\index.js`:

### Management Bootstrap
- On plugin init, create `management/` directory if missing
- Bootstrap `runtime-settings.json` from current config values if file doesn't exist
- Initialize empty `commands.jsonl` and `events.jsonl`

### Runtime Settings
- Read `runtime-settings.json` before each sensitive action (relay, delay timing)
- Replace hardcoded config reads for `relayTarget`, `delayMs`, `summaryDelayMs`

### Event Emission
Append to `events.jsonl` on:
- Inbound user message (`message_in`)
- Outbound bot reply (`message_out`)
- Summary forwarded (`summary_sent`)
- Human takeover detected (`takeover_enabled`)
- Takeover released (`takeover_released`)
- Wake triggered (`wake_requested`)
- Settings changed (`settings_updated`)

### Command Polling
- Every 2 seconds, read `commands.jsonl`
- Track last-processed line offset in memory (reset to 0 on restart, re-process idempotently)
- Execute each command exactly once:
  - `set_takeover`: Force thread to `human` status
  - `release_takeover`: Move thread from `human` to `active`, clear `lastHumanReplyAt`
  - `wake_now`: Reuse existing `fireWake()` path
  - `update_runtime_settings`: Write new values to `runtime-settings.json`
- Emit completion event or `command_failed` event

### File Safety
- Atomic writes for `runtime-settings.json` (write temp + rename)
- Append-only for `events.jsonl` and `commands.jsonl`
- UTF-8 throughout (Hebrew-safe)

## Data Flow

### Takeover Flow
1. Admin clicks "Enable Takeover" → dashboard route handler
2. Route handler POSTs to bridge with bearer token
3. Bridge appends `set_takeover` command to `commands.jsonl`, returns 202
4. Plugin polls, picks up command within 2s
5. Plugin flips thread to `human`, emits `takeover_enabled` to `events.jsonl`
6. Dashboard polls, sees updated status

### Error Handling
- **Bridge offline:** Dashboard shows degraded banner, pages render with empty data
- **Plugin not polling:** Commands queue in `commands.jsonl`, bridge returns 202 (fire-and-forget)
- **Malformed commands:** Plugin emits `command_failed` event, skips command
- **File I/O errors:** Bridge retries reads once, returns 503 on failure

### Polling (No WebSockets in v1)
- Conversation detail: 10s interval
- Conversation list: 30s interval
- Overview: 30s interval

## Authentication

**Dashboard auth:**
- Single admin password from `ADMIN_PASSWORD` env
- Login sets httpOnly secure cookie with session token
- Session validated on every SSR page load and route handler
- Logout clears cookie

**Bridge auth:**
- Bearer token from `BRIDGE_TOKEN` env
- Validated on every request via middleware
- 401 on missing/invalid token

## Non-Goals (v1)

- No backfill from old logs
- No multiple relay recipients
- No per-contact routing rules
- No manual outbound message composer
- No WebSocket real-time updates
- No i18n (English admin labels, Hebrew content displayed as-is)
