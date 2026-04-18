# OpenClaw Manager V2 Features Expansion

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add four major features to OpenClaw Manager: manual message composer, multiple relay recipients, per-contact routing rules, and real-time WebSocket updates replacing polling.

**Architecture:** Extend the bridge with a WebSocket server (ws) alongside the existing REST API. Add new types for relay recipients and routing rules. The dashboard gains a compose UI that sends messages through the gateway `chat.send` method, and replaces its 30s polling with a persistent WebSocket connection to the bridge for live updates. Routing rules and relay recipients are stored in `runtime-settings.json` alongside existing settings.

**Tech Stack:** Express 5 + ws (WebSocket), Next.js 15 App Router, React 19, Tailwind CSS 4, TypeScript 5, pnpm monorepo

---

## File Structure

### New Files

| Path | Responsibility |
|------|---------------|
| `packages/types/src/index.ts` | Extended with new types (RelayRecipient, RoutingRule, WsMessage, SendMessageCommand) |
| `apps/bridge/src/ws.ts` | WebSocket server — attaches to HTTP server, authenticates, broadcasts state changes |
| `apps/bridge/src/services/relay-recipients.ts` | CRUD for relay recipients list in runtime-settings.json |
| `apps/bridge/src/services/routing-rules.ts` | CRUD for per-contact routing rules in runtime-settings.json |
| `apps/bridge/src/services/file-watcher.ts` | Watches state + events files, emits change callbacks for WS broadcast |
| `apps/bridge/src/routes/compose.ts` | POST /compose — sends a message via gateway chat.send |
| `apps/bridge/src/routes/relay.ts` | GET/POST/DELETE /relay-recipients |
| `apps/bridge/src/routes/routing.ts` | GET/POST/PUT/DELETE /routing-rules |
| `apps/dashboard/src/lib/ws-client.ts` | Client-side WebSocket hook for live bridge data |
| `apps/dashboard/src/components/compose-dialog.tsx` | Message compose modal with recipient + text input |
| `apps/dashboard/src/components/relay-recipients-form.tsx` | Manage multiple relay recipients |
| `apps/dashboard/src/components/routing-rules-table.tsx` | Per-contact routing rules editor |
| `apps/dashboard/src/components/live-indicator.tsx` | Connection status dot (green/red) |
| `apps/dashboard/src/app/relay/page.tsx` | Relay recipients management page |
| `apps/dashboard/src/app/routing/page.tsx` | Routing rules management page |
| `apps/dashboard/src/app/api/relay/route.ts` | Server-side proxy for relay CRUD |
| `apps/dashboard/src/app/api/routing/route.ts` | Server-side proxy for routing CRUD |
| `apps/dashboard/src/app/api/compose/route.ts` | Server-side proxy for compose |

### Modified Files

| Path | Changes |
|------|---------|
| `packages/types/src/index.ts` | Add RelayRecipient, RoutingRule, WsMessage, CommandType extensions |
| `apps/bridge/src/server.ts` | Return HTTP server from `app.listen()`, attach WS server, mount new routers |
| `apps/bridge/src/config.ts` | No changes needed (settings stored in existing runtime-settings.json) |
| `apps/bridge/src/services/runtime-settings.ts` | Extend to handle relayRecipients array and routingRules array |
| `apps/bridge/src/services/command-queue.ts` | Add `send_message` command type |
| `apps/bridge/package.json` | Add `ws` dependency |
| `apps/dashboard/src/lib/bridge-client.ts` | Add compose, relay, routing API methods |
| `apps/dashboard/src/components/app-shell.tsx` | Add nav links for Relay and Routing pages, add live indicator |
| `apps/dashboard/src/components/conversation-table.tsx` | Add compose button per row |
| `apps/dashboard/src/app/conversations/[conversationKey]/page.tsx` | Add compose button, integrate WS for live messages |
| `apps/dashboard/src/app/page.tsx` | Replace polling with WS-driven refresh |
| `apps/dashboard/src/components/auto-refresh.tsx` | Replace with WS-based auto-refresh |

---

## Task 1: Extend Shared Types

**Files:**
- Modify: `packages/types/src/index.ts`

- [ ] **Step 1: Add new types to the shared types package**

Add these types at the end of `packages/types/src/index.ts`:

```typescript
// --- V2 Types ---

export type RelayRecipient = {
  id: string;
  phone: string;
  label: string;
  enabled: boolean;
};

export type RoutingRule = {
  id: string;
  conversationKey: string;
  phone: string;
  displayName: string | null;
  relayRecipientIds: string[];
  suppressBot: boolean;
  note: string;
};

export type RuntimeSettingsV2 = RuntimeSettings & {
  relayRecipients: RelayRecipient[];
  routingRules: RoutingRule[];
};

export type WsMessageType =
  | "conversations_updated"
  | "event_new"
  | "settings_updated"
  | "connected";

export type WsMessage = {
  type: WsMessageType;
  payload: unknown;
};

export type SendMessagePayload = {
  conversationKey: string;
  phone: string;
  text: string;
};
```

Also extend `CommandType` to include `"send_message"`:

```typescript
export type CommandType =
  | "set_takeover"
  | "release_takeover"
  | "wake_now"
  | "update_runtime_settings"
  | "send_message";
```

- [ ] **Step 2: Verify types build**

Run: `pnpm build`
Expected: Clean build with no type errors.

- [ ] **Step 3: Commit**

```bash
git add packages/types/src/index.ts
git commit -m "feat(types): add V2 types for relay recipients, routing rules, WebSocket messages, and send_message command"
```

---

## Task 2: Bridge — Multiple Relay Recipients Service

**Files:**
- Create: `apps/bridge/src/services/relay-recipients.ts`
- Modify: `apps/bridge/src/services/runtime-settings.ts`

- [ ] **Step 1: Extend runtime-settings.ts to handle V2 fields**

In `apps/bridge/src/services/runtime-settings.ts`, update the imports and defaults:

```typescript
import type { RuntimeSettings, RuntimeSettingsV2 } from "@openclaw-manager/types";

const DEFAULT_SETTINGS: RuntimeSettingsV2 = {
  relayTarget: "",
  delayMs: 600000,
  summaryDelayMs: 900000,
  updatedAt: Date.now(),
  updatedBy: "system",
  relayRecipients: [],
  routingRules: [],
};
```

Update `readSettings` return type to `RuntimeSettingsV2` and `writeSettings` to accept `Partial<RuntimeSettingsV2>`.

