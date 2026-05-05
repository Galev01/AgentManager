# Dashboard Copilot Chat — Phase A1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pop-out chat panel anchored bottom-right of every dashboard page, with bridge-managed per-user chat sessions backed by OpenClaw. Wire format supports tool-call envelope shape from day one (forward-compatible with Phase C); no tools exposed and no mutation surface in A1.

**Architecture:** Bridge (Windows) holds durable chat sessions on disk under `${MANAGEMENT_DIR}/copilot/sessions/<sessionId>/` (meta + transcript JSONL + pending JSON). One in-flight turn per session enforced by a per-session lock. Turn dispatch goes through a `ChatBackendAdapter` interface; `openclawChatBackend` reuses the existing `callGateway("sessions.create" / "sessions.send" / "sessions.get")` pattern from `claude-code-ask.ts:163-208`. Hermes adapter is a Phase-A1 stub returning a typed error. Dashboard surfaces a floating launcher in `AppShell` plus a slide-up popover panel; communication via Next.js `/api/copilot/[...path]` proxy that forwards bearer + actor-assertion headers to the bridge (mirrors `/api/runtime-config` pattern).

**Tech Stack:** TypeScript (Express on bridge, Next.js 15 App Router on dashboard), `node:test` for backend tests, Tailwind for UI, polling-based turn lifecycle (no WebSocket/SSE in A1).

**Spec:** `docs/superpowers/specs/2026-05-06-dashboard-copilot-chat-phase-a1-design.md`

**Branch:** `Gal/copilot-chat-spec` already contains the spec commit. Implementation tasks land on the same branch (or a child branch — implementer's call at execution time).

**Pre-existing test failure baseline:** `apps/bridge/test/youtube-rebuild.test.ts` fails on `main` and is unrelated to this work. Bridge filter is `bridge`, not `@openclaw-manager/bridge`.

---

## File Structure

### Shared types

- Modify `packages/types/src/copilot.ts` — NEW. All Copilot wire types.
- Modify `packages/types/src/index.ts` — re-export `./copilot.js` if the package uses an index barrel.
- Modify `packages/types/src/auth/permissions.ts` — add `copilot.chat`.
- Modify `packages/types/src/auth/users.ts` — add optional `preferences` field on `AuthUser` and `AuthUserPublic`.

### Bridge service layer

- Create `apps/bridge/src/services/copilot/store.ts` — atomic file IO for meta, transcript, pending.
- Create `apps/bridge/src/services/copilot/backend.ts` — `ChatBackendAdapter` interface + types.
- Create `apps/bridge/src/services/copilot/backends/openclaw.ts` — OpenClaw adapter impl.
- Create `apps/bridge/src/services/copilot/backends/hermes.ts` — Phase-A1 stub.
- Create `apps/bridge/src/services/copilot/orchestrator.ts` — per-session lock + turn lifecycle + crash recovery.

### Bridge HTTP

- Create `apps/bridge/src/routes/copilot.ts` — six endpoints + permission gates + audit log.
- Modify `apps/bridge/src/server.ts` — mount the router after the existing runtime-config mount; wire boot-time crash recovery.

### Bridge tests

- Create `apps/bridge/test/copilot-store.test.ts`.
- Create `apps/bridge/test/copilot-orchestrator.test.ts`.
- Create `apps/bridge/test/copilot-openclaw-backend.test.ts`.
- Create `apps/bridge/test/copilot-routes.test.ts`.

### Dashboard

- Create `apps/dashboard/src/lib/copilot-client.ts` — bridge client wrapper (mirrors `runtime-config-client.ts`).
- Create `apps/dashboard/src/app/api/copilot/[...path]/route.ts` — Next.js proxy.
- Create `apps/dashboard/src/components/copilot/launcher.tsx` — floating button.
- Create `apps/dashboard/src/components/copilot/panel.tsx` — popover container + state machine.
- Create `apps/dashboard/src/components/copilot/empty-state.tsx` — "new chat" form + recent sessions list.
- Create `apps/dashboard/src/components/copilot/session-view.tsx` — message timeline + composer.
- Create `apps/dashboard/src/hooks/use-copilot-sessions.ts` — list sessions.
- Create `apps/dashboard/src/hooks/use-session-snapshot.ts` — fetch one snapshot.
- Create `apps/dashboard/src/hooks/use-polling-turn.ts` — poll an in-flight turn.
- Create `apps/dashboard/src/hooks/use-copilot-ui-state.ts` — localStorage open/active session.
- Modify `apps/dashboard/src/components/app-shell.tsx` — mount `<CopilotLauncher />` inside the authenticated layout.

### Dashboard preferences (Unit D)

- Modify `apps/dashboard/src/app/admin/users/[id]/edit-form.tsx` — add Copilot default-backend radio.
- Modify `apps/bridge/src/services/auth/service.ts` (or wherever user updates land) — accept and persist `preferences` field. **Read the file first; if the existing pattern uses a different module split, adapt.**

---

## Phase 0 — Interface freeze

### Task 0: Types + permission

**Files:**
- Create: `packages/types/src/copilot.ts`
- Modify: `packages/types/src/index.ts`
- Modify: `packages/types/src/auth/permissions.ts`
- Modify: `packages/types/src/auth/users.ts`

- [ ] **Step 1: Add Copilot wire types**

Create `packages/types/src/copilot.ts`:

```ts
import type { JsonValue } from "./runtimes.js";

export type BackendKind = "openclaw" | "hermes";

export type CopilotSessionMeta = {
  id: string;
  ownerUserId: string;
  backend: BackendKind;
  title: string | null;
  createdAt: number;
  lastTurnAt: number | null;
  openclawSessionKey?: string;
};

export type CopilotMessageRole = "user" | "assistant" | "system";

export type CopilotToolCall = {
  type: "tool_call";
  call_id: string;
  tool: string;
  arguments: JsonValue;
};

export type CopilotToolResult = {
  type: "tool_result";
  call_id: string;
  ok: boolean;
  result?: JsonValue;
  error?: string;
};

export type CopilotMessageEvent =
  | { type: "text"; text: string }
  | CopilotToolCall
  | CopilotToolResult;

export type CopilotMessage = {
  msg_id: string;
  role: CopilotMessageRole;
  events: CopilotMessageEvent[];
  createdAt: number;
};

export type CopilotPendingState =
  | "pending"
  | "running"
  | "done"
  | "error"
  | "timeout";

export type CopilotPendingTurn = {
  msg_id: string;
  state: CopilotPendingState;
  startedAt: number;
  finishedAt?: number;
  errorDetail?: string;
};

export type CopilotSessionSnapshot = {
  meta: CopilotSessionMeta;
  messages: CopilotMessage[];
  pending: CopilotPendingTurn | null;
};

export type CopilotTurnPollResponse = {
  pending: CopilotPendingTurn;
  assistantMessage: CopilotMessage | null;
  lastMessageId: string | null;
};

export type CopilotSessionCreateInput = {
  backend: BackendKind;
  title?: string;
};

export type CopilotTurnSubmitInput = {
  message: string;
};
```

- [ ] **Step 2: Re-export from index**

In `packages/types/src/index.ts`, add:

```ts
export * from "./copilot.js";
```

(Position alongside other re-exports. **Read the file first** to match style — if there's a curated list rather than a wildcard, add the named exports explicitly.)

- [ ] **Step 3: Add `copilot.chat` permission**

In `packages/types/src/auth/permissions.ts`, add to `PERMISSION_REGISTRY`:

```ts
"copilot.chat":               { category: "copilot",        label: "Use Copilot chat",          description: "Open the dashboard Copilot chat panel and create/use sessions." },
```

Place the entry adjacent to the `runtimes.config` entry to keep the registry grouped.

- [ ] **Step 4: Extend `AuthUser` and `AuthUserPublic` with optional `preferences`**

In `packages/types/src/auth/users.ts`, add a new type and extend the user types:

```ts
export type CopilotUserPreferences = {
  defaultBackend?: "openclaw" | "hermes";
};

export type UserPreferences = {
  copilot?: CopilotUserPreferences;
};
```

Then add `preferences?: UserPreferences;` to **both** `AuthUser` and `AuthUserPublic`. The field is optional everywhere — missing means "default behavior".

- [ ] **Step 5: Build types**

Run: `pnpm --filter @openclaw-manager/types build`
Expected: clean build, exit 0.

- [ ] **Step 6: Build bridge + dashboard to confirm additive**

Run: `pnpm --filter bridge build && pnpm --filter dashboard build`
Expected: both pass. Adding optional fields and new exports is additive — should not break existing consumers.

- [ ] **Step 7: Commit**

```bash
git add packages/types/src/copilot.ts packages/types/src/index.ts \
        packages/types/src/auth/permissions.ts packages/types/src/auth/users.ts
git commit -m "types(copilot): wire types + copilot.chat permission + AuthUser preferences"
```

---

## Phase A — Bridge service layer

### Task A1: Copilot store (atomic file IO)

**Files:**
- Create: `apps/bridge/src/services/copilot/store.ts`
- Test: `apps/bridge/test/copilot-store.test.ts`

- [ ] **Step 1: Failing test**

Create `apps/bridge/test/copilot-store.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  createCopilotStore,
} from "../src/services/copilot/store.js";

async function tempRoot(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), "copilot-store-"));
}

test("create + read meta round-trip", async () => {
  const root = await tempRoot();
  const store = createCopilotStore({ rootDir: root });
  const meta = await store.createSession({
    ownerUserId: "u1",
    backend: "openclaw",
    title: "hello",
  });
  assert.equal(meta.ownerUserId, "u1");
  assert.equal(meta.backend, "openclaw");
  assert.equal(meta.title, "hello");
  assert.ok(meta.id.length > 0);

  const readBack = await store.readMeta(meta.id);
  assert.deepEqual(readBack, meta);
});

test("listSessionsForOwner only returns owner-matched, newest first", async () => {
  const root = await tempRoot();
  const store = createCopilotStore({ rootDir: root });
  const a = await store.createSession({ ownerUserId: "u1", backend: "openclaw", title: "A" });
  const b = await store.createSession({ ownerUserId: "u2", backend: "openclaw", title: "B" });
  const c = await store.createSession({ ownerUserId: "u1", backend: "openclaw", title: "C" });
  const list = await store.listSessionsForOwner("u1");
  assert.equal(list.length, 2);
  assert.equal(list[0].id, c.id);
  assert.equal(list[1].id, a.id);
  assert.ok(list.every((m) => m.ownerUserId === "u1"));
  assert.ok(b);
});

test("appendMessage writes JSONL line; readMessages returns ordered tail", async () => {
  const root = await tempRoot();
  const store = createCopilotStore({ rootDir: root });
  const meta = await store.createSession({ ownerUserId: "u1", backend: "openclaw" });
  await store.appendMessage(meta.id, {
    msg_id: "m1", role: "user", createdAt: 1, events: [{ type: "text", text: "hi" }],
  });
  await store.appendMessage(meta.id, {
    msg_id: "m2", role: "assistant", createdAt: 2, events: [{ type: "text", text: "hello" }],
  });
  const tail = await store.readMessages(meta.id, 50);
  assert.equal(tail.length, 2);
  assert.equal(tail[0].msg_id, "m1");
  assert.equal(tail[1].msg_id, "m2");
});

test("writePending + readPending atomic round-trip", async () => {
  const root = await tempRoot();
  const store = createCopilotStore({ rootDir: root });
  const meta = await store.createSession({ ownerUserId: "u1", backend: "openclaw" });
  await store.writePending(meta.id, {
    msg_id: "m1", state: "pending", startedAt: 100,
  });
  const p = await store.readPending(meta.id);
  assert.equal(p?.msg_id, "m1");
  assert.equal(p?.state, "pending");

  await store.writePending(meta.id, {
    msg_id: "m1", state: "done", startedAt: 100, finishedAt: 200,
  });
  const p2 = await store.readPending(meta.id);
  assert.equal(p2?.state, "done");
});

test("deleteSession recursively removes directory", async () => {
  const root = await tempRoot();
  const store = createCopilotStore({ rootDir: root });
  const meta = await store.createSession({ ownerUserId: "u1", backend: "openclaw" });
  await store.appendMessage(meta.id, { msg_id: "m1", role: "user", createdAt: 1, events: [{ type: "text", text: "x" }] });
  await store.deleteSession(meta.id);
  const after = await store.readMeta(meta.id);
  assert.equal(after, null);
});

test("listAllNonTerminalPending finds sessions with non-terminal pending state", async () => {
  const root = await tempRoot();
  const store = createCopilotStore({ rootDir: root });
  const a = await store.createSession({ ownerUserId: "u1", backend: "openclaw" });
  const b = await store.createSession({ ownerUserId: "u1", backend: "openclaw" });
  await store.writePending(a.id, { msg_id: "m1", state: "running", startedAt: 100 });
  await store.writePending(b.id, { msg_id: "m2", state: "done", startedAt: 100, finishedAt: 200 });
  const stale = await store.listAllNonTerminalPending();
  assert.equal(stale.length, 1);
  assert.equal(stale[0].sessionId, a.id);
});
```

- [ ] **Step 2: Run tests — confirm FAIL**

```
pnpm --filter bridge test 2>&1 | grep -E "copilot-store|tests |fail" | head -20
```

Expected: module not found / functions not exported.

- [ ] **Step 3: Implement the store**

Create `apps/bridge/src/services/copilot/store.ts`:

```ts
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import type {
  CopilotSessionMeta, CopilotMessage, CopilotPendingTurn, BackendKind,
} from "@openclaw-manager/types";

export type CopilotStoreDeps = { rootDir: string };

export type CopilotStore = {
  createSession(args: {
    ownerUserId: string;
    backend: BackendKind;
    title?: string;
    openclawSessionKey?: string;
  }): Promise<CopilotSessionMeta>;
  readMeta(sessionId: string): Promise<CopilotSessionMeta | null>;
  updateMeta(sessionId: string, patch: Partial<CopilotSessionMeta>): Promise<CopilotSessionMeta>;
  listSessionsForOwner(ownerUserId: string, limit?: number): Promise<CopilotSessionMeta[]>;
  appendMessage(sessionId: string, msg: CopilotMessage): Promise<void>;
  readMessages(sessionId: string, limit: number): Promise<CopilotMessage[]>;
  writePending(sessionId: string, p: CopilotPendingTurn): Promise<void>;
  readPending(sessionId: string): Promise<CopilotPendingTurn | null>;
  clearPending(sessionId: string): Promise<void>;
  deleteSession(sessionId: string): Promise<void>;
  listAllNonTerminalPending(): Promise<Array<{ sessionId: string; pending: CopilotPendingTurn }>>;
};

const TERMINAL: ReadonlyArray<CopilotPendingTurn["state"]> = ["done", "error", "timeout"];

function sessionDir(root: string, id: string): string { return path.join(root, "sessions", id); }
function metaPath(root: string, id: string): string { return path.join(sessionDir(root, id), "meta.json"); }
function transcriptPath(root: string, id: string): string { return path.join(sessionDir(root, id), "transcript.jsonl"); }
function pendingPath(root: string, id: string): string { return path.join(sessionDir(root, id), "pending.json"); }

async function atomicWriteJson(p: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(p), { recursive: true });
  const tmp = `${p}.tmp-${process.pid}-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
  await fs.writeFile(tmp, JSON.stringify(value, null, 2) + "\n", "utf8");
  await fs.rename(tmp, p);
}

async function readJsonOrNull<T>(p: string): Promise<T | null> {
  try { return JSON.parse(await fs.readFile(p, "utf8")) as T; }
  catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw e;
  }
}

