# Consult-Hermes MCP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up a remote-hosted MCP service `mcp-hermes` on `192.168.0.10` and a `/consult-hermes` Claude Code skill, mirroring `/consult-openclaw` but with phase-1 limits documented (no dashboard moderation, ephemeral sessions).

**Architecture:** New Node package `packages/mcp-hermes/` runs as a sibling process to `hermes-shim` on `192.168.0.10`. Exposes MCP over Streamable HTTP transport on port `9120` with bearer auth. Forwards each `hermes_say` to `hermes-shim` `POST /v1/chat` (loopback `127.0.0.1:9119`) using a server-held shim token. Maintains in-process session map keyed by clientId. Claude Code registers it as a remote HTTP MCP. Skill mirrors consult-openclaw structure but instructs Claude Code to feed Hermes full project context per turn, since Hermes has no embedded knowledge of the OpenClaw-manager codebase.

**Tech Stack:** Node 20+, TypeScript, `@modelcontextprotocol/sdk` ≥ 1.10 (StreamableHTTPServerTransport), Express 4, Vitest, pnpm workspace, systemd user service.

---

## Phase-1 Contract Reference

Locked contract (do not change without re-consult):

| Aspect | Decision |
|---|---|
| Architecture | Remote MCP HTTP service (Route 1, sibling to hermes-shim) |
| Tools | `hermes_say`, `hermes_session_info`, `hermes_conclude` |
| Session storage | In-process Map; lost on restart |
| Auth client→MCP | Bearer `MCP_HERMES_TOKEN` (new, distinct from shim token) |
| Auth MCP→shim | Server-side `HERMES_SHIM_TOKEN` (already provisioned) |
| Bind | Default `127.0.0.1:9120`; explicit `MCP_HERMES_BIND_LAN=1` for `0.0.0.0` |
| Conclude | Marks in-mem entry concluded; no archive |
| Session info | Returns `{session_id, message_count, status, started_at}` from in-mem map |
| Out of scope phase 1 | Manual mode, discard reply, dashboard, durable sessions, envelope (intent/state/artifact/refs) |

---

## File Structure

**New files (in OpenClaw-manager repo):**

```
packages/mcp-hermes/
├── package.json
├── tsconfig.json
├── .gitignore
├── README.md
├── src/
│   ├── server.ts              # HTTP entry + Express bootstrap + transport wiring
│   ├── auth.ts                # Bearer middleware
│   ├── sessions.ts            # In-process session map
│   ├── shim-client.ts         # POST /v1/chat wrapper
│   └── tools.ts               # MCP tool registration (say/info/conclude)
├── test/
│   ├── auth.test.ts
│   ├── sessions.test.ts
│   ├── shim-client.test.ts
│   ├── tools-say.test.ts
│   ├── tools-session-info.test.ts
│   └── tools-conclude.test.ts
├── systemd/
│   └── mcp-hermes.service.template
└── scripts/
    └── deploy-remote.sh
docs/superpowers/specs/2026-05-06-consult-hermes-design.md
```