- [ ] **Step 2: Create relay-recipients.ts service**

Create `apps/bridge/src/services/relay-recipients.ts`:

```typescript
import crypto from "node:crypto";
import { readSettings, writeSettings } from "./runtime-settings.js";
import type { RelayRecipient } from "@openclaw-manager/types";

export async function listRecipients(): Promise<RelayRecipient[]> {
  const settings = await readSettings();
  return settings.relayRecipients;
}

export async function addRecipient(
  input: Omit<RelayRecipient, "id">
): Promise<RelayRecipient> {
  const settings = await readSettings();
  const recipient: RelayRecipient = { ...input, id: crypto.randomUUID() };
  settings.relayRecipients.push(recipient);
  await writeSettings({
    relayRecipients: settings.relayRecipients,
    updatedBy: "dashboard",
  });
  return recipient;
}

export async function removeRecipient(id: string): Promise<boolean> {
  const settings = await readSettings();
  const before = settings.relayRecipients.length;
  settings.relayRecipients = settings.relayRecipients.filter((r) => r.id !== id);
  if (settings.relayRecipients.length === before) return false;
  await writeSettings({
    relayRecipients: settings.relayRecipients,
    updatedBy: "dashboard",
  });
  return true;
}

export async function toggleRecipient(
  id: string,
  enabled: boolean
): Promise<RelayRecipient | null> {
  const settings = await readSettings();
  const recipient = settings.relayRecipients.find((r) => r.id === id);
  if (!recipient) return null;
  recipient.enabled = enabled;
  await writeSettings({
    relayRecipients: settings.relayRecipients,
    updatedBy: "dashboard",
  });
  return recipient;
}
```

- [ ] **Step 3: Create relay route**

Create `apps/bridge/src/routes/relay.ts`:

```typescript
import { Router, type Request, type Response } from "express";
import {
  listRecipients,
  addRecipient,
  removeRecipient,
  toggleRecipient,
} from "../services/relay-recipients.js";

const router: Router = Router();

router.get("/relay-recipients", async (_req: Request, res: Response) => {
  try {
    const recipients = await listRecipients();
    res.json(recipients);
  } catch {
    res.status(503).json({ error: "Failed to read relay recipients" });
  }
});

router.post("/relay-recipients", async (req: Request, res: Response) => {
  try {
    const { phone, label, enabled } = req.body;
    if (typeof phone !== "string" || !phone.trim()) {
      res.status(400).json({ error: "phone is required" });
      return;
    }
    const recipient = await addRecipient({
      phone: phone.trim(),
      label: typeof label === "string" ? label.trim() : phone.trim(),
      enabled: enabled !== false,
    });
    res.status(201).json(recipient);
  } catch {
    res.status(503).json({ error: "Failed to add relay recipient" });
  }
});

router.delete(
  "/relay-recipients/:id",
  async (req: Request, res: Response) => {
    try {
      const removed = await removeRecipient(req.params.id);
      if (!removed) {
        res.status(404).json({ error: "Recipient not found" });
        return;
      }
      res.json({ ok: true });
    } catch {
      res.status(503).json({ error: "Failed to remove relay recipient" });
    }
  }
);

router.patch(
  "/relay-recipients/:id",
  async (req: Request, res: Response) => {
    try {
      const { enabled } = req.body;
      if (typeof enabled !== "boolean") {
        res.status(400).json({ error: "enabled (boolean) is required" });
        return;
      }
      const updated = await toggleRecipient(req.params.id, enabled);
      if (!updated) {
        res.status(404).json({ error: "Recipient not found" });
        return;
      }
      res.json(updated);
    } catch {
      res.status(503).json({ error: "Failed to toggle relay recipient" });
    }
  }
);

export default router;
```

- [ ] **Step 4: Mount relay router in server.ts**

In `apps/bridge/src/server.ts`, add:

```typescript
import relayRouter from "./routes/relay.js";
```

And mount it after `gatewayRouter`:

```typescript
app.use(relayRouter);
```

- [ ] **Step 5: Verify build**

Run: `pnpm build`
Expected: Clean build.

- [ ] **Step 6: Commit**

```bash
git add apps/bridge/src/services/relay-recipients.ts apps/bridge/src/services/runtime-settings.ts apps/bridge/src/routes/relay.ts apps/bridge/src/server.ts
git commit -m "feat(bridge): add multiple relay recipients CRUD endpoints"
```

---

## Task 3: Bridge — Per-Contact Routing Rules Service

**Files:**
- Create: `apps/bridge/src/services/routing-rules.ts`
- Create: `apps/bridge/src/routes/routing.ts`
- Modify: `apps/bridge/src/server.ts`

- [ ] **Step 1: Create routing-rules.ts service**

Create `apps/bridge/src/services/routing-rules.ts`:

```typescript
import crypto from "node:crypto";
import { readSettings, writeSettings } from "./runtime-settings.js";
import type { RoutingRule } from "@openclaw-manager/types";

export async function listRules(): Promise<RoutingRule[]> {
  const settings = await readSettings();
  return settings.routingRules;
}

export async function getRuleForConversation(
  conversationKey: string
): Promise<RoutingRule | null> {
  const settings = await readSettings();
  return (
    settings.routingRules.find((r) => r.conversationKey === conversationKey) ??
    null
  );
}

export async function upsertRule(
  input: Omit<RoutingRule, "id"> & { id?: string }
): Promise<RoutingRule> {
  const settings = await readSettings();
  const existing = input.id
    ? settings.routingRules.find((r) => r.id === input.id)
    : null;

  if (existing) {
    Object.assign(existing, input);
    await writeSettings({
      routingRules: settings.routingRules,
      updatedBy: "dashboard",
    });
    return existing;
  }

  const rule: RoutingRule = {
    ...input,
    id: crypto.randomUUID(),
  };
  settings.routingRules.push(rule);
  await writeSettings({
    routingRules: settings.routingRules,
    updatedBy: "dashboard",
  });
  return rule;
}

export async function removeRule(id: string): Promise<boolean> {
  const settings = await readSettings();
  const before = settings.routingRules.length;
  settings.routingRules = settings.routingRules.filter((r) => r.id !== id);
  if (settings.routingRules.length === before) return false;
  await writeSettings({
    routingRules: settings.routingRules,
    updatedBy: "dashboard",
  });
  return true;
}
```

- [ ] **Step 2: Create routing route**