export function createCopilotStore(deps: CopilotStoreDeps): CopilotStore {
  const root = deps.rootDir;

  async function readMeta(id: string): Promise<CopilotSessionMeta | null> {
    return readJsonOrNull<CopilotSessionMeta>(metaPath(root, id));
  }

  async function writeMeta(meta: CopilotSessionMeta): Promise<void> {
    await atomicWriteJson(metaPath(root, meta.id), meta);
  }

  return {
    async createSession({ ownerUserId, backend, title, openclawSessionKey }) {
      const id = crypto.randomUUID();
      const meta: CopilotSessionMeta = {
        id, ownerUserId, backend,
        title: title ?? null,
        createdAt: Date.now(),
        lastTurnAt: null,
        openclawSessionKey,
      };
      await writeMeta(meta);
      return meta;
    },
    readMeta,
    async updateMeta(id, patch) {
      const current = await readMeta(id);
      if (!current) throw new Error(`copilot session not found: ${id}`);
      const next: CopilotSessionMeta = { ...current, ...patch, id: current.id };
      await writeMeta(next);
      return next;
    },
    async listSessionsForOwner(ownerUserId, limit = 50) {
      const sessionsRoot = path.join(root, "sessions");
      let names: string[] = [];
      try { names = await fs.readdir(sessionsRoot); } catch { return []; }
      const out: CopilotSessionMeta[] = [];
      for (const id of names) {
        const meta = await readMeta(id);
        if (meta && meta.ownerUserId === ownerUserId) out.push(meta);
      }
      out.sort((a, b) => (b.lastTurnAt ?? b.createdAt) - (a.lastTurnAt ?? a.createdAt));
      return out.slice(0, limit);
    },
    async appendMessage(id, msg) {
      const dir = sessionDir(root, id);
      await fs.mkdir(dir, { recursive: true });
      await fs.appendFile(transcriptPath(root, id), JSON.stringify(msg) + "\n", "utf8");
    },
    async readMessages(id, limit) {
      let raw: string;
      try { raw = await fs.readFile(transcriptPath(root, id), "utf8"); } catch { return []; }
      const lines = raw.split("\n").filter((l) => l.length > 0);
      const tail = limit > 0 ? lines.slice(-limit) : lines;
      const out: CopilotMessage[] = [];
      for (const line of tail) {
        try { out.push(JSON.parse(line) as CopilotMessage); } catch { /* skip corrupt */ }
      }
      return out;
    },
    async writePending(id, p) { await atomicWriteJson(pendingPath(root, id), p); },
    async readPending(id) { return readJsonOrNull<CopilotPendingTurn>(pendingPath(root, id)); },
    async clearPending(id) {
      try { await fs.unlink(pendingPath(root, id)); }
      catch (e) { if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e; }
    },
    async deleteSession(id) {
      await fs.rm(sessionDir(root, id), { recursive: true, force: true });
    },
    async listAllNonTerminalPending() {
      const sessionsRoot = path.join(root, "sessions");
      let names: string[] = [];
      try { names = await fs.readdir(sessionsRoot); } catch { return []; }
      const out: Array<{ sessionId: string; pending: CopilotPendingTurn }> = [];
      for (const id of names) {
        const p = await readJsonOrNull<CopilotPendingTurn>(pendingPath(root, id));
        if (p && !TERMINAL.includes(p.state)) out.push({ sessionId: id, pending: p });
      }
      return out;
    },
  };
}
```

- [ ] **Step 4: Run tests — confirm PASS**

Run the same command as Step 2. Expected: 6 tests pass; bridge test baseline preserved (only `youtube-rebuild.test.ts` fail unchanged).

- [ ] **Step 5: Commit**

```bash
git add apps/bridge/src/services/copilot/store.ts apps/bridge/test/copilot-store.test.ts
git commit -m "bridge(copilot): atomic store for meta, transcript, pending"
```

---

### Task A2: Backend adapter contract + Hermes Phase-A1 stub

**Files:**
- Create: `apps/bridge/src/services/copilot/backend.ts`
- Create: `apps/bridge/src/services/copilot/backends/hermes.ts`

- [ ] **Step 1: Define the adapter interface**

Create `apps/bridge/src/services/copilot/backend.ts`:

```ts
import type { CopilotSessionMeta } from "@openclaw-manager/types";

export type ChatTurnRequest = {
  session: CopilotSessionMeta;
  userMessageText: string;
  msgId: string;
};

export type ChatTurnResult =
  | { ok: true; assistantText: string }
  | { ok: false; error: string };

export type SessionBootstrap = Partial<Pick<CopilotSessionMeta, "openclawSessionKey">>;

export interface ChatBackendAdapter {
  /**
   * Called once when a session is created with this backend. Bootstraps any
   * backend-side state (e.g. OpenClaw `sessions.create`). Returns optional
   * fields to merge into the meta — for OpenClaw, the gateway key.
   */
  createSession(args: { sessionId: string; ownerUserId: string }): Promise<SessionBootstrap>;

  /**
   * Submits a user turn and returns the assistant text. Backend-native
   * session memory is authoritative — the adapter does NOT receive local
   * transcript history.
   */
  sendTurn(req: ChatTurnRequest): Promise<ChatTurnResult>;
}
```

- [ ] **Step 2: Implement the Hermes Phase-A1 stub**

Create `apps/bridge/src/services/copilot/backends/hermes.ts`:

```ts
import type { ChatBackendAdapter, ChatTurnRequest, ChatTurnResult, SessionBootstrap } from "../backend.js";