**New files (outside repo, on Gal's local machine):**

```
~/.claude/skills/consult-hermes/SKILL.md
```

**Modified files:**

```
~/.mcp.json                    # add hermes remote MCP entry
packages/mcp-hermes/README.md  # deploy + register instructions
```

**On remote `192.168.0.10`:**

```
/home/gal/.local/lib/mcp-hermes/                # rsync target
/home/gal/.config/systemd/user/mcp-hermes.service
/home/gal/.mcp-hermes/env                       # 600 perms, token + config
```

---

## Task 1: Scaffold mcp-hermes package

**Files:**
- Create: `packages/mcp-hermes/package.json`
- Create: `packages/mcp-hermes/tsconfig.json`
- Create: `packages/mcp-hermes/.gitignore`
- Create: `packages/mcp-hermes/src/server.ts` (skeleton)

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "@openclaw-manager/mcp-hermes",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "bin": {
    "mcp-hermes": "dist/server.js"
  },
  "scripts": {
    "build": "tsc",
    "dev": "tsx src/server.ts",
    "start": "node dist/server.js",
    "test": "vitest run"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.10.0",
    "express": "^4.21.0"
  },
  "devDependencies": {
    "@types/express": "^4.17.23",
    "@types/node": "^22.15.2",
    "tsx": "^4.19.4",
    "typescript": "^5.8.3",
    "vitest": "^2.1.4"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "declaration": true
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: Create `.gitignore`**

```
dist/
node_modules/
*.log
```

- [ ] **Step 4: Create skeleton `src/server.ts`**

```ts
#!/usr/bin/env node
console.log("mcp-hermes scaffold");
```

- [ ] **Step 5: Install dependencies**

Run: `pnpm install` (from repo root)
Expected: workspace resolves the new package, dependencies install.

- [ ] **Step 6: Verify TypeScript build**

Run: `pnpm --filter @openclaw-manager/mcp-hermes build`
Expected: `dist/server.js` created, no errors.

- [ ] **Step 7: Commit**

```bash
git add packages/mcp-hermes/
git commit -m "mcp-hermes: scaffold package"
```

---

## Task 2: Bearer auth middleware (TDD)

**Files:**
- Test: `packages/mcp-hermes/test/auth.test.ts`
- Create: `packages/mcp-hermes/src/auth.ts`

- [ ] **Step 1: Write failing test**

```ts
// packages/mcp-hermes/test/auth.test.ts
import { describe, it, expect, vi } from "vitest";
import { bearerAuth } from "../src/auth.js";

function makeReq(headers: Record<string, string>) {
  return { headers } as any;
}
function makeRes() {
  const status = vi.fn().mockReturnThis();
  const json = vi.fn().mockReturnThis();
  const end = vi.fn();
  return { status, json, end } as any;
}

describe("bearerAuth", () => {
  const mw = bearerAuth("secret-token");

  it("passes through with correct bearer", () => {
    const req = makeReq({ authorization: "Bearer secret-token" });
    const res = makeRes();
    const next = vi.fn();
    mw(req, res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("returns 401 with no header", () => {
    const req = makeReq({});
    const res = makeRes();
    const next = vi.fn();
    mw(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it("returns 401 with wrong token", () => {
    const req = makeReq({ authorization: "Bearer nope" });
    const res = makeRes();
    const next = vi.fn();
    mw(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it("returns 500 if expected token is empty", () => {
    const mw0 = bearerAuth("");
    const req = makeReq({ authorization: "Bearer anything" });
    const res = makeRes();
    const next = vi.fn();
    mw0(req, res, next);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});
```

- [ ] **Step 2: Run test — confirm FAIL**

Run: `pnpm --filter @openclaw-manager/mcp-hermes test`
Expected: cannot find `../src/auth.js`.

- [ ] **Step 3: Implement `src/auth.ts`**

```ts
import type { Request, Response, NextFunction } from "express";

export function bearerAuth(expected: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!expected) {
      res.status(500).json({ error: "MCP_HERMES_TOKEN not configured" });
      return;
    }
    const header = req.headers.authorization ?? "";
    if (header !== `Bearer ${expected}`) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    next();
  };
}
```

- [ ] **Step 4: Run test — confirm PASS**

Run: `pnpm --filter @openclaw-manager/mcp-hermes test`
Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/mcp-hermes/test/auth.test.ts packages/mcp-hermes/src/auth.ts
git commit -m "mcp-hermes: bearer auth middleware"
```

---

## Task 3: In-process session map (TDD)

**Files:**
- Test: `packages/mcp-hermes/test/sessions.test.ts`
- Create: `packages/mcp-hermes/src/sessions.ts`

- [ ] **Step 1: Write failing test**

```ts
// packages/mcp-hermes/test/sessions.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { SessionStore } from "../src/sessions.js";

describe("SessionStore", () => {
  let store: SessionStore;
  beforeEach(() => { store = new SessionStore(() => 1_700_000_000_000); });

  it("creates a session with auto-generated id", () => {
    const s = store.getOrCreate("client-1");
    expect(s.sessionId).toMatch(/^[0-9a-f-]{36}$/);
    expect(s.messageCount).toBe(0);
    expect(s.status).toBe("active");
    expect(s.startedAt).toBe(1_700_000_000_000);
  });

  it("returns existing session for same id+client", () => {
    const a = store.getOrCreate("client-1");
    const b = store.getOrCreate("client-1", a.sessionId);
    expect(b.sessionId).toBe(a.sessionId);
  });

  it("creates new session when explicit id is unknown", () => {
    const s = store.getOrCreate("client-1", "unknown-id");
    expect(s.sessionId).toBe("unknown-id");
    expect(s.messageCount).toBe(0);
  });

  it("incrementMessageCount bumps count", () => {
    const s = store.getOrCreate("client-1");
    store.incrementMessageCount("client-1", s.sessionId);
    store.incrementMessageCount("client-1", s.sessionId);
    expect(store.get("client-1", s.sessionId)?.messageCount).toBe(2);
  });

  it("conclude marks status concluded", () => {
    const s = store.getOrCreate("client-1");
    store.conclude("client-1", s.sessionId, "done");
    const after = store.get("client-1", s.sessionId);
    expect(after?.status).toBe("concluded");
    expect(after?.lastSummary).toBe("done");
  });

  it("getMostRecent returns latest by startedAt", () => {
    let now = 1_700_000_000_000;
    const store2 = new SessionStore(() => now);
    const a = store2.getOrCreate("client-2");
    now += 1000;
    const b = store2.getOrCreate("client-2", "explicit-b");
    expect(store2.getMostRecent("client-2")?.sessionId).toBe(b.sessionId);
  });

  it("isolates sessions across clients", () => {
    const a = store.getOrCreate("client-A");
    const fromB = store.get("client-B", a.sessionId);
    expect(fromB).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test — FAIL**

Run: `pnpm --filter @openclaw-manager/mcp-hermes test`
Expected: cannot find `../src/sessions.js`.

- [ ] **Step 3: Implement `src/sessions.ts`**

```ts
import { randomUUID } from "node:crypto";

export type SessionStatus = "active" | "concluded";

export interface SessionEntry {
  sessionId: string;
  messageCount: number;
  status: SessionStatus;
  startedAt: number;
  lastSummary?: string;
}

type Now = () => number;

export class SessionStore {
  private byClient = new Map<string, Map<string, SessionEntry>>();

  constructor(private now: Now = () => Date.now()) {}

  private clientMap(clientId: string): Map<string, SessionEntry> {
    let m = this.byClient.get(clientId);
    if (!m) { m = new Map(); this.byClient.set(clientId, m); }
    return m;
  }

  getOrCreate(clientId: string, sessionId?: string): SessionEntry {
    const m = this.clientMap(clientId);
    if (sessionId && m.has(sessionId)) return m.get(sessionId)!;
    const id = sessionId ?? randomUUID();
    const entry: SessionEntry = {
      sessionId: id,
      messageCount: 0,
      status: "active",
      startedAt: this.now(),
    };
    m.set(id, entry);
    return entry;
  }

  get(clientId: string, sessionId: string): SessionEntry | undefined {
    return this.byClient.get(clientId)?.get(sessionId);
  }

  incrementMessageCount(clientId: string, sessionId: string): void {
    const e = this.get(clientId, sessionId);
    if (e) e.messageCount += 1;
  }

  conclude(clientId: string, sessionId: string, summary?: string): void {
    const e = this.get(clientId, sessionId);
    if (!e) return;
    e.status = "concluded";
    if (summary) e.lastSummary = summary;
  }

  getMostRecent(clientId: string): SessionEntry | undefined {
    const m = this.byClient.get(clientId);
    if (!m) return undefined;
    let best: SessionEntry | undefined;
    for (const e of m.values()) {
      if (!best || e.startedAt > best.startedAt) best = e;
    }
    return best;
  }
}
```

- [ ] **Step 4: Run test — PASS**

Run: `pnpm --filter @openclaw-manager/mcp-hermes test`
Expected: 7 tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/mcp-hermes/test/sessions.test.ts packages/mcp-hermes/src/sessions.ts
git commit -m "mcp-hermes: in-process session store"
```

---

## Task 4: Shim client (TDD)

**Files:**
- Test: `packages/mcp-hermes/test/shim-client.test.ts`
- Create: `packages/mcp-hermes/src/shim-client.ts`

- [ ] **Step 1: Write failing test**

```ts
// packages/mcp-hermes/test/shim-client.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ShimClient } from "../src/shim-client.js";

describe("ShimClient.chat", () => {
  let client: ShimClient;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    client = new ShimClient({
      baseUrl: "http://127.0.0.1:9119",
      shimToken: "shim-secret",
      fetchImpl: fetchMock,
    });
  });

  it("POSTs to /v1/chat with correct payload + auth", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        ok: true, assistant_text: "hi", session_id: "s1", elapsed_ms: 42,
      }),
    });
    const reply = await client.chat({ session_id: "s1", message: "hello" });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:9119/v1/chat",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          Authorization: "Bearer shim-secret",
        }),
        body: JSON.stringify({ session_id: "s1", message: "hello" }),
      }),
    );
    expect(reply).toEqual({ assistantText: "hi", elapsedMs: 42 });
  });

  it("throws ShimError on non-2xx with detail", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 502,
      text: async () => JSON.stringify({ detail: "hermes returned 1: boom" }),
    });
    await expect(client.chat({ session_id: "s1", message: "x" }))
      .rejects.toMatchObject({ status: 502, detail: "hermes returned 1: boom" });
  });

  it("throws ShimError on empty/non-JSON response", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => "<html>oops</html>",
    });
    await expect(client.chat({ session_id: "s1", message: "x" }))
      .rejects.toMatchObject({ status: 500 });
  });
});
```

- [ ] **Step 2: Run — FAIL**

Run: `pnpm --filter @openclaw-manager/mcp-hermes test`

- [ ] **Step 3: Implement `src/shim-client.ts`**

```ts
export interface ShimChatRequest {
  session_id: string;
  message: string;
}