Create `apps/bridge/src/routes/routing.ts`:

```typescript
import { Router, type Request, type Response } from "express";
import {
  listRules,
  upsertRule,
  removeRule,
} from "../services/routing-rules.js";

const router: Router = Router();

router.get("/routing-rules", async (_req: Request, res: Response) => {
  try {
    const rules = await listRules();
    res.json(rules);
  } catch {
    res.status(503).json({ error: "Failed to read routing rules" });
  }
});

router.post("/routing-rules", async (req: Request, res: Response) => {
  try {
    const { conversationKey, phone, displayName, relayRecipientIds, suppressBot, note } = req.body;
    if (typeof conversationKey !== "string" || !conversationKey.trim()) {
      res.status(400).json({ error: "conversationKey is required" });
      return;
    }
    const rule = await upsertRule({
      conversationKey: conversationKey.trim(),
      phone: typeof phone === "string" ? phone.trim() : "",
      displayName: typeof displayName === "string" ? displayName : null,
      relayRecipientIds: Array.isArray(relayRecipientIds) ? relayRecipientIds : [],
      suppressBot: suppressBot === true,
      note: typeof note === "string" ? note : "",
    });
    res.status(201).json(rule);
  } catch {
    res.status(503).json({ error: "Failed to create routing rule" });
  }
});

router.put("/routing-rules/:id", async (req: Request, res: Response) => {
  try {
    const { conversationKey, phone, displayName, relayRecipientIds, suppressBot, note } = req.body;
    const rule = await upsertRule({
      id: req.params.id,
      conversationKey: typeof conversationKey === "string" ? conversationKey.trim() : "",
      phone: typeof phone === "string" ? phone.trim() : "",
      displayName: typeof displayName === "string" ? displayName : null,
      relayRecipientIds: Array.isArray(relayRecipientIds) ? relayRecipientIds : [],
      suppressBot: suppressBot === true,
      note: typeof note === "string" ? note : "",
    });
    res.json(rule);
  } catch {
    res.status(503).json({ error: "Failed to update routing rule" });
  }
});

router.delete("/routing-rules/:id", async (req: Request, res: Response) => {
  try {
    const removed = await removeRule(req.params.id);
    if (!removed) {
      res.status(404).json({ error: "Rule not found" });
      return;
    }
    res.json({ ok: true });
  } catch {
    res.status(503).json({ error: "Failed to remove routing rule" });
  }
});

export default router;
```

- [ ] **Step 3: Mount routing router in server.ts**

In `apps/bridge/src/server.ts`, add:

```typescript
import routingRouter from "./routes/routing.js";
```

And mount it:

```typescript
app.use(routingRouter);
```

- [ ] **Step 4: Verify build**

Run: `pnpm build`
Expected: Clean build.

- [ ] **Step 5: Commit**

```bash
git add apps/bridge/src/services/routing-rules.ts apps/bridge/src/routes/routing.ts apps/bridge/src/server.ts
git commit -m "feat(bridge): add per-contact routing rules CRUD endpoints"
```

---

## Task 4: Bridge — Manual Message Compose Endpoint

**Files:**
- Create: `apps/bridge/src/routes/compose.ts`
- Modify: `apps/bridge/src/server.ts`

- [ ] **Step 1: Create compose route**

Create `apps/bridge/src/routes/compose.ts`:

```typescript
import { Router, type Request, type Response } from "express";
import { callGateway } from "../services/gateway.js";
import { enqueueCommand } from "../services/command-queue.js";

const router: Router = Router();

router.post("/compose", async (req: Request, res: Response) => {
  try {
    const { conversationKey, phone, text } = req.body;
    if (typeof phone !== "string" || !phone.trim()) {
      res.status(400).json({ error: "phone is required" });
      return;
    }
    if (typeof text !== "string" || !text.trim()) {
      res.status(400).json({ error: "text is required" });
      return;
    }

    // Send via OpenClaw gateway chat.send
    const result = await callGateway("chat.send", {
      channel: "whatsapp",
      to: phone.trim(),
      message: text.trim(),
    });

    // Log the command for audit trail
    await enqueueCommand({
      type: "send_message",
      conversationKey: typeof conversationKey === "string" ? conversationKey : undefined,
      payload: { phone: phone.trim(), text: text.trim() },
      issuedBy: "dashboard",
    });

    res.json({ ok: true, result });
  } catch (err: any) {
    res.status(502).json({ error: err.message || "Failed to send message" });
  }
});

export default router;
```

- [ ] **Step 2: Mount compose router in server.ts**

In `apps/bridge/src/server.ts`, add:

```typescript
import composeRouter from "./routes/compose.js";
```

And mount it:

```typescript
app.use(composeRouter);
```

- [ ] **Step 3: Verify build**

Run: `pnpm build`
Expected: Clean build.

- [ ] **Step 4: Commit**

```bash
git add apps/bridge/src/routes/compose.ts apps/bridge/src/server.ts
git commit -m "feat(bridge): add manual message compose endpoint via gateway chat.send"
```

---

## Task 5: Bridge — WebSocket Server for Real-Time Updates

**Files:**
- Create: `apps/bridge/src/ws.ts`
- Create: `apps/bridge/src/services/file-watcher.ts`
- Modify: `apps/bridge/src/server.ts`
- Modify: `apps/bridge/package.json` (add `ws` dependency)

- [ ] **Step 1: Install ws dependency**

Run: `cd apps/bridge && pnpm add ws && pnpm add -D @types/ws`

- [ ] **Step 2: Create file-watcher.ts**

Create `apps/bridge/src/services/file-watcher.ts`:

```typescript
import fs from "node:fs";
import { config } from "../config.js";

type ChangeCallback = (file: "state" | "events" | "settings") => void;

const listeners: ChangeCallback[] = [];

export function onFileChange(cb: ChangeCallback): () => void {
  listeners.push(cb);
  return () => {
    const idx = listeners.indexOf(cb);
    if (idx >= 0) listeners.splice(idx, 1);
  };
}

function notify(file: "state" | "events" | "settings"): void {
  for (const cb of listeners) {
    try {
      cb(file);
    } catch {
      // swallow listener errors
    }
  }
}

let debounceTimers: Record<string, ReturnType<typeof setTimeout>> = {};

function debounced(file: "state" | "events" | "settings"): void {
  if (debounceTimers[file]) clearTimeout(debounceTimers[file]);
  debounceTimers[file] = setTimeout(() => notify(file), 200);
}

export function startWatching(): void {
  try {
    fs.watch(config.openclawStatePath, () => debounced("state"));
  } catch {
    console.warn("Could not watch state file — will rely on polling");
  }

  try {
    fs.watch(config.eventsPath, () => debounced("events"));
  } catch {
    console.warn("Could not watch events file — will rely on polling");
  }

  try {
    fs.watch(config.runtimeSettingsPath, () => debounced("settings"));
  } catch {
    console.warn("Could not watch settings file — will rely on polling");
  }
}
```