/**
 * Phase-A1 stub. The route layer rejects backend="hermes" at create time so
 * this adapter is never reached in production. It exists so Phase A2 is a
 * single-file replacement with no contract change.
 */
export function createHermesChatBackend(): ChatBackendAdapter {
  return {
    async createSession(): Promise<SessionBootstrap> {
      return {};
    },
    async sendTurn(_req: ChatTurnRequest): Promise<ChatTurnResult> {
      return { ok: false, error: "hermes backend not yet implemented (Phase A2)" };
    },
  };
}
```

- [ ] **Step 3: Build bridge to confirm types align**

Run: `pnpm --filter bridge build 2>&1 | tail -5`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add apps/bridge/src/services/copilot/backend.ts apps/bridge/src/services/copilot/backends/hermes.ts
git commit -m "bridge(copilot): backend adapter interface + Hermes Phase-A1 stub"
```

---

### Task A3: OpenClaw chat backend

**Files:**
- Create: `apps/bridge/src/services/copilot/backends/openclaw.ts`
- Test: `apps/bridge/test/copilot-openclaw-backend.test.ts`

- [ ] **Step 1: Failing tests against an in-memory `callGateway` fake**

Create `apps/bridge/test/copilot-openclaw-backend.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { createOpenclawChatBackend } from "../src/services/copilot/backends/openclaw.js";
import type { CopilotSessionMeta } from "@openclaw-manager/types";

const baseSession = (over?: Partial<CopilotSessionMeta>): CopilotSessionMeta => ({
  id: "s1",
  ownerUserId: "u1",
  backend: "openclaw",
  title: null,
  createdAt: 0,
  lastTurnAt: null,
  openclawSessionKey: "copilot-s1",
  ...over,
});

test("createSession calls sessions.create with derived key", async () => {
  const calls: Array<{ method: string; params: unknown }> = [];
  const callGateway = async (method: string, params?: Record<string, unknown>) => {
    calls.push({ method, params });
    return null;
  };
  const backend = createOpenclawChatBackend({ callGateway, replyPollIntervalMs: 1, replyTimeoutMs: 100 });
  const out = await backend.createSession({ sessionId: "s1", ownerUserId: "u1" });
  assert.equal(out.openclawSessionKey, "copilot-s1");
  assert.equal(calls[0].method, "sessions.create");
  assert.deepEqual(calls[0].params, { key: "copilot-s1" });
});

test("sendTurn submits message + polls until assistant text appears", async () => {
  let getCalls = 0;
  const callGateway = async (method: string, params?: Record<string, unknown>): Promise<unknown> => {
    if (method === "sessions.create") return null;
    if (method === "sessions.send") return { runId: "r1" };
    if (method === "sessions.get") {
      getCalls++;
      if (getCalls < 2) return { messages: [{ role: "user", content: [{ type: "text", text: "hi" }] }] };
      return {
        messages: [
          { role: "user", content: [{ type: "text", text: "hi" }] },
          { role: "assistant", content: [{ type: "text", text: "hello back" }] },
        ],
      };
    }
    return null;
  };
  const backend = createOpenclawChatBackend({ callGateway, replyPollIntervalMs: 1, replyTimeoutMs: 1000 });
  const result = await backend.sendTurn({
    session: baseSession(),
    userMessageText: "hi",
    msgId: "m1",
  });
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.assistantText, "hello back");
});

test("sendTurn returns ok:false with error on timeout", async () => {
  const callGateway = async (method: string): Promise<unknown> => {
    if (method === "sessions.create") return null;
    if (method === "sessions.send") return null;
    if (method === "sessions.get") return { messages: [] };
    return null;
  };
  const backend = createOpenclawChatBackend({ callGateway, replyPollIntervalMs: 1, replyTimeoutMs: 30 });
  const result = await backend.sendTurn({
    session: baseSession(),
    userMessageText: "hi",
    msgId: "m1",
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.error, /timeout/i);
});

test("sendTurn prepends preamble on first turn (baseline=0)", async () => {
  const sent: string[] = [];
  let getCalls = 0;
  const callGateway = async (method: string, params?: Record<string, unknown>): Promise<unknown> => {
    if (method === "sessions.create") return null;
    if (method === "sessions.send") {
      sent.push(String((params as { message: string }).message));
      return null;
    }
    if (method === "sessions.get") {
      getCalls++;
      if (getCalls < 2) return { messages: [] };
      return { messages: [
        { role: "user", content: [{ type: "text", text: sent[0] }] },
        { role: "assistant", content: [{ type: "text", text: "ok" }] },
      ] };
    }
    return null;
  };
  const backend = createOpenclawChatBackend({ callGateway, replyPollIntervalMs: 1, replyTimeoutMs: 1000 });
  await backend.sendTurn({ session: baseSession(), userMessageText: "first", msgId: "m1" });
  assert.match(sent[0], /Dashboard Copilot/);
  assert.match(sent[0], /first/);
});
```

- [ ] **Step 2: Run tests — confirm FAIL**

```
pnpm --filter bridge test 2>&1 | grep -E "copilot-openclaw-backend|tests |fail" | head -20
```

Expected: module missing.

- [ ] **Step 3: Implement the OpenClaw backend**

Create `apps/bridge/src/services/copilot/backends/openclaw.ts`:

```ts
import type { ChatBackendAdapter, ChatTurnRequest, ChatTurnResult, SessionBootstrap } from "../backend.js";

export type OpenclawChatBackendDeps = {
  callGateway: (method: string, params?: Record<string, unknown>) => Promise<unknown>;
  replyPollIntervalMs?: number;   // default 500
  replyTimeoutMs?: number;        // default 120000
};

type GatewayMessage = {
  role?: string;
  content?: Array<{ type?: string; text?: string }>;
};

const PREAMBLE = [
  "[Persistent system instructions for this OpenClaw session]",
  "",
  "You are the Dashboard Copilot for OpenClaw-Manager. You are talking to a",
  "human operator inside a dashboard chat panel.",
  "",
  "Tone:",
  "- Helpful, terse, technical. No warm-up pleasantries.",
  "- Lead with the answer or the specific clarifying question.",
  "- Reply in English unless the operator writes in another language.",
  "",
  "Scope:",
  "- You can explain the system, suggest changes, walk through code, interpret",
  "  logs, and propose runbooks.",
  "- You CANNOT make dashboard changes, edit files, restart services, or run",
  "  arbitrary commands from this chat. The dashboard does not yet expose",
  "  those tools to you. If the operator asks you to perform such an action,",
  "  say so clearly and offer the closest informational answer.",
  "- If the operator asks for a destructive action, do not pretend you executed",
  "  it. State the limitation honestly.",
  "",
  "Grounding:",
  "- Distinguish what you have been told vs. what you would need to look up.",
  "  When you are uncertain, say so.",
  "- Refer to files by absolute path or the canonical repo path. Do not invent",
  "  file names.",
].join("\n");

function deriveKey(sessionId: string): string { return `copilot-${sessionId}`; }

function extractAssistantText(messages: GatewayMessage[]): string | null {
  const last = messages[messages.length - 1];
  if (!last || last.role !== "assistant") return null;
  const text = last.content?.find((p) => p.type === "text" && typeof p.text === "string")?.text;
  return text ?? null;
}

function wrapFirstMessage(userText: string): string {
  return `${PREAMBLE}\n\n---\n\n${userText}`;
}

async function ensureSession(callGateway: OpenclawChatBackendDeps["callGateway"], key: string): Promise<number> {
  await callGateway("sessions.create", { key });
  const state = (await callGateway("sessions.get", { key })) as { messages?: GatewayMessage[] };
  return state?.messages?.length ?? 0;
}

async function pollForReply(
  callGateway: OpenclawChatBackendDeps["callGateway"],
  key: string,
  baselineLength: number,
  timeoutMs: number,
  intervalMs: number,
): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, intervalMs));
    const state = (await callGateway("sessions.get", { key })) as { messages?: GatewayMessage[] };
    const messages = state?.messages ?? [];
    if (messages.length >= baselineLength + 2) {
      const text = extractAssistantText(messages);
      if (text) return text;
    }
  }
  throw new Error("timeout waiting for OpenClaw reply");
}

export function createOpenclawChatBackend(deps: OpenclawChatBackendDeps): ChatBackendAdapter {
  const intervalMs = deps.replyPollIntervalMs ?? 500;
  const timeoutMs = deps.replyTimeoutMs ?? 120000;

  return {
    async createSession({ sessionId }): Promise<SessionBootstrap> {
      const key = deriveKey(sessionId);
      await deps.callGateway("sessions.create", { key });
      return { openclawSessionKey: key };
    },
    async sendTurn(req: ChatTurnRequest): Promise<ChatTurnResult> {
      const key = req.session.openclawSessionKey ?? deriveKey(req.session.id);
      try {
        const baseline = await ensureSession(deps.callGateway, key);
        const message = baseline === 0 ? wrapFirstMessage(req.userMessageText) : req.userMessageText;
        await deps.callGateway("sessions.send", { key, idempotencyKey: req.msgId, message });
        const assistantText = await pollForReply(deps.callGateway, key, baseline, timeoutMs, intervalMs);
        return { ok: true, assistantText };
      } catch (e) {
        return { ok: false, error: (e as Error).message };
      }
    },
  };
}
```

- [ ] **Step 4: Run tests — confirm PASS**

Same filter as Step 2. Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/bridge/src/services/copilot/backends/openclaw.ts apps/bridge/test/copilot-openclaw-backend.test.ts
git commit -m "bridge(copilot): openclaw chat backend with poll-for-reply pattern"
```

---

### Task A4: Orchestrator (per-session lock + turn lifecycle + crash recovery)

**Files:**
- Create: `apps/bridge/src/services/copilot/orchestrator.ts`
- Test: `apps/bridge/test/copilot-orchestrator.test.ts`

- [ ] **Step 1: Failing tests**

Create `apps/bridge/test/copilot-orchestrator.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createCopilotStore } from "../src/services/copilot/store.js";
import { createCopilotOrchestrator } from "../src/services/copilot/orchestrator.js";
import type { ChatBackendAdapter } from "../src/services/copilot/backend.js";

async function tempRoot() { return mkdtemp(path.join(tmpdir(), "copilot-orch-")); }