export interface ShimChatReply {
  assistantText: string;
  elapsedMs: number;
}

export class ShimError extends Error {
  constructor(public status: number, public detail: string, message?: string) {
    super(message ?? `shim ${status}: ${detail}`);
    this.name = "ShimError";
  }
}

export interface ShimClientOptions {
  baseUrl: string;
  shimToken: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export class ShimClient {
  private fetchImpl: typeof fetch;
  private timeoutMs: number;
  constructor(private opts: ShimClientOptions) {
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.timeoutMs = opts.timeoutMs ?? 200_000;
  }

  async chat(req: ShimChatRequest): Promise<ShimChatReply> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.opts.baseUrl}/v1/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.opts.shimToken}`,
        },
        body: JSON.stringify(req),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
    const bodyText = await res.text();
    if (!res.ok) {
      let detail = bodyText;
      try { detail = JSON.parse(bodyText).detail ?? bodyText; } catch {}
      throw new ShimError(res.status, detail);
    }
    let parsed: any;
    try { parsed = JSON.parse(bodyText); } catch {
      throw new ShimError(res.status, `non-JSON body: ${bodyText.slice(0, 200)}`);
    }
    return { assistantText: String(parsed.assistant_text ?? ""), elapsedMs: Number(parsed.elapsed_ms ?? 0) };
  }
}
```

- [ ] **Step 4: Run — PASS**

Run: `pnpm --filter @openclaw-manager/mcp-hermes test`
Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/mcp-hermes/test/shim-client.test.ts packages/mcp-hermes/src/shim-client.ts
git commit -m "mcp-hermes: shim chat client with bearer auth"
```

---

## Task 5: Tool: hermes_say (TDD)

**Files:**
- Test: `packages/mcp-hermes/test/tools-say.test.ts`
- Create: `packages/mcp-hermes/src/tools.ts`

- [ ] **Step 1: Write failing test**

```ts
// packages/mcp-hermes/test/tools-say.test.ts
import { describe, it, expect, vi } from "vitest";
import { handleHermesSay } from "../src/tools.js";
import { SessionStore } from "../src/sessions.js";

