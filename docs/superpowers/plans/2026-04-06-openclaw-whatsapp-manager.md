# OpenClaw WhatsApp Manager Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a three-part admin system (dashboard + bridge API + plugin extensions) for managing OpenClaw's WhatsApp auto-reply plugin.

**Architecture:** pnpm monorepo with shared types package. Dashboard (Next.js 15 on CentOS) calls Bridge (Express on Windows) server-side only. Bridge reads/writes management files that the plugin produces and consumes. File-based IPC via JSONL append logs and a mutable settings JSON.

**Tech Stack:** pnpm workspaces, TypeScript, Next.js 15 (App Router), Tailwind CSS 4, Express, node:fs/promises

---

## Task 1: Monorepo Scaffolding

**Files:**
- Create: `package.json` (root)
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.base.json`
- Create: `.gitignore`
- Create: `.env.example`
- Create: `packages/types/package.json`
- Create: `packages/types/tsconfig.json`
- Create: `apps/bridge/package.json`
- Create: `apps/bridge/tsconfig.json`

- [ ] **Step 1: Create root package.json and workspace config**

```json
// package.json
{
  "name": "openclaw-whatsapp-manager",
  "private": true,
  "scripts": {
    "dev:bridge": "pnpm --filter bridge dev",
    "dev:dashboard": "pnpm --filter dashboard dev",
    "build": "pnpm -r build",
    "build:dashboard": "pnpm --filter dashboard build",
    "build:bridge": "pnpm --filter bridge build"
  }
}
```

```yaml
# pnpm-workspace.yaml
packages:
  - "packages/*"
  - "apps/*"
```

- [ ] **Step 2: Create tsconfig.base.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true
  }
}
```

- [ ] **Step 3: Create .gitignore and .env.example**

```gitignore
# .gitignore
node_modules/
dist/
.next/
.env
.env.local
*.tsbuildinfo
```

```env
# .env.example
# Bridge
BRIDGE_HOST=192.168.0.50
BRIDGE_PORT=3100
BRIDGE_TOKEN=changeme
OPENCLAW_STATE_PATH=C:\Users\GalLe\.openclaw\workspace\.openclaw\extensions\whatsapp-auto-reply\whatsapp-auto-reply-state.json
MANAGEMENT_DIR=C:\Users\GalLe\.openclaw\workspace\.openclaw\extensions\whatsapp-auto-reply\management

# Dashboard
ADMIN_PASSWORD=changeme
SESSION_SECRET=generate-a-random-32-char-string
OPENCLAW_BRIDGE_URL=http://192.168.0.50:3100
OPENCLAW_BRIDGE_TOKEN=changeme
```

- [ ] **Step 4: Create packages/types scaffold**

```json
// packages/types/package.json
{
  "name": "@openclaw-manager/types",
  "version": "0.1.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch"
  }
}
```

```json
// packages/types/tsconfig.json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

- [ ] **Step 5: Create apps/bridge scaffold**

```json
// apps/bridge/package.json
{
  "name": "bridge",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "build": "tsc",
    "start": "node dist/server.js"
  },
  "dependencies": {
    "@openclaw-manager/types": "workspace:*",
    "express": "^5.1.0"
  },
  "devDependencies": {
    "@types/express": "^5.0.2",
    "@types/node": "^22.15.2",
    "tsx": "^4.19.4",
    "typescript": "^5.8.3"
  }
}
```

```json
// apps/bridge/tsconfig.json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

- [ ] **Step 6: Run pnpm install**

```bash
cd "c:/Users/GalLe/Cursor projects/OpenClaw-manager"
pnpm install
```

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: scaffold monorepo with pnpm workspaces, shared types, and bridge app"
```

---

## Task 2: Shared Types Package

**Files:**
- Create: `packages/types/src/index.ts`

- [ ] **Step 1: Write all shared types**

```ts
// packages/types/src/index.ts

export type ConversationStatus = "cold" | "waking" | "active" | "human";

export type RuntimeSettings = {
  relayTarget: string;
  delayMs: number;
  summaryDelayMs: number;
  updatedAt: number;
  updatedBy: string;
};

export type ConversationRow = {
  conversationKey: string;
  phone: string;
  displayName: string | null;
  status: ConversationStatus;
  lastRemoteAt: number | null;
  lastRemoteContent: string | null;
  lastAgentReplyAt: number | null;
  lastHumanReplyAt: number | null;
  awaitingRelay: boolean;
};

export type EventType =
  | "message_in"
  | "message_out"
  | "summary_sent"
  | "takeover_enabled"
  | "takeover_released"
  | "wake_requested"
  | "settings_updated"
  | "command_failed";

export type EventActor = "user" | "bot" | "human_admin" | "system";

export type ConversationEvent = {
  id: string;
  type: EventType;
  conversationKey: string | null;
  phone: string | null;
  displayName: string | null;
  text: string | null;
  actor: EventActor;
  at: number;
  meta?: Record<string, unknown>;
};

export type CommandType =
  | "set_takeover"
  | "release_takeover"
  | "wake_now"
  | "update_runtime_settings";

export type ManagementCommand = {
  id: string;
  type: CommandType;
  conversationKey?: string;
  payload?: Record<string, unknown>;
  at: number;
  issuedBy: string;
};

export type OverviewData = {
  totalConversations: number;
  activeCount: number;
  humanCount: number;
  coldCount: number;
  wakingCount: number;
  lastActivityAt: number | null;
  relayTarget: string;
};
```

- [ ] **Step 2: Build types package**

```bash
cd "c:/Users/GalLe/Cursor projects/OpenClaw-manager"
pnpm --filter @openclaw-manager/types build
```

Expected: Compiles without errors, creates `packages/types/dist/index.js` and `packages/types/dist/index.d.ts`.

- [ ] **Step 3: Commit**

```bash
git add packages/types/
git commit -m "feat: add shared types package with all data shapes"
```

---

## Task 3: Bridge — Config, Auth, and Server Entry

**Files:**
- Create: `apps/bridge/src/config.ts`
- Create: `apps/bridge/src/auth.ts`
- Create: `apps/bridge/src/server.ts`

- [ ] **Step 1: Write config module**

```ts
// apps/bridge/src/config.ts
import path from "node:path";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

export const config = {
  host: process.env.BRIDGE_HOST || "0.0.0.0",
  port: Number(process.env.BRIDGE_PORT) || 3100,
  token: requireEnv("BRIDGE_TOKEN"),
  openclawStatePath: requireEnv("OPENCLAW_STATE_PATH"),
  managementDir: requireEnv("MANAGEMENT_DIR"),
  get runtimeSettingsPath() {
    return path.join(this.managementDir, "runtime-settings.json");
  },
  get eventsPath() {
    return path.join(this.managementDir, "events.jsonl");
  },
  get commandsPath() {
    return path.join(this.managementDir, "commands.jsonl");
  },
} as const;
```

- [ ] **Step 2: Write auth middleware**

```ts
// apps/bridge/src/auth.ts
import type { Request, Response, NextFunction } from "express";
import { config } from "./config.js";

export function bearerAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing or invalid Authorization header" });
    return;
  }
  const token = header.slice(7);
  if (token !== config.token) {
    res.status(401).json({ error: "Invalid token" });
    return;
  }
  next();
}
```

- [ ] **Step 3: Write server entry point (minimal, routes added in later tasks)**

```ts
// apps/bridge/src/server.ts
import express from "express";
import { config } from "./config.js";
import { bearerAuth } from "./auth.js";

const app = express();
app.use(express.json());
app.use(bearerAuth);

app.get("/health", (_req, res) => {
  res.json({ ok: true, uptime: process.uptime() });
});

app.listen(config.port, config.host, () => {
  console.log(`Bridge listening on ${config.host}:${config.port}`);
});

export { app };
```

- [ ] **Step 4: Verify bridge compiles**

```bash
cd "c:/Users/GalLe/Cursor projects/OpenClaw-manager"
pnpm --filter bridge build
```

Expected: Compiles without errors.

- [ ] **Step 5: Commit**

```bash
git add apps/bridge/src/
git commit -m "feat: add bridge server with config and bearer auth middleware"
```

---

## Task 4: Bridge — Services (State, Settings, Events, Commands)

**Files:**
- Create: `apps/bridge/src/services/openclaw-state.ts`
- Create: `apps/bridge/src/services/runtime-settings.ts`
- Create: `apps/bridge/src/services/event-log.ts`
- Create: `apps/bridge/src/services/command-queue.ts`

- [ ] **Step 1: Write openclaw-state service**

This reads the plugin's state JSON file and maps it to `ConversationRow[]`.

```ts
// apps/bridge/src/services/openclaw-state.ts
import fs from "node:fs/promises";
import { config } from "../config.js";
import type { ConversationRow, ConversationStatus } from "@openclaw-manager/types";