- [ ] **Step 3: Create ws.ts WebSocket server**

Create `apps/bridge/src/ws.ts`:

```typescript
import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "node:http";
import crypto from "node:crypto";
import { config } from "./config.js";
import { getConversations } from "./services/openclaw-state.js";
import { readSettings } from "./services/runtime-settings.js";
import { onFileChange, startWatching } from "./services/file-watcher.js";
import type { WsMessage } from "@openclaw-manager/types";

export function attachWebSocket(server: Server): void {
  const wss = new WebSocketServer({ server, path: "/ws" });

  wss.on("connection", (ws, req) => {
    // Authenticate via query param: ?token=<BRIDGE_TOKEN>
    const url = new URL(req.url || "/", `http://${req.headers.host}`);
    const token = url.searchParams.get("token") || "";
    const tokenBuf = Buffer.from(token);
    const expectedBuf = Buffer.from(config.token);

    if (
      tokenBuf.length !== expectedBuf.length ||
      !crypto.timingSafeEqual(tokenBuf, expectedBuf)
    ) {
      ws.close(4001, "Unauthorized");
      return;
    }

    const msg: WsMessage = { type: "connected", payload: { ts: Date.now() } };
    ws.send(JSON.stringify(msg));
  });

  function broadcast(message: WsMessage): void {
    const data = JSON.stringify(message);
    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data);
      }
    }
  }

  // Watch files and broadcast changes
  startWatching();

  onFileChange(async (file) => {
    try {
      if (file === "state") {
        const conversations = await getConversations();
        broadcast({ type: "conversations_updated", payload: conversations });
      } else if (file === "settings") {
        const settings = await readSettings();
        broadcast({ type: "settings_updated", payload: settings });
      } else if (file === "events") {
        // For events, just notify — client can fetch latest
        broadcast({ type: "event_new", payload: { ts: Date.now() } });
      }
    } catch {
      // swallow broadcast errors
    }
  });

  console.log("WebSocket server attached at /ws");
}
```

- [ ] **Step 4: Update server.ts to attach WebSocket**

Replace the `app.listen` block in `apps/bridge/src/server.ts` with:

```typescript
import { attachWebSocket } from "./ws.js";

const server = app.listen(config.port, config.host, () => {
  console.log(`Bridge listening on ${config.host}:${config.port}`);
});

attachWebSocket(server);

export { app, server };
```

- [ ] **Step 5: Verify build**

Run: `pnpm build`
Expected: Clean build. The `ws` types resolve correctly.

- [ ] **Step 6: Commit**

```bash
git add apps/bridge/src/ws.ts apps/bridge/src/services/file-watcher.ts apps/bridge/src/server.ts apps/bridge/package.json pnpm-lock.yaml
git commit -m "feat(bridge): add WebSocket server with file watching for real-time updates"
```

---

## Task 6: Dashboard — Bridge Client Extensions

**Files:**
- Modify: `apps/dashboard/src/lib/bridge-client.ts`

- [ ] **Step 1: Add V2 API methods to bridge-client.ts**

Append to the existing exports in `apps/dashboard/src/lib/bridge-client.ts`:

```typescript
import type {
  OverviewData,
  ConversationRow,
  ConversationEvent,
  RuntimeSettings,
  ManagementCommand,
  RelayRecipient,
  RoutingRule,
  RuntimeSettingsV2,
} from "@openclaw-manager/types";