describe("hermes_say handler", () => {
  it("creates session if none provided, calls shim, increments count", async () => {
    const store = new SessionStore(() => 1700);
    const shim = { chat: vi.fn().mockResolvedValue({ assistantText: "yo", elapsedMs: 12 }) };
    const result = await handleHermesSay({
      args: { message: "hi" },
      clientId: "c1",
      store,
      shim: shim as any,
    });
    expect(shim.chat).toHaveBeenCalledWith({
      session_id: expect.stringMatching(/^[0-9a-f-]{36}$/),
      message: "hi",
    });
    const parsed = JSON.parse(result.text);
    expect(parsed.reply).toBe("yo");
    expect(parsed.message_count).toBe(1);
    expect(parsed.session_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(parsed.elapsed_ms).toBe(12);
  });

  it("reuses provided session_id", async () => {
    const store = new SessionStore(() => 1700);
    const shim = { chat: vi.fn().mockResolvedValue({ assistantText: "ok", elapsedMs: 1 }) };
    await handleHermesSay({ args: { message: "1", session_id: "abc" }, clientId: "c1", store, shim: shim as any });
    await handleHermesSay({ args: { message: "2", session_id: "abc" }, clientId: "c1", store, shim: shim as any });
    expect(store.get("c1", "abc")?.messageCount).toBe(2);
  });

  it("propagates shim errors", async () => {
    const store = new SessionStore(() => 1700);
    const shim = { chat: vi.fn().mockRejectedValue(new Error("shim 502: boom")) };
    await expect(handleHermesSay({ args: { message: "x" }, clientId: "c1", store, shim: shim as any }))
      .rejects.toThrow(/boom/);
  });

  it("rejects empty message", async () => {
    const store = new SessionStore(() => 1700);
    const shim = { chat: vi.fn() };
    await expect(handleHermesSay({ args: { message: "" }, clientId: "c1", store, shim: shim as any }))
      .rejects.toThrow(/message required/);
    expect(shim.chat).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Implement `src/tools.ts` (initial)**

```ts
import type { SessionStore } from "./sessions.js";
import type { ShimClient } from "./shim-client.js";

export interface ToolHandlerCtx {
  args: Record<string, unknown>;
  clientId: string;
  store: SessionStore;
  shim: Pick<ShimClient, "chat">;
}

export interface ToolTextResult { text: string }

export async function handleHermesSay(ctx: ToolHandlerCtx): Promise<ToolTextResult> {
  const message = String(ctx.args.message ?? "");
  if (!message) throw new Error("message required");
  const sessionId = typeof ctx.args.session_id === "string" && ctx.args.session_id
    ? ctx.args.session_id
    : undefined;
  const entry = ctx.store.getOrCreate(ctx.clientId, sessionId);
  const reply = await ctx.shim.chat({ session_id: entry.sessionId, message });
  ctx.store.incrementMessageCount(ctx.clientId, entry.sessionId);
  const after = ctx.store.get(ctx.clientId, entry.sessionId)!;
  return {
    text: JSON.stringify({
      session_id: after.sessionId,
      reply: reply.assistantText,
      message_count: after.messageCount,
      elapsed_ms: reply.elapsedMs,
    }, null, 2),
  };
}
```

- [ ] **Step 4: Run — PASS**

Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/mcp-hermes/test/tools-say.test.ts packages/mcp-hermes/src/tools.ts
git commit -m "mcp-hermes: hermes_say handler"
```

---

## Task 6: Tool: hermes_session_info (TDD)

**Files:**
- Test: `packages/mcp-hermes/test/tools-session-info.test.ts`
- Modify: `packages/mcp-hermes/src/tools.ts`

- [ ] **Step 1: Write failing test**

```ts
// packages/mcp-hermes/test/tools-session-info.test.ts
import { describe, it, expect } from "vitest";
import { handleHermesSessionInfo } from "../src/tools.js";
import { SessionStore } from "../src/sessions.js";

describe("hermes_session_info handler", () => {
  it("returns most recent when no id provided", async () => {
    let now = 1000;
    const store = new SessionStore(() => now);
    store.getOrCreate("c1");
    now += 100;
    const b = store.getOrCreate("c1");
    const r = await handleHermesSessionInfo({ args: {}, clientId: "c1", store, shim: {} as any });
    const parsed = JSON.parse(r.text);
    expect(parsed.session_id).toBe(b.sessionId);
    expect(parsed.status).toBe("active");
  });

  it("returns specific session when id given", async () => {
    const store = new SessionStore(() => 1234);
    const a = store.getOrCreate("c1");
    store.incrementMessageCount("c1", a.sessionId);
    const r = await handleHermesSessionInfo({
      args: { session_id: a.sessionId }, clientId: "c1", store, shim: {} as any,
    });
    const parsed = JSON.parse(r.text);
    expect(parsed.session_id).toBe(a.sessionId);
    expect(parsed.message_count).toBe(1);
    expect(parsed.started_at).toBe(1234);
  });

  it("returns status:unknown for missing session", async () => {
    const store = new SessionStore();
    const r = await handleHermesSessionInfo({
      args: { session_id: "nope" }, clientId: "c1", store, shim: {} as any,
    });
    const parsed = JSON.parse(r.text);
    expect(parsed.status).toBe("unknown");
    expect(parsed.session_id).toBe("nope");
  });

  it("returns no-session text when no id and no recent", async () => {
    const store = new SessionStore();
    const r = await handleHermesSessionInfo({ args: {}, clientId: "c1", store, shim: {} as any });
    expect(r.text).toBe("no session yet");
  });
});
```

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Append to `src/tools.ts`**

```ts
export async function handleHermesSessionInfo(ctx: ToolHandlerCtx): Promise<ToolTextResult> {
  const requestedId = typeof ctx.args.session_id === "string" ? ctx.args.session_id : undefined;
  if (!requestedId) {
    const recent = ctx.store.getMostRecent(ctx.clientId);
    if (!recent) return { text: "no session yet" };
    return { text: JSON.stringify({
      session_id: recent.sessionId,
      message_count: recent.messageCount,
      status: recent.status,
      started_at: recent.startedAt,
    }, null, 2) };
  }
  const entry = ctx.store.get(ctx.clientId, requestedId);
  if (!entry) return { text: JSON.stringify({
    session_id: requestedId,
    message_count: 0,
    status: "unknown",
    started_at: 0,
  }, null, 2) };
  return { text: JSON.stringify({
    session_id: entry.sessionId,
    message_count: entry.messageCount,
    status: entry.status,
    started_at: entry.startedAt,
  }, null, 2) };
}
```

- [ ] **Step 4: Run — PASS**

Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/mcp-hermes/test/tools-session-info.test.ts packages/mcp-hermes/src/tools.ts
git commit -m "mcp-hermes: hermes_session_info handler"
```

---

## Task 7: Tool: hermes_conclude (TDD)

**Files:**
- Test: `packages/mcp-hermes/test/tools-conclude.test.ts`
- Modify: `packages/mcp-hermes/src/tools.ts`

- [ ] **Step 1: Write failing test**

```ts
// packages/mcp-hermes/test/tools-conclude.test.ts
import { describe, it, expect } from "vitest";
import { handleHermesConclude } from "../src/tools.js";
import { SessionStore } from "../src/sessions.js";

describe("hermes_conclude handler", () => {
  it("concludes most recent when no id given", async () => {
    const store = new SessionStore(() => 1);
    const a = store.getOrCreate("c1");
    const r = await handleHermesConclude({
      args: { summary: "wrapped" }, clientId: "c1", store, shim: {} as any,
    });
    const parsed = JSON.parse(r.text);
    expect(parsed.status).toBe("concluded");
    expect(parsed.session_id).toBe(a.sessionId);
    expect(store.get("c1", a.sessionId)?.lastSummary).toBe("wrapped");
  });

  it("returns no-session if nothing to conclude", async () => {
    const store = new SessionStore();
    const r = await handleHermesConclude({ args: {}, clientId: "c1", store, shim: {} as any });
    expect(r.text).toBe("no session to conclude");
  });

  it("concludes by explicit id", async () => {
    const store = new SessionStore();
    const a = store.getOrCreate("c1", "fixed-id");
    await handleHermesConclude({
      args: { session_id: "fixed-id" }, clientId: "c1", store, shim: {} as any,
    });
    expect(store.get("c1", a.sessionId)?.status).toBe("concluded");
  });
});
```

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Append to `src/tools.ts`**

```ts
export async function handleHermesConclude(ctx: ToolHandlerCtx): Promise<ToolTextResult> {
  const summary = typeof ctx.args.summary === "string" ? ctx.args.summary : undefined;
  const requestedId = typeof ctx.args.session_id === "string" ? ctx.args.session_id : undefined;
  const target = requestedId
    ? ctx.store.get(ctx.clientId, requestedId)
    : ctx.store.getMostRecent(ctx.clientId);
  if (!target) return { text: "no session to conclude" };
  ctx.store.conclude(ctx.clientId, target.sessionId, summary);
  return { text: JSON.stringify({
    session_id: target.sessionId,
    status: "concluded",
  }, null, 2) };
}
```

- [ ] **Step 4: Run — PASS**

Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/mcp-hermes/test/tools-conclude.test.ts packages/mcp-hermes/src/tools.ts
git commit -m "mcp-hermes: hermes_conclude handler"
```

---

## Task 8: Wire MCP server with StreamableHTTP transport

**Files:**
- Modify: `packages/mcp-hermes/src/server.ts`

> **Note for engineer:** `@modelcontextprotocol/sdk` ≥ 1.10 ships `StreamableHTTPServerTransport` from `@modelcontextprotocol/sdk/server/streamableHttp.js`. The pattern is: one `Server` per client session, mounted on Express. We use *stateless* mode (no session id reuse across requests) and rely on the `clientId` header that Claude Code sends to scope our in-process session map. If the SDK API has shifted, consult `@modelcontextprotocol/sdk` README at install time and adapt.

- [ ] **Step 1: Replace `src/server.ts` with full implementation**

```ts
#!/usr/bin/env node
import express from "express";
import crypto from "node:crypto";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { bearerAuth } from "./auth.js";
import { SessionStore } from "./sessions.js";
import { ShimClient } from "./shim-client.js";
import {
  handleHermesSay,
  handleHermesSessionInfo,
  handleHermesConclude,
  type ToolTextResult,
} from "./tools.js";

const PORT = Number(process.env.MCP_HERMES_PORT ?? 9120);
const HOST = process.env.MCP_HERMES_HOST ?? "127.0.0.1";
const BIND_LAN = process.env.MCP_HERMES_BIND_LAN === "1";
const MCP_TOKEN = process.env.MCP_HERMES_TOKEN ?? "";
const SHIM_URL = process.env.HERMES_SHIM_URL ?? "http://127.0.0.1:9119";
const SHIM_TOKEN = process.env.HERMES_SHIM_TOKEN ?? "";

if (HOST !== "127.0.0.1" && !BIND_LAN) {
  console.error("refusing to bind non-loopback without MCP_HERMES_BIND_LAN=1");
  process.exit(2);
}
if (!MCP_TOKEN) {
  console.error("MCP_HERMES_TOKEN must be set");
  process.exit(2);
}
if (!SHIM_TOKEN) {
  console.error("HERMES_SHIM_TOKEN must be set");
  process.exit(2);
}

const store = new SessionStore();
const shim = new ShimClient({ baseUrl: SHIM_URL, shimToken: SHIM_TOKEN });

function buildServer(clientId: string): Server {
  const server = new Server(
    { name: "mcp-hermes", version: "0.1.0" },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: "hermes_say",
        description:
          "Send a turn in an ongoing collaborative conversation with Hermes. Hermes is a remote agent with NO knowledge of your project. Include full project context (file paths, code snippets, architecture overview, prior decisions) in every message.",
        inputSchema: {
          type: "object",
          properties: {
            message: { type: "string", description: "Your turn — include rich project context, not just the immediate question." },
            session_id: { type: "string", description: "Optional. Reuse to continue a thread. Omit to start a new one." },
            context: {
              type: "object",
              additionalProperties: true,
              description: "Optional structured context (file, snippet, stack). Hermes does not auto-load this — restate key parts in `message`.",
            },
          },
          required: ["message"],
        },
      },
      {
        name: "hermes_session_info",
        description: "Inspect the current Hermes session: id, message count, status, started_at.",
        inputSchema: {
          type: "object",
          properties: { session_id: { type: "string" } },
        },
      },
      {
        name: "hermes_conclude",
        description: "Mark the current Hermes collaborative thread as concluded. Phase 1: in-memory only, no archive.",
        inputSchema: {
          type: "object",
          properties: {
            session_id: { type: "string" },
            summary: { type: "string", description: "Optional one-line outcome summary." },
          },
        },
      },
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const name = req.params.name;
    const args = (req.params.arguments ?? {}) as Record<string, unknown>;
    let result: ToolTextResult;
    if (name === "hermes_say") {
      result = await handleHermesSay({ args, clientId, store, shim });
    } else if (name === "hermes_session_info") {
      result = await handleHermesSessionInfo({ args, clientId, store, shim });
    } else if (name === "hermes_conclude") {
      result = await handleHermesConclude({ args, clientId, store, shim });
    } else {
      throw new Error(`Unknown tool: ${name}`);
    }
    return { content: [{ type: "text", text: result.text }] };
  });

  return server;
}

const app = express();
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "mcp-hermes", version: "0.1.0" });
});

