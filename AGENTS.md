# OpenClaw Manager - Agent Guide

## What This Project Is

OpenClaw Manager is an admin system for managing an **OpenClaw** instance — an AI-powered automation platform that currently runs a WhatsApp auto-reply plugin. The manager provides a web dashboard for monitoring conversations, controlling bot behavior, and adjusting runtime settings.

> **Important:** This is an OpenClaw manager, not a WhatsApp-only manager. OpenClaw handles multiple channels and capabilities. Frame all work as "OpenClaw management."

## Architecture Overview

```
Browser (admin user)
  |
  v
Dashboard (Next.js 15, port 3000)        <-- CentOS server
  |  server-side only, bearer token
  v
Bridge API (Express 5, port 3100)         <-- Windows machine (same as OpenClaw)
  |
  +---> Local files (state, events, commands, settings)
  +---> OpenClaw Gateway (ws://127.0.0.1:18789 via SDK)
```

**Key principle:** The browser never talks to the Bridge directly. The Dashboard proxies all calls server-side.

## Monorepo Structure

```
openclaw-whatsapp-manager/
├── apps/
│   ├── bridge/           # Express API on the Windows machine
│   │   └── src/
│   │       ├── server.ts          # Entry point, route mounting
│   │       ├── config.ts          # Env var loading with defaults
│   │       ├── auth.ts            # Bearer token validation (timing-safe)
│   │       ├── routes/            # HTTP route handlers
│   │       └── services/          # Business logic
│   │           ├── openclaw-state.ts      # Reads plugin state JSON
│   │           ├── runtime-settings.ts    # Reads/writes settings JSON
│   │           ├── event-log.ts           # Reads events JSONL
│   │           ├── command-queue.ts       # Appends commands JSONL
│   │           └── gateway.ts             # OpenClaw SDK wrapper
│   │
│   └── dashboard/        # Next.js 15 web app
│       └── src/
│           ├── app/               # App Router pages and API routes
│           │   ├── page.tsx               # Overview dashboard
│           │   ├── login/page.tsx         # Password auth
│           │   ├── conversations/         # List + detail views
│           │   ├── settings/page.tsx      # Runtime settings editor
│           │   ├── commands/page.tsx       # Interactive command runner
│           │   └── api/                   # Auth + gateway API routes
│           ├── components/        # React components
│           └── lib/
│               ├── bridge-client.ts       # Server-side bridge caller
│               ├── session.ts             # HMAC cookie sessions
│               └── format.ts              # Display formatters
│
├── packages/
│   └── types/            # Shared TypeScript types (@openclaw-manager/types)
│       └── src/index.ts           # All shared interfaces and type aliases
│
├── openclaw-plugin/
│   └── management/       # Runtime state files (gitignored content, committed structure)
│
├── docs/superpowers/     # Implementation plans and specs
├── PLAN.md               # Original project specification
├── pnpm-workspace.yaml   # Workspace config
└── tsconfig.base.json    # Shared TS config (ES2022, strict)
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 15.3, React 19, Tailwind CSS 4 |
| Bridge API | Express 5, TypeScript |
| Shared types | `@openclaw-manager/types` workspace package |
| Package manager | pnpm (monorepo) |
| Runtime | Node.js with TypeScript (tsx for dev, tsc for build) |
| Auth | HMAC-SHA256 signed cookies (dashboard), bearer tokens (bridge) |
| Storage | File-based: JSON + JSONL (no database) |

## How to Run

```bash
pnpm install              # Install all workspace dependencies
pnpm dev:bridge           # Start bridge on port 3100 (tsx watch)
pnpm dev:dashboard        # Start dashboard on port 3000 (next dev)
pnpm build                # Build everything for production
```

## Key Concepts

### Conversation States
- **cold** — No recent activity, bot is idle
- **waking** — Bot is initiating contact
- **active** — Ongoing bot conversation
- **human** — Human admin has taken over (bot suppressed)

### Management Commands (via commands.jsonl)
- `set_takeover` — Force a conversation into human mode
- `release_takeover` — Return control to the bot
- `wake_now` — Force bot to message a cold thread
- `update_runtime_settings` — Change relay target or delays

### File-Based IPC
The bridge and plugin communicate through files:
- **`whatsapp-auto-reply-state.json`** — Live conversation state (read-only by bridge)
- **`management/runtime-settings.json`** — Mutable settings (read/write)
- **`management/events.jsonl`** — Append-only event log
- **`management/commands.jsonl`** — Append-only command queue

### OpenClaw SDK
The bridge dynamically imports the globally-installed OpenClaw SDK to call gateway methods (logs, sessions, agents, etc.). The SDK handles device authentication and WebSocket protocol internally. See `apps/bridge/src/services/gateway.ts`.

## Coding Conventions

### TypeScript
- **Strict mode** everywhere (`tsconfig.base.json` sets `strict: true`)
- All shared types go in `packages/types/src/index.ts`
- Import shared types as `@openclaw-manager/types`
- Use `node:` prefix for Node.js built-ins (`node:fs/promises`, `node:crypto`)

### Bridge (Express)
- Each route file exports a default `Router`
- Services are pure functions that read/write files — no Express dependency
- Auth uses timing-safe comparison (`crypto.timingSafeEqual`)
- Atomic writes for settings: write to temp file, then rename
- All routes except `/health` require bearer token

### Dashboard (Next.js)
- App Router with server components by default
- Client components marked with `"use client"` only when needed
- Bridge calls happen server-side only via `lib/bridge-client.ts`
- Sessions use HMAC-signed cookies — see `lib/session.ts`
- Tailwind for all styling, dark mode by default

### Error Handling
- Bridge returns `{ error: string }` with appropriate HTTP status
- Dashboard shows a `degraded-banner` when bridge is unreachable
- Gateway calls fail gracefully (SDK load failure logged, not thrown)

### File Operations
- JSONL files: one JSON object per line, append with `\n`
- Settings: read entire file, merge updates, atomic write
- State file: read-only, parsed and normalized per request
- Session IDs validated with `^[a-f0-9-]+$` regex before file access

## Environment Variables

### Bridge
| Variable | Required | Default | Purpose |
|----------|----------|---------|---------|
| `BRIDGE_HOST` | No | `127.0.0.1` | Bind address |
| `BRIDGE_PORT` | No | `3100` | Listen port |
| `BRIDGE_TOKEN` | Yes | — | Bearer token for API auth |
| `OPENCLAW_STATE_PATH` | Yes | — | Path to plugin state JSON |
| `MANAGEMENT_DIR` | Yes | — | Path to management files dir |
| `OPENCLAW_GATEWAY_URL` | No | `http://127.0.0.1:18789` | Gateway URL |
| `OPENCLAW_GATEWAY_TOKEN` | Yes | — | Gateway auth token |
| `OPENCLAW_SESSIONS_DIR` | No | — | Agent session transcripts dir |
| `CLAUDE_CODE_PENDING_TIMEOUT_MS` | No | `300000` | Max ms to hold a manual-mode `/claude-code/ask` reply |
| `CLAUDE_CODE_SHARED_OPENCLAW_SESSION_ID` | No | `oc-shared-claude-code` | Shared OpenClaw-side session id all Claude Code sessions use |