type PluginConversation = {
  status?: string;
  firstName?: string;
  senderName?: string;
  awaitingRelay?: boolean;
  lastRemoteAt?: number;
  lastRemoteContent?: string;
  lastAgentReplyAt?: number;
  lastHumanReplyAt?: number;
};

type PluginState = {
  conversations?: Record<string, PluginConversation>;
};

function parseConversationKey(key: string): { phone: string } {
  const parts = key.split(":");
  return { phone: parts.length >= 3 ? parts.slice(2).join(":") : key };
}

function toStatus(raw: string | undefined): ConversationStatus {
  if (raw === "active" || raw === "human" || raw === "waking" || raw === "cold") return raw;
  return "cold";
}

export async function readPluginState(): Promise<PluginState> {
  try {
    const raw = await fs.readFile(config.openclawStatePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return { conversations: {} };
  }
}

export async function getConversations(): Promise<ConversationRow[]> {
  const state = await readPluginState();
  if (!state.conversations) return [];
  return Object.entries(state.conversations).map(([key, conv]) => {
    const { phone } = parseConversationKey(key);
    return {
      conversationKey: key,
      phone,
      displayName: conv.senderName || conv.firstName || null,
      status: toStatus(conv.status),
      lastRemoteAt: conv.lastRemoteAt ?? null,
      lastRemoteContent: conv.lastRemoteContent ?? null,
      lastAgentReplyAt: conv.lastAgentReplyAt ?? null,
      lastHumanReplyAt: conv.lastHumanReplyAt ?? null,
      awaitingRelay: conv.awaitingRelay === true,
    };
  });
}

export async function getConversation(conversationKey: string): Promise<ConversationRow | null> {
  const all = await getConversations();
  return all.find((c) => c.conversationKey === conversationKey) ?? null;
}
```

- [ ] **Step 2: Write runtime-settings service**

```ts
// apps/bridge/src/services/runtime-settings.ts
import fs from "node:fs/promises";
import path from "node:path";
import { config } from "../config.js";
import type { RuntimeSettings } from "@openclaw-manager/types";

const DEFAULT_SETTINGS: RuntimeSettings = {
  relayTarget: "",
  delayMs: 600000,
  summaryDelayMs: 900000,
  updatedAt: Date.now(),
  updatedBy: "system",
};

export async function readSettings(): Promise<RuntimeSettings> {
  try {
    const raw = await fs.readFile(config.runtimeSettingsPath, "utf8");
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export async function writeSettings(updates: Partial<RuntimeSettings>): Promise<RuntimeSettings> {
  const current = await readSettings();
  const next: RuntimeSettings = {
    ...current,
    ...updates,
    updatedAt: Date.now(),
  };
  const tmpPath = config.runtimeSettingsPath + ".tmp";
  await fs.writeFile(tmpPath, JSON.stringify(next, null, 2) + "\n", "utf8");
  await fs.rename(tmpPath, config.runtimeSettingsPath);
  return next;
}
```

- [ ] **Step 3: Write event-log service**

```ts
// apps/bridge/src/services/event-log.ts
import fs from "node:fs/promises";
import { config } from "../config.js";
import type { ConversationEvent } from "@openclaw-manager/types";

export async function readEvents(options?: {
  conversationKey?: string;
  limit?: number;
  before?: number;
}): Promise<ConversationEvent[]> {
  let raw: string;
  try {
    raw = await fs.readFile(config.eventsPath, "utf8");
  } catch {
    return [];
  }

  const lines = raw.trim().split("\n").filter(Boolean);
  let events: ConversationEvent[] = [];
  for (const line of lines) {
    try {
      events.push(JSON.parse(line));
    } catch {
      // skip malformed lines
    }
  }

  if (options?.conversationKey) {
    events = events.filter((e) => e.conversationKey === options.conversationKey);
  }
  if (options?.before) {
    events = events.filter((e) => e.at < options.before!);
  }

  // Sort descending by timestamp
  events.sort((a, b) => b.at - a.at);

  if (options?.limit) {
    events = events.slice(0, options.limit);
  }

  return events;
}
```

- [ ] **Step 4: Write command-queue service**

```ts
// apps/bridge/src/services/command-queue.ts
import fs from "node:fs/promises";
import { config } from "../config.js";
import type { ManagementCommand } from "@openclaw-manager/types";
import crypto from "node:crypto";

export async function enqueueCommand(
  command: Omit<ManagementCommand, "id" | "at">
): Promise<ManagementCommand> {
  const full: ManagementCommand = {
    ...command,
    id: crypto.randomUUID(),
    at: Date.now(),
  };
  const line = JSON.stringify(full) + "\n";
  await fs.appendFile(config.commandsPath, line, "utf8");
  return full;
}
```

- [ ] **Step 5: Verify bridge compiles**

```bash
pnpm --filter bridge build
```

- [ ] **Step 6: Commit**

```bash
git add apps/bridge/src/services/
git commit -m "feat: add bridge services for state, settings, events, and commands"
```

---

## Task 5: Bridge — Route Handlers

**Files:**
- Create: `apps/bridge/src/routes/overview.ts`
- Create: `apps/bridge/src/routes/conversations.ts`
- Create: `apps/bridge/src/routes/messages.ts`
- Create: `apps/bridge/src/routes/settings.ts`
- Create: `apps/bridge/src/routes/commands.ts`
- Modify: `apps/bridge/src/server.ts`

- [ ] **Step 1: Write overview route**

```ts
// apps/bridge/src/routes/overview.ts
import { Router } from "express";
import { getConversations } from "../services/openclaw-state.js";
import { readSettings } from "../services/runtime-settings.js";
import type { OverviewData } from "@openclaw-manager/types";

const router = Router();

router.get("/overview", async (_req, res) => {
  try {
    const [conversations, settings] = await Promise.all([
      getConversations(),
      readSettings(),
    ]);
    const data: OverviewData = {
      totalConversations: conversations.length,
      activeCount: conversations.filter((c) => c.status === "active").length,
      humanCount: conversations.filter((c) => c.status === "human").length,
      coldCount: conversations.filter((c) => c.status === "cold").length,
      wakingCount: conversations.filter((c) => c.status === "waking").length,
      lastActivityAt: conversations.reduce((max, c) => {
        const ts = c.lastRemoteAt ?? 0;
        return ts > max ? ts : max;
      }, 0) || null,
      relayTarget: settings.relayTarget,
    };
    res.json(data);
  } catch (err) {
    res.status(503).json({ error: "Failed to read state" });
  }
});

export default router;
```

- [ ] **Step 2: Write conversations route**

```ts
// apps/bridge/src/routes/conversations.ts
import { Router } from "express";
import { getConversations, getConversation } from "../services/openclaw-state.js";

const router = Router();

router.get("/conversations", async (_req, res) => {
  try {
    const conversations = await getConversations();
    res.json(conversations);
  } catch {
    res.status(503).json({ error: "Failed to read state" });
  }
});

router.get("/conversations/:conversationKey", async (req, res) => {
  try {
    const conv = await getConversation(req.params.conversationKey);
    if (!conv) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }
    res.json(conv);
  } catch {
    res.status(503).json({ error: "Failed to read state" });
  }
});

export default router;
```

- [ ] **Step 3: Write messages route**

```ts
// apps/bridge/src/routes/messages.ts
import { Router } from "express";
import { readEvents } from "../services/event-log.js";

const router = Router();

router.get("/messages", async (req, res) => {
  try {
    const conversationKey = req.query.conversationKey as string | undefined;
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const before = req.query.before ? Number(req.query.before) : undefined;
    const events = await readEvents({ conversationKey, limit, before });
    res.json(events);
  } catch {
    res.status(503).json({ error: "Failed to read events" });
  }
});

export default router;
```

- [ ] **Step 4: Write settings route**

```ts
// apps/bridge/src/routes/settings.ts
import { Router } from "express";
import { readSettings, writeSettings } from "../services/runtime-settings.js";

const router = Router();

router.get("/settings", async (_req, res) => {
  try {
    const settings = await readSettings();
    res.json(settings);
  } catch {
    res.status(503).json({ error: "Failed to read settings" });
  }
});

router.patch("/settings", async (req, res) => {
  try {
    const { relayTarget, delayMs, summaryDelayMs, updatedBy } = req.body;
    const updates: Record<string, unknown> = {};
    if (typeof relayTarget === "string") updates.relayTarget = relayTarget;
    if (typeof delayMs === "number") updates.delayMs = delayMs;
    if (typeof summaryDelayMs === "number") updates.summaryDelayMs = summaryDelayMs;
    if (typeof updatedBy === "string") updates.updatedBy = updatedBy;
    else updates.updatedBy = "dashboard";
    const next = await writeSettings(updates);
    res.json(next);
  } catch {
    res.status(503).json({ error: "Failed to write settings" });
  }
});

export default router;
```

- [ ] **Step 5: Write commands route**

```ts
// apps/bridge/src/routes/commands.ts
import { Router } from "express";
import { enqueueCommand } from "../services/command-queue.js";
import type { CommandType } from "@openclaw-manager/types";

const router = Router();

function commandRoute(type: CommandType) {
  return async (req: any, res: any) => {
    try {
      const conversationKey = req.params.conversationKey;
      const command = await enqueueCommand({
        type,
        conversationKey,
        payload: req.body?.payload,
        issuedBy: "dashboard",
      });
      res.status(202).json(command);
    } catch {
      res.status(503).json({ error: "Failed to enqueue command" });
    }
  };
}

router.post("/conversations/:conversationKey/takeover", commandRoute("set_takeover"));
router.post("/conversations/:conversationKey/release", commandRoute("release_takeover"));
router.post("/conversations/:conversationKey/wake-now", commandRoute("wake_now"));

export default router;
```

- [ ] **Step 6: Wire all routes into server.ts**

Replace `apps/bridge/src/server.ts` with:

```ts
// apps/bridge/src/server.ts
import express from "express";
import { config } from "./config.js";
import { bearerAuth } from "./auth.js";
import overviewRouter from "./routes/overview.js";
import conversationsRouter from "./routes/conversations.js";
import messagesRouter from "./routes/messages.js";
import settingsRouter from "./routes/settings.js";
import commandsRouter from "./routes/commands.js";

const app = express();
app.use(express.json());

// Health endpoint is unauthenticated
app.get("/health", (_req, res) => {
  res.json({ ok: true, uptime: process.uptime() });
});

// All other routes require auth
app.use(bearerAuth);
app.use(overviewRouter);
app.use(conversationsRouter);
app.use(messagesRouter);
app.use(settingsRouter);
app.use(commandsRouter);

app.listen(config.port, config.host, () => {
  console.log(`Bridge listening on ${config.host}:${config.port}`);
});

export { app };
```

- [ ] **Step 7: Verify bridge compiles**

```bash
pnpm --filter bridge build
```

- [ ] **Step 8: Commit**

```bash
git add apps/bridge/
git commit -m "feat: add all bridge route handlers (overview, conversations, messages, settings, commands)"
```

---

## Task 6: Dashboard — Next.js Scaffold with Fillow Design Tokens

**Files:**
- Create: `apps/dashboard/package.json`
- Create: `apps/dashboard/next.config.ts`
- Create: `apps/dashboard/tsconfig.json`
- Create: `apps/dashboard/postcss.config.mjs`
- Create: `apps/dashboard/src/app/globals.css`
- Create: `apps/dashboard/src/app/layout.tsx`
- Create: `apps/dashboard/tailwind.config.ts`

- [ ] **Step 1: Create dashboard package.json**

```json
{
  "name": "dashboard",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "next dev --port 3000",
    "build": "next build",
    "start": "next start --port 3000"
  },
  "dependencies": {
    "@openclaw-manager/types": "workspace:*",
    "next": "^15.3.1",
    "react": "^19.1.0",
    "react-dom": "^19.1.0"
  },
  "devDependencies": {
    "@types/node": "^22.15.2",
    "@types/react": "^19.1.2",
    "@types/react-dom": "^19.1.2",
    "tailwindcss": "^4.1.4",
    "@tailwindcss/postcss": "^4.1.4",
    "typescript": "^5.8.3"
  }
}
```

- [ ] **Step 2: Create next.config.ts and tsconfig.json**

```ts
// apps/dashboard/next.config.ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
};

