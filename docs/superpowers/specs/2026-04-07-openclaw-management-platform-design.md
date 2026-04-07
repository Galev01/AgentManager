# OpenClaw Management Platform — Design Spec

## Vision

Transform the OpenClaw Manager from a WhatsApp-focused admin tool into a comprehensive management platform covering the full OpenClaw gateway surface: agents, sessions, cron jobs, tools/skills, channels, and configuration. Single power-user (Gal), clean management app aesthetic (like Vercel/Linear), module-per-domain approach matching the existing V1/V2 architecture.

## Architecture

No new services or processes. The existing Bridge → Dashboard pattern is extended:

```
Browser (admin)
  │
  ▼
Dashboard (Next.js 15, port 3000)
  │  server-side fetch with bearer token
  ▼
Bridge API (Express 5, port 3100)
  │
  ├──▶ Local files (state, events, commands, settings)   [existing V1/V2]
  ├──▶ OpenClaw Gateway (127.0.0.1:18789 via SDK)        [new domain pages]
  └──▶ File watcher → WS → SSE to browser                [existing real-time]
```

**What changes per domain:**
1. Bridge: new route file wrapping `callGateway()` with typed responses
2. Shared types: new interfaces in `packages/types`
3. Dashboard bridge-client: new typed fetch methods
4. Dashboard API routes: new proxy routes for client-side mutations
5. Dashboard pages: server components + client components following existing patterns

**What stays the same:**
- Auth model (password → cookie → bearer token chain)
- File-based IPC for WhatsApp plugin
- SSE real-time updates
- Sidebar navigation structure (extended with new sections)

## Navigation Structure

Sidebar is grouped into sections:

```
MONITOR
  Overview          /                   [existing]
  Conversations     /conversations      [existing]

MANAGE
  Agents            /agents             [new]
  Sessions          /sessions           [new]
  Cron Jobs         /cron               [new]

CONFIGURE
  Tools & Skills    /tools              [new]
  Channels          /channels           [new]
  Config            /config             [new]
  Settings          /settings           [existing - runtime settings]

ROUTING
  Relay             /relay              [existing V2]
  Routing Rules     /routing            [existing V2]

ADVANCED
  Commands          /commands           [existing]
  Logs              /logs               [existing - via commands page]
```

## Domain Specifications

### 1. Agents (`/agents`)

**Purpose:** Full lifecycle management of OpenClaw AI agents.

**List view (`/agents`):**
- Table: name, model, status, tool count, created date
- Create button opens a form modal
- Inline delete with confirmation

**Detail view (`/agents/[name]`):**
- Agent identity card: name, model, status
- System prompt editor (textarea, auto-save on blur)
- Tools assignment: checkboxes from tools.catalog
- Danger zone: delete agent

**Bridge routes:**
- `GET /agents` → `agents.list`
- `POST /agents` → `agents.create` (body: name, model, systemPrompt, tools)
- `GET /agents/:name` → `agents.identity` (params: { name })
- `PATCH /agents/:name` → `agents.update` (body: partial agent config)
- `DELETE /agents/:name` → `agents.delete` (params: { name })

**Types:**
```typescript
type Agent = {
  name: string;
  model: string;
  systemPrompt?: string;
  tools: string[];
  createdAt?: number;
  updatedAt?: number;
};
```

### 2. Sessions (`/sessions`)

**Purpose:** Monitor and interact with agent conversation sessions.

**List view (`/sessions`):**
- Table: session ID (truncated), agent name, status, message count, token usage, created, last activity
- Filters: by agent, by status (active/completed/aborted)
- Create button: select agent → start new session

**Detail view (`/sessions/[id]`):**
- Session info card: ID, agent, status, usage stats
- Message transcript: scrollable list of user/assistant/system messages
- Live chat input: send a message into the session (calls sessions.send)
- Action buttons: reset, abort, compact, delete

**Bridge routes:**
- `GET /agent-sessions` → `sessions.list`
- `POST /agent-sessions` → `sessions.create` (body: agentName)
- `GET /agent-sessions/:id` → fetch session detail (sessions.list filtered + sessions.usage)
- `POST /agent-sessions/:id/send` → `sessions.send` (body: { message })
- `POST /agent-sessions/:id/reset` → `sessions.reset`
- `POST /agent-sessions/:id/abort` → `sessions.abort`
- `POST /agent-sessions/:id/compact` → `sessions.compact`
- `DELETE /agent-sessions/:id` → `sessions.delete`
- `GET /agent-sessions/:id/usage` → `sessions.usage`

Note: routes use `/agent-sessions` to avoid collision with existing `/sessions` (transcript files).

**Types:**
```typescript
type AgentSession = {
  id: string;
  agentName: string;
  status: "active" | "completed" | "aborted";
  messageCount: number;
  tokenUsage?: { prompt: number; completion: number; total: number };
  createdAt: number;
  lastActivityAt: number;
};

type SessionMessage = {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp?: number;
};
```