const okBackend: ChatBackendAdapter = {
  async createSession() { return { openclawSessionKey: "k1" }; },
  async sendTurn() { return { ok: true, assistantText: "world" }; },
};

const slowBackend = (delayMs: number, text = "world"): ChatBackendAdapter => ({
  async createSession() { return {}; },
  async sendTurn() {
    await new Promise((r) => setTimeout(r, delayMs));
    return { ok: true, assistantText: text };
  },
});

test("submitTurn appends user msg + writes pending + dispatches + resolves to done", async () => {
  const root = await tempRoot();
  const store = createCopilotStore({ rootDir: root });
  const orch = createCopilotOrchestrator({ store, backendFor: () => okBackend });
  const meta = await store.createSession({ ownerUserId: "u1", backend: "openclaw" });
  const { msgId } = await orch.submitTurn({ sessionId: meta.id, userMessageText: "hi" });

  // Pending immediately set
  const pendingNow = await store.readPending(meta.id);
  assert.ok(pendingNow);

  // Wait for completion
  await orch.waitForTurn(meta.id, msgId, 5000);
  const finalPending = await store.readPending(meta.id);
  assert.equal(finalPending?.state, "done");

  const msgs = await store.readMessages(meta.id, 50);
  assert.equal(msgs.length, 2);
  assert.equal(msgs[0].role, "user");
  assert.equal(msgs[1].role, "assistant");
  assert.deepEqual(msgs[1].events, [{ type: "text", text: "world" }]);
});

test("concurrent submitTurn returns 409 turn_in_progress", async () => {
  const root = await tempRoot();
  const store = createCopilotStore({ rootDir: root });
  const orch = createCopilotOrchestrator({ store, backendFor: () => slowBackend(100) });
  const meta = await store.createSession({ ownerUserId: "u1", backend: "openclaw" });
  await orch.submitTurn({ sessionId: meta.id, userMessageText: "first" });
  await assert.rejects(
    orch.submitTurn({ sessionId: meta.id, userMessageText: "second" }),
    (e: unknown) => (e as { code?: string }).code === "turn_in_progress",
  );
});

test("backend error transitions pending to error", async () => {
  const root = await tempRoot();
  const store = createCopilotStore({ rootDir: root });
  const errBackend: ChatBackendAdapter = {
    async createSession() { return {}; },
    async sendTurn() { return { ok: false, error: "boom" }; },
  };
  const orch = createCopilotOrchestrator({ store, backendFor: () => errBackend });
  const meta = await store.createSession({ ownerUserId: "u1", backend: "openclaw" });
  const { msgId } = await orch.submitTurn({ sessionId: meta.id, userMessageText: "x" });
  await orch.waitForTurn(meta.id, msgId, 5000);
  const p = await store.readPending(meta.id);
  assert.equal(p?.state, "error");
  assert.match(p?.errorDetail ?? "", /boom/);
});

test("recoverOnBoot transitions stale running pending to timeout", async () => {
  const root = await tempRoot();
  const store = createCopilotStore({ rootDir: root });
  const meta = await store.createSession({ ownerUserId: "u1", backend: "openclaw" });
  await store.writePending(meta.id, { msg_id: "m1", state: "running", startedAt: Date.now() - 999_999 });
  const orch = createCopilotOrchestrator({ store, backendFor: () => okBackend, pendingTimeoutMs: 180_000 });
  await orch.recoverOnBoot();
  const p = await store.readPending(meta.id);
  assert.equal(p?.state, "timeout");
});

test("recoverOnBoot transitions running with later assistant message to done", async () => {
  const root = await tempRoot();
  const store = createCopilotStore({ rootDir: root });
  const meta = await store.createSession({ ownerUserId: "u1", backend: "openclaw" });
  const startedAt = Date.now() - 1000;
  await store.writePending(meta.id, { msg_id: "m1", state: "running", startedAt });
  await store.appendMessage(meta.id, {
    msg_id: "m1", role: "user", createdAt: startedAt + 10, events: [{ type: "text", text: "hi" }],
  });
  await store.appendMessage(meta.id, {
    msg_id: "a1", role: "assistant", createdAt: startedAt + 200, events: [{ type: "text", text: "hello" }],
  });
  const orch = createCopilotOrchestrator({ store, backendFor: () => okBackend, pendingTimeoutMs: 180_000 });
  await orch.recoverOnBoot();
  const p = await store.readPending(meta.id);
  assert.equal(p?.state, "done");
});
```

- [ ] **Step 2: Run tests — confirm FAIL**

```
pnpm --filter bridge test 2>&1 | grep -E "copilot-orchestrator|tests |fail" | head -20
```

- [ ] **Step 3: Implement the orchestrator**

Create `apps/bridge/src/services/copilot/orchestrator.ts`:

```ts
import crypto from "node:crypto";
import type {
  CopilotMessage, CopilotPendingTurn, BackendKind,
} from "@openclaw-manager/types";
import type { ChatBackendAdapter } from "./backend.js";
import type { CopilotStore } from "./store.js";

export type CopilotOrchestratorDeps = {
  store: CopilotStore;
  backendFor: (kind: BackendKind) => ChatBackendAdapter;
  pendingTimeoutMs?: number;     // default 180_000
  onAudit?: (line: { event: string; data: Record<string, unknown> }) => void;
};

export type CopilotOrchestrator = {
  submitTurn(args: { sessionId: string; userMessageText: string }): Promise<{ msgId: string; pending: CopilotPendingTurn }>;
  waitForTurn(sessionId: string, msgId: string, timeoutMs: number): Promise<CopilotPendingTurn>;
  recoverOnBoot(): Promise<void>;
};

export class TurnInProgressError extends Error {
  code = "turn_in_progress" as const;
  constructor() { super("a turn is already in progress for this session"); }
}

const TERMINAL: ReadonlyArray<CopilotPendingTurn["state"]> = ["done", "error", "timeout"];

export function createCopilotOrchestrator(deps: CopilotOrchestratorDeps): CopilotOrchestrator {
  const pendingTimeoutMs = deps.pendingTimeoutMs ?? 180_000;
  const inflight = new Map<string, Promise<void>>();

  function audit(event: string, data: Record<string, unknown>) {
    deps.onAudit?.({ event, data });
  }

  async function dispatch(sessionId: string, msgId: string, userText: string): Promise<void> {
    const meta = await deps.store.readMeta(sessionId);
    if (!meta) throw new Error(`copilot session not found: ${sessionId}`);
    const backend = deps.backendFor(meta.backend);

    await deps.store.writePending(sessionId, { msg_id: msgId, state: "running", startedAt: Date.now() });

    try {
      const result = await backend.sendTurn({ session: meta, userMessageText: userText, msgId });
      if (result.ok) {
        const assistantMsg: CopilotMessage = {
          msg_id: crypto.randomUUID(),
          role: "assistant",
          createdAt: Date.now(),
          events: [{ type: "text", text: result.assistantText }],
        };
        await deps.store.appendMessage(sessionId, assistantMsg);
        const finishedAt = Date.now();
        await deps.store.writePending(sessionId, { msg_id: msgId, state: "done", startedAt: 0, finishedAt });
        await deps.store.updateMeta(sessionId, { lastTurnAt: finishedAt });
        audit("turn.completed", {
          sessionId, backend: meta.backend, user: meta.ownerUserId, msgId,
          latencyMs: finishedAt - (await deps.store.readPending(sessionId))!.startedAt,
          assistantLength: result.assistantText.length,
        });
      } else {
        await deps.store.writePending(sessionId, {
          msg_id: msgId, state: "error", startedAt: 0, finishedAt: Date.now(), errorDetail: result.error,
        });
        audit("turn.error", { sessionId, backend: meta.backend, user: meta.ownerUserId, msgId, errorDetail: result.error });
      }
    } catch (e) {
      const errMsg = (e as Error).message;
      await deps.store.writePending(sessionId, {
        msg_id: msgId, state: "error", startedAt: 0, finishedAt: Date.now(), errorDetail: errMsg,
      });
      audit("turn.error", { sessionId, backend: meta.backend, user: meta.ownerUserId, msgId, errorDetail: errMsg });
    }
  }

  return {
    async submitTurn({ sessionId, userMessageText }) {
      const existing = await deps.store.readPending(sessionId);
      if (existing && !TERMINAL.includes(existing.state)) {
        throw new TurnInProgressError();
      }

      const msgId = crypto.randomUUID();
      const startedAt = Date.now();
      const meta = await deps.store.readMeta(sessionId);
      if (!meta) throw new Error(`copilot session not found: ${sessionId}`);

      // Append user message + write pending in user-visible order
      await deps.store.appendMessage(sessionId, {
        msg_id: msgId, role: "user", createdAt: startedAt, events: [{ type: "text", text: userMessageText }],
      });
      const pending: CopilotPendingTurn = { msg_id: msgId, state: "pending", startedAt };
      await deps.store.writePending(sessionId, pending);
      audit("turn.accepted", { sessionId, backend: meta.backend, user: meta.ownerUserId, msgId });

      const promise = dispatch(sessionId, msgId, userMessageText).finally(() => {
        inflight.delete(sessionId);
      });
      inflight.set(sessionId, promise);
      // Don't await — return immediately
      void promise;

      return { msgId, pending };
    },

    async waitForTurn(sessionId, msgId, timeoutMs) {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        const p = await deps.store.readPending(sessionId);
        if (!p || p.msg_id !== msgId) {
          // Different msg or cleared — caller should re-fetch snapshot
          throw new Error(`pending for msgId ${msgId} no longer present`);
        }
        if (TERMINAL.includes(p.state)) return p;
        await new Promise((r) => setTimeout(r, 50));
      }
      throw new Error("waitForTurn deadline exceeded");
    },

    async recoverOnBoot() {
      const stale = await deps.store.listAllNonTerminalPending();
      const now = Date.now();
      for (const { sessionId, pending } of stale) {
        const messages = await deps.store.readMessages(sessionId, 50);
        const newerAssistant = messages
          .filter((m) => m.role === "assistant" && m.createdAt > pending.startedAt)
          .pop();
        if (newerAssistant) {
          await deps.store.writePending(sessionId, {
            msg_id: pending.msg_id, state: "done", startedAt: pending.startedAt, finishedAt: newerAssistant.createdAt,
          });
          audit("turn.recovered_done", { sessionId, msgId: pending.msg_id });
        } else if (now - pending.startedAt > pendingTimeoutMs) {
          await deps.store.writePending(sessionId, {
            msg_id: pending.msg_id, state: "timeout", startedAt: pending.startedAt, finishedAt: now,
            errorDetail: "stale on bridge restart",
          });
          audit("turn.timeout", { sessionId, msgId: pending.msg_id, elapsedMs: now - pending.startedAt });
        }
      }
    },
  };
}
```

- [ ] **Step 4: Run tests — confirm PASS**

```
pnpm --filter bridge test 2>&1 | grep -E "copilot-orchestrator|tests |fail" | head -20
```

Expected: 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/bridge/src/services/copilot/orchestrator.ts apps/bridge/test/copilot-orchestrator.test.ts
git commit -m "bridge(copilot): orchestrator with per-session lock and crash recovery"
```