export default nextConfig;
```

```json
// apps/dashboard/tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "ES2022"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 3: Create PostCSS config and Tailwind config with Fillow design tokens**

```js
// apps/dashboard/postcss.config.mjs
export default {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};
```

```ts
// apps/dashboard/tailwind.config.ts
import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // Fillow design system
        primary: {
          DEFAULT: "#886CC0",
          light: "#a88fd6",
          dark: "#6a4fa0",
          hover: "#7a5fb5",
        },
        secondary: {
          DEFAULT: "#FFA7D7",
          light: "#ffbfe3",
        },
        success: {
          DEFAULT: "#09BD3C",
          light: "#d4f5dd",
        },
        warning: {
          DEFAULT: "#FFBF00",
          light: "#fff3cc",
        },
        danger: {
          DEFAULT: "#FC2E53",
          light: "#fdd9e0",
        },
        info: {
          DEFAULT: "#D653C1",
          light: "#f3d4ee",
        },
        dark: {
          DEFAULT: "#161717",
          card: "#202020",
          border: "#2B2B2B",
          lighter: "#2d2d2d",
        },
        text: {
          primary: "#ffffff",
          muted: "#828690",
          gray: "#b3b3b3",
        },
      },
      fontFamily: {
        sans: ["Roboto", "sans-serif"],
      },
      fontSize: {
        xs: "0.75rem",
        sm: "0.8125rem",
        base: "0.875rem",
        lg: "1rem",
        xl: "1.125rem",
        "2xl": "1.25rem",
        "3xl": "1.5rem",
        "4xl": "1.875rem",
        "5xl": "2.25rem",
      },
      borderRadius: {
        DEFAULT: "0.625rem",
        sm: "0.325rem",
        lg: "1rem",
        pill: "2rem",
      },
      spacing: {
        4.5: "1.125rem",
        7.5: "1.875rem",
      },
      boxShadow: {
        card: "0 5px 5px 0 rgba(82,63,105,0.05)",
        "card-dark": "0 0 0 1px rgba(255,255,255,0.1)",
        primary: "0 5px 15px 0 rgba(136,108,192,0.2)",
      },
    },
  },
  plugins: [],
};

export default config;
```

- [ ] **Step 4: Create globals.css with Fillow CSS variables**

```css
/* apps/dashboard/src/app/globals.css */
@import "tailwindcss";
@config "../../tailwind.config.ts";

@theme {
  --font-sans: "Roboto", sans-serif;
}

@layer base {
  :root {
    --card: #fff;
    --text-dark: #312a2a;
    --text-gray: #737b8b;
    --text-muted: #888888;
    --body-bg: #f3f0f9;
    --border: #e6e6e6;
    --primary: #886CC0;
    --sidebar-width: 16.5rem;
    --header-height: 4.5rem;
  }

  .dark {
    --card: #202020;
    --text-dark: #ffffff;
    --text-gray: #b3b3b3;
    --text-muted: #828690;
    --body-bg: #161717;
    --border: #2B2B2B;
  }

  body {
    font-family: "Roboto", sans-serif;
    font-size: 0.875rem;
    background-color: var(--body-bg);
    color: var(--text-dark);
  }
}
```

- [ ] **Step 5: Create root layout**

```tsx
// apps/dashboard/src/app/layout.tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "OpenClaw Manager",
  description: "WhatsApp management dashboard for OpenClaw",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="bg-dark text-text-primary antialiased">
        {children}
      </body>
    </html>
  );
}
```

- [ ] **Step 6: Install dependencies and verify**

```bash
cd "c:/Users/GalLe/Cursor projects/OpenClaw-manager"
pnpm install
pnpm --filter dashboard build
```

- [ ] **Step 7: Commit**

```bash
git add apps/dashboard/
git commit -m "feat: scaffold Next.js dashboard with Fillow design tokens and dark mode"
```

---

## Task 7: Dashboard — Auth (Session + Login Page)

**Files:**
- Create: `apps/dashboard/src/lib/session.ts`
- Create: `apps/dashboard/src/app/login/page.tsx`
- Create: `apps/dashboard/src/app/api/auth/login/route.ts`
- Create: `apps/dashboard/src/app/api/auth/logout/route.ts`
- Create: `apps/dashboard/src/middleware.ts`