app.use("/mcp", bearerAuth(MCP_TOKEN));

app.post("/mcp", async (req, res) => {
  const clientId = String(req.headers["x-client-id"] ?? `unknown-${crypto.randomBytes(4).toString("hex")}`);
  const server = buildServer(clientId);
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on("close", () => { transport.close(); server.close(); });
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

app.listen(PORT, HOST, () => {
  console.log(`mcp-hermes listening on http://${HOST}:${PORT}/mcp (LAN bind: ${BIND_LAN})`);
});
```

- [ ] **Step 2: Build**

Run: `pnpm --filter @openclaw-manager/mcp-hermes build`
Expected: clean build.

- [ ] **Step 3: Local smoke (with stub env)**

Run (separate terminal):
```bash
MCP_HERMES_TOKEN=test-mcp \
HERMES_SHIM_TOKEN=test-shim \
HERMES_SHIM_URL=http://127.0.0.1:9999 \
pnpm --filter @openclaw-manager/mcp-hermes start
```
Expected: log line `mcp-hermes listening on http://127.0.0.1:9120/mcp (LAN bind: false)`.

- [ ] **Step 4: Verify health endpoint**

Run: `curl -s http://127.0.0.1:9120/health`
Expected: `{"ok":true,"service":"mcp-hermes","version":"0.1.0"}`.

- [ ] **Step 5: Verify auth rejection**

Run: `curl -s -o /dev/null -w "%{http_code}" -X POST http://127.0.0.1:9120/mcp -H "Content-Type: application/json" -d '{}'`
Expected: `401`.

- [ ] **Step 6: Stop the local instance, commit**

```bash
git add packages/mcp-hermes/src/server.ts
git commit -m "mcp-hermes: HTTP MCP server with bearer auth"
```

---

## Task 9: systemd service template

**Files:**
- Create: `packages/mcp-hermes/systemd/mcp-hermes.service.template`
- Create: `packages/mcp-hermes/README.md`

- [ ] **Step 1: Create systemd template**

```ini
[Unit]
Description=OpenClaw-Manager MCP Hermes facade
After=network.target hermes-shim.service
Wants=hermes-shim.service

[Service]
Type=simple
EnvironmentFile=%h/.mcp-hermes/env
ExecStart=/usr/bin/node %h/.local/lib/mcp-hermes/dist/server.js
Restart=on-failure
RestartSec=2s

[Install]
WantedBy=default.target
```

- [ ] **Step 2: Create README**

```markdown
# mcp-hermes

Remote-hosted Model Context Protocol (MCP) facade for the Hermes agent. Exposes
`hermes_say`, `hermes_session_info`, and `hermes_conclude` to Claude Code over
Streamable HTTP, forwarding chat turns to a local `hermes-shim` process.

## Architecture

```
Claude Code ── HTTP+bearer ──► mcp-hermes (192.168.0.10:9120)
                                  │
                                  └─ HTTP+bearer ──► hermes-shim (127.0.0.1:9119)
                                                          │
                                                          └─ subprocess ──► hermes -z
```

## Phase-1 limits

- Sessions are in-process only; lost on restart.
- No operator moderation, no dashboard, no manual-mode flip.
- See `docs/superpowers/specs/2026-05-06-consult-hermes-design.md`.

## Environment

| Variable | Default | Purpose |
|---|---|---|
| `MCP_HERMES_TOKEN` | (required) | Bearer that Claude Code presents to MCP |
| `HERMES_SHIM_TOKEN` | (required) | Bearer that MCP presents to hermes-shim |
| `HERMES_SHIM_URL` | `http://127.0.0.1:9119` | Local shim base URL |
| `MCP_HERMES_HOST` | `127.0.0.1` | Bind host |
| `MCP_HERMES_PORT` | `9120` | Bind port |
| `MCP_HERMES_BIND_LAN` | (unset) | Set to `1` to allow non-loopback bind |

## Deployment to 192.168.0.10

See `scripts/deploy-remote.sh`.

## Register in Claude Code

```
claude mcp add --transport http --scope user hermes \
  http://192.168.0.10:9120/mcp \
  --header "Authorization: Bearer <MCP_HERMES_TOKEN>"
```
```

- [ ] **Step 3: Commit**

```bash
git add packages/mcp-hermes/systemd/ packages/mcp-hermes/README.md
git commit -m "mcp-hermes: systemd template and README"
```

---

## Task 10: Deploy script

**Files:**
- Create: `packages/mcp-hermes/scripts/deploy-remote.sh`

- [ ] **Step 1: Create deploy script**

```bash
#!/usr/bin/env bash
# Deploy mcp-hermes to remote 192.168.0.10. Run from repo root.
set -euo pipefail

REMOTE_USER="${REMOTE_USER:-gal}"
REMOTE_HOST="${REMOTE_HOST:-192.168.0.10}"
REMOTE_LIB="\$HOME/.local/lib/mcp-hermes"
REMOTE_SYSTEMD="\$HOME/.config/systemd/user"
REMOTE_ENV_DIR="\$HOME/.mcp-hermes"

echo "==> Building locally"
pnpm --filter @openclaw-manager/mcp-hermes build

echo "==> Rsync dist + node_modules + package.json to remote"
rsync -az --delete \
  packages/mcp-hermes/dist/ \
  packages/mcp-hermes/package.json \
  packages/mcp-hermes/node_modules/ \
  "$REMOTE_USER@$REMOTE_HOST:$REMOTE_LIB/"

echo "==> Install systemd unit"
scp packages/mcp-hermes/systemd/mcp-hermes.service.template \
  "$REMOTE_USER@$REMOTE_HOST:$REMOTE_SYSTEMD/mcp-hermes.service"

echo "==> Reload + restart"
ssh "$REMOTE_USER@$REMOTE_HOST" '
  mkdir -p ~/.mcp-hermes ~/.config/systemd/user ~/.local/lib/mcp-hermes
  test -f ~/.mcp-hermes/env || { echo "create ~/.mcp-hermes/env first"; exit 1; }
  chmod 600 ~/.mcp-hermes/env
  systemctl --user daemon-reload
  systemctl --user enable --now mcp-hermes
  systemctl --user restart mcp-hermes
  systemctl --user status --no-pager mcp-hermes
'
```

- [ ] **Step 2: chmod +x**

```bash
chmod +x packages/mcp-hermes/scripts/deploy-remote.sh
```

- [ ] **Step 3: Commit**

```bash
git add packages/mcp-hermes/scripts/deploy-remote.sh
git commit -m "mcp-hermes: remote deploy script"
```

---

## Task 11: Provision token + env file on remote

**Files:**
- Modify (remote): `/home/gal/.mcp-hermes/env`

- [ ] **Step 1: Generate fresh MCP token**

Run (locally):
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```
Save the output as `MCP_HERMES_TOKEN_VALUE` in your shell.

- [ ] **Step 2: Read existing shim token from remote**

Run:
```bash
ssh gal@192.168.0.10 'cat ~/.hermes/shim.env | grep ^HERMES_SHIM_TOKEN'
```
Save as `HERMES_SHIM_TOKEN_VALUE`.

- [ ] **Step 3: Write env file on remote**

Run:
```bash
ssh gal@192.168.0.10 "mkdir -p ~/.mcp-hermes && cat > ~/.mcp-hermes/env <<EOF
MCP_HERMES_TOKEN=${MCP_HERMES_TOKEN_VALUE}
HERMES_SHIM_TOKEN=${HERMES_SHIM_TOKEN_VALUE}
HERMES_SHIM_URL=http://127.0.0.1:9119
MCP_HERMES_HOST=0.0.0.0
MCP_HERMES_PORT=9120
MCP_HERMES_BIND_LAN=1
EOF
chmod 600 ~/.mcp-hermes/env"
```

- [ ] **Step 4: Verify**

Run:
```bash
ssh gal@192.168.0.10 'ls -l ~/.mcp-hermes/env && wc -l ~/.mcp-hermes/env'
```
Expected: file mode `-rw-------`, 6 lines.

(No commit — env file is per-host, not in repo.)

---

## Task 12: Deploy to 192.168.0.10

**Files:** none modified locally; remote install only.

- [ ] **Step 1: Run deploy script**

Run:
```bash
bash packages/mcp-hermes/scripts/deploy-remote.sh
```
Expected: rsync succeeds; systemd unit becomes `active (running)`.

- [ ] **Step 2: Tail logs**

Run:
```bash
ssh gal@192.168.0.10 'journalctl --user -u mcp-hermes -n 20 --no-pager'
```
Expected: `mcp-hermes listening on http://0.0.0.0:9120/mcp (LAN bind: true)`.

- [ ] **Step 3: Verify health endpoint from local**

Run:
```bash
curl -s http://192.168.0.10:9120/health
```
Expected: `{"ok":true,"service":"mcp-hermes","version":"0.1.0"}`.

- [ ] **Step 4: Verify bearer rejection**

Run:
```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://192.168.0.10:9120/mcp -H "Content-Type: application/json" -d '{}'
```
Expected: `401`.

- [ ] **Step 5: Verify shim reachability from MCP host**

Run:
```bash
ssh gal@192.168.0.10 'curl -s -H "Authorization: Bearer $(grep ^HERMES_SHIM_TOKEN ~/.mcp-hermes/env | cut -d= -f2)" http://127.0.0.1:9119/v1/health'
```
Expected: `{"ok":true,"hermes_version":"..."}`.

(No commit.)

---

## Task 13: Register MCP in Claude Code

**Files:**
- Modify: `~/.mcp.json` (or via `claude mcp add`)

- [ ] **Step 1: Read current `~/.mcp.json`**

Run: `cat ~/.mcp.json`
Expected: existing entries for `figma`, `godot-mcp`, `openclaw`.

- [ ] **Step 2: Add hermes entry**

Edit `~/.mcp.json` to add an entry inside `mcpServers`:

```json
"hermes": {
  "type": "http",
  "url": "http://192.168.0.10:9120/mcp",
  "headers": {
    "Authorization": "Bearer <MCP_HERMES_TOKEN_VALUE_FROM_TASK_11>"
  }
}
```

- [ ] **Step 3: Restart Claude Code session**

Close and reopen the Claude Code window so it loads the new MCP entry.

- [ ] **Step 4: Verify tools available**

In a fresh Claude Code prompt, ask Claude to list available MCP tools or invoke `mcp__hermes__hermes_session_info`.
Expected: returns `no session yet`.

(No commit — `.mcp.json` lives in `~`, not in repo.)

---

## Task 14: End-to-end smoke

**Files:** none — runtime verification.

- [ ] **Step 1: Send a test turn**

In Claude Code, instruct: "Use mcp__hermes__hermes_say with message='hello, please reply with the word PONG'."
Expected: tool returns JSON with `reply` containing `PONG` (or model's variation), `message_count: 1`, valid `session_id`.

- [ ] **Step 2: Continue same session**

Instruct Claude to call `hermes_say` again with the same `session_id` and `message='what was the last word you said?'`.
Expected: Hermes references PONG (continuity through `--continue` flag in shim).

- [ ] **Step 3: Inspect session**

Call `hermes_session_info` with no args.
Expected: `message_count: 2`, `status: active`.

- [ ] **Step 4: Conclude**

Call `hermes_conclude` with `summary: "smoke test"`.
Expected: `status: concluded`.

- [ ] **Step 5: Re-inspect**

Call `hermes_session_info` with the session_id.
Expected: `status: concluded`.

(No commit.)

---

## Task 15: Write consult-hermes skill

**Files:**
- Create: `~/.claude/skills/consult-hermes/SKILL.md`

> **Critical:** This skill must instruct Claude Code to feed Hermes full project context per turn. Hermes does NOT have embedded knowledge of OpenClaw-manager. Memory entry `feedback_consult_hermes_zero_context.md` is the source of this rule.

- [ ] **Step 1: Create skill directory**

Run: `mkdir -p ~/.claude/skills/consult-hermes`

- [ ] **Step 2: Write `SKILL.md`**

```markdown
---
name: consult-hermes
description: Use when Gal asks Claude Code to collaborate with Hermes via MCP — clarifying questions, design discussion, and reviews go through `mcp__hermes__hermes_say` instead of asking Gal. Triggered by "consult hermes", "talk to hermes", "use hermes as the user", or explicit invocation of this skill.
---

# Consult Hermes

## Overview

Swap the human interlocutor for Hermes (the remote agent at `192.168.0.10`, exposed to Claude Code via the `mcp-hermes` MCP service). Instead of asking Gal clarifying questions and reporting progress back to him, route conversational turns through `mcp__hermes__hermes_say`.

**Critical difference from /consult-openclaw:** Hermes has **zero embedded knowledge of the OpenClaw-manager codebase**. OpenClaw is co-developed with the manager and accumulates context; Hermes is an independent agent reachable over HTTP. Every `hermes_say` turn must include enough project framing for a fresh collaborator to give a useful answer.

## Project context Hermes needs (paste into early turns)

When you start a Hermes session, your first turn should orient Hermes. Adapt this template:

> I'm Claude Code working on **OpenClaw-Manager** — a multi-runtime control plane (Node/TypeScript) for collaborative AI agents (OpenClaw, Hermes, Zeroclaw). The repo is a pnpm workspace at `c:/Users/GalLe/Cursor projects/OpenClaw-manager` with two top-level apps:
> - `apps/bridge` — Express HTTP bridge that hosts runtime adapters and a chat-orchestration layer.
> - `apps/dashboard` — Next.js operator UI at `192.168.0.240/claude-code` (CentOS deploy via NSSM/systemd).
>
> Shared packages live under `packages/` (typed contracts, runtime adapters, MCP facades). Today I'm working on `<feature>` in `<files>`. The relevant context is `<short summary of the immediate problem>`.
>
> Question: <your actual question>

If a later turn changes scope (different file/feature), re-orient. Don't assume Hermes remembers your project layout from the previous turn — Hermes does, but only at the level of what you've literally typed; do not rely on it inferring repo conventions.

## When to Use

- Gal hands over a task and says to consult Hermes, talk to Hermes instead, or let Hermes guide the work.
- Gal wants a parallel collaborator in addition to (or instead of) OpenClaw on a specific task.

## When NOT to Use

- Gal is actively driving the session and replying in real time.
- Hermes has no operator UI — Gal cannot moderate replies in real time. If you need that, use `/consult-openclaw` instead.
- The `mcp__hermes__hermes_say` tool is not available (MCP not loaded). Fall back to asking Gal directly.
- A destructive or irreversible action is needed (git push, prod deploy, dropping data). Ask **Gal directly**; Hermes cannot authorize production changes.

## The Rule

While this skill is active, every turn that would normally go to Gal goes to Hermes via `mcp__hermes__hermes_say`. That means:

- **Clarifying questions** → `hermes_say({message: "<full project framing> + <question>"})`
- **Proposed plans / design choices** → send the plan with full context.
- **Progress updates** → narrate to Hermes, not Gal.
- **Final handoff** → `mcp__hermes__hermes_conclude({summary: "<short outcome>"})`.

Plain text output to Gal is status-level only ("Consulting Hermes on the refactor", "Working on X", "Done").

## How to Call

```
mcp__hermes__hermes_say({
  message: "<full project framing — what OpenClaw-Manager is, what file you're touching, why> + <your actual question or proposal>",
  session_id: "<reuse to continue thread; omit on first turn>"
})
```

The MCP returns JSON: `{session_id, reply, message_count, elapsed_ms}`. Reuse `session_id` on subsequent turns to maintain continuity.

**Inspect** with `mcp__hermes__hermes_session_info` to see message count or status.
**Conclude** with `mcp__hermes__hermes_conclude({summary: "..."})` when the task is done.

## Phase-1 limits (read carefully)

| Capability | Status |
|---|---|
| `hermes_say` (chat) | ✅ |
| Session continuity within a process lifetime | ✅ (via `--continue` in hermes-shim) |
| Session continuity across mcp-hermes restarts | ❌ (in-memory map only) |
| Operator moderation / manual mode | ❌ |
| Discard reply / dashboard archive | ❌ |
| Envelope (intent/state/artifact/refs like OpenClaw) | ❌ |

If Hermes returns an HTTP error (502/504/empty) — surface it to Gal and ask how to proceed.

## What Claude Code Should Do With Hermes's Replies

- Hermes is a smart collaborator with NO project context except what you've sent.
- If a reply is vague or off-target, the most likely cause is insufficient context in your turn — re-send with more framing.
- Treat Hermes as a peer: push back if its proposal contradicts an invariant in the codebase, but show the invariant (paste the code/test/doc that establishes it).
- If Hermes says it has nothing more to add or signals completion, call `hermes_conclude`.

## Escalation to Gal

Even while this skill is active, escalate to Gal directly when:

1. **Destructive action required** (git push, prod deploy, dropping data, overwriting uncommitted work).
2. **Hermes returns an HTTP error** (502 from shim, 504 timeout, empty assistant_text). Surface and ask.
3. **Skill applies to wrong situation** (Gal is clearly waiting for a direct answer).

## Typical Flow

```
Gal: "review this auth refactor — consult hermes"
You: [short output] "Consulting Hermes on the auth refactor."
You: hermes_say({
  message: "I'm Claude Code on OpenClaw-Manager (pnpm workspace, Node/TS, apps/bridge runs Express). I just refactored apps/bridge/src/auth.ts to extract bearer parsing into parseBearer(). Diff:\n\n```ts\n<paste diff>\n```\n\nQuestion: any timing-attack concerns with how I'm comparing tokens?"
})
Hermes: "Use crypto.timingSafeEqual on Buffers of the same length, not string ===. Your snippet uses === — change it."
You: [verify, edit, retest]
You: hermes_say({
  message: "Switched to timingSafeEqual with length-pad. Tests green (12/12). Diff line:\n```ts\n<paste>\n```",
  session_id: "<previous>"
})
Hermes: "Looks good. No further notes."
You: hermes_conclude({session_id: "...", summary: "auth refactor reviewed; timing-safe compare added"})
You: [short output to Gal] "Done. Hermes signed off; tests green."
```

## Common Mistakes

| Mistake | Fix |
|---|---|
| Sending a one-line question to Hermes assuming it knows the file/repo. | Always include project framing + file path + relevant snippet. |
| Reusing OpenClaw-style envelope fields (intent/state/artifact). | Hermes MCP does NOT support envelope. Use `message` + `session_id` only. |
| Asking Hermes to "review the recent change" without pasting the diff. | Paste the actual diff or before/after snippets. |
| Forgetting `session_id` on the second turn. | Without `session_id`, you start a new thread and Hermes loses memory. |
| Calling `hermes_conclude` then continuing to work. | Conclude is final for this session. |

## Workflow review gates while consult-hermes is active

Other superpowers skills (`brainstorming`, `writing-plans`, `subagent-driven-development`, `executing-plans`, `requesting-code-review`, `finishing-a-development-branch`) all have steps phrased as "user reviews," "user approves," or "ask the user." While consult-hermes is active, those steps map to Hermes, not Gal. Pick the recommended option, run it past Hermes via `hermes_say`, and proceed on its signoff. Same escalation rules apply for destructive actions.

## End of session

When the task is complete, call `hermes_conclude` with a one-line summary, then output a single status line to Gal. Don't dump the full Hermes transcript to Gal — he can re-engage if he wants details.
```

- [ ] **Step 3: Verify skill loads**

In a new Claude Code session, type `/consult-hermes`. Expected: skill loads and prints the SKILL.md content.

(No commit — skill lives in `~/.claude/skills/`, not in repo.)

---

## Task 16: Internal spec doc

**Files:**
- Create: `docs/superpowers/specs/2026-05-06-consult-hermes-design.md`

- [ ] **Step 1: Write spec**

```markdown
# Consult-Hermes Design Spec

**Date:** 2026-05-06
**Status:** Phase 1 implemented

## Goal

Provide a `/consult-hermes` Claude Code skill analogous to `/consult-openclaw`, routing collaborative turns to the Hermes agent via a remote MCP service.

## Architecture

[mirror plan's "Architecture" + "File Structure" + "Phase-1 Contract Reference"]

## Lossy parity vs consult-openclaw

| Capability | OpenClaw | Hermes phase 1 |
|---|---|---|
| say/turn | envelope (intent/state/artifact/refs) | message + session_id only |
| conclude | DB session ended, dashboard archive | in-memory flag |
| session_info | id/displayName/mode/messageCount from DB | id/messageCount/status from in-mem |
| manual mode flip | yes | no |
| discard reply | yes | no |
| dashboard visibility | yes | no |
| persistence across restart | yes | no |

## Trust boundaries

- Client → MCP: `MCP_HERMES_TOKEN`, distinct from shim token.
- MCP → shim: `HERMES_SHIM_TOKEN`, server-side only.
- Token rotation: edit `/home/gal/.mcp-hermes/env`, `systemctl --user restart mcp-hermes`.

## Future-reuse (NOT phase 1)

- Durable session DB (could add SQLite under `/home/gal/.mcp-hermes/sessions.db`).
- Operator moderation UI (would require new endpoints + dashboard work mirroring OpenClaw's `/claude-code/sessions` PATCH).
- Envelope (intent/state/artifact/refs) — requires shim-side metadata persistence first.

## References

- Plan: `docs/superpowers/plans/2026-05-06-consult-hermes-mcp.md`
- Hermes runtime spec: `docs/superpowers/specs/2026-05-04-hermes-runtime-integration-design.md`
- mcp-hermes README: `packages/mcp-hermes/README.md`
- Skill source: `~/.claude/skills/consult-hermes/SKILL.md`
```

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/specs/2026-05-06-consult-hermes-design.md
git commit -m "docs: consult-hermes phase-1 design spec"
```

---

## Task 17: Final verification + push

- [ ] **Step 1: Run full test suite**

Run: `pnpm --filter @openclaw-manager/mcp-hermes test`
Expected: all tests pass (~21 tests across 6 files).

- [ ] **Step 2: Verify build is clean**

Run: `pnpm --filter @openclaw-manager/mcp-hermes build`
Expected: no errors, no warnings.

- [ ] **Step 3: Re-run end-to-end smoke (Task 14)**

Confirm a fresh Claude Code session can `hermes_say` → reply → `hermes_conclude`.

- [ ] **Step 4: Confirm git status clean**

Run: `git status`
Expected: working tree clean on the feature branch.

- [ ] **Step 5: Push branch**

Run: `git push -u origin <branch-name>`
(Branch name follows `Gal/` convention per repo's collaboration rules.)

- [ ] **Step 6: Open PR**

Use `gh pr create` per repo conventions. Reference plan + spec docs in the body.

---

## Self-Review Notes

- **Spec coverage:** every contract item in the "Phase-1 Contract Reference" maps to a task. Auth (Tasks 2 + 8 + 11), tools (5–7), transport (8), deploy (9–12), skill (15), spec doc (16).
- **Placeholders:** none — every code block is concrete.
- **Type consistency:** `SessionEntry`, `SessionStore`, `ShimClient`, `ToolHandlerCtx`, tool function names (`handleHermesSay` etc.) used consistently across tasks 3–8.
- **Zero-context-for-Hermes rule:** baked into Task 15 SKILL.md (project framing template, "Common Mistakes" entry, every "How to Call" example shows full framing).
- **Subagent-driven warning:** OpenClaw mandated subagent-driven-development for parallel work. Tasks 1–8 (in-repo TS/test) and Tasks 9–10 (deploy artifacts) and Tasks 15–16 (docs) are independent enough to parallelize after Task 8 completes.
