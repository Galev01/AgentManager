# OpenClaw WhatsApp Manager Plan

## Summary
Build a small admin system with three parts:

- A CentOS-hosted web dashboard for viewing conversations, takeover state, sent messages, and runtime settings.
- A Windows-side bridge API that sits next to the live OpenClaw instance and exposes a safe management surface over HTTPS on your LAN/VPN.
- A small extension to the existing `whatsapp-auto-reply` plugin so it can publish live state, record a clean event history, and accept management commands without relying on raw log parsing.

This avoids talking directly to the current loopback-only OpenClaw gateway, gives you reliable history from rollout forward, and keeps v1 focused on:
- human takeover and release
- single active relay recipient
- wake-now / bot handoff controls
- message history of what the bot sent
- runtime WhatsApp settings like cold delay

## Key Changes

### 1. Runtime Management Contract
Add a dedicated management data surface owned by the WhatsApp plugin instead of reading raw OpenClaw logs for UI data.

New runtime files on the Windows OpenClaw host:
- `management/runtime-settings.json`
- `management/events.jsonl`
- `management/commands.jsonl`

Contract:
- `runtime-settings.json` is the live mutable settings source for `relayTarget`, `delayMs`, `summaryDelayMs`, and a small `updatedAt/updatedBy` audit stamp.
- `events.jsonl` is append-only and starts fresh at rollout. It records inbound user messages, outbound bot messages, summary forwards, human takeover on/off, wake-now requests, and settings changes.
- `commands.jsonl` is append-only input for management actions. The plugin polls it every 1-2 seconds, executes idempotently, and emits completion/failure into `events.jsonl`.

Command types:
- `set_takeover`
- `release_takeover`
- `wake_now`
- `update_runtime_settings`

Event types:
- `message_in`
- `message_out`
- `summary_sent`
- `takeover_enabled`
- `takeover_released`
- `wake_requested`
- `settings_updated`
- `command_failed`

Why:
- current state JSON is useful for live thread status, but not enough for a durable “what the bot sent” timeline after summaries clear
- raw OpenClaw logs are too noisy and unstable to be the UI’s source of truth

### 2. Windows Bridge API
Add a small Node/TypeScript bridge service on the Windows machine where OpenClaw runs.

Responsibilities:
- read live thread state from the plugin state file
- read and write `runtime-settings.json`
- append management commands to `commands.jsonl`
- stream or page `events.jsonl`
- expose a small authenticated REST API for the CentOS dashboard
- never expose the raw OpenClaw gateway to the browser

API surface:
- `GET /health`
- `GET /overview`
- `GET /conversations`
- `GET /conversations/:conversationKey`
- `GET /messages?conversationKey=...`
- `GET /settings`
- `PATCH /settings`
- `POST /conversations/:conversationKey/takeover`
- `POST /conversations/:conversationKey/release`
- `POST /conversations/:conversationKey/wake-now`

Response shape defaults:
- conversations return normalized thread status: `cold | waking | active | human`
- messages return paged timeline items with `direction`, `text`, `timestamp`, `senderName`, `senderId`
- settings return the single active relay recipient and delay values only

Security model:
- bridge binds to the Windows LAN IP only
- Windows firewall restricts access to the CentOS VM IP
- bridge requires a shared bearer token from env
- browser never calls bridge directly; only the dashboard server does

### 3. CentOS Dashboard
Build a small password-protected admin dashboard on CentOS.

Chosen stack:
- Next.js + TypeScript
- server-rendered pages and route handlers
- cookie session auth for the admin login
- server-side bridge client using `OPENCLAW_BRIDGE_URL` and `OPENCLAW_BRIDGE_TOKEN`

Pages:
- `/login`
- `/` overview dashboard
- `/conversations`
- `/conversations/[conversationKey]`
- `/settings`

Core UI behavior:
- Overview shows counts for `cold`, `active`, and `human` threads plus last activity and current relay recipient
- Conversations list shows contact name, phone, status, last inbound, last outbound, and takeover badge
- Conversation detail shows the recent message timeline and buttons for:
  - enable human takeover
  - release human takeover
  - wake now
- Settings page edits:
  - single active relay recipient
  - cold delay
  - summary delay
- Sent-message history is driven from `events.jsonl`, not from current session transcripts

### 4. Plugin Enhancements
Extend the current plugin at [C:\Users\GalLe\.openclaw\workspace\.openclaw\extensions\whatsapp-auto-reply\index.js](C:\Users\GalLe\.openclaw\workspace\.openclaw\extensions\whatsapp-auto-reply\index.js) to support management mode.