- [ ] **Step 1: Write session library**

Uses signed cookies. No external deps — just `crypto` for HMAC.

```ts
// apps/dashboard/src/lib/session.ts
import { cookies } from "next/headers";
import crypto from "node:crypto";

const SESSION_COOKIE = "ocm_session";
const SECRET = process.env.SESSION_SECRET || "dev-secret-change-me-in-prod";

function sign(value: string): string {
  const hmac = crypto.createHmac("sha256", SECRET).update(value).digest("hex");
  return `${value}.${hmac}`;
}

function verify(signed: string): string | null {
  const idx = signed.lastIndexOf(".");
  if (idx === -1) return null;
  const value = signed.slice(0, idx);
  const expected = sign(value);
  if (signed !== expected) return null;
  return value;
}

export async function createSession(): Promise<void> {
  const token = sign(`admin:${Date.now()}`);
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 60 * 60 * 24 * 7, // 7 days
  });
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}

export async function isAuthenticated(): Promise<boolean> {
  const jar = await cookies();
  const cookie = jar.get(SESSION_COOKIE);
  if (!cookie?.value) return false;
  return verify(cookie.value) !== null;
}
```

- [ ] **Step 2: Write login API route**

```ts
// apps/dashboard/src/app/api/auth/login/route.ts
import { NextResponse } from "next/server";
import { createSession } from "@/lib/session";

export async function POST(request: Request) {
  const { password } = await request.json();
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminPassword || password !== adminPassword) {
    return NextResponse.json({ error: "Invalid password" }, { status: 401 });
  }

  await createSession();
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: Write logout API route**

```ts
// apps/dashboard/src/app/api/auth/logout/route.ts
import { NextResponse } from "next/server";
import { destroySession } from "@/lib/session";

export async function POST() {
  await destroySession();
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: Write middleware for auth protection**

```ts
// apps/dashboard/src/middleware.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import crypto from "node:crypto";

const SESSION_COOKIE = "ocm_session";
const SECRET = process.env.SESSION_SECRET || "dev-secret-change-me-in-prod";

function verify(signed: string): boolean {
  const idx = signed.lastIndexOf(".");
  if (idx === -1) return false;
  const value = signed.slice(0, idx);
  const hmac = crypto.createHmac("sha256", SECRET).update(value).digest("hex");
  return signed === `${value}.${hmac}`;
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow login page and auth API routes
  if (pathname === "/login" || pathname.startsWith("/api/auth/")) {
    return NextResponse.next();
  }

  const session = request.cookies.get(SESSION_COOKIE)?.value;
  if (!session || !verify(session)) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
```

- [ ] **Step 5: Write login page**

```tsx
// apps/dashboard/src/app/login/page.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        setError("Invalid password");
        return;
      }
      router.push("/");
      router.refresh();
    } catch {
      setError("Connection failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-dark">
      <div className="w-full max-w-sm">
        {/* Purple gradient accent bar */}
        <div className="h-1 rounded-t bg-gradient-to-r from-primary to-[#AA6CC0]" />
        <div className="rounded-b bg-dark-card p-8 shadow-card-dark">
          <h1 className="mb-2 text-2xl font-semibold tracking-tight text-text-primary">
            OpenClaw Manager
          </h1>
          <p className="mb-8 text-sm text-text-muted">
            Sign in to manage your WhatsApp bot
          </p>
          <form onSubmit={handleSubmit}>
            <label className="mb-2 block text-sm text-text-gray" htmlFor="password">
              Admin Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mb-4 block w-full rounded border border-dark-border bg-dark px-5 py-3 text-base text-text-primary placeholder-text-muted outline-none transition focus:border-primary"
              placeholder="Enter password"
              autoFocus
            />
            {error && (
              <p className="mb-4 text-sm text-danger">{error}</p>
            )}
            <button
              type="submit"
              disabled={loading || !password}
              className="w-full rounded-pill bg-primary py-3 px-6 font-medium text-white transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? (
                <span className="inline-flex items-center gap-2">
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                  </svg>
                  Signing in...
                </span>
              ) : (
                "Sign In"
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Commit**

```bash
git add apps/dashboard/src/
git commit -m "feat: add dashboard auth with signed cookie sessions and login page"
```

---

## Task 8: Dashboard — Bridge Client Library

**Files:**
- Create: `apps/dashboard/src/lib/bridge-client.ts`
- Create: `apps/dashboard/src/lib/format.ts`

- [ ] **Step 1: Write bridge client (server-side only)**

```ts
// apps/dashboard/src/lib/bridge-client.ts
import type {
  OverviewData,
  ConversationRow,
  ConversationEvent,
  RuntimeSettings,
  ManagementCommand,
} from "@openclaw-manager/types";

const BRIDGE_URL = process.env.OPENCLAW_BRIDGE_URL || "http://localhost:3100";
const BRIDGE_TOKEN = process.env.OPENCLAW_BRIDGE_TOKEN || "";

async function bridgeFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const url = `${BRIDGE_URL}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${BRIDGE_TOKEN}`,
      ...options?.headers,
    },
    next: { revalidate: 0 },
  });

  if (!res.ok) {
    throw new Error(`Bridge ${res.status}: ${await res.text()}`);
  }

  return res.json();
}

export async function getOverview(): Promise<OverviewData> {
  return bridgeFetch<OverviewData>("/overview");
}

export async function getConversations(): Promise<ConversationRow[]> {
  return bridgeFetch<ConversationRow[]>("/conversations");
}

export async function getConversation(key: string): Promise<ConversationRow | null> {
  try {
    return await bridgeFetch<ConversationRow>(`/conversations/${encodeURIComponent(key)}`);
  } catch {
    return null;
  }
}

export async function getMessages(
  conversationKey: string,
  limit = 50,
  before?: number
): Promise<ConversationEvent[]> {
  const params = new URLSearchParams({ conversationKey, limit: String(limit) });
  if (before) params.set("before", String(before));
  return bridgeFetch<ConversationEvent[]>(`/messages?${params}`);
}

export async function getSettings(): Promise<RuntimeSettings> {
  return bridgeFetch<RuntimeSettings>("/settings");
}

export async function updateSettings(
  updates: Partial<RuntimeSettings>
): Promise<RuntimeSettings> {
  return bridgeFetch<RuntimeSettings>("/settings", {
    method: "PATCH",
    body: JSON.stringify(updates),
  });
}

export async function sendTakeover(conversationKey: string): Promise<ManagementCommand> {
  return bridgeFetch<ManagementCommand>(
    `/conversations/${encodeURIComponent(conversationKey)}/takeover`,
    { method: "POST" }
  );
}

export async function sendRelease(conversationKey: string): Promise<ManagementCommand> {
  return bridgeFetch<ManagementCommand>(
    `/conversations/${encodeURIComponent(conversationKey)}/release`,
    { method: "POST" }
  );
}