### Dashboard
| Variable | Required | Default | Purpose |
|----------|----------|---------|---------|
| `ADMIN_PASSWORD` | Yes | — | Login password |
| `SESSION_SECRET` | Yes | — | HMAC key for cookie signing |
| `OPENCLAW_BRIDGE_URL` | No | `http://localhost:3100` | Bridge API URL |
| `OPENCLAW_BRIDGE_TOKEN` | Yes | — | Bridge bearer token |

## Bridge API Reference

All endpoints except `/health` require `Authorization: Bearer <token>`.

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/health` | Health check + uptime |
| GET | `/overview` | Aggregate conversation stats |
| GET | `/conversations` | List all conversations |
| GET | `/conversations/:key` | Single conversation detail |
| GET | `/messages?conversationKey=&limit=&before=` | Paginated event log |
| GET | `/settings` | Runtime settings |
| PATCH | `/settings` | Update settings |
| POST | `/conversations/:key/takeover` | Enable human takeover |
| POST | `/conversations/:key/release` | Release takeover |
| POST | `/conversations/:key/wake-now` | Wake cold thread |
| GET | `/logs/tail?lines=` | Tail OpenClaw logs |
| GET | `/sessions` | List agent sessions |
| GET | `/sessions/:id/transcript` | Session transcript |
| POST | `/gateway/:method` | Proxy any gateway method |
| POST | `/gateway/:ns/:action` | Proxy namespaced gateway method |

## Gateway Methods (via /gateway proxy)

Available methods forwarded to the OpenClaw SDK:

- **Agents:** `agents.list`, `agents.create`, `agents.update`, `agents.delete`, `agents.identity`
- **Sessions:** `sessions.list`, `sessions.create`, `sessions.send`, `sessions.delete`, `sessions.reset`, `sessions.abort`, `sessions.usage`, `sessions.compact`
- **Chat:** `chat.send`, `chat.inject`
- **Config:** `config.get`, `config.set`, `config.apply`, `config.schema`
- **Channels:** `channels.status`, `channels.logout`
- **Cron:** `cron.list`, `cron.add`, `cron.remove`, `cron.status`, `cron.run`
- **System:** `logs.tail`, `models.list`, `tools.catalog`, `tools.effective`
- **Skills:** `skills.status`, `skills.install`

## Claude Code ↔ OpenClaw

A collaborative dialogue channel: Claude Code (any IDE) calls the `@openclaw-manager/mcp` stdio server, which forwards to `/claude-code/ask`. The bridge routes the turn through the OpenClaw gateway, logs the exchange, and (in manual mode) holds the reply until the operator approves it from the dashboard. See `docs/superpowers/specs/2026-04-19-claude-code-openclaw-bridge-design.md` for the full design.

Bridge endpoints: `/claude-code/ask`, `/claude-code/sessions`, `/claude-code/transcripts/:id`, `/claude-code/pending`, `/claude-code/pending/:id`, `/claude-code/connect-config`.

MCP tools: `openclaw_say`, `openclaw_conclude`, `openclaw_session_info`.

## Adding a New Feature — Checklist

1. **Types first:** Add any new types to `packages/types/src/index.ts`
2. **Bridge service:** Add business logic in `apps/bridge/src/services/`
3. **Bridge route:** Add HTTP handler in `apps/bridge/src/routes/`, mount in `server.ts`
4. **Bridge client method:** Add the fetch call in `apps/dashboard/src/lib/bridge-client.ts`
5. **Dashboard page/component:** Add UI in `apps/dashboard/src/app/` or `components/`
6. **Build check:** Run `pnpm build` to verify no type errors across the monorepo
