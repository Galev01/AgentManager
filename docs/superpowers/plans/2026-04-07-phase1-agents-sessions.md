# Phase 1: Agents & Sessions Management — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Agents and Sessions management pages to the OpenClaw Manager dashboard, restructure the sidebar with grouped sections, and create typed bridge endpoints for both domains.

**Architecture:** Extend the existing bridge → dashboard pattern. New bridge routes wrap `callGateway()` with typed responses. New dashboard pages follow the same server component + client component pattern used by existing pages. Sidebar gets section headers to organize growing navigation.

**Tech Stack:** Express 5, Next.js 15 App Router, React 19, Tailwind CSS 4, TypeScript 5, pnpm monorepo

---

## File Structure

### New Files

| Path | Responsibility |
|------|---------------|
| `packages/types/src/index.ts` | Extended with Agent, AgentSession, SessionMessage types |
| `apps/bridge/src/routes/agents.ts` | CRUD endpoints for agent management |
| `apps/bridge/src/routes/agent-sessions.ts` | CRUD + action endpoints for sessions |
| `apps/dashboard/src/app/agents/page.tsx` | Agent list page |
| `apps/dashboard/src/app/agents/[name]/page.tsx` | Agent detail page |
| `apps/dashboard/src/components/agent-table.tsx` | Agent list table component |
| `apps/dashboard/src/components/agent-form.tsx` | Create/edit agent form |
| `apps/dashboard/src/app/sessions/page.tsx` | Sessions list page |
| `apps/dashboard/src/app/sessions/[id]/page.tsx` | Session detail page |
| `apps/dashboard/src/components/session-table.tsx` | Session list table component |
| `apps/dashboard/src/components/session-chat.tsx` | Session chat input + transcript |
| `apps/dashboard/src/app/api/agents/route.ts` | Dashboard proxy for agent mutations |
| `apps/dashboard/src/app/api/agents/[name]/route.ts` | Dashboard proxy for single agent |
| `apps/dashboard/src/app/api/sessions/route.ts` | Dashboard proxy for session mutations |
| `apps/dashboard/src/app/api/sessions/[id]/route.ts` | Dashboard proxy for single session actions |

### Modified Files

| Path | Changes |
|------|---------|
| `packages/types/src/index.ts` | Add Agent, AgentSession, SessionMessage types |
| `apps/bridge/src/server.ts` | Mount agents and agent-sessions routers |
| `apps/dashboard/src/lib/bridge-client.ts` | Add typed methods for agents and sessions |
| `apps/dashboard/src/components/sidebar.tsx` | Restructure with section headers and new nav items |

---

## Task 1: Add Agent and Session Types

**Files:**
- Modify: `packages/types/src/index.ts`

- [ ] **Step 1: Add V3 types for agents and sessions**

Append to the end of `packages/types/src/index.ts`:

```typescript
// --- V3 Types: Agent Management ---

export type Agent = {
  name: string;
  model?: string;
  systemPrompt?: string;
  tools?: string[];
  createdAt?: number;
  updatedAt?: number;
};

export type AgentSession = {
  id: string;
  agentName?: string;
  status: "active" | "completed" | "aborted";
  messageCount?: number;
  tokenUsage?: { prompt: number; completion: number; total: number };
  createdAt?: number;
  lastActivityAt?: number;
};

export type SessionMessage = {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp?: number;
};
```

- [ ] **Step 2: Verify build**

Run: `pnpm build`
Expected: Clean build.

- [ ] **Step 3: Commit**

```bash
git add packages/types/src/index.ts
git commit -m "feat(types): add Agent, AgentSession, SessionMessage types for V3"
```

---

## Task 2: Bridge — Agents Routes

**Files:**
- Create: `apps/bridge/src/routes/agents.ts`
- Modify: `apps/bridge/src/server.ts`

- [ ] **Step 1: Create agents route**

Create `apps/bridge/src/routes/agents.ts`:

```typescript
import { Router, type Request, type Response } from "express";
import { callGateway } from "../services/gateway.js";

const router: Router = Router();

// GET /agents — list all agents
router.get("/agents", async (_req: Request, res: Response) => {
  try {
    const result = await callGateway("agents.list", {});
    res.json(result);
  } catch (err: any) {
    res.status(502).json({ error: err.message || "Failed to list agents" });
  }
});

// POST /agents — create a new agent
router.post("/agents", async (req: Request, res: Response) => {
  try {
    const { name, model, systemPrompt, tools } = req.body;
    if (typeof name !== "string" || !name.trim()) {
      res.status(400).json({ error: "name is required" });
      return;
    }
    const params: Record<string, unknown> = { name: name.trim() };
    if (typeof model === "string") params.model = model.trim();
    if (typeof systemPrompt === "string") params.systemPrompt = systemPrompt;
    if (Array.isArray(tools)) params.tools = tools;
    const result = await callGateway("agents.create", params);
    res.status(201).json(result);
  } catch (err: any) {
    res.status(502).json({ error: err.message || "Failed to create agent" });
  }
});

// GET /agents/:name — get agent identity/details
router.get("/agents/:name", async (req: Request, res: Response) => {
  try {
    const name = req.params.name as string;
    const result = await callGateway("agents.identity", { name });
    res.json(result);
  } catch (err: any) {
    res.status(502).json({ error: err.message || "Failed to get agent" });
  }
});

// PATCH /agents/:name — update agent config
router.patch("/agents/:name", async (req: Request, res: Response) => {
  try {
    const name = req.params.name as string;
    const updates = req.body || {};
    const result = await callGateway("agents.update", { name, ...updates });
    res.json(result);
  } catch (err: any) {
    res.status(502).json({ error: err.message || "Failed to update agent" });
  }
});

// DELETE /agents/:name — delete agent
router.delete("/agents/:name", async (req: Request, res: Response) => {
  try {
    const name = req.params.name as string;
    const result = await callGateway("agents.delete", { name });
    res.json(result);
  } catch (err: any) {
    res.status(502).json({ error: err.message || "Failed to delete agent" });
  }
});

export default router;
```

- [ ] **Step 2: Mount agents router in server.ts**

In `apps/bridge/src/server.ts`, add import and mount:

```typescript
import agentsRouter from "./routes/agents.js";
```
Mount after `composeRouter`:
```typescript
app.use(agentsRouter);
```

- [ ] **Step 3: Verify build**

Run: `pnpm build`
Expected: Clean build.

- [ ] **Step 4: Commit**

```bash
git add apps/bridge/src/routes/agents.ts apps/bridge/src/server.ts
git commit -m "feat(bridge): add agents CRUD endpoints"
```

---

## Task 3: Bridge — Agent Sessions Routes

**Files:**
- Create: `apps/bridge/src/routes/agent-sessions.ts`
- Modify: `apps/bridge/src/server.ts`

- [ ] **Step 1: Create agent-sessions route**

Create `apps/bridge/src/routes/agent-sessions.ts`:

```typescript
import { Router, type Request, type Response } from "express";
import { callGateway } from "../services/gateway.js";

const router: Router = Router();

// GET /agent-sessions — list all sessions
router.get("/agent-sessions", async (req: Request, res: Response) => {
  try {
    const params: Record<string, unknown> = {};
    if (req.query.agent) params.agent = String(req.query.agent);
    if (req.query.status) params.status = String(req.query.status);
    const result = await callGateway("sessions.list", params);
    res.json(result);
  } catch (err: any) {
    res.status(502).json({ error: err.message || "Failed to list sessions" });
  }
});

// POST /agent-sessions — create a new session
router.post("/agent-sessions", async (req: Request, res: Response) => {
  try {
    const { agentName } = req.body;
    const params: Record<string, unknown> = {};
    if (typeof agentName === "string") params.agent = agentName.trim();
    const result = await callGateway("sessions.create", params);
    res.status(201).json(result);
  } catch (err: any) {
    res.status(502).json({ error: err.message || "Failed to create session" });
  }
});

// POST /agent-sessions/:id/send — send message into session
router.post("/agent-sessions/:id/send", async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const { message } = req.body;
    if (typeof message !== "string" || !message.trim()) {
      res.status(400).json({ error: "message is required" });
      return;
    }
    const result = await callGateway("sessions.send", {
      session: id,
      message: message.trim(),
    });
    res.json(result);
  } catch (err: any) {
    res.status(502).json({ error: err.message || "Failed to send message" });
  }
});

// GET /agent-sessions/:id/usage — get session usage stats
router.get("/agent-sessions/:id/usage", async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const result = await callGateway("sessions.usage", { session: id });
    res.json(result);
  } catch (err: any) {
    res.status(502).json({ error: err.message || "Failed to get usage" });
  }
});

// POST /agent-sessions/:id/reset — reset session
router.post("/agent-sessions/:id/reset", async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const result = await callGateway("sessions.reset", { session: id });
    res.json(result);
  } catch (err: any) {
    res.status(502).json({ error: err.message || "Failed to reset session" });
  }
});

// POST /agent-sessions/:id/abort — abort session
router.post("/agent-sessions/:id/abort", async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const result = await callGateway("sessions.abort", { session: id });
    res.json(result);
  } catch (err: any) {
    res.status(502).json({ error: err.message || "Failed to abort session" });
  }
});

// POST /agent-sessions/:id/compact — compact session
router.post("/agent-sessions/:id/compact", async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const result = await callGateway("sessions.compact", { session: id });
    res.json(result);
  } catch (err: any) {
    res.status(502).json({ error: err.message || "Failed to compact session" });
  }
});

// DELETE /agent-sessions/:id — delete session
router.delete("/agent-sessions/:id", async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const result = await callGateway("sessions.delete", { session: id });
    res.json(result);
  } catch (err: any) {
    res.status(502).json({ error: err.message || "Failed to delete session" });
  }
});

export default router;
```

- [ ] **Step 2: Mount in server.ts**

Add import and mount after agentsRouter:
```typescript
import agentSessionsRouter from "./routes/agent-sessions.js";
app.use(agentSessionsRouter);
```

- [ ] **Step 3: Verify build**

Run: `pnpm build`
Expected: Clean build.

- [ ] **Step 4: Commit**

```bash
git add apps/bridge/src/routes/agent-sessions.ts apps/bridge/src/server.ts
git commit -m "feat(bridge): add agent sessions CRUD and action endpoints"
```

---

## Task 4: Dashboard — Bridge Client Methods for Agents & Sessions

**Files:**
- Modify: `apps/dashboard/src/lib/bridge-client.ts`

- [ ] **Step 1: Add agent and session methods**

Update imports at top of `bridge-client.ts` to include new types:

```typescript
import type {
  OverviewData, ConversationRow, ConversationEvent, RuntimeSettings,
  ManagementCommand, RelayRecipient, RoutingRule, RuntimeSettingsV2,
  Agent, AgentSession, SessionMessage,
} from "@openclaw-manager/types";
```

Append these methods:

```typescript
// --- Agents ---
export async function listAgents(): Promise<Agent[]> {
  const result = await bridgeFetch<unknown>("/agents");
  return Array.isArray(result) ? result : [];
}

export async function getAgent(name: string): Promise<Agent | null> {
  try {
    return await bridgeFetch<Agent>(`/agents/${encodeURIComponent(name)}`);
  } catch { return null; }
}

export async function createAgent(input: {
  name: string; model?: string; systemPrompt?: string; tools?: string[];
}): Promise<Agent> {
  return bridgeFetch<Agent>("/agents", { method: "POST", body: JSON.stringify(input) });
}

export async function updateAgent(name: string, updates: Partial<Agent>): Promise<Agent> {
  return bridgeFetch<Agent>(`/agents/${encodeURIComponent(name)}`, {
    method: "PATCH", body: JSON.stringify(updates),
  });
}

export async function deleteAgent(name: string): Promise<{ ok: boolean }> {
  return bridgeFetch(`/agents/${encodeURIComponent(name)}`, { method: "DELETE" });
}

// --- Agent Sessions ---
export async function listAgentSessions(filters?: {
  agent?: string; status?: string;
}): Promise<AgentSession[]> {
  const params = new URLSearchParams();
  if (filters?.agent) params.set("agent", filters.agent);
  if (filters?.status) params.set("status", filters.status);
  const qs = params.toString();
  const result = await bridgeFetch<unknown>(`/agent-sessions${qs ? `?${qs}` : ""}`);
  return Array.isArray(result) ? result : [];
}

export async function createAgentSession(agentName?: string): Promise<AgentSession> {
  return bridgeFetch<AgentSession>("/agent-sessions", {
    method: "POST", body: JSON.stringify({ agentName }),
  });
}

export async function sendSessionMessage(id: string, message: string): Promise<unknown> {
  return bridgeFetch(`/agent-sessions/${encodeURIComponent(id)}/send`, {
    method: "POST", body: JSON.stringify({ message }),
  });
}

export async function getSessionUsage(id: string): Promise<unknown> {
  return bridgeFetch(`/agent-sessions/${encodeURIComponent(id)}/usage`);
}

export async function resetSession(id: string): Promise<unknown> {
  return bridgeFetch(`/agent-sessions/${encodeURIComponent(id)}/reset`, { method: "POST" });
}

export async function abortSession(id: string): Promise<unknown> {
  return bridgeFetch(`/agent-sessions/${encodeURIComponent(id)}/abort`, { method: "POST" });
}

export async function compactSession(id: string): Promise<unknown> {
  return bridgeFetch(`/agent-sessions/${encodeURIComponent(id)}/compact`, { method: "POST" });
}

export async function deleteSession(id: string): Promise<{ ok: boolean }> {
  return bridgeFetch(`/agent-sessions/${encodeURIComponent(id)}`, { method: "DELETE" });
}
```

- [ ] **Step 2: Verify build**

Run: `pnpm build`
Expected: Clean build.

- [ ] **Step 3: Commit**

```bash
git add apps/dashboard/src/lib/bridge-client.ts
git commit -m "feat(dashboard): add bridge client methods for agents and sessions"
```

---

## Task 5: Restructure Sidebar with Section Headers

**Files:**
- Modify: `apps/dashboard/src/components/sidebar.tsx`

- [ ] **Step 1: Restructure the sidebar with grouped sections**

Rewrite the NAV_ITEMS constant and rendering in `sidebar.tsx` to use section headers. The current flat list becomes grouped:

```typescript
type NavSection = {
  label: string;
  items: Array<{ href: string; label: string; icon: string }>;
};

const NAV_SECTIONS: NavSection[] = [
  {
    label: "Monitor",
    items: [
      { href: "/", label: "Overview", icon: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1" },
      { href: "/conversations", label: "Conversations", icon: "M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" },
    ],
  },
  {
    label: "Manage",
    items: [
      { href: "/agents", label: "Agents", icon: "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" },
      { href: "/sessions", label: "Sessions", icon: "M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" },
    ],
  },
  {
    label: "Configure",
    items: [
      { href: "/settings", label: "Settings", icon: "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z" },
    ],
  },
  {
    label: "Routing",
    items: [
      { href: "/relay", label: "Relay", icon: "M17 8h2a2 2 0 012 2v6a2 2 0 01-2 2h-2v4l-4-4H9a1.994 1.994 0 01-1.414-.586m0 0L11 14h4a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2v4l.586-.586z" },
      { href: "/routing", label: "Routing Rules", icon: "M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6-3V7m6 13l4.553 2.276A1 1 0 0021 21.382V10.618a1 1 0 00-.553-.894L15 7m0 13V7m0 0L9 7" },
    ],
  },
  {
    label: "Advanced",
    items: [
      { href: "/commands", label: "Commands", icon: "M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" },
    ],
  },
];
```

The render logic changes from mapping a flat array to mapping sections with section labels:

```tsx
{NAV_SECTIONS.map((section) => (
  <div key={section.label} className="mt-4">
    <div className="px-4 pb-1 text-[10px] font-medium uppercase tracking-wider text-text-muted">
      {section.label}
    </div>
    {section.items.map((item) => {
      const isActive = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
      return (
        <Link key={item.href} href={item.href}
          className={`flex items-center gap-3 rounded px-4 py-2.5 text-sm transition ${isActive ? "bg-primary/10 text-primary" : "text-text-gray hover:bg-dark-lighter hover:text-text-primary"}`}>
          <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
          </svg>
          {item.label}
        </Link>
      );
    })}
  </div>
))}
```