export async function sendWakeNow(conversationKey: string): Promise<ManagementCommand> {
  return bridgeFetch<ManagementCommand>(
    `/conversations/${encodeURIComponent(conversationKey)}/wake-now`,
    { method: "POST" }
  );
}
```

- [ ] **Step 2: Write format utilities**

```ts
// apps/dashboard/src/lib/format.ts
export function timeAgo(timestamp: number | null): string {
  if (!timestamp) return "Never";
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return "Just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function formatTimestamp(timestamp: number): string {
  return new Date(timestamp).toLocaleString("en-IL", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function msToMinutes(ms: number): number {
  return Math.round(ms / 60000);
}

export function minutesToMs(minutes: number): number {
  return minutes * 60000;
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/dashboard/src/lib/
git commit -m "feat: add bridge client library and format utilities"
```

---

## Task 9: Dashboard — App Shell (Sidebar + Header + Degraded Banner)

**Files:**
- Create: `apps/dashboard/src/components/app-shell.tsx`
- Create: `apps/dashboard/src/components/sidebar.tsx`
- Create: `apps/dashboard/src/components/header.tsx`
- Create: `apps/dashboard/src/components/degraded-banner.tsx`
- Create: `apps/dashboard/src/components/status-badge.tsx`

- [ ] **Step 1: Write status badge component**

```tsx
// apps/dashboard/src/components/status-badge.tsx
import type { ConversationStatus } from "@openclaw-manager/types";

const STATUS_STYLES: Record<ConversationStatus, string> = {
  active: "bg-success/10 text-success border-success/20",
  human: "bg-danger/10 text-danger border-danger/20",
  waking: "bg-warning/10 text-warning border-warning/20",
  cold: "bg-text-muted/10 text-text-muted border-text-muted/20",
};

const STATUS_LABELS: Record<ConversationStatus, string> = {
  active: "Active",
  human: "Human",
  waking: "Waking",
  cold: "Cold",
};

export function StatusBadge({ status }: { status: ConversationStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-pill border px-3 py-0.5 text-xs font-medium ${STATUS_STYLES[status]}`}
    >
      <span
        className={`mr-1.5 inline-block h-1.5 w-1.5 rounded-full ${
          status === "active"
            ? "bg-success"
            : status === "human"
              ? "bg-danger"
              : status === "waking"
                ? "bg-warning"
                : "bg-text-muted"
        }`}
      />
      {STATUS_LABELS[status]}
    </span>
  );
}
```

- [ ] **Step 2: Write sidebar component**

```tsx
// apps/dashboard/src/components/sidebar.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/", label: "Overview", icon: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1" },
  { href: "/conversations", label: "Conversations", icon: "M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" },
  { href: "/settings", label: "Settings", icon: "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z" },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed left-0 top-0 z-10 flex h-full w-[var(--sidebar-width)] flex-col border-r border-dark-border bg-dark-card">
      {/* Logo */}
      <div className="flex h-[var(--header-height)] items-center px-6">
        <span className="text-xl font-semibold tracking-tight text-primary">
          OpenClaw
        </span>
      </div>

      {/* Navigation */}
      <nav className="mt-4 flex-1 space-y-1 px-3">
        {NAV_ITEMS.map((item) => {
          const isActive =
            item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded px-4 py-3 text-sm transition ${
                isActive
                  ? "bg-primary/10 text-primary"
                  : "text-text-gray hover:bg-dark-lighter hover:text-text-primary"
              }`}
            >
              <svg
                className="h-5 w-5 shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
              </svg>
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="border-t border-dark-border px-6 py-4">
        <p className="text-xs text-text-muted">WhatsApp Manager v1.0</p>
      </div>
    </aside>
  );
}
```

- [ ] **Step 3: Write header component**

```tsx
// apps/dashboard/src/components/header.tsx
"use client";

import { useRouter } from "next/navigation";

export function Header({ title }: { title: string }) {
  const router = useRouter();

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  };

  return (
    <header className="sticky top-0 z-5 flex h-[var(--header-height)] items-center justify-between border-b border-dark-border bg-dark-card/80 px-8 backdrop-blur">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <button
        onClick={handleLogout}
        className="rounded px-4 py-2 text-sm text-text-muted transition hover:bg-dark-lighter hover:text-text-primary"
      >
        Logout
      </button>
    </header>
  );
}
```

- [ ] **Step 4: Write degraded banner**

```tsx
// apps/dashboard/src/components/degraded-banner.tsx
export function DegradedBanner() {
  return (
    <div className="rounded border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">
      <span className="mr-2 font-medium">Bridge connection lost</span>
      <span className="text-warning/80">— data may be stale</span>
    </div>
  );
}
```

- [ ] **Step 5: Write app shell that composes sidebar + header + content**

```tsx
// apps/dashboard/src/components/app-shell.tsx
import { Sidebar } from "./sidebar";
import { Header } from "./header";

export function AppShell({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen">
      <Sidebar />
      <div className="ml-[var(--sidebar-width)]">
        <Header title={title} />
        <main className="p-8">{children}</main>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Commit**

```bash
git add apps/dashboard/src/components/
git commit -m "feat: add app shell with sidebar, header, status badge, and degraded banner"
```

---

## Task 10: Dashboard — Overview Page

**Files:**
- Create: `apps/dashboard/src/components/overview-cards.tsx`
- Create: `apps/dashboard/src/app/page.tsx`

- [ ] **Step 1: Write overview cards component**

```tsx
// apps/dashboard/src/components/overview-cards.tsx
import type { OverviewData } from "@openclaw-manager/types";
import { timeAgo } from "@/lib/format";

type StatCardProps = {
  label: string;
  value: number;
  subtitle?: string;
  color: string;
  dotColor: string;
};

function StatCard({ label, value, subtitle, color, dotColor }: StatCardProps) {
  return (
    <div className="rounded bg-dark-card p-6 shadow-card-dark">
      <div className="flex items-center gap-3">
        <span className={`inline-block h-3 w-3 rounded-full ${dotColor}`} />
        <span className="text-sm text-text-gray">{label}</span>
      </div>
      <p className={`mt-3 text-4xl font-semibold tracking-tight ${color}`}>{value}</p>
      {subtitle && <p className="mt-1 text-xs text-text-muted">{subtitle}</p>}
    </div>
  );
}

export function OverviewCards({ data }: { data: OverviewData }) {
  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard
        label="Total Conversations"
        value={data.totalConversations}
        color="text-text-primary"
        dotColor="bg-primary"
      />
      <StatCard
        label="Active"
        value={data.activeCount}
        subtitle={data.wakingCount > 0 ? `${data.wakingCount} waking` : undefined}
        color="text-success"
        dotColor="bg-success"
      />
      <StatCard
        label="Human Takeover"
        value={data.humanCount}
        color="text-danger"
        dotColor="bg-danger"
      />
      <StatCard
        label="Cold"
        value={data.coldCount}
        color="text-text-muted"
        dotColor="bg-text-muted"
      />
    </div>
  );
}

export function OverviewMeta({ data }: { data: OverviewData }) {
  return (
    <div className="mt-6 flex flex-wrap items-center gap-6 rounded bg-dark-card p-6 shadow-card-dark">
      <div>
        <span className="text-xs text-text-muted">Last Activity</span>
        <p className="text-sm text-text-primary">{timeAgo(data.lastActivityAt)}</p>
      </div>
      <div className="h-8 w-px bg-dark-border" />
      <div>
        <span className="text-xs text-text-muted">Relay Target</span>
        <p className="text-sm text-text-primary">
          {data.relayTarget || <span className="text-text-muted">Not set</span>}
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Write overview page**

```tsx
// apps/dashboard/src/app/page.tsx
import { AppShell } from "@/components/app-shell";
import { OverviewCards, OverviewMeta } from "@/components/overview-cards";
import { DegradedBanner } from "@/components/degraded-banner";
import { getOverview } from "@/lib/bridge-client";
import type { OverviewData } from "@openclaw-manager/types";

export const dynamic = "force-dynamic";

export default async function OverviewPage() {
  let data: OverviewData | null = null;
  let bridgeError = false;

  try {
    data = await getOverview();
  } catch {
    bridgeError = true;
  }

  return (
    <AppShell title="Overview">
      {bridgeError && <DegradedBanner />}
      {data ? (
        <>
          <OverviewCards data={data} />
          <OverviewMeta data={data} />
        </>
      ) : (
        !bridgeError && <p className="text-text-muted">Loading...</p>
      )}
    </AppShell>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/dashboard/src/
git commit -m "feat: add overview page with stat cards and last activity"
```

---

## Task 11: Dashboard — Conversations List Page

**Files:**
- Create: `apps/dashboard/src/components/conversation-table.tsx`
- Create: `apps/dashboard/src/app/conversations/page.tsx`

- [ ] **Step 1: Write conversation table component**

```tsx
// apps/dashboard/src/components/conversation-table.tsx
"use client";

import Link from "next/link";
import type { ConversationRow } from "@openclaw-manager/types";
import { StatusBadge } from "./status-badge";
import { timeAgo } from "@/lib/format";

export function ConversationTable({ conversations }: { conversations: ConversationRow[] }) {
  if (conversations.length === 0) {
    return (
      <div className="rounded bg-dark-card p-12 text-center shadow-card-dark">
        <p className="text-text-muted">No conversations yet</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded bg-dark-card shadow-card-dark">
      <table className="w-full">
        <thead>
          <tr className="border-b border-dark-border text-left text-xs font-medium uppercase tracking-wider text-text-muted">
            <th className="px-6 py-4">Contact</th>
            <th className="px-6 py-4">Phone</th>
            <th className="px-6 py-4">Status</th>
            <th className="px-6 py-4">Last Message</th>
            <th className="px-6 py-4">Last Reply</th>
          </tr>
        </thead>
        <tbody>
          {conversations.map((conv) => (
            <tr
              key={conv.conversationKey}
              className="border-b border-dark-border/50 transition hover:bg-dark-lighter"
            >
              <td className="px-6 py-4">
                <Link
                  href={`/conversations/${encodeURIComponent(conv.conversationKey)}`}
                  className="font-medium text-text-primary hover:text-primary"
                >
                  {conv.displayName || "Unknown"}
                </Link>
              </td>
              <td className="px-6 py-4 text-sm text-text-gray">{conv.phone}</td>
              <td className="px-6 py-4">
                <StatusBadge status={conv.status} />
              </td>
              <td className="px-6 py-4 text-sm text-text-muted">
                {timeAgo(conv.lastRemoteAt)}
              </td>
              <td className="px-6 py-4 text-sm text-text-muted">
                {timeAgo(conv.lastAgentReplyAt)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 2: Write conversations list page**

```tsx
// apps/dashboard/src/app/conversations/page.tsx
import { AppShell } from "@/components/app-shell";
import { ConversationTable } from "@/components/conversation-table";
import { DegradedBanner } from "@/components/degraded-banner";
import { getConversations } from "@/lib/bridge-client";
import type { ConversationRow } from "@openclaw-manager/types";

export const dynamic = "force-dynamic";

export default async function ConversationsPage() {
  let conversations: ConversationRow[] = [];
  let bridgeError = false;

  try {
    conversations = await getConversations();
  } catch {
    bridgeError = true;
  }

  return (
    <AppShell title="Conversations">
      {bridgeError && <DegradedBanner />}
      <ConversationTable conversations={conversations} />
    </AppShell>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/dashboard/src/
git commit -m "feat: add conversations list page with table and status badges"
```

---

## Task 12: Dashboard — Conversation Detail Page

**Files:**
- Create: `apps/dashboard/src/components/message-timeline.tsx`
- Create: `apps/dashboard/src/components/takeover-controls.tsx`
- Create: `apps/dashboard/src/app/conversations/[conversationKey]/page.tsx`
- Create: `apps/dashboard/src/app/api/conversations/[conversationKey]/takeover/route.ts`
- Create: `apps/dashboard/src/app/api/conversations/[conversationKey]/release/route.ts`
- Create: `apps/dashboard/src/app/api/conversations/[conversationKey]/wake-now/route.ts`

- [ ] **Step 1: Write message timeline component**

```tsx
// apps/dashboard/src/components/message-timeline.tsx
import type { ConversationEvent } from "@openclaw-manager/types";
import { formatTimestamp } from "@/lib/format";

function EventBubble({ event }: { event: ConversationEvent }) {
  const isInbound = event.type === "message_in";
  const isOutbound = event.type === "message_out";
  const isSystem = !isInbound && !isOutbound;

  if (isSystem) {
    return (
      <div className="flex justify-center py-2">
        <span className="rounded-pill bg-dark-lighter px-4 py-1 text-xs text-text-muted">
          {event.type.replace(/_/g, " ")}
          {event.text ? `: ${event.text}` : ""}
          <span className="ml-2 opacity-60">{formatTimestamp(event.at)}</span>
        </span>
      </div>
    );
  }

  return (
    <div className={`flex ${isInbound ? "justify-start" : "justify-end"} mb-3`}>
      <div
        className={`max-w-[70%] rounded-lg px-4 py-3 ${
          isInbound
            ? "bg-dark-lighter text-text-primary"
            : "bg-primary/20 text-text-primary"
        }`}
      >
        {event.displayName && (
          <p className={`mb-1 text-xs font-medium ${isInbound ? "text-primary" : "text-primary-light"}`}>
            {event.displayName}
          </p>
        )}
        <p className="text-sm leading-relaxed whitespace-pre-wrap">{event.text}</p>
        <p className="mt-1 text-right text-xs text-text-muted">{formatTimestamp(event.at)}</p>
      </div>
    </div>
  );
}

export function MessageTimeline({ events }: { events: ConversationEvent[] }) {
  if (events.length === 0) {
    return (
      <div className="py-12 text-center text-text-muted">
        No messages recorded yet
      </div>
    );
  }

  // Events come sorted desc, reverse for chronological display
  const chronological = [...events].reverse();

  return (
    <div className="space-y-1 py-4">
      {chronological.map((event) => (
        <EventBubble key={event.id} event={event} />
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Write takeover controls component**

```tsx
// apps/dashboard/src/components/takeover-controls.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ConversationStatus } from "@openclaw-manager/types";

function Spinner() {
  return (
    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
}

export function TakeoverControls({
  conversationKey,
  status,
}: {
  conversationKey: string;
  status: ConversationStatus;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);

  const handleAction = async (action: "takeover" | "release" | "wake-now") => {
    setLoading(action);
    try {
      await fetch(`/api/conversations/${encodeURIComponent(conversationKey)}/${action}`, {
        method: "POST",
      });
      router.refresh();
    } catch {
      // Silently fail — user sees stale state
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="flex flex-wrap gap-3">
      {status !== "human" && (
        <button
          onClick={() => handleAction("takeover")}
          disabled={loading !== null}
          className="inline-flex items-center gap-2 rounded bg-danger py-2.5 px-5 text-sm font-medium text-white transition hover:bg-danger/80 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading === "takeover" && <Spinner />}
          Enable Takeover
        </button>
      )}
      {status === "human" && (
        <button
          onClick={() => handleAction("release")}
          disabled={loading !== null}
          className="inline-flex items-center gap-2 rounded bg-success py-2.5 px-5 text-sm font-medium text-white transition hover:bg-success/80 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading === "release" && <Spinner />}
          Release Takeover
        </button>
      )}
      {(status === "cold" || status === "waking") && (
        <button
          onClick={() => handleAction("wake-now")}
          disabled={loading !== null}
          className="inline-flex items-center gap-2 rounded bg-primary py-2.5 px-5 text-sm font-medium text-white transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading === "wake-now" && <Spinner />}
          Wake Now
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Write API route handlers for conversation actions**

```ts
// apps/dashboard/src/app/api/conversations/[conversationKey]/takeover/route.ts
import { NextResponse } from "next/server";
import { sendTakeover } from "@/lib/bridge-client";

export async function POST(_req: Request, { params }: { params: Promise<{ conversationKey: string }> }) {
  try {
    const { conversationKey } = await params;
    const result = await sendTakeover(conversationKey);
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "Bridge unreachable" }, { status: 503 });
  }
}
```

```ts
// apps/dashboard/src/app/api/conversations/[conversationKey]/release/route.ts
import { NextResponse } from "next/server";
import { sendRelease } from "@/lib/bridge-client";

export async function POST(_req: Request, { params }: { params: Promise<{ conversationKey: string }> }) {
  try {
    const { conversationKey } = await params;
    const result = await sendRelease(conversationKey);
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "Bridge unreachable" }, { status: 503 });
  }
}
```

```ts
// apps/dashboard/src/app/api/conversations/[conversationKey]/wake-now/route.ts
import { NextResponse } from "next/server";
import { sendWakeNow } from "@/lib/bridge-client";

export async function POST(_req: Request, { params }: { params: Promise<{ conversationKey: string }> }) {
  try {
    const { conversationKey } = await params;
    const result = await sendWakeNow(conversationKey);
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "Bridge unreachable" }, { status: 503 });
  }
}
```

- [ ] **Step 4: Write conversation detail page**

```tsx
// apps/dashboard/src/app/conversations/[conversationKey]/page.tsx
import { AppShell } from "@/components/app-shell";
import { StatusBadge } from "@/components/status-badge";
import { MessageTimeline } from "@/components/message-timeline";
import { TakeoverControls } from "@/components/takeover-controls";
import { DegradedBanner } from "@/components/degraded-banner";
import { getConversation, getMessages } from "@/lib/bridge-client";
import { timeAgo } from "@/lib/format";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function ConversationDetailPage({
  params,
}: {
  params: Promise<{ conversationKey: string }>;
}) {
  const { conversationKey } = await params;
  const decodedKey = decodeURIComponent(conversationKey);
  let conversation = null;
  let events: any[] = [];
  let bridgeError = false;

  try {
    [conversation, events] = await Promise.all([
      getConversation(decodedKey),
      getMessages(decodedKey),
    ]);
  } catch {
    bridgeError = true;
  }

  if (!conversation && !bridgeError) {
    return (
      <AppShell title="Conversation">
        <div className="rounded bg-dark-card p-12 text-center shadow-card-dark">
          <p className="text-text-muted">Conversation not found</p>
          <Link href="/conversations" className="mt-4 inline-block text-primary hover:underline">
            Back to conversations
          </Link>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title={conversation?.displayName || conversation?.phone || "Conversation"}>
      {bridgeError && <DegradedBanner />}
      {conversation && (
        <>
          {/* Info bar */}
          <div className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded bg-dark-card p-6 shadow-card-dark">
            <div className="flex items-center gap-4">
              <div>
                <p className="text-lg font-medium">{conversation.displayName || "Unknown"}</p>
                <p className="text-sm text-text-muted">{conversation.phone}</p>
              </div>
              <StatusBadge status={conversation.status} />
            </div>
            <div className="flex items-center gap-6 text-sm text-text-muted">
              <span>Last message: {timeAgo(conversation.lastRemoteAt)}</span>
              <span>Last reply: {timeAgo(conversation.lastAgentReplyAt)}</span>
            </div>
          </div>

          {/* Actions */}
          <div className="mb-6">
            <TakeoverControls
              conversationKey={decodedKey}
              status={conversation.status}
            />
          </div>

          {/* Messages */}
          <div className="rounded bg-dark-card p-6 shadow-card-dark">
            <h2 className="mb-4 text-lg font-semibold">Messages</h2>
            <MessageTimeline events={events} />
          </div>
        </>
      )}
    </AppShell>
  );
}
```

- [ ] **Step 5: Commit**

```bash
git add apps/dashboard/src/
git commit -m "feat: add conversation detail page with message timeline and takeover controls"
```

---

## Task 13: Dashboard — Settings Page

**Files:**
- Create: `apps/dashboard/src/components/settings-form.tsx`
- Create: `apps/dashboard/src/app/settings/page.tsx`
- Create: `apps/dashboard/src/app/api/settings/route.ts`

- [ ] **Step 1: Write settings form component**

```tsx
// apps/dashboard/src/components/settings-form.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { RuntimeSettings } from "@openclaw-manager/types";
import { msToMinutes, minutesToMs, formatTimestamp } from "@/lib/format";

export function SettingsForm({ settings }: { settings: RuntimeSettings }) {
  const router = useRouter();
  const [relayTarget, setRelayTarget] = useState(settings.relayTarget);
  const [delayMin, setDelayMin] = useState(String(msToMinutes(settings.delayMs)));
  const [summaryDelayMin, setSummaryDelayMin] = useState(String(msToMinutes(settings.summaryDelayMs)));
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setSaved(false);
    try {
      await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          relayTarget,
          delayMs: minutesToMs(Number(delayMin) || 0),
          summaryDelayMs: minutesToMs(Number(summaryDelayMin) || 0),
        }),
      });
      setSaved(true);
      router.refresh();
      setTimeout(() => setSaved(false), 3000);
    } catch {
      // handled by page-level error
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <label className="mb-2 block text-sm text-text-gray" htmlFor="relayTarget">
          Relay Target (phone number)
        </label>
        <input
          id="relayTarget"
          type="text"
          value={relayTarget}
          onChange={(e) => setRelayTarget(e.target.value)}
          className="block w-full rounded border border-dark-border bg-dark px-5 py-3 text-base text-text-primary placeholder-text-muted outline-none transition focus:border-primary"
          placeholder="+972..."
        />
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <div>
          <label className="mb-2 block text-sm text-text-gray" htmlFor="delayMin">
            Cold Start Delay (minutes)
          </label>
          <input
            id="delayMin"
            type="number"
            min="0"
            value={delayMin}
            onChange={(e) => setDelayMin(e.target.value)}
            className="block w-full rounded border border-dark-border bg-dark px-5 py-3 text-base text-text-primary outline-none transition focus:border-primary"
          />
        </div>
        <div>
          <label className="mb-2 block text-sm text-text-gray" htmlFor="summaryDelayMin">
            Summary Delay (minutes)
          </label>
          <input
            id="summaryDelayMin"
            type="number"
            min="0"
            value={summaryDelayMin}
            onChange={(e) => setSummaryDelayMin(e.target.value)}
            className="block w-full rounded border border-dark-border bg-dark px-5 py-3 text-base text-text-primary outline-none transition focus:border-primary"
          />
        </div>
      </div>

      <div className="flex items-center gap-4">
        <button
          type="submit"
          disabled={loading}
          className="inline-flex items-center gap-2 rounded bg-primary py-3 px-6 font-medium text-white transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading && (
            <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
            </svg>
          )}
          Save Settings
        </button>
        {saved && <span className="text-sm text-success">Saved!</span>}
      </div>

      <p className="text-xs text-text-muted">
        Last updated: {formatTimestamp(settings.updatedAt)} by {settings.updatedBy}
      </p>
    </form>
  );
}
```

- [ ] **Step 2: Write settings API proxy route**

```ts
// apps/dashboard/src/app/api/settings/route.ts
import { NextResponse } from "next/server";
import { updateSettings } from "@/lib/bridge-client";

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const result = await updateSettings(body);
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "Bridge unreachable" }, { status: 503 });
  }
}
```

- [ ] **Step 3: Write settings page**

```tsx
// apps/dashboard/src/app/settings/page.tsx
import { AppShell } from "@/components/app-shell";
import { SettingsForm } from "@/components/settings-form";
import { DegradedBanner } from "@/components/degraded-banner";
import { getSettings } from "@/lib/bridge-client";
import type { RuntimeSettings } from "@openclaw-manager/types";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  let settings: RuntimeSettings | null = null;
  let bridgeError = false;

  try {
    settings = await getSettings();
  } catch {
    bridgeError = true;
  }

  return (
    <AppShell title="Settings">
      {bridgeError && <DegradedBanner />}
      {settings ? (
        <div className="max-w-2xl rounded bg-dark-card p-8 shadow-card-dark">
          <h2 className="mb-6 text-lg font-semibold">Runtime Settings</h2>
          <SettingsForm settings={settings} />
        </div>
      ) : (
        !bridgeError && <p className="text-text-muted">Loading settings...</p>
      )}
    </AppShell>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add apps/dashboard/src/
git commit -m "feat: add settings page with relay target, cold delay, and summary delay controls"
```

---

## Task 14: Plugin Extensions — Management Mode

**Files:**
- Modify: `C:\Users\GalLe\.openclaw\workspace\.openclaw\extensions\whatsapp-auto-reply\index.js`
- Create: `openclaw-plugin/management/` (template directory with empty files)

- [ ] **Step 1: Create management directory templates**

Create `openclaw-plugin/management/` with starter files:

```json
// openclaw-plugin/management/runtime-settings.json
{
  "relayTarget": "",
  "delayMs": 600000,
  "summaryDelayMs": 900000,
  "updatedAt": 0,
  "updatedBy": "system"
}
```

```
// openclaw-plugin/management/events.jsonl
(empty file)
```

```
// openclaw-plugin/management/commands.jsonl
(empty file)
```

- [ ] **Step 2: Add management constants and helpers to plugin**

Insert after the existing constants (after line 15 `const STATE_FILE_NAME = ...`):

```js
const MANAGEMENT_DIR_NAME = "management";
const RUNTIME_SETTINGS_FILE = "runtime-settings.json";
const EVENTS_FILE = "events.jsonl";
const COMMANDS_FILE = "commands.jsonl";
const COMMAND_POLL_INTERVAL_MS = 2000;

function generateId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function resolveManagementDir(api) {
  const rootDir = toText(api.rootDir) || api.resolvePath(".");
  return path.join(rootDir, MANAGEMENT_DIR_NAME);
}
```

- [ ] **Step 3: Add management bootstrap, event emitting, settings reading, and command polling inside the `register(api)` function**

Insert after `let state = createStateShape();` (line 468) and before `const persistState`:

```js
    // === Management ===
    const mgmtDir = resolveManagementDir(api);
    const mgmtSettingsPath = path.join(mgmtDir, RUNTIME_SETTINGS_FILE);
    const mgmtEventsPath = path.join(mgmtDir, EVENTS_FILE);
    const mgmtCommandsPath = path.join(mgmtDir, COMMANDS_FILE);
    let lastCommandOffset = 0;
    let mgmtReady = false;

    const bootstrapManagement = async () => {
      try {
        await fs.mkdir(mgmtDir, { recursive: true });
        try {
          await fs.access(mgmtSettingsPath);
        } catch {
          const initial = {
            relayTarget: relayTarget || "",
            delayMs,
            summaryDelayMs,
            updatedAt: Date.now(),
            updatedBy: "bootstrap",
          };
          await fs.writeFile(mgmtSettingsPath, JSON.stringify(initial, null, 2) + "\n", "utf8");
        }
        // Ensure events and commands files exist
        for (const f of [mgmtEventsPath, mgmtCommandsPath]) {
          try { await fs.access(f); } catch { await fs.writeFile(f, "", "utf8"); }
        }
        // Set command offset to end of file so we don't replay old commands
        try {
          const content = await fs.readFile(mgmtCommandsPath, "utf8");
          lastCommandOffset = content.split("\n").filter(Boolean).length;
        } catch { lastCommandOffset = 0; }
        mgmtReady = true;
        api.logger.info("whatsapp-auto-reply: management bootstrap complete");
      } catch (err) {
        api.logger.warn(`whatsapp-auto-reply: management bootstrap failed: ${String(err)}`);
      }
    };

    const emitEvent = async (event) => {
      if (!mgmtReady) return;
      try {
        const line = JSON.stringify({ id: generateId(), ...event, at: Date.now() }) + "\n";
        await fs.appendFile(mgmtEventsPath, line, "utf8");
      } catch (err) {
        api.logger.warn(`whatsapp-auto-reply: failed to emit event: ${String(err)}`);
      }
    };

    const readRuntimeSettings = async () => {
      if (!mgmtReady) return null;
      try {
        const raw = await fs.readFile(mgmtSettingsPath, "utf8");
        return JSON.parse(raw);
      } catch {
        return null;
      }
    };

    const getRuntimeDelayMs = async () => {
      const settings = await readRuntimeSettings();
      return settings?.delayMs ?? delayMs;
    };

    const getRuntimeSummaryDelayMs = async () => {
      const settings = await readRuntimeSettings();
      return settings?.summaryDelayMs ?? summaryDelayMs;
    };

    const getRuntimeRelayTarget = async () => {
      const settings = await readRuntimeSettings();
      return settings?.relayTarget ?? relayTarget;
    };

    const pollCommands = async () => {
      if (!mgmtReady) return;
      try {
        const content = await fs.readFile(mgmtCommandsPath, "utf8");
        const lines = content.split("\n").filter(Boolean);
        const newLines = lines.slice(lastCommandOffset);
        for (const line of newLines) {
          lastCommandOffset++;
          try {
            const cmd = JSON.parse(line);
            await executeCommand(cmd);
          } catch (err) {
            api.logger.warn(`whatsapp-auto-reply: failed to parse command: ${String(err)}`);
          }
        }
      } catch (err) {
        api.logger.warn(`whatsapp-auto-reply: failed to poll commands: ${String(err)}`);
      }
    };

    const executeCommand = async (cmd) => {
      const type = cmd?.type;
      const conversationKey = toText(cmd?.conversationKey);
      try {
        switch (type) {
          case "set_takeover": {
            if (!conversationKey) throw new Error("missing conversationKey");
            const thread = await getConversationState(conversationKey);
            if (!thread) throw new Error("thread not found");
            const now = Date.now();
            await setConversationState(conversationKey, {
              ...thread,
              status: "human",
              awaitingRelay: false,
              summaryStartedAt: void 0,
              summaryDueAt: void 0,
              summarySentAt: now,
              lastHumanReplyAt: now,
              updatedAt: now,
            });
            await emitEvent({ type: "takeover_enabled", conversationKey, actor: "human_admin" });
            api.logger.info(`whatsapp-auto-reply: management set_takeover for ${conversationKey}`);
            break;
          }
          case "release_takeover": {
            if (!conversationKey) throw new Error("missing conversationKey");
            const thread = await getConversationState(conversationKey);
            if (!thread) throw new Error("thread not found");
            const now = Date.now();
            await setConversationState(conversationKey, {
              ...thread,
              status: "active",
              lastHumanReplyAt: void 0,
              updatedAt: now,
            });
            await emitEvent({ type: "takeover_released", conversationKey, actor: "human_admin" });
            api.logger.info(`whatsapp-auto-reply: management release_takeover for ${conversationKey}`);
            break;
          }
          case "wake_now": {
            if (!conversationKey) throw new Error("missing conversationKey");
            const result = await requestImmediateWake(conversationKey);
            await emitEvent({ type: "wake_requested", conversationKey, actor: "human_admin", meta: result });
            api.logger.info(`whatsapp-auto-reply: management wake_now for ${conversationKey} -> ${result.reason}`);
            break;
          }
          case "update_runtime_settings": {
            const payload = cmd?.payload || {};
            const current = (await readRuntimeSettings()) || {};
            const next = { ...current, ...payload, updatedAt: Date.now(), updatedBy: "dashboard" };
            const tmpPath = mgmtSettingsPath + ".tmp";
            await fs.writeFile(tmpPath, JSON.stringify(next, null, 2) + "\n", "utf8");
            await fs.rename(tmpPath, mgmtSettingsPath);
            await emitEvent({ type: "settings_updated", actor: "human_admin", meta: payload });
            api.logger.info(`whatsapp-auto-reply: management update_runtime_settings`);
            break;
          }
          default:
            throw new Error(`unknown command type: ${type}`);
        }
      } catch (err) {
        await emitEvent({
          type: "command_failed",
          conversationKey: conversationKey || null,
          actor: "system",
          text: String(err),
          meta: { commandType: type, commandId: cmd?.id },
        });
        api.logger.warn(`whatsapp-auto-reply: command failed (${type}): ${String(err)}`);
      }
    };

    // Start command polling interval
    let commandPollTimer;
```

- [ ] **Step 4: Add event emissions to existing hooks**

In the `message_received` handler, after the inbound message state updates, add event emissions:

After `await setConversationState(conversationKey, nextState);` for non-fromMe inbound messages (the cold/new message path at ~line 952):
```js
      await emitEvent({
        type: "message_in",
        conversationKey,
        phone: peerId,
        displayName: firstName || thread?.firstName || null,
        text: remoteText || null,
        actor: "user",
      });
```

After `await setConversationState(conversationKey, nextState);` for the active thread path (~line 936):
```js
      await emitEvent({
        type: "message_in",
        conversationKey,
        phone: peerId,
        displayName: firstName || thread?.firstName || null,
        text: remoteText || null,
        actor: "user",
      });
```

In `message_sent` handler, after marking active (~line 1164):
```js
      await emitEvent({
        type: "message_out",
        conversationKey,
        phone: peerId,
        text: event.content || null,
        actor: "bot",
      });
```

In `fireSummaryRelay`, after successful send (~line 674):
```js
        await emitEvent({
          type: "summary_sent",
          conversationKey: normalizedConversationKey,
          phone: relayTarget,
          text: summaryText,
          actor: "bot",
          meta: { destination: relayTarget },
        });
```

In the `fromMe` handler that enables human takeover (~line 891):
```js
        await emitEvent({
          type: "takeover_enabled",
          conversationKey,
          phone: peerId,
          actor: "human_admin",
        });
```

- [ ] **Step 5: Start management polling in bootstrap**

At the end of the existing `bootstrap` function (after line 814 `api.logger.info(...)`), add:

```js
      await bootstrapManagement();
      commandPollTimer = setInterval(() => void pollCommands(), COMMAND_POLL_INTERVAL_MS);
```

- [ ] **Step 6: Commit**

```bash
git add openclaw-plugin/ "C:\Users\GalLe\.openclaw\workspace\.openclaw\extensions\whatsapp-auto-reply\index.js"
git commit -m "feat: extend plugin with management mode - events, commands, runtime settings"
```

---

## Task 15: Install Dependencies and Full Build Verification

- [ ] **Step 1: Install all dependencies**

```bash
cd "c:/Users/GalLe/Cursor projects/OpenClaw-manager"
pnpm install
```

- [ ] **Step 2: Build types package**

```bash
pnpm --filter @openclaw-manager/types build
```

Expected: Clean compilation.

- [ ] **Step 3: Build bridge**

```bash
pnpm --filter bridge build
```

Expected: Clean compilation.

- [ ] **Step 4: Build dashboard**

```bash
pnpm --filter dashboard build
```

Expected: Next.js build succeeds (pages may show warnings about bridge connection during build, which is expected).

- [ ] **Step 5: Commit any lockfile changes**

```bash
git add pnpm-lock.yaml
git commit -m "chore: update lockfile after full build verification"
```