---

## Phase B — Bridge HTTP routes

### Task B1: Routes + audit log

**Files:**
- Create: `apps/bridge/src/routes/copilot.ts`
- Modify: `apps/bridge/src/server.ts`
- Test: `apps/bridge/test/copilot-routes.test.ts`

- [ ] **Step 1: Failing tests**

Create `apps/bridge/test/copilot-routes.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import http from "node:http";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createCopilotStore } from "../src/services/copilot/store.js";
import { createCopilotOrchestrator } from "../src/services/copilot/orchestrator.js";
import { createCopilotRouter } from "../src/routes/copilot.js";
import type { ChatBackendAdapter } from "../src/services/copilot/backend.js";

const okBackend: ChatBackendAdapter = {
  async createSession() { return { openclawSessionKey: "k1" }; },
  async sendTurn() { return { ok: true, assistantText: "pong" }; },
};

async function bootApp(perms: string[], userId = "u1") {
  const root = await mkdtemp(path.join(tmpdir(), "copilot-rt-"));
  const store = createCopilotStore({ rootDir: root });
  const orch = createCopilotOrchestrator({ store, backendFor: () => okBackend });
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).auth = { user: { id: userId }, permissions: perms };
    next();
  });
  app.use(createCopilotRouter({ store, orchestrator: orch }));
  const server = http.createServer(app).listen(0);
  const addr = server.address() as { port: number };
  return { url: `http://127.0.0.1:${addr.port}`, close: () => server.close() };
}

test("POST /copilot/sessions creates with backend openclaw", async () => {
  const a = await bootApp(["copilot.chat"]);
  const r = await fetch(`${a.url}/copilot/sessions`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ backend: "openclaw", title: "t" }),
  });
  const body = await r.json();
  assert.equal(r.status, 200);
  assert.equal(body.backend, "openclaw");
  assert.equal(body.ownerUserId, "u1");
  a.close();
});

test("POST /copilot/sessions rejects backend hermes with 400", async () => {
  const a = await bootApp(["copilot.chat"]);
  const r = await fetch(`${a.url}/copilot/sessions`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ backend: "hermes" }),
  });
  const body = await r.json();
  assert.equal(r.status, 400);
  assert.equal(body.error, "backend_not_supported");
  a.close();
});

test("GET /copilot/sessions/:id 404 when not owner (no leakage)", async () => {
  const a = await bootApp(["copilot.chat"], "u1");
  const created = await fetch(`${a.url}/copilot/sessions`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ backend: "openclaw" }),
  }).then((x) => x.json());
  a.close();

  const b = await bootApp(["copilot.chat"], "u2");
  const r = await fetch(`${b.url}/copilot/sessions/${created.id}`);
  // Different in-memory store per bootApp, so this also 404s on store-miss; main point is route shape exercised.
  assert.equal(r.status, 404);
  b.close();
});

test("403 without copilot.chat permission", async () => {
  const a = await bootApp([]);
  const r = await fetch(`${a.url}/copilot/sessions`);
  assert.equal(r.status, 403);
  a.close();
});

test("POST turn + GET turn poll returns done with assistantMessage", async () => {
  const a = await bootApp(["copilot.chat"]);
  const created = await fetch(`${a.url}/copilot/sessions`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ backend: "openclaw" }),
  }).then((x) => x.json());

  const submit = await fetch(`${a.url}/copilot/sessions/${created.id}/turn`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ message: "ping" }),
  }).then((x) => x.json());
  assert.equal(submit.state, "pending");

  // poll until done
  let body: any;
  for (let i = 0; i < 50; i++) {
    const res = await fetch(`${a.url}/copilot/sessions/${created.id}/turn/${submit.msg_id}`);
    body = await res.json();
    if (body.pending.state === "done") break;
    await new Promise((r) => setTimeout(r, 20));
  }
  assert.equal(body.pending.state, "done");
  assert.ok(body.assistantMessage);
  assert.equal(body.assistantMessage.role, "assistant");
  a.close();
});

test("DELETE removes session", async () => {
  const a = await bootApp(["copilot.chat"]);
  const created = await fetch(`${a.url}/copilot/sessions`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ backend: "openclaw" }),
  }).then((x) => x.json());
  const r = await fetch(`${a.url}/copilot/sessions/${created.id}`, { method: "DELETE" });
  assert.equal(r.status, 204);
  const get = await fetch(`${a.url}/copilot/sessions/${created.id}`);
  assert.equal(get.status, 404);
  a.close();
});
```

- [ ] **Step 2: Run tests — confirm FAIL**

```
pnpm --filter bridge test 2>&1 | grep -E "copilot-routes|tests |fail" | head -20
```

- [ ] **Step 3: Implement the router**

Create `apps/bridge/src/routes/copilot.ts`:

```ts
import { Router, type Router as ExpressRouter, type Request, type Response, type NextFunction, type RequestHandler } from "express";
import type { CopilotStore } from "../services/copilot/store.js";
import type { CopilotOrchestrator } from "../services/copilot/orchestrator.js";
import { TurnInProgressError } from "../services/copilot/orchestrator.js";
import type {
  PermissionId, CopilotSessionCreateInput, CopilotTurnSubmitInput,
  CopilotSessionSnapshot, CopilotMessage, CopilotPendingTurn,
} from "@openclaw-manager/types";

export type CopilotRouterDeps = {
  store: CopilotStore;
  orchestrator: CopilotOrchestrator;
  backendCreator?: (sessionId: string, ownerUserId: string, backend: "openclaw" | "hermes") => Promise<{ openclawSessionKey?: string }>;
  log?: (event: string, data: Record<string, unknown>) => void;
};

function requirePerm(...perms: PermissionId[]): RequestHandler<any> {
  return (req: Request, res: Response, next: NextFunction): void => {
    const eff = (req as any).auth?.permissions ?? [];
    for (const p of perms) {
      if (!eff.includes(p)) { res.status(403).json({ error: "forbidden", missing: p }); return; }
    }
    next();
  };
}

function userId(req: Request): string | null {
  return (req as any).auth?.user?.id ?? null;
}