// --- Compose ---
export async function sendMessage(payload: {
  conversationKey?: string;
  phone: string;
  text: string;
}): Promise<{ ok: boolean; result: unknown }> {
  return bridgeFetch("/compose", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

// --- Relay Recipients ---
export async function getRelayRecipients(): Promise<RelayRecipient[]> {
  return bridgeFetch<RelayRecipient[]>("/relay-recipients");
}

export async function addRelayRecipient(input: {
  phone: string;
  label: string;
  enabled?: boolean;
}): Promise<RelayRecipient> {
  return bridgeFetch<RelayRecipient>("/relay-recipients", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function removeRelayRecipient(id: string): Promise<{ ok: boolean }> {
  return bridgeFetch(`/relay-recipients/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export async function toggleRelayRecipient(
  id: string,
  enabled: boolean
): Promise<RelayRecipient> {
  return bridgeFetch<RelayRecipient>(
    `/relay-recipients/${encodeURIComponent(id)}`,
    { method: "PATCH", body: JSON.stringify({ enabled }) }
  );
}

// --- Routing Rules ---
export async function getRoutingRules(): Promise<RoutingRule[]> {
  return bridgeFetch<RoutingRule[]>("/routing-rules");
}

export async function createRoutingRule(
  input: Omit<RoutingRule, "id">
): Promise<RoutingRule> {
  return bridgeFetch<RoutingRule>("/routing-rules", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateRoutingRule(
  id: string,
  input: Omit<RoutingRule, "id">
): Promise<RoutingRule> {
  return bridgeFetch<RoutingRule>(
    `/routing-rules/${encodeURIComponent(id)}`,
    { method: "PUT", body: JSON.stringify(input) }
  );
}

export async function deleteRoutingRule(id: string): Promise<{ ok: boolean }> {
  return bridgeFetch(`/routing-rules/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

// --- Settings V2 ---
export async function getSettingsV2(): Promise<RuntimeSettingsV2> {
  return bridgeFetch<RuntimeSettingsV2>("/settings");
}
```

Also update the existing `getSettings` return type from `RuntimeSettings` to `RuntimeSettingsV2`.

- [ ] **Step 2: Verify build**

Run: `pnpm build`
Expected: Clean build.

- [ ] **Step 3: Commit**

```bash
git add apps/dashboard/src/lib/bridge-client.ts
git commit -m "feat(dashboard): add bridge client methods for compose, relay, and routing APIs"
```

---

## Task 7: Dashboard — WebSocket Client Hook

**Files:**
- Create: `apps/dashboard/src/lib/ws-client.ts`
- Create: `apps/dashboard/src/components/live-indicator.tsx`

- [ ] **Step 1: Create ws-client.ts**

Create `apps/dashboard/src/lib/ws-client.ts`:

```typescript
"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { WsMessage } from "@openclaw-manager/types";

type WsStatus = "connecting" | "connected" | "disconnected";

export function useBridgeWs(
  wsUrl: string,
  onMessage: (msg: WsMessage) => void
) {
  const [status, setStatus] = useState<WsStatus>("disconnected");
  const wsRef = useRef<WebSocket | null>(null);
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  const connect = useCallback(() => {
    if (wsRef.current) return;
    setStatus("connecting");

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => setStatus("connected");

    ws.onmessage = (event) => {
      try {
        const msg: WsMessage = JSON.parse(event.data);
        onMessageRef.current(msg);
      } catch {
        // ignore malformed
      }
    };

    ws.onclose = () => {
      wsRef.current = null;
      setStatus("disconnected");
      // Auto-reconnect after 3s
      setTimeout(connect, 3000);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, [wsUrl]);

  useEffect(() => {
    connect();
    return () => {
      if (wsRef.current) {
        wsRef.current.onclose = null; // prevent reconnect on unmount
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [connect]);

  return { status };
}
```

- [ ] **Step 2: Create live-indicator.tsx**

Create `apps/dashboard/src/components/live-indicator.tsx`:

```tsx
"use client";

type Props = {
  status: "connecting" | "connected" | "disconnected";
};

const colors = {
  connected: "bg-green-500",
  connecting: "bg-yellow-500 animate-pulse",
  disconnected: "bg-red-500",
} as const;

const labels = {
  connected: "Live",
  connecting: "Connecting...",
  disconnected: "Offline",
} as const;

export function LiveIndicator({ status }: Props) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-zinc-400">
      <span className={`h-2 w-2 rounded-full ${colors[status]}`} />
      {labels[status]}
    </span>
  );
}
```

- [ ] **Step 3: Verify build**

Run: `pnpm build`
Expected: Clean build.

- [ ] **Step 4: Commit**

```bash
git add apps/dashboard/src/lib/ws-client.ts apps/dashboard/src/components/live-indicator.tsx
git commit -m "feat(dashboard): add WebSocket client hook and live connection indicator"
```

---

## Task 8: Dashboard — Compose Dialog Component

**Files:**
- Create: `apps/dashboard/src/components/compose-dialog.tsx`
- Create: `apps/dashboard/src/app/api/compose/route.ts`

- [ ] **Step 1: Create compose API route**

Create `apps/dashboard/src/app/api/compose/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { sendMessage } from "@/lib/bridge-client";
import { verifySession } from "@/lib/session";
import { cookies } from "next/headers";

export async function POST(request: Request) {
  const session = await verifySession(await cookies());
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const body = await request.json();
    const result = await sendMessage(body);
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to send message" },
      { status: 502 }
    );
  }
}
```

- [ ] **Step 2: Create compose-dialog.tsx**

Create `apps/dashboard/src/components/compose-dialog.tsx`:

```tsx
"use client";

import { useState, useRef, useEffect } from "react";

type Props = {
  conversationKey?: string;
  phone?: string;
  displayName?: string | null;
  onClose: () => void;
  onSent?: () => void;
};

export function ComposeDialog({
  conversationKey,
  phone: initialPhone,
  displayName,
  onClose,
  onSent,
}: Props) {
  const [phone, setPhone] = useState(initialPhone || "");
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    textRef.current?.focus();
  }, []);

  async function handleSend() {
    if (!phone.trim() || !text.trim()) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/compose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationKey,
          phone: phone.trim(),
          text: text.trim(),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      onSent?.();
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to send");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-lg border border-zinc-700 bg-zinc-900 p-6">
        <h2 className="mb-4 text-lg font-semibold text-zinc-100">
          Send Message{displayName ? ` to ${displayName}` : ""}
        </h2>

        <label className="mb-1 block text-sm text-zinc-400">Phone</label>
        <input
          type="text"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          disabled={!!initialPhone}
          className="mb-3 w-full rounded border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 disabled:opacity-50"
          placeholder="972501234567@s.whatsapp.net"
        />

        <label className="mb-1 block text-sm text-zinc-400">Message</label>
        <textarea
          ref={textRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={4}
          className="mb-3 w-full rounded border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100"
          placeholder="Type your message..."
        />

        {error && (
          <p className="mb-3 text-sm text-red-400">{error}</p>
        )}

        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200"
          >
            Cancel
          </button>
          <button
            onClick={handleSend}
            disabled={sending || !phone.trim() || !text.trim()}
            className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
          >
            {sending ? "Sending..." : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify build**

Run: `pnpm build`
Expected: Clean build.

- [ ] **Step 4: Commit**

```bash
git add apps/dashboard/src/components/compose-dialog.tsx apps/dashboard/src/app/api/compose/route.ts
git commit -m "feat(dashboard): add message compose dialog and API route"
```

---

## Task 9: Dashboard — Relay Recipients Management Page

**Files:**
- Create: `apps/dashboard/src/components/relay-recipients-form.tsx`
- Create: `apps/dashboard/src/app/relay/page.tsx`
- Create: `apps/dashboard/src/app/api/relay/route.ts`
- Modify: `apps/dashboard/src/components/app-shell.tsx` (add nav link)

- [ ] **Step 1: Create relay API route**

Create `apps/dashboard/src/app/api/relay/route.ts`:

```typescript
import { NextResponse } from "next/server";
import {
  getRelayRecipients,
  addRelayRecipient,
  removeRelayRecipient,
  toggleRelayRecipient,
} from "@/lib/bridge-client";
import { verifySession } from "@/lib/session";
import { cookies } from "next/headers";

export async function GET() {
  const session = await verifySession(await cookies());
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const recipients = await getRelayRecipients();
    return NextResponse.json(recipients);
  } catch {
    return NextResponse.json({ error: "Failed to fetch" }, { status: 502 });
  }
}

export async function POST(request: Request) {
  const session = await verifySession(await cookies());
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await request.json();
    const recipient = await addRelayRecipient(body);
    return NextResponse.json(recipient, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Failed to add" }, { status: 502 });
  }
}

export async function DELETE(request: Request) {
  const session = await verifySession(await cookies());
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { id } = await request.json();
    const result = await removeRelayRecipient(id);
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "Failed to remove" }, { status: 502 });
  }
}

export async function PATCH(request: Request) {
  const session = await verifySession(await cookies());
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { id, enabled } = await request.json();
    const result = await toggleRelayRecipient(id, enabled);
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "Failed to toggle" }, { status: 502 });
  }
}
```

- [ ] **Step 2: Create relay-recipients-form.tsx**

Create `apps/dashboard/src/components/relay-recipients-form.tsx`:

```tsx
"use client";

import { useState } from "react";
import type { RelayRecipient } from "@openclaw-manager/types";

type Props = {
  initial: RelayRecipient[];
};

export function RelayRecipientsForm({ initial }: Props) {
  const [recipients, setRecipients] = useState(initial);
  const [phone, setPhone] = useState("");
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleAdd() {
    if (!phone.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/relay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: phone.trim(), label: label.trim() || phone.trim() }),
      });
      if (res.ok) {
        const added = await res.json();
        setRecipients((prev) => [...prev, added]);
        setPhone("");
        setLabel("");
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove(id: string) {
    setBusy(true);
    try {
      const res = await fetch("/api/relay", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (res.ok) {
        setRecipients((prev) => prev.filter((r) => r.id !== id));
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleToggle(id: string, enabled: boolean) {
    setBusy(true);
    try {
      const res = await fetch("/api/relay", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, enabled }),
      });
      if (res.ok) {
        const updated = await res.json();
        setRecipients((prev) => prev.map((r) => (r.id === id ? updated : r)));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="overflow-hidden rounded-lg border border-zinc-700">
        <table className="w-full text-sm">
          <thead className="bg-zinc-800 text-zinc-400">
            <tr>
              <th className="px-4 py-2 text-left">Label</th>
              <th className="px-4 py-2 text-left">Phone</th>
              <th className="px-4 py-2 text-center">Enabled</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {recipients.map((r) => (
              <tr key={r.id} className="border-t border-zinc-700">
                <td className="px-4 py-2 text-zinc-100">{r.label}</td>
                <td className="px-4 py-2 font-mono text-zinc-300">{r.phone}</td>
                <td className="px-4 py-2 text-center">
                  <button
                    onClick={() => handleToggle(r.id, !r.enabled)}
                    disabled={busy}
                    className={`rounded px-2 py-0.5 text-xs font-medium ${
                      r.enabled
                        ? "bg-green-900/50 text-green-400"
                        : "bg-zinc-700 text-zinc-400"
                    }`}
                  >
                    {r.enabled ? "ON" : "OFF"}
                  </button>
                </td>
                <td className="px-4 py-2 text-right">
                  <button
                    onClick={() => handleRemove(r.id)}
                    disabled={busy}
                    className="text-xs text-red-400 hover:text-red-300"
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
            {recipients.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-zinc-500">
                  No relay recipients configured
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex gap-2">
        <input
          type="text"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="Phone (e.g. 972501234567)"
          className="flex-1 rounded border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100"
        />
        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Label (optional)"
          className="flex-1 rounded border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100"
        />
        <button
          onClick={handleAdd}
          disabled={busy || !phone.trim()}
          className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
        >
          Add
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create relay page**

Create `apps/dashboard/src/app/relay/page.tsx`:

```tsx
import { getRelayRecipients } from "@/lib/bridge-client";
import { RelayRecipientsForm } from "@/components/relay-recipients-form";

export default async function RelayPage() {
  let recipients;
  try {
    recipients = await getRelayRecipients();
  } catch {
    recipients = [];
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-zinc-100">
        Relay Recipients
      </h1>
      <p className="mb-6 text-sm text-zinc-400">
        Manage who receives relay summaries. Multiple recipients can be active
        simultaneously.
      </p>
      <RelayRecipientsForm initial={recipients} />
    </div>
  );
}
```

- [ ] **Step 4: Add Relay link to app-shell.tsx navigation**

In `apps/dashboard/src/components/app-shell.tsx`, add a navigation entry for `/relay` alongside the existing nav items (Conversations, Settings, Commands, etc.):

```tsx
{ href: "/relay", label: "Relay" },
```

- [ ] **Step 5: Verify build**

Run: `pnpm build`
Expected: Clean build.

- [ ] **Step 6: Commit**

```bash
git add apps/dashboard/src/app/relay/ apps/dashboard/src/app/api/relay/ apps/dashboard/src/components/relay-recipients-form.tsx apps/dashboard/src/components/app-shell.tsx
git commit -m "feat(dashboard): add relay recipients management page"
```

---

## Task 10: Dashboard — Routing Rules Management Page

**Files:**
- Create: `apps/dashboard/src/components/routing-rules-table.tsx`
- Create: `apps/dashboard/src/app/routing/page.tsx`
- Create: `apps/dashboard/src/app/api/routing/route.ts`
- Modify: `apps/dashboard/src/components/app-shell.tsx` (add nav link)

- [ ] **Step 1: Create routing API route**

Create `apps/dashboard/src/app/api/routing/route.ts`:

```typescript
import { NextResponse } from "next/server";
import {
  getRoutingRules,
  createRoutingRule,
  updateRoutingRule,
  deleteRoutingRule,
} from "@/lib/bridge-client";
import { verifySession } from "@/lib/session";
import { cookies } from "next/headers";

export async function GET() {
  const session = await verifySession(await cookies());
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const rules = await getRoutingRules();
    return NextResponse.json(rules);
  } catch {
    return NextResponse.json({ error: "Failed to fetch" }, { status: 502 });
  }
}

export async function POST(request: Request) {
  const session = await verifySession(await cookies());
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await request.json();
    const rule = await createRoutingRule(body);
    return NextResponse.json(rule, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Failed to create" }, { status: 502 });
  }
}

export async function PUT(request: Request) {
  const session = await verifySession(await cookies());
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { id, ...body } = await request.json();
    const rule = await updateRoutingRule(id, body);
    return NextResponse.json(rule);
  } catch {
    return NextResponse.json({ error: "Failed to update" }, { status: 502 });
  }
}

export async function DELETE(request: Request) {
  const session = await verifySession(await cookies());
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { id } = await request.json();
    const result = await deleteRoutingRule(id);
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "Failed to delete" }, { status: 502 });
  }
}
```

- [ ] **Step 2: Create routing-rules-table.tsx**

Create `apps/dashboard/src/components/routing-rules-table.tsx`:

```tsx
"use client";

import { useState } from "react";
import type { RoutingRule, RelayRecipient } from "@openclaw-manager/types";

type Props = {
  initialRules: RoutingRule[];
  recipients: RelayRecipient[];
};

export function RoutingRulesTable({ initialRules, recipients }: Props) {
  const [rules, setRules] = useState(initialRules);
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // New rule form state
  const [newKey, setNewKey] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newName, setNewName] = useState("");
  const [newRecipientIds, setNewRecipientIds] = useState<string[]>([]);
  const [newSuppress, setNewSuppress] = useState(false);
  const [newNote, setNewNote] = useState("");

  async function handleAdd() {
    if (!newKey.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/routing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationKey: newKey.trim(),
          phone: newPhone.trim(),
          displayName: newName.trim() || null,
          relayRecipientIds: newRecipientIds,
          suppressBot: newSuppress,
          note: newNote.trim(),
        }),
      });
      if (res.ok) {
        const rule = await res.json();
        setRules((prev) => [...prev, rule]);
        setNewKey("");
        setNewPhone("");
        setNewName("");
        setNewRecipientIds([]);
        setNewSuppress(false);
        setNewNote("");
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(id: string) {
    setBusy(true);
    try {
      const res = await fetch("/api/routing", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (res.ok) {
        setRules((prev) => prev.filter((r) => r.id !== id));
      }
    } finally {
      setBusy(false);
    }
  }

  function toggleRecipientId(recipientId: string) {
    setNewRecipientIds((prev) =>
      prev.includes(recipientId)
        ? prev.filter((id) => id !== recipientId)
        : [...prev, recipientId]
    );
  }

  return (
    <div className="space-y-6">
      <div className="overflow-hidden rounded-lg border border-zinc-700">
        <table className="w-full text-sm">
          <thead className="bg-zinc-800 text-zinc-400">
            <tr>
              <th className="px-4 py-2 text-left">Contact</th>
              <th className="px-4 py-2 text-left">Phone</th>
              <th className="px-4 py-2 text-left">Relay To</th>
              <th className="px-4 py-2 text-center">Suppress Bot</th>
              <th className="px-4 py-2 text-left">Note</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {rules.map((rule) => (
              <tr key={rule.id} className="border-t border-zinc-700">
                <td className="px-4 py-2 text-zinc-100">
                  {rule.displayName || rule.conversationKey}
                </td>
                <td className="px-4 py-2 font-mono text-zinc-300">
                  {rule.phone}
                </td>
                <td className="px-4 py-2 text-zinc-300">
                  {rule.relayRecipientIds
                    .map((id) => recipients.find((r) => r.id === id)?.label || id)
                    .join(", ") || "Default"}
                </td>
                <td className="px-4 py-2 text-center">
                  <span
                    className={`rounded px-2 py-0.5 text-xs font-medium ${
                      rule.suppressBot
                        ? "bg-red-900/50 text-red-400"
                        : "bg-zinc-700 text-zinc-400"
                    }`}
                  >
                    {rule.suppressBot ? "Yes" : "No"}
                  </span>
                </td>
                <td className="px-4 py-2 text-zinc-400">{rule.note}</td>
                <td className="px-4 py-2 text-right">
                  <button
                    onClick={() => handleDelete(rule.id)}
                    disabled={busy}
                    className="text-xs text-red-400 hover:text-red-300"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
            {rules.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-zinc-500">
                  No routing rules — all conversations use default relay settings
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="rounded-lg border border-zinc-700 bg-zinc-800/50 p-4">
        <h3 className="mb-3 text-sm font-semibold text-zinc-200">
          Add Routing Rule
        </h3>
        <div className="grid grid-cols-2 gap-3">
          <input
            type="text"
            value={newKey}
            onChange={(e) => setNewKey(e.target.value)}
            placeholder="Conversation key"
            className="rounded border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100"
          />
          <input
            type="text"
            value={newPhone}
            onChange={(e) => setNewPhone(e.target.value)}
            placeholder="Phone"
            className="rounded border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100"
          />
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Display name (optional)"
            className="rounded border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100"
          />
          <input
            type="text"
            value={newNote}
            onChange={(e) => setNewNote(e.target.value)}
            placeholder="Note (optional)"
            className="rounded border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100"
          />
        </div>

        <div className="mt-3">
          <p className="mb-1 text-xs text-zinc-400">Relay to:</p>
          <div className="flex flex-wrap gap-2">
            {recipients.map((r) => (
              <button
                key={r.id}
                onClick={() => toggleRecipientId(r.id)}
                className={`rounded px-2 py-1 text-xs ${
                  newRecipientIds.includes(r.id)
                    ? "bg-blue-600 text-white"
                    : "bg-zinc-700 text-zinc-300"
                }`}
              >
                {r.label}
              </button>
            ))}
            {recipients.length === 0 && (
              <span className="text-xs text-zinc-500">
                No recipients — add some on the Relay page first
              </span>
            )}
          </div>
        </div>

        <div className="mt-3 flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-zinc-300">
            <input
              type="checkbox"
              checked={newSuppress}
              onChange={(e) => setNewSuppress(e.target.checked)}
              className="rounded"
            />
            Suppress bot replies
          </label>
          <button
            onClick={handleAdd}
            disabled={busy || !newKey.trim()}
            className="ml-auto rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
          >
            Add Rule
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create routing page**

Create `apps/dashboard/src/app/routing/page.tsx`:

```tsx
import { getRoutingRules, getRelayRecipients } from "@/lib/bridge-client";
import { RoutingRulesTable } from "@/components/routing-rules-table";

export default async function RoutingPage() {
  let rules, recipients;
  try {
    [rules, recipients] = await Promise.all([
      getRoutingRules(),
      getRelayRecipients(),
    ]);
  } catch {
    rules = [];
    recipients = [];
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-zinc-100">Routing Rules</h1>
      <p className="mb-6 text-sm text-zinc-400">
        Assign specific relay recipients per conversation, or suppress bot
        replies for individual contacts.
      </p>
      <RoutingRulesTable initialRules={rules} recipients={recipients} />
    </div>
  );
}
```

- [ ] **Step 4: Add Routing link to app-shell.tsx navigation**

In `apps/dashboard/src/components/app-shell.tsx`, add alongside the Relay link:

```tsx
{ href: "/routing", label: "Routing" },
```

- [ ] **Step 5: Verify build**

Run: `pnpm build`
Expected: Clean build.

- [ ] **Step 6: Commit**

```bash
git add apps/dashboard/src/app/routing/ apps/dashboard/src/app/api/routing/ apps/dashboard/src/components/routing-rules-table.tsx apps/dashboard/src/components/app-shell.tsx
git commit -m "feat(dashboard): add per-contact routing rules management page"
```

---

## Task 11: Dashboard — Integrate WebSocket into Existing Pages

**Files:**
- Modify: `apps/dashboard/src/components/auto-refresh.tsx`
- Modify: `apps/dashboard/src/app/page.tsx`
- Modify: `apps/dashboard/src/components/app-shell.tsx`
- Modify: `apps/dashboard/src/app/conversations/[conversationKey]/page.tsx`

- [ ] **Step 1: Replace auto-refresh with WS-driven refresh**

Rewrite `apps/dashboard/src/components/auto-refresh.tsx` to use the WebSocket hook instead of `setTimeout`/`router.refresh()`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useBridgeWs } from "@/lib/ws-client";
import { LiveIndicator } from "./live-indicator";

type Props = {
  wsUrl: string;
};

export function AutoRefresh({ wsUrl }: Props) {
  const router = useRouter();

  const { status } = useBridgeWs(wsUrl, (msg) => {
    // Refresh the page on any state change
    if (
      msg.type === "conversations_updated" ||
      msg.type === "settings_updated" ||
      msg.type === "event_new"
    ) {
      router.refresh();
    }
  });

  return <LiveIndicator status={status} />;
}
```

- [ ] **Step 2: Pass WS URL from server to client**

In the dashboard pages that use `<AutoRefresh />`, pass the WebSocket URL. The WS URL is derived from `OPENCLAW_BRIDGE_URL` but with `ws://` protocol and `/ws?token=` appended.

Create a helper in `apps/dashboard/src/lib/ws-url.ts`:

```typescript
export function getBridgeWsUrl(): string {
  const bridgeUrl = process.env.OPENCLAW_BRIDGE_URL || "http://localhost:3100";
  const token = process.env.OPENCLAW_BRIDGE_TOKEN || "";
  const wsUrl = bridgeUrl.replace(/^http/, "ws") + `/ws?token=${encodeURIComponent(token)}`;
  return wsUrl;
}
```

- [ ] **Step 3: Update overview page to pass WS URL to AutoRefresh**

In `apps/dashboard/src/app/page.tsx`, import `getBridgeWsUrl` and pass it:

```tsx
import { getBridgeWsUrl } from "@/lib/ws-url";

// In the component body:
const wsUrl = getBridgeWsUrl();

// In the JSX, replace existing AutoRefresh:
<AutoRefresh wsUrl={wsUrl} />
```

- [ ] **Step 4: Add LiveIndicator to app-shell header**

In `apps/dashboard/src/components/app-shell.tsx`, add the `<AutoRefresh />` component in the header area so the live indicator is always visible.

- [ ] **Step 5: Verify build**

Run: `pnpm build`
Expected: Clean build.

- [ ] **Step 6: Commit**

```bash
git add apps/dashboard/src/components/auto-refresh.tsx apps/dashboard/src/lib/ws-url.ts apps/dashboard/src/app/page.tsx apps/dashboard/src/components/app-shell.tsx apps/dashboard/src/app/conversations/
git commit -m "feat(dashboard): replace polling with WebSocket-driven live updates"
```

---

## Task 12: Dashboard — Compose Button Integration

**Files:**
- Modify: `apps/dashboard/src/components/conversation-table.tsx`
- Modify: `apps/dashboard/src/app/conversations/[conversationKey]/page.tsx`

- [ ] **Step 1: Add compose button to conversation table rows**

In `apps/dashboard/src/components/conversation-table.tsx`, add a "Compose" button alongside the existing takeover toggle in each row. When clicked, it should open the `ComposeDialog` with the conversation's phone and key pre-filled.

Add state for the compose dialog:

```tsx
import { ComposeDialog } from "./compose-dialog";

// Inside the component:
const [composingKey, setComposingKey] = useState<string | null>(null);
const composingConv = composingKey
  ? conversations.find((c) => c.conversationKey === composingKey)
  : null;
```

Add the button in each row's actions cell:

```tsx
<button
  onClick={() => setComposingKey(conv.conversationKey)}
  className="rounded bg-zinc-700 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-600"
>
  Compose
</button>
```

And render the dialog conditionally:

```tsx
{composingConv && (
  <ComposeDialog
    conversationKey={composingConv.conversationKey}
    phone={composingConv.phone}
    displayName={composingConv.displayName}
    onClose={() => setComposingKey(null)}
  />
)}
```

- [ ] **Step 2: Add compose button to conversation detail page**

In `apps/dashboard/src/app/conversations/[conversationKey]/page.tsx`, add a "Send Message" button in the controls section that opens the `ComposeDialog`.

- [ ] **Step 3: Verify build**

Run: `pnpm build`
Expected: Clean build.

- [ ] **Step 4: Commit**

```bash
git add apps/dashboard/src/components/conversation-table.tsx apps/dashboard/src/app/conversations/
git commit -m "feat(dashboard): integrate compose button into conversations list and detail views"
```

---

## Task 13: Final Integration Build and Verification

**Files:** All modified files

- [ ] **Step 1: Full clean build**

Run:
```bash
pnpm install
pnpm build
```
Expected: Clean build with no type errors across all packages.

- [ ] **Step 2: Verify bridge starts**

Run: `pnpm dev:bridge`
Expected: Output includes:
- `Bridge listening on 127.0.0.1:3100`
- `WebSocket server attached at /ws`
- `OpenClaw SDK loaded for gateway calls`

- [ ] **Step 3: Verify dashboard starts**

Run: `pnpm dev:dashboard`
Expected: Dashboard starts on port 3000 with no errors.

- [ ] **Step 4: Verify new endpoints respond**

Test with curl:
```bash
# Relay recipients
curl -s -H "Authorization: Bearer $BRIDGE_TOKEN" http://127.0.0.1:3100/relay-recipients

# Routing rules
curl -s -H "Authorization: Bearer $BRIDGE_TOKEN" http://127.0.0.1:3100/routing-rules

# Health (includes new WS server)
curl -s http://127.0.0.1:3100/health
```

Expected: JSON responses (empty arrays for new endpoints, `{ok: true}` for health).

- [ ] **Step 5: Commit final state**

```bash
git add -A
git commit -m "chore: V2 features integration verification"
```