Plugin changes:
- bootstrap runtime settings from current config if `runtime-settings.json` does not exist
- refresh runtime settings on a short interval or before sensitive actions
- append normalized message/takeover/settings events to `events.jsonl`
- poll `commands.jsonl` and execute new commands exactly once
- keep existing behavior for cold start, active thread replies, and human takeover
- on `release_takeover`, move the thread from `human` to `active` and clear `lastHumanReplyAt`
- on `set_takeover`, force `human` state without needing a manual WhatsApp message
- on `wake_now`, reuse the existing wake path

Non-goals for v1:
- no backfill from old logs or session files
- no multiple relay recipients
- no per-contact routing rules
- no manual outbound message composer from the dashboard

## Public Interfaces And Data Shapes

### Bridge Settings Shape
```ts
type RuntimeSettings = {
  relayTarget: string
  delayMs: number
  summaryDelayMs: number
  updatedAt: number
  updatedBy: string
}
```

### Conversation Summary Shape
```ts
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
```

### Event Shape
```ts
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
```

## Files

### Planned Repo Layout
```text
openclaw-whatsapp-manager/
  README.md
  .env.example

  apps/
    dashboard/
      package.json
      next.config.ts
      tsconfig.json
      src/app/layout.tsx
      src/app/login/page.tsx
      src/app/page.tsx
      src/app/conversations/page.tsx
      src/app/conversations/[conversationKey]/page.tsx
      src/app/settings/page.tsx
      src/app/api/auth/login/route.ts
      src/app/api/auth/logout/route.ts
      src/lib/session.ts
      src/lib/bridge-client.ts
      src/lib/format.ts
      src/components/app-shell.tsx
      src/components/overview-cards.tsx
      src/components/conversation-table.tsx
      src/components/message-timeline.tsx
      src/components/takeover-controls.tsx
      src/components/settings-form.tsx
      src/types.ts

    bridge/
      package.json
      tsconfig.json
      src/server.ts
      src/config.ts
      src/auth.ts
      src/routes/health.ts
      src/routes/overview.ts
      src/routes/conversations.ts
      src/routes/messages.ts
      src/routes/settings.ts
      src/routes/commands.ts
      src/services/openclaw-state.ts
      src/services/runtime-settings.ts
      src/services/event-log.ts
      src/services/command-queue.ts
      src/types.ts

  openclaw-plugin/
    management/
      runtime-settings.json
      commands.jsonl
      events.jsonl
```

### Existing OpenClaw Files To Extend
- [C:\Users\GalLe\.openclaw\workspace\.openclaw\extensions\whatsapp-auto-reply\index.js](C:\Users\GalLe\.openclaw\workspace\.openclaw\extensions\whatsapp-auto-reply\index.js)
- [C:\Users\GalLe\.openclaw\workspace\.openclaw\extensions\whatsapp-auto-reply\openclaw.plugin.json](C:\Users\GalLe\.openclaw\workspace\.openclaw\extensions\whatsapp-auto-reply\openclaw.plugin.json)
- [C:\Users\GalLe\.openclaw\openclaw.json](C:\Users\GalLe\.openclaw\openclaw.json)

## Test Plan
- Login rejects bad password and sets a valid admin session for good password.
- Dashboard loads with bridge offline and shows a clear degraded-state banner.
- Overview reflects live counts from the plugin state file.
- Conversation list shows current `human` and `active` threads correctly.
- Enabling takeover from the UI flips the thread to `human` and suppresses the next auto-reply.
- Releasing takeover from the UI flips the thread back to `active`.
- Wake-now on a `cold` thread triggers immediate bot send.
- Wake-now on a `human` thread is rejected cleanly.
- Updating relay recipient changes the next summary destination without a gateway restart.
- Updating cold delay changes the next new-thread timer behavior.
- Bot outbound messages appear in the message timeline from rollout forward.
- Summary-sent events appear in history with the destination recipient.
- Groups remain ignored and never appear as managed conversations.
- Restarting OpenClaw preserves runtime settings and conversation state.
- Restarting the bridge does not lose event history.
- CentOS dashboard can call the bridge only through the server, never from the browser directly.

## Assumptions
- The dashboard is a standalone CentOS web app, not an OpenClaw canvas page.
- A small Windows-side bridge service is acceptable because the current OpenClaw gateway is loopback-only.
- V1 manages one active relay recipient at a time.
- V1 starts history collection fresh at rollout and does not backfill old logs.
- Admin UI labels are in English, while WhatsApp content remains Hebrew-safe and displayed as-is.
- The bridge is reachable only on your private network and protected with a shared token; the dashboard itself adds the admin password layer.