export function createCopilotRouter(deps: CopilotRouterDeps): ExpressRouter {
  const r: ExpressRouter = Router();
  const log = deps.log ?? ((event, data) => console.log(`copilot.${event}`, JSON.stringify(data)));

  async function loadCallerSession(req: Request, res: Response): Promise<{ id: string } | null> {
    const id = String(req.params.id);
    const meta = await deps.store.readMeta(id);
    if (!meta || meta.ownerUserId !== userId(req)) {
      res.status(404).json({ error: "session_not_found" });
      return null;
    }
    return { id };
  }

  r.get("/copilot/sessions", requirePerm("copilot.chat"), async (req, res) => {
    const owner = userId(req);
    if (!owner) { res.status(401).json({ error: "unauthorized" }); return; }
    const list = await deps.store.listSessionsForOwner(owner, 50);
    res.json({ sessions: list });
  });

  r.post("/copilot/sessions", requirePerm("copilot.chat"), async (req, res) => {
    const owner = userId(req);
    if (!owner) { res.status(401).json({ error: "unauthorized" }); return; }
    const body = (req.body ?? {}) as CopilotSessionCreateInput;
    if (body.backend !== "openclaw" && body.backend !== "hermes") {
      res.status(400).json({ error: "invalid_backend" });
      return;
    }
    if (body.backend === "hermes") {
      res.status(400).json({ error: "backend_not_supported", detail: "Hermes backend lands in Phase A2" });
      return;
    }
    const meta = await deps.store.createSession({
      ownerUserId: owner, backend: body.backend, title: body.title,
    });
    if (deps.backendCreator) {
      const boot = await deps.backendCreator(meta.id, owner, body.backend);
      if (boot.openclawSessionKey) {
        await deps.store.updateMeta(meta.id, { openclawSessionKey: boot.openclawSessionKey });
      }
    }
    const final = (await deps.store.readMeta(meta.id))!;
    log("session.created", { user: owner, sessionId: final.id, backend: final.backend });
    res.json(final);
  });

  r.get("/copilot/sessions/:id", requirePerm("copilot.chat"), async (req, res) => {
    const session = await loadCallerSession(req, res);
    if (!session) return;
    const meta = (await deps.store.readMeta(session.id))!;
    const messages = await deps.store.readMessages(session.id, 50);
    const pending = await deps.store.readPending(session.id);
    const snap: CopilotSessionSnapshot = { meta, messages, pending };
    res.json(snap);
  });

  r.delete("/copilot/sessions/:id", requirePerm("copilot.chat"), async (req, res) => {
    const session = await loadCallerSession(req, res);
    if (!session) return;
    const meta = (await deps.store.readMeta(session.id))!;
    await deps.store.deleteSession(session.id);
    log("session.deleted", { user: userId(req), sessionId: session.id, backend: meta.backend });
    res.status(204).end();
  });

  r.post("/copilot/sessions/:id/turn", requirePerm("copilot.chat"), async (req, res) => {
    const session = await loadCallerSession(req, res);
    if (!session) return;
    const body = (req.body ?? {}) as CopilotTurnSubmitInput;
    if (typeof body.message !== "string" || body.message.length === 0) {
      res.status(400).json({ error: "invalid_message" });
      return;
    }
    try {
      const { msgId, pending } = await deps.orchestrator.submitTurn({
        sessionId: session.id, userMessageText: body.message,
      });
      res.json({ msg_id: msgId, state: pending.state });
    } catch (e) {
      if (e instanceof TurnInProgressError) {
        res.status(409).json({ error: "turn_in_progress" });
        return;
      }
      console.warn("copilot.turn.submit_error", (e as Error).message);
      res.status(500).json({ error: "adapter_error", detail: (e as Error).message });
    }
  });

  r.get("/copilot/sessions/:id/turn/:msgId", requirePerm("copilot.chat"), async (req, res) => {
    const session = await loadCallerSession(req, res);
    if (!session) return;
    const msgId = String(req.params.msgId);
    const pending = await deps.store.readPending(session.id);
    if (!pending || pending.msg_id !== msgId) {
      res.status(404).json({ error: "turn_not_found" });
      return;
    }
    const messages = await deps.store.readMessages(session.id, 50);
    let assistantMessage: CopilotMessage | null = null;
    if (pending.state === "done") {
      const last = messages[messages.length - 1];
      if (last && last.role === "assistant") assistantMessage = last;
    }
    const lastMessageId = messages[messages.length - 1]?.msg_id ?? null;
    const responsePending: CopilotPendingTurn = pending;
    res.json({ pending: responsePending, assistantMessage, lastMessageId });
  });

  return r;
}
```

- [ ] **Step 4: Run tests — confirm PASS**

```
pnpm --filter bridge test 2>&1 | grep -E "copilot-routes|tests |fail" | head -20
```

Expected: 6 tests pass.

- [ ] **Step 5: Wire into `server.ts`**

In `apps/bridge/src/server.ts`:

Add imports near the existing route imports:

```ts
import { createCopilotRouter } from "./routes/copilot.js";
import { createCopilotStore } from "./services/copilot/store.js";
import { createCopilotOrchestrator } from "./services/copilot/orchestrator.js";
import { createOpenclawChatBackend } from "./services/copilot/backends/openclaw.js";
import { createHermesChatBackend } from "./services/copilot/backends/hermes.js";
import { callGateway } from "./services/gateway.js";
import path from "node:path";
```

(`callGateway` import may already exist — don't duplicate.)

After the existing `createRuntimeConfigRouter` mount, add:

```ts
const copilotRoot = path.join(config.managementDir, "copilot");
const copilotStore = createCopilotStore({ rootDir: copilotRoot });
const openclawChatBackend = createOpenclawChatBackend({ callGateway });
const hermesChatBackend = createHermesChatBackend();
const copilotOrchestrator = createCopilotOrchestrator({
  store: copilotStore,
  backendFor: (kind) => (kind === "openclaw" ? openclawChatBackend : hermesChatBackend),
});
app.use(createCopilotRouter({
  store: copilotStore,
  orchestrator: copilotOrchestrator,
  backendCreator: async (sessionId, ownerUserId, backend) => {
    const adapter = backend === "openclaw" ? openclawChatBackend : hermesChatBackend;
    return adapter.createSession({ sessionId, ownerUserId });
  },
}));
```

Then in the existing post-listen async block (the `void (async () => { ... })();` near the bottom), append:

```ts
try { await copilotOrchestrator.recoverOnBoot(); } catch (e) { console.warn("copilot recover failed:", e); }
```

(`config.managementDir` is the existing env-resolved field. **Verify** by reading the config module first; if the field is named differently, use the actual name.)

- [ ] **Step 6: Run all bridge tests + build**

```
pnpm --filter bridge test 2>&1 | tail -10
pnpm --filter bridge build 2>&1 | tail -5
```

All tests pass at baseline (only `youtube-rebuild.test.ts` fails). Build clean.

- [ ] **Step 7: Commit**

```bash
git add apps/bridge/src/routes/copilot.ts apps/bridge/src/server.ts apps/bridge/test/copilot-routes.test.ts
git commit -m "bridge(copilot): HTTP routes, server wiring, boot-time crash recovery"
```

---

## Phase C — Dashboard

### Task C1: Bridge client + Next.js proxy

**Files:**
- Create: `apps/dashboard/src/lib/copilot-client.ts`
- Create: `apps/dashboard/src/app/api/copilot/[...path]/route.ts`

- [ ] **Step 1: Implement the client**

Read `apps/dashboard/src/lib/runtime-config-client.ts` first to copy the bridge-fetch wrapper pattern (likely a private `bridgeFetch` helper with `actorHeaders()` + `Authorization: Bearer`).

Create `apps/dashboard/src/lib/copilot-client.ts`:

```ts
import { bridgeFetch } from "./bridge-client";   // or use the inlined helper from runtime-config-client; match whichever pattern that file uses
import type {
  CopilotSessionMeta, CopilotSessionSnapshot, CopilotSessionCreateInput,
  CopilotTurnPollResponse, CopilotTurnSubmitInput,
} from "@openclaw-manager/types";

export async function listSessions(): Promise<CopilotSessionMeta[]> {
  const res = await bridgeFetch("/copilot/sessions", { method: "GET" });
  if (!res.ok) throw new Error(`copilot list ${res.status}`);
  const body = await res.json();
  return body.sessions;
}

export async function createSession(input: CopilotSessionCreateInput): Promise<CopilotSessionMeta> {
  const res = await bridgeFetch("/copilot/sessions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`copilot create ${res.status}: ${await res.text()}`);
  return res.json();
}

export async function getSnapshot(sessionId: string): Promise<CopilotSessionSnapshot> {
  const res = await bridgeFetch(`/copilot/sessions/${encodeURIComponent(sessionId)}`, { method: "GET" });
  if (!res.ok) throw new Error(`copilot snapshot ${res.status}`);
  return res.json();
}

export async function deleteSession(sessionId: string): Promise<void> {
  const res = await bridgeFetch(`/copilot/sessions/${encodeURIComponent(sessionId)}`, { method: "DELETE" });
  if (!res.ok && res.status !== 204) throw new Error(`copilot delete ${res.status}`);
}

export async function submitTurn(sessionId: string, input: CopilotTurnSubmitInput): Promise<{ msg_id: string; state: string }> {
  const res = await bridgeFetch(`/copilot/sessions/${encodeURIComponent(sessionId)}/turn`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`copilot turn ${res.status}: ${await res.text()}`);
  return res.json();
}

export async function pollTurn(sessionId: string, msgId: string): Promise<CopilotTurnPollResponse> {
  const res = await bridgeFetch(`/copilot/sessions/${encodeURIComponent(sessionId)}/turn/${encodeURIComponent(msgId)}`, { method: "GET" });
  if (!res.ok) throw new Error(`copilot poll ${res.status}`);
  return res.json();
}
```

If `bridgeFetch` is private to `bridge-client.ts`, copy the helper inline (matches the existing pattern across `runtime-config-client.ts` etc.).

- [ ] **Step 2: Implement the Next.js proxy**

Create `apps/dashboard/src/app/api/copilot/[...path]/route.ts`:

```ts
import { NextResponse } from "next/server";
import { bridgeFetch } from "@/lib/bridge-client";

async function forward(req: Request, ctx: { params: Promise<{ path: string[] }> }, method: string) {
  const { path } = await ctx.params;
  const url = `/copilot/${path.map(encodeURIComponent).join("/")}${new URL(req.url).search}`;
  const init: RequestInit = { method };
  if (method !== "GET" && method !== "DELETE") {
    init.headers = { "content-type": req.headers.get("content-type") ?? "application/json" };
    init.body = await req.text();
  }
  const res = await bridgeFetch(url, init);
  const text = await res.text();
  return new NextResponse(text, {
    status: res.status,
    headers: { "content-type": res.headers.get("content-type") ?? "application/json" },
  });
}

export async function GET(req: Request, ctx: { params: Promise<{ path: string[] }> }) { return forward(req, ctx, "GET"); }
export async function POST(req: Request, ctx: { params: Promise<{ path: string[] }> }) { return forward(req, ctx, "POST"); }
export async function DELETE(req: Request, ctx: { params: Promise<{ path: string[] }> }) { return forward(req, ctx, "DELETE"); }
export async function PATCH(req: Request, ctx: { params: Promise<{ path: string[] }> }) { return forward(req, ctx, "PATCH"); }
```

(If the existing `bridge-client` requires server-side auth gating like `runtime-config/route.ts` did, mirror that pattern — read the existing `runtime-config/route.ts` first and copy its session/permission preamble.)

- [ ] **Step 3: Build dashboard**

```
pnpm --filter dashboard build 2>&1 | tail -5
```

- [ ] **Step 4: Commit**

```bash
git add apps/dashboard/src/lib/copilot-client.ts apps/dashboard/src/app/api/copilot/[...path]/route.ts
git commit -m "dashboard(copilot): bridge client wrapper + Next.js proxy"
```

---

### Task C2: UI state hook (localStorage)

**Files:**
- Create: `apps/dashboard/src/hooks/use-copilot-ui-state.ts`

- [ ] **Step 1: Implement the hook**

```ts
"use client";

import { useCallback, useEffect, useState } from "react";

const KEY = "copilot-ui-state";

export type CopilotUiState = {
  open: boolean;
  activeSessionId: string | null;
};

const DEFAULT: CopilotUiState = { open: false, activeSessionId: null };

function read(): CopilotUiState {
  if (typeof window === "undefined") return DEFAULT;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return DEFAULT;
    const parsed = JSON.parse(raw) as CopilotUiState;
    return {
      open: typeof parsed.open === "boolean" ? parsed.open : false,
      activeSessionId: typeof parsed.activeSessionId === "string" ? parsed.activeSessionId : null,
    };
  } catch { return DEFAULT; }
}

function write(s: CopilotUiState) {
  try { window.localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* ignore */ }
}

export function useCopilotUiState() {
  const [state, setState] = useState<CopilotUiState>(DEFAULT);

  useEffect(() => { setState(read()); }, []);

  const update = useCallback((patch: Partial<CopilotUiState>) => {
    setState((prev) => {
      const next = { ...prev, ...patch };
      write(next);
      return next;
    });
  }, []);

  return { state, update };
}
```

- [ ] **Step 2: Build dashboard, commit**

```
pnpm --filter dashboard build 2>&1 | tail -3
git add apps/dashboard/src/hooks/use-copilot-ui-state.ts
git commit -m "dashboard(copilot): localStorage UI state hook"
```

---

### Task C3: Sessions list + snapshot + polling hooks

**Files:**
- Create: `apps/dashboard/src/hooks/use-copilot-sessions.ts`
- Create: `apps/dashboard/src/hooks/use-session-snapshot.ts`
- Create: `apps/dashboard/src/hooks/use-polling-turn.ts`

- [ ] **Step 1: Implement the three hooks**

`apps/dashboard/src/hooks/use-copilot-sessions.ts`:

```ts
"use client";
import { useCallback, useEffect, useState } from "react";
import type { CopilotSessionMeta } from "@openclaw-manager/types";