Also update the footer text from "WhatsApp Manager v1.0" to "OpenClaw Manager".

- [ ] **Step 2: Verify build**

Run: `pnpm build`
Expected: Clean build.

- [ ] **Step 3: Commit**

```bash
git add apps/dashboard/src/components/sidebar.tsx
git commit -m "feat(dashboard): restructure sidebar with grouped section headers"
```

---

## Task 6: Dashboard — Agents List Page

**Files:**
- Create: `apps/dashboard/src/app/agents/page.tsx`
- Create: `apps/dashboard/src/components/agent-table.tsx`
- Create: `apps/dashboard/src/app/api/agents/route.ts`

- [ ] **Step 1: Create agents API route**

Create `apps/dashboard/src/app/api/agents/route.ts` — proxies GET (list) and POST (create) to bridge. Auth via `isAuthenticated()` matching existing patterns (check `apps/dashboard/src/app/api/relay/route.ts` for the pattern).

- [ ] **Step 2: Create agent-table.tsx**

A "use client" component that receives `initial: Agent[]`, shows a table with columns: Name, Model, Tools (count badge), Actions (View, Delete). Includes a "Create Agent" button that opens an inline form. Delete calls `/api/agents` with DELETE method.

Match existing component styling (zinc borders, dark backgrounds, blue action buttons).

- [ ] **Step 3: Create agents list page**

Server component at `apps/dashboard/src/app/agents/page.tsx`:
- Fetches agents via `listAgents()` from bridge-client
- Renders inside `<AppShell title="Agents">`
- Shows `<AgentTable initial={agents} />`
- Handles bridge errors gracefully (empty array fallback)

- [ ] **Step 4: Verify build**

Run: `pnpm build`
Expected: Clean build with `/agents` in route table.

- [ ] **Step 5: Commit**

```bash
git add apps/dashboard/src/app/agents/ apps/dashboard/src/app/api/agents/ apps/dashboard/src/components/agent-table.tsx
git commit -m "feat(dashboard): add agents list page with create/delete"
```

---

## Task 7: Dashboard — Agent Detail Page

**Files:**
- Create: `apps/dashboard/src/app/agents/[name]/page.tsx`
- Create: `apps/dashboard/src/components/agent-form.tsx`
- Create: `apps/dashboard/src/app/api/agents/[name]/route.ts`

- [ ] **Step 1: Create single agent API route**

Create `apps/dashboard/src/app/api/agents/[name]/route.ts` — proxies GET (identity), PATCH (update), DELETE to bridge `/agents/:name`.

- [ ] **Step 2: Create agent-form.tsx**

A "use client" component for editing an agent. Props: `agent: Agent`. Shows:
- Name (read-only display)
- Model (text input)
- System prompt (textarea)
- Tools (display list — editing tool assignments comes in Phase 3)
- Save button that PATCHes `/api/agents/:name`
- Delete button with confirmation modal

- [ ] **Step 3: Create agent detail page**

Server component at `apps/dashboard/src/app/agents/[name]/page.tsx`:
- Fetches agent via `getAgent(name)` from bridge-client
- Renders inside `<AppShell title={agent.name}>`
- Shows agent info card + `<AgentForm agent={agent} />`
- Back link to `/agents`
- 404 handling if agent not found

- [ ] **Step 4: Verify build**

Run: `pnpm build`
Expected: Clean build.

- [ ] **Step 5: Commit**

```bash
git add apps/dashboard/src/app/agents/ apps/dashboard/src/app/api/agents/ apps/dashboard/src/components/agent-form.tsx
git commit -m "feat(dashboard): add agent detail page with edit form"
```

---

## Task 8: Dashboard — Sessions List Page

**Files:**
- Create: `apps/dashboard/src/app/sessions/page.tsx`
- Create: `apps/dashboard/src/components/session-table.tsx`
- Create: `apps/dashboard/src/app/api/sessions/route.ts`