### 3. Cron Jobs (`/cron`)

**Purpose:** Schedule and manage recurring automated tasks.

**List view (`/cron`):**
- Table: name/ID, schedule (human-readable + raw cron), agent, status, last run, next run
- Add button: form with cron expression input + human-readable preview
- Inline toggle for active/paused
- Run Now button per job

**Detail view:** Inline expansion in the table (no separate page needed — cron jobs are simple).

**Bridge routes:**
- `GET /cron` → `cron.list`
- `POST /cron` → `cron.add` (body: schedule, command, agentName)
- `DELETE /cron/:id` → `cron.remove`
- `GET /cron/:id/status` → `cron.status`
- `POST /cron/:id/run` → `cron.run`

**Types:**
```typescript
type CronJob = {
  id: string;
  name?: string;
  schedule: string;
  command: string;
  agentName?: string;
  status: "active" | "paused";
  lastRunAt?: number;
  nextRunAt?: number;
  lastResult?: string;
};
```

### 4. Tools & Skills (`/tools`)

**Purpose:** Browse available tools, manage effective tool assignments, install skills.

**Tabs:**
- **Catalog:** Searchable card grid of all tools — name, description, category, parameters
- **Effective:** Which tools are currently active — table view with agent assignment
- **Skills:** Installed skills with status badges, install new skill form

**Bridge routes:**
- `GET /tools/catalog` → `tools.catalog`
- `GET /tools/effective` → `tools.effective`
- `GET /skills` → `skills.status`
- `POST /skills/install` → `skills.install` (body: { name })

**Types:**
```typescript
type Tool = {
  name: string;
  description: string;
  category?: string;
  parameters?: Array<{ name: string; type: string; required: boolean; description: string }>;
};

type EffectiveTool = {
  name: string;
  enabled: boolean;
  assignedTo?: string;
};

type Skill = {
  name: string;
  status: "installed" | "available" | "error";
  version?: string;
  description?: string;
};
```

### 5. Channels (`/channels`)

**Purpose:** Monitor messaging channel connections, reconnect if needed.

**Layout:** Status cards (one per channel) — no table needed since channel count is small.

Each card shows:
- Channel name and type (WhatsApp, etc.)
- Connection status badge (connected/disconnected/error)
- Last activity timestamp
- Account info (phone number, etc.)
- Logout button (with confirmation)

**Bridge routes:**
- `GET /channels` → `channels.status`
- `POST /channels/:name/logout` → `channels.logout`

**Types:**
```typescript
type Channel = {
  name: string;
  type: string;
  status: "connected" | "disconnected" | "error";
  lastActivityAt?: number;
  accountInfo?: Record<string, unknown>;
};
```

### 6. Config (`/config`)

**Purpose:** View and edit OpenClaw gateway configuration with schema-driven forms.

**Layout:**
- Schema-driven form: fetch `config.schema` → auto-generate form fields with correct types, descriptions, defaults, enum options
- Pre-filled from `config.get`
- Save button: `config.set` + `config.apply`
- Raw JSON toggle: view/edit raw config for power-user tweaks
- Diff view: show changes before applying

**Bridge routes:**
- `GET /gateway-config` → `config.get`
- `GET /gateway-config/schema` → `config.schema`
- `PATCH /gateway-config` → `config.set` (body: partial config)
- `POST /gateway-config/apply` → `config.apply`

Note: routes use `/gateway-config` to avoid collision with Express config concepts.

**Types:**
```typescript
type ConfigSchemaProperty = {
  type: string;
  description?: string;
  default?: unknown;
  enum?: unknown[];
};

type ConfigSchema = {
  properties: Record<string, ConfigSchemaProperty>;
};
```

## Implementation Phases

### Phase 1: Agents + Sessions (highest value, deepest integration)
- Shared types for Agent, AgentSession, SessionMessage
- Bridge routes for agents and sessions
- Dashboard pages: /agents, /agents/[name], /sessions, /sessions/[id]
- Sidebar restructure with section groupings

### Phase 2: Cron Jobs + Channels
- Types for CronJob, Channel
- Bridge routes for cron and channels
- Dashboard pages: /cron, /channels

### Phase 3: Tools/Skills + Config
- Types for Tool, Skill, ConfigSchema
- Bridge routes for tools, skills, config
- Dashboard pages: /tools (with tabs), /config (schema-driven form)

### Phase 4: Enhanced Overview
- Expand overview page with panels for agent count, active sessions, cron job status, channel health
- Mini status widgets pulling from all domains

## Conventions

- All new code follows existing patterns exactly (see AGENTS.md)
- Bridge routes: one file per domain in `apps/bridge/src/routes/`
- Bridge services: optional — only if gateway responses need transformation
- Dashboard: server components for pages, client components for interactivity
- Types: all in `packages/types/src/index.ts`
- Dark theme, Tailwind CSS, zinc-based color palette matching existing UI