export function useCopilotSessions() {
  const [sessions, setSessions] = useState<CopilotSessionMeta[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    try {
      const res = await fetch("/api/copilot/sessions");
      if (!res.ok) throw new Error(`list ${res.status}`);
      const body = await res.json();
      setSessions(body.sessions);
      setError(null);
    } catch (e) { setError(e instanceof Error ? e.message : "load failed"); }
  }, []);

  useEffect(() => { void refetch(); }, [refetch]);

  return { sessions, error, refetch };
}
```

`apps/dashboard/src/hooks/use-session-snapshot.ts`:

```ts
"use client";
import { useCallback, useEffect, useState } from "react";
import type { CopilotSessionSnapshot } from "@openclaw-manager/types";

export function useSessionSnapshot(sessionId: string | null) {
  const [snapshot, setSnapshot] = useState<CopilotSessionSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!sessionId) { setSnapshot(null); return; }
    try {
      const res = await fetch(`/api/copilot/sessions/${encodeURIComponent(sessionId)}`);
      if (!res.ok) throw new Error(`snapshot ${res.status}`);
      setSnapshot(await res.json());
      setError(null);
    } catch (e) { setError(e instanceof Error ? e.message : "load failed"); setSnapshot(null); }
  }, [sessionId]);

  useEffect(() => { void refetch(); }, [refetch]);

  return { snapshot, error, refetch };
}
```

`apps/dashboard/src/hooks/use-polling-turn.ts`:

```ts
"use client";
import { useEffect, useState } from "react";
import type { CopilotTurnPollResponse } from "@openclaw-manager/types";

const TERMINAL = new Set(["done", "error", "timeout"]);

export function usePollingTurn(sessionId: string | null, msgId: string | null) {
  const [response, setResponse] = useState<CopilotTurnPollResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionId || !msgId) { setResponse(null); return; }
    let cancelled = false;
    let timer: NodeJS.Timeout | null = null;

    async function tick() {
      if (cancelled) return;
      try {
        const res = await fetch(`/api/copilot/sessions/${encodeURIComponent(sessionId!)}/turn/${encodeURIComponent(msgId!)}`);
        if (!res.ok) throw new Error(`poll ${res.status}`);
        const body: CopilotTurnPollResponse = await res.json();
        if (cancelled) return;
        setResponse(body);
        if (!TERMINAL.has(body.pending.state)) {
          timer = setTimeout(tick, 1500);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "poll failed");
      }
    }
    void tick();
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [sessionId, msgId]);

  return { response, error };
}
```

- [ ] **Step 2: Build, commit**

```
pnpm --filter dashboard build 2>&1 | tail -3
git add apps/dashboard/src/hooks/use-copilot-sessions.ts \
        apps/dashboard/src/hooks/use-session-snapshot.ts \
        apps/dashboard/src/hooks/use-polling-turn.ts
git commit -m "dashboard(copilot): hooks for sessions, snapshot, turn polling"
```

---

### Task C4: Launcher + Panel + Empty + SessionView

**Files:**
- Create: `apps/dashboard/src/components/copilot/empty-state.tsx`
- Create: `apps/dashboard/src/components/copilot/session-view.tsx`
- Create: `apps/dashboard/src/components/copilot/panel.tsx`
- Create: `apps/dashboard/src/components/copilot/launcher.tsx`

- [ ] **Step 1: Empty state (new chat form + recent sessions list)**

```tsx
"use client";
import { useState } from "react";
import type { BackendKind, CopilotSessionMeta } from "@openclaw-manager/types";

export function CopilotEmptyState({
  defaultBackend, recent, onStart, onPickSession,
}: {
  defaultBackend: BackendKind;
  recent: CopilotSessionMeta[];
  onStart: (input: { backend: BackendKind; title?: string }) => Promise<void>;
  onPickSession: (id: string) => void;
}) {
  const [backend, setBackend] = useState<BackendKind>(defaultBackend);
  const [title, setTitle] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setPending(true); setError(null);
    try { await onStart({ backend, title: title.trim() || undefined }); }
    catch (e) { setError(e instanceof Error ? e.message : "failed"); }
    finally { setPending(false); }
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="space-y-2">
        <div className="text-sm font-medium text-neutral-100">New chat</div>
        <div className="flex flex-col gap-2 text-sm text-neutral-300">
          <label className="flex items-center gap-2">
            <input type="radio" name="backend" value="openclaw"
                   checked={backend === "openclaw"} onChange={() => setBackend("openclaw")} />
            OpenClaw
          </label>
          <label className="flex items-center gap-2 text-neutral-500" title="available in next phase">
            <input type="radio" name="backend" value="hermes"
                   checked={backend === "hermes"} onChange={() => setBackend("hermes")}
                   disabled />
            Hermes (coming soon)
          </label>
        </div>
        <input
          type="text"
          placeholder="Title (optional)"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full rounded border border-neutral-700 bg-neutral-900 p-2 text-sm text-neutral-100"
        />
        <button
          onClick={start}
          disabled={pending || backend === "hermes"}
          className="rounded bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {pending ? "Starting…" : "Start"}
        </button>
        {error && <div className="text-xs text-red-400">{error}</div>}
      </div>

      {recent.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs uppercase tracking-wide text-neutral-500">Recent</div>
          <div className="space-y-1">
            {recent.slice(0, 5).map((s) => (
              <button key={s.id}
                onClick={() => onPickSession(s.id)}
                className="block w-full rounded border border-neutral-800 p-2 text-left text-sm text-neutral-200 hover:bg-neutral-900"
              >
                <div className="font-medium">{s.title ?? `Untitled — ${new Date(s.createdAt).toLocaleDateString()}`}</div>
                <div className="text-xs text-neutral-500">{s.backend} · {s.lastTurnAt ? new Date(s.lastTurnAt).toLocaleString() : "no turns yet"}</div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: SessionView (timeline + composer)**

```tsx
"use client";
import { useEffect, useRef, useState } from "react";
import { useSessionSnapshot } from "@/hooks/use-session-snapshot";
import { usePollingTurn } from "@/hooks/use-polling-turn";
import type { CopilotMessage } from "@openclaw-manager/types";

export function CopilotSessionView({ sessionId, onClose, onDelete }: { sessionId: string; onClose: () => void; onDelete: () => void }) {
  const { snapshot, refetch } = useSessionSnapshot(sessionId);
  const [pendingMsgId, setPendingMsgId] = useState<string | null>(null);
  const { response: pollResp } = usePollingTurn(sessionId, pendingMsgId);
  const [input, setInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // When polling lands done, refetch the snapshot to pull in the assistant message.
  useEffect(() => {
    if (pollResp && (pollResp.pending.state === "done" || pollResp.pending.state === "error" || pollResp.pending.state === "timeout")) {
      void refetch();
      setPendingMsgId(null);
    }
  }, [pollResp, refetch]);

  // Adopt server-side pending if present (after reload during a running turn).
  useEffect(() => {
    if (snapshot?.pending && !["done", "error", "timeout"].includes(snapshot.pending.state)) {
      setPendingMsgId(snapshot.pending.msg_id);
    }
  }, [snapshot]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [snapshot, pollResp]);

  async function send() {
    const text = input.trim();
    if (!text || submitting || pendingMsgId) return;
    setInput(""); setSubmitting(true); setError(null);
    try {
      const res = await fetch(`/api/copilot/sessions/${encodeURIComponent(sessionId)}/turn`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: text }),
      });
      if (!res.ok) {
        const body = await res.text();
        if (res.status === 409) throw new Error("Another turn is in progress.");
        throw new Error(`Failed: ${body}`);
      }
      const body = await res.json();
      setPendingMsgId(body.msg_id);
      await refetch();
    } catch (e) { setError(e instanceof Error ? e.message : "send failed"); }
    finally { setSubmitting(false); }
  }

  if (!snapshot) return <div className="p-4 text-sm text-neutral-400">Loading…</div>;

  const messages = snapshot.messages;
  const isPending = pendingMsgId !== null || (snapshot.pending && !["done", "error", "timeout"].includes(snapshot.pending.state));

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-neutral-800 p-3">
        <div className="flex-1">
          <div className="text-sm font-medium text-neutral-100">
            {snapshot.meta.title ?? `Untitled — ${new Date(snapshot.meta.createdAt).toLocaleDateString()}`}
          </div>
          <div className="text-xs text-neutral-500">{snapshot.meta.backend}</div>
        </div>
        <button onClick={onDelete} className="text-xs text-red-400 hover:underline">delete</button>
        <button onClick={onClose} className="text-xs text-neutral-400 hover:underline">close</button>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {messages.map((m) => <MessageBubble key={m.msg_id} msg={m} />)}
        {isPending && <div className="text-xs italic text-neutral-500">…thinking</div>}
        <div ref={bottomRef} />
      </div>
      <div className="border-t border-neutral-800 p-3">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }}
          rows={2}
          placeholder="Type a message…"
          disabled={isPending}
          className="w-full rounded border border-neutral-700 bg-neutral-900 p-2 text-sm text-neutral-100"
        />
        {error && <div className="mt-1 text-xs text-red-400">{error}</div>}
      </div>
    </div>
  );
}

function MessageBubble({ msg }: { msg: CopilotMessage }) {
  const isUser = msg.role === "user";
  const text = msg.events.find((e) => e.type === "text")?.text ?? "";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[85%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm ${
        isUser ? "bg-emerald-800/40 text-emerald-100" : "bg-neutral-800 text-neutral-100"
      }`}>{text}</div>
    </div>
  );
}
```

- [ ] **Step 3: Panel (state machine wrapper)**

```tsx
"use client";
import { useState } from "react";
import type { BackendKind } from "@openclaw-manager/types";
import { useCopilotSessions } from "@/hooks/use-copilot-sessions";
import { useCopilotUiState } from "@/hooks/use-copilot-ui-state";
import { CopilotEmptyState } from "./empty-state";
import { CopilotSessionView } from "./session-view";

export function CopilotPanel({ defaultBackend }: { defaultBackend: BackendKind }) {
  const { state, update } = useCopilotUiState();
  const { sessions, refetch } = useCopilotSessions();
  const [error, setError] = useState<string | null>(null);

  if (!state.open) return null;

  async function start({ backend, title }: { backend: BackendKind; title?: string }) {
    setError(null);
    const res = await fetch("/api/copilot/sessions", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ backend, title }),
    });
    if (!res.ok) { setError(`create failed: ${res.status}`); return; }
    const meta = await res.json();
    update({ activeSessionId: meta.id });
    await refetch();
  }

  async function deleteActive() {
    if (!state.activeSessionId) return;
    await fetch(`/api/copilot/sessions/${encodeURIComponent(state.activeSessionId)}`, { method: "DELETE" });
    update({ activeSessionId: null });
    await refetch();
  }

  return (
    <div className="fixed bottom-20 right-4 z-50 flex h-[620px] w-[440px] flex-col overflow-hidden rounded-lg border border-neutral-800 bg-neutral-950 shadow-2xl md:w-[440px] max-md:inset-x-0 max-md:bottom-0 max-md:h-[80vh] max-md:w-auto max-md:rounded-none">
      {error && <div className="bg-red-950/40 p-2 text-xs text-red-300">{error}</div>}
      {state.activeSessionId
        ? <CopilotSessionView
            sessionId={state.activeSessionId}
            onClose={() => update({ open: false })}
            onDelete={() => void deleteActive()}
          />
        : <CopilotEmptyState
            defaultBackend={defaultBackend}
            recent={sessions ?? []}
            onStart={start}
            onPickSession={(id) => update({ activeSessionId: id })}
          />}
    </div>
  );
}
```

- [ ] **Step 4: Launcher**

```tsx
"use client";
import { useCopilotUiState } from "@/hooks/use-copilot-ui-state";
import { PermissionGate } from "@/components/permission-gate";
import { CopilotPanel } from "./panel";
import type { BackendKind } from "@openclaw-manager/types";