- [ ] **Step 1: Create sessions API route**

Create `apps/dashboard/src/app/api/sessions/route.ts` — proxies GET (list with optional agent/status filters) and POST (create) to bridge `/agent-sessions`.

- [ ] **Step 2: Create session-table.tsx**

A "use client" component. Props: `initial: AgentSession[]`. Shows:
- Table: ID (truncated to 8 chars), Agent, Status (badge), Messages, Tokens, Created, Last Activity
- Status badges: green for active, gray for completed, red for aborted
- Click row → navigate to `/sessions/[id]`
- "New Session" button that creates a session (optionally selecting an agent)
- Filter dropdowns: by agent name, by status

- [ ] **Step 3: Create sessions list page**

Server component at `apps/dashboard/src/app/sessions/page.tsx`:
- Fetches sessions via `listAgentSessions()` from bridge-client
- Renders inside `<AppShell title="Sessions">`
- Shows `<SessionTable initial={sessions} />`

- [ ] **Step 4: Verify build**

Run: `pnpm build`
Expected: Clean build.

- [ ] **Step 5: Commit**

```bash
git add apps/dashboard/src/app/sessions/ apps/dashboard/src/app/api/sessions/ apps/dashboard/src/components/session-table.tsx
git commit -m "feat(dashboard): add sessions list page with filtering"
```

---

## Task 9: Dashboard — Session Detail Page with Chat

**Files:**
- Create: `apps/dashboard/src/app/sessions/[id]/page.tsx`
- Create: `apps/dashboard/src/components/session-chat.tsx`
- Create: `apps/dashboard/src/app/api/sessions/[id]/route.ts`

- [ ] **Step 1: Create single session API route**

Create `apps/dashboard/src/app/api/sessions/[id]/route.ts` — proxies:
- POST with `{ action: "send", message }` → bridge POST `/agent-sessions/:id/send`
- POST with `{ action: "reset" }` → bridge POST `/agent-sessions/:id/reset`
- POST with `{ action: "abort" }` → bridge POST `/agent-sessions/:id/abort`
- POST with `{ action: "compact" }` → bridge POST `/agent-sessions/:id/compact`
- DELETE → bridge DELETE `/agent-sessions/:id`

- [ ] **Step 2: Create session-chat.tsx**

A "use client" component for interacting with a session. Props: `sessionId: string, status: string`. Shows:
- Message input at bottom (textarea + send button) — disabled if session is not active
- Action buttons: Reset, Abort, Compact, Delete
- Response display area showing the latest response after sending
- Loading state while waiting for response (sessions.send can be slow)

- [ ] **Step 3: Create session detail page**

Server component at `apps/dashboard/src/app/sessions/[id]/page.tsx`:
- Fetches session usage via `getSessionUsage(id)` from bridge-client
- Renders inside `<AppShell title="Session">`
- Info card: session ID, agent, status, token usage
- `<SessionChat sessionId={id} status={session.status} />`
- Back link to `/sessions`

- [ ] **Step 4: Verify build**

Run: `pnpm build`
Expected: Clean build.

- [ ] **Step 5: Commit**

```bash
git add apps/dashboard/src/app/sessions/ apps/dashboard/src/app/api/sessions/ apps/dashboard/src/components/session-chat.tsx
git commit -m "feat(dashboard): add session detail page with chat and actions"
```

---

## Task 10: Final Integration Build and Verification

**Files:** All modified files

- [ ] **Step 1: Full clean build**

Run:
```bash
pnpm install
pnpm build
```
Expected: Clean build with no type errors, all new routes in the build output.

- [ ] **Step 2: Verify new routes appear**

Expected routes in dashboard build output:
- `/agents` (dynamic)
- `/agents/[name]` (dynamic)
- `/sessions` (dynamic)
- `/sessions/[id]` (dynamic)
- `/api/agents` (dynamic)
- `/api/agents/[name]` (dynamic)
- `/api/sessions` (dynamic)
- `/api/sessions/[id]` (dynamic)

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "chore: Phase 1 agents + sessions integration verification"
```