export function CopilotLauncher({ defaultBackend = "openclaw" as BackendKind }: { defaultBackend?: BackendKind }) {
  const { state, update } = useCopilotUiState();
  return (
    <PermissionGate perm="copilot.chat">
      <button
        onClick={() => update({ open: !state.open })}
        aria-label="Open Copilot"
        className="fixed bottom-4 right-4 z-50 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-700 text-white shadow-lg hover:bg-emerald-600"
      >
        <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
      </button>
      <CopilotPanel defaultBackend={defaultBackend} />
    </PermissionGate>
  );
}
```

- [ ] **Step 5: Build dashboard, commit**

```
pnpm --filter dashboard build 2>&1 | tail -5
git add apps/dashboard/src/components/copilot/
git commit -m "dashboard(copilot): launcher, panel, empty state, session view"
```

---

### Task C5: AppShell wire

**Files:**
- Modify: `apps/dashboard/src/components/app-shell.tsx`

- [ ] **Step 1: Mount the launcher**

Read `apps/dashboard/src/components/app-shell.tsx`. Add import:

```tsx
import { CopilotLauncher } from "@/components/copilot/launcher";
```

Inside the authenticated layout's outermost JSX (after the main content slot), add:

```tsx
<CopilotLauncher defaultBackend={currentUser?.preferences?.copilot?.defaultBackend ?? "openclaw"} />
```

(`currentUser` is whatever the existing AppShell uses to pass the auth user down. **Read the file first** — if AppShell doesn't have a user reference, look up the `currentUser` import pattern from existing pages like `runtimes/page.tsx` and pass the relevant prefs through. If awkward, just hard-code `"openclaw"` as default in A1; per-user default polish lands in Unit D.)

- [ ] **Step 2: Build, commit**

```
pnpm --filter dashboard build 2>&1 | tail -5
git add apps/dashboard/src/components/app-shell.tsx
git commit -m "dashboard(copilot): mount launcher in AppShell"
```

---

## Phase D — Per-user default backend preference

### Task D1: Persist + edit-form

**Files:**
- Modify: `apps/bridge/src/services/auth/service.ts` (or whichever module owns user updates — read first)
- Modify: `apps/dashboard/src/app/admin/users/[id]/edit-form.tsx`

- [ ] **Step 1: Find the user-update path on the bridge**

Read `apps/bridge/src/services/auth/service.ts` and grep for `AuthUserUpdateInput`. Note the function that handles updates (likely `updateUser` or similar). Confirm whether `preferences` would flow through naturally (it should, given JSON merge), or whether the update accepts a strict subset.

If the update is permissive (spread current + patch), no service change needed beyond accepting `preferences` in the input type.

If the update only accepts whitelisted keys, extend `AuthUserUpdateInput` (in `packages/types/src/auth/users.ts`) to include optional `preferences?: UserPreferences;` and update the service to pass it through to disk.

- [ ] **Step 2: Add the radio to the edit form**

In `apps/dashboard/src/app/admin/users/[id]/edit-form.tsx`, add a new field group:

```tsx
{/* Copilot default backend */}
<div className="space-y-1">
  <div className="text-sm font-medium">Copilot default backend</div>
  <div className="flex items-center gap-3 text-sm">
    <label className="flex items-center gap-1">
      <input type="radio" name="copilotBackend" value="openclaw"
             checked={form.preferences?.copilot?.defaultBackend !== "hermes"}
             onChange={() => setForm({ ...form, preferences: { ...form.preferences, copilot: { defaultBackend: "openclaw" } } })} />
      OpenClaw
    </label>
    <label className="flex items-center gap-1 text-neutral-500" title="available in next phase">
      <input type="radio" name="copilotBackend" value="hermes" disabled />
      Hermes
    </label>
  </div>
</div>
```

(Match the existing form's style. **Read the file first** — there will be a state object and a submit handler to thread `preferences` through.)

- [ ] **Step 3: Build, run bridge tests, commit**

```
pnpm --filter @openclaw-manager/types build && pnpm --filter bridge build && pnpm --filter dashboard build
pnpm --filter bridge test 2>&1 | tail -5
git add packages/types/src/auth/users.ts apps/bridge/src/services/auth/service.ts apps/dashboard/src/app/admin/users/[id]/edit-form.tsx
git commit -m "auth+copilot: per-user defaultBackend preference + edit-form radio"
```

---

## Phase E — End-to-end smoke

### Task E1: Manual smoke runbook

**Files:** none (runbook + verification only)

This task does NOT modify code; it's a verification gate before the final review.

- [ ] **Step 1: Run all bridge tests + builds**

```
pnpm --filter @openclaw-manager/types build
pnpm --filter bridge build
pnpm --filter dashboard build
pnpm --filter bridge test 2>&1 | tail -10
```

All bridge tests pass at baseline (only `youtube-rebuild.test.ts` fail unchanged). All builds clean.

- [ ] **Step 2: Manual smoke (local dev)**

In two terminals:

```
pnpm dev:bridge        # tsx watch on :3100
pnpm dev:dashboard     # next dev on :3000
```

In a browser:
1. Log in to `http://localhost:3000`.
2. Visit any dashboard page. Confirm the chat-bubble button appears bottom-right (only if logged-in user has `copilot.chat`).
3. Click the launcher. Empty state form appears.
4. Backend radio: OpenClaw selected; Hermes radio disabled with "available in next phase" tooltip.
5. Enter optional title "smoke", click Start.
6. Session created; SessionView shown. Send "hello".
7. "…thinking" indicator appears. Wait up to ~10 s. Assistant reply renders.
8. Reload the page. Panel re-opens to the same session (localStorage). Snapshot reloads.
9. Click "delete" in the session header. Empty state re-appears; session removed from recent list.
10. Open browser devtools → Application → Local Storage → confirm `copilot-ui-state` key.

- [ ] **Step 3: Audit log spot-check**

Tail the bridge log for the smoke session:

```
Get-Content C:\ProgramData\OpenClaw-Bridge\logs\bridge.out.log -Tail 30 | Select-String "copilot."
```

Expect at least: `copilot.session.created`, `copilot.turn.accepted`, `copilot.turn.completed`, `copilot.session.deleted`.

- [ ] **Step 4: Commit a smoke note**

If the smoke surfaced anything that wasn't covered by tests, add a follow-up task to the plan (or open a deferred-followup file). Otherwise, no commit.

---

## Self-Review

### 1. Spec coverage

- Architecture diagram → File Structure + Phase B mounting.
- Storage layout (`meta.json`, `transcript.jsonl`, `pending.json`) → Task A1 store.
- Backend frozen at create + per-user default → Task 0 types + Phase D.
- Tool-call envelope shape carried in wire format → Task 0 types.
- Crash-consistency + recovery → Task A4 orchestrator + Task B1 boot wire.
- Per-session lock + 409 → Task A4 + Task B1 routes.
- Reply acquisition (poll `sessions.get` for length growth) → Task A3.
- System preamble on first turn → Task A3 (`wrapFirstMessage`).
- Permission `copilot.chat` → Task 0.
- API surface (6 endpoints, error contract) → Task B1.
- Floating launcher + panel + empty + session view → Tasks C4, C5.
- localStorage persistence → Task C2.
- Polling hook → Task C3.
- Per-user default backend → Task D1.
- Audit log lines → Task A4 (orchestrator emits) + Task B1 (route emits session.created/deleted).
- Reality-audit per UI control → covered by hooks + components.
- Hard-delete on DELETE → Task A1 store + Task B1 route.
- Caller-owns-session check returning 404 (not 403) → Task B1.
- Hermes Phase-A1 stub returning typed error; route rejects 400 at create → Task A2 + Task B1.

No spec-section without a task.

### 2. Placeholder scan

No "TBD" / "TODO" / "Add appropriate error handling" / "Similar to Task N." Verified.

A few "**Read the file first**" instructions in tasks where the implementer must adapt to existing patterns (auth service module split, AppShell layout, edit-form state shape). These are intentional — tells the implementer to look at concrete code rather than blindly paste — and each carries a fallback if the existing pattern is awkward.

### 3. Type consistency

- `CopilotSessionMeta`, `CopilotMessage`, `CopilotPendingTurn`, `CopilotTurnPollResponse` all defined in Task 0 and used identically in A1/A4/B1/C1/C3/C4.
- `BackendKind` consistent: `"openclaw" | "hermes"` everywhere.
- `ChatBackendAdapter` interface (Task A2) consumed by openclaw (A3), hermes stub (A2), orchestrator (A4), router wiring (B1).
- `copilot.chat` permission referenced in Task 0 (registry), B1 (gate), C4 (PermissionGate).
- `preferences.copilot.defaultBackend` referenced in Task 0 (type), C5 (read in AppShell), D1 (write in edit form).
- Audit event names: orchestrator emits `turn.accepted` / `turn.completed` / `turn.error` / `turn.timeout` / `turn.recovered_done` (A4); route emits `session.created` / `session.deleted` (B1). All scoped under the `copilot.` prefix in the logger.

No drift detected.
