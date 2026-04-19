# Claude Code ↔ OpenClaw Bridge — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let Claude Code, running in any IDE, hold a multi-turn dialogue with OpenClaw via a new MCP server in this repo, with every exchange visible and moderatable from the dashboard.

**Architecture:** A thin stdio MCP package (`@openclaw-manager/mcp`) forwards calls to the bridge, which talks to the OpenClaw gateway via the existing SDK, persists transcripts and sessions to disk in `openclaw-plugin/management/claude-code/`, and broadcasts live updates over the existing WebSocket to the dashboard. Dashboard adds a `/claude-code` area: sessions list + per-session detail with live transcript and a pending-draft moderation card.

**Tech Stack:** TypeScript 5.8 (strict), Node 22, Express 5, Next.js 15, `@modelcontextprotocol/sdk`, node:test via tsx, existing `ws` for live updates.

**Spec:** [2026-04-19-claude-code-openclaw-bridge-design.md](../specs/2026-04-19-claude-code-openclaw-bridge-design.md).

---

## File Structure

**New files:**
- `packages/mcp-openclaw/package.json`
- `packages/mcp-openclaw/tsconfig.json`
- `packages/mcp-openclaw/src/server.ts` — stdio MCP server
- `apps/bridge/src/services/claude-code-sessions.ts` — sessions index CRUD
- `apps/bridge/src/services/claude-code-transcript.ts` — JSONL append + read
- `apps/bridge/src/services/claude-code-pending.ts` — pending items + in-memory held-promise map
- `apps/bridge/src/services/claude-code-ask.ts` — orchestrator for `/ask`
- `apps/bridge/src/routes/claude-code.ts` — HTTP routes
- `apps/bridge/test/claude-code-sessions.test.ts`
- `apps/bridge/test/claude-code-transcript.test.ts`
- `apps/bridge/test/claude-code-pending.test.ts`
- `apps/bridge/test/claude-code-ask.test.ts`
- `apps/dashboard/src/app/claude-code/page.tsx` — sessions list
- `apps/dashboard/src/app/claude-code/[id]/page.tsx` — session detail
- `apps/dashboard/src/components/claude-code-sessions-table.tsx`
- `apps/dashboard/src/components/claude-code-session-detail.tsx`
- `apps/dashboard/src/components/claude-code-pending-card.tsx`
- `apps/dashboard/src/components/claude-code-connect-modal.tsx`
- `scripts/smoke-claude-code.mjs`
- `openclaw-plugin/management/claude-code/.gitkeep`

**Modified files:**
- `packages/types/src/index.ts` — add Claude-Code types
- `apps/bridge/src/config.ts` — add env vars
- `apps/bridge/src/server.ts` — mount new router
- `apps/bridge/src/ws.ts` — add broadcast helpers (or confirm existing pattern)
- `apps/dashboard/src/lib/bridge-client.ts` — new methods
- `apps/dashboard/src/components/sidebar.tsx` — add nav item
- `apps/bridge/.env` (Gal's local) and document in `AGENTS.md`
- `pnpm-workspace.yaml` — already covers `packages/*`, no change

---

## Task 1: Shared types

**Files:**
- Modify: `packages/types/src/index.ts` (append new section at end)

- [ ] **Step 1: Add Claude Code types**

Append this block to the end of `packages/types/src/index.ts`:

```typescript
// --- Claude Code ↔ OpenClaw ---

export type ClaudeCodeSessionMode = "agent" | "manual";
export type ClaudeCodeSessionState = "active" | "ended";

export type ClaudeCodeSession = {
  id: string;
  displayName: string;
  ide: string;
  workspace: string;
  mode: ClaudeCodeSessionMode;
  state: ClaudeCodeSessionState;
  openclawSessionId: string;
  createdAt: string;
  lastActivityAt: string;
  messageCount: number;
};

export type ClaudeCodeTranscriptEventKind =
  | "ask"
  | "draft"
  | "answer"
  | "discarded"
  | "timeout"
  | "mode_change"
  | "ended";

export type ClaudeCodeAnswerSource = "agent" | "operator";
export type ClaudeCodeOperatorAction = "send-as-is" | "edit" | "replace";

export type ClaudeCodeTranscriptEvent = {
  t: string;
  kind: ClaudeCodeTranscriptEventKind;
  msgId?: string;
  question?: string;
  context?: Record<string, unknown>;
  draft?: string;
  answer?: string;
  source?: ClaudeCodeAnswerSource;
  action?: ClaudeCodeOperatorAction;
  from?: ClaudeCodeSessionMode;
  to?: ClaudeCodeSessionMode;
  by?: string;
};

export type ClaudeCodePendingItem = {
  id: string;
  sessionId: string;
  msgId: string;
  question: string;
  draft: string;
  createdAt: string;
};

export type ClaudeCodeAskRequest = {
  ide: string;
  workspace: string;
  msgId: string;
  question: string;
  context?: Record<string, unknown>;
};

export type ClaudeCodeAskResponse = {
  answer: string;
  source: ClaudeCodeAnswerSource;
  action?: ClaudeCodeOperatorAction;
};

export type ClaudeCodeConnectConfig = {
  antigravity: string;
  vscode: string;
  cli: string;
};
```

Also extend the existing `WsMessageType` union (find the line `export type WsMessageType =`) by adding these members before the closing semicolon:

```typescript
  | "claude_code_session_upserted"
  | "claude_code_session_ended"
  | "claude_code_transcript_appended"
  | "claude_code_pending_upserted"
  | "claude_code_pending_resolved"
```

- [ ] **Step 2: Build to verify types compile**

Run: `pnpm --filter @openclaw-manager/types build`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/types/src/index.ts
git commit -m "types: add Claude Code ↔ OpenClaw shared types"
```

---

## Task 2: Bridge config for new paths & timeouts

**Files:**
- Modify: `apps/bridge/src/config.ts`
- Create: `openclaw-plugin/management/claude-code/.gitkeep` (empty file)

- [ ] **Step 1: Add new config getters**

In `apps/bridge/src/config.ts`, add these entries to the `config` object (just before the closing `} as const;`):

```typescript
  claudeCodePendingTimeoutMs:
    Number(process.env.CLAUDE_CODE_PENDING_TIMEOUT_MS) || 300000,
  claudeCodeSharedOpenclawSessionId:
    process.env.CLAUDE_CODE_SHARED_OPENCLAW_SESSION_ID || "oc-shared-claude-code",
  get claudeCodeDir() {
    return path.join(this.managementDir, "claude-code");
  },
  get claudeCodeSessionsPath() {
    return path.join(this.managementDir, "claude-code", "sessions.json");
  },
  get claudeCodePendingPath() {
    return path.join(this.managementDir, "claude-code", "pending.json");
  },
```

- [ ] **Step 2: Create the storage directory keeper**

Run (via the Write tool, not the shell):

Create empty file at `openclaw-plugin/management/claude-code/.gitkeep`.

- [ ] **Step 3: Build bridge to verify**

Run: `pnpm --filter bridge build`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/bridge/src/config.ts openclaw-plugin/management/claude-code/.gitkeep
git commit -m "bridge: add claude-code config paths and timeout"
```

---

## Task 3: Session registry service (TDD)

**Files:**
- Create: `apps/bridge/src/services/claude-code-sessions.ts`
- Test: `apps/bridge/test/claude-code-sessions.test.ts`

- [ ] **Step 1: Write failing test**

Create `apps/bridge/test/claude-code-sessions.test.ts`:

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  computeSessionId,
  deriveDisplayName,
  createSession,
  getOrCreateSession,
  listSessions,
  renameSession,
  setSessionMode,
  endSession,
  resurrectSession,
  touchSession,
} from "../src/services/claude-code-sessions.js";

async function tmp(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "cc-sessions-"));
  return dir;
}

test("computeSessionId is stable for normalized ide+workspace", () => {
  const a = computeSessionId("antigravity", "C:\\Users\\X\\Proj");
  const b = computeSessionId("antigravity", "c:/users/x/proj");
  assert.equal(a, b);
  assert.equal(a.length, 12);
});

test("deriveDisplayName uses basename of workspace", () => {
  assert.equal(
    deriveDisplayName("vscode", "C:\\Users\\Gal\\repos\\my-app"),
    "vscode@my-app"
  );
});

test("createSession writes and listSessions reads back", async () => {
  const dir = await tmp();
  const p = path.join(dir, "sessions.json");
  const s = await createSession(p, {
    ide: "antigravity",
    workspace: "C:\\w\\proj",
    openclawSessionId: "oc-shared",
  });
  assert.equal(s.state, "active");
  assert.equal(s.mode, "agent");
  const list = await listSessions(p);
  assert.equal(list.length, 1);
  assert.equal(list[0]!.id, s.id);
});

test("getOrCreateSession is idempotent on ide+workspace", async () => {
  const dir = await tmp();
  const p = path.join(dir, "sessions.json");
  const a = await getOrCreateSession(p, {
    ide: "vscode",
    workspace: "C:\\w\\proj",
    openclawSessionId: "oc-shared",
  });
  const b = await getOrCreateSession(p, {
    ide: "vscode",
    workspace: "c:/w/proj",
    openclawSessionId: "oc-shared",
  });
  assert.equal(a.id, b.id);
  const list = await listSessions(p);
  assert.equal(list.length, 1);
});

test("setSessionMode flips agent <-> manual", async () => {
  const dir = await tmp();
  const p = path.join(dir, "sessions.json");
  const s = await createSession(p, { ide: "cli", workspace: "/tmp", openclawSessionId: "oc" });
  await setSessionMode(p, s.id, "manual");
  const list = await listSessions(p);
  assert.equal(list[0]!.mode, "manual");
});

test("endSession and resurrectSession toggle state", async () => {
  const dir = await tmp();
  const p = path.join(dir, "sessions.json");
  const s = await createSession(p, { ide: "cli", workspace: "/tmp", openclawSessionId: "oc" });
  await endSession(p, s.id);
  assert.equal((await listSessions(p))[0]!.state, "ended");
  await resurrectSession(p, s.id);
  assert.equal((await listSessions(p))[0]!.state, "active");
});

test("renameSession updates displayName only", async () => {
  const dir = await tmp();
  const p = path.join(dir, "sessions.json");
  const s = await createSession(p, { ide: "cli", workspace: "/tmp", openclawSessionId: "oc" });
  await renameSession(p, s.id, "my-name");
  assert.equal((await listSessions(p))[0]!.displayName, "my-name");
});

test("touchSession bumps lastActivityAt and messageCount", async () => {
  const dir = await tmp();
  const p = path.join(dir, "sessions.json");
  const s = await createSession(p, { ide: "cli", workspace: "/tmp", openclawSessionId: "oc" });
  const before = s.lastActivityAt;
  await new Promise((r) => setTimeout(r, 5));
  await touchSession(p, s.id);
  const list = await listSessions(p);
  assert.notEqual(list[0]!.lastActivityAt, before);
  assert.equal(list[0]!.messageCount, 1);
});
```

- [ ] **Step 2: Run test, confirm it fails**

Run: `pnpm --filter bridge test`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the service**

Create `apps/bridge/src/services/claude-code-sessions.ts`:

```typescript
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import type {
  ClaudeCodeSession,
  ClaudeCodeSessionMode,
} from "@openclaw-manager/types";

type CreateArgs = { ide: string; workspace: string; openclawSessionId: string };

function normalize(workspace: string): string {
  return workspace.trim().replace(/\\/g, "/").toLowerCase();
}

export function computeSessionId(ide: string, workspace: string): string {
  const input = `${ide.trim().toLowerCase()}:${normalize(workspace)}`;
  return crypto.createHash("sha256").update(input).digest("hex").slice(0, 12);
}

export function deriveDisplayName(ide: string, workspace: string): string {
  const base = path.basename(normalize(workspace)) || workspace;
  return `${ide}@${base}`;
}

async function readFile(p: string): Promise<{ sessions: ClaudeCodeSession[] }> {
  try {
    const raw = await fs.readFile(p, "utf8");
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed?.sessions)) return { sessions: parsed.sessions };
    return { sessions: [] };
  } catch {
    return { sessions: [] };
  }
}

async function writeFile(p: string, data: { sessions: ClaudeCodeSession[] }): Promise<void> {
  await fs.mkdir(path.dirname(p), { recursive: true });
  const tmp = `${p}.tmp-${process.pid}-${Date.now()}`;
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), "utf8");
  await fs.rename(tmp, p);
}

export async function listSessions(p: string): Promise<ClaudeCodeSession[]> {
  const { sessions } = await readFile(p);
  return sessions;
}

export async function createSession(p: string, args: CreateArgs): Promise<ClaudeCodeSession> {
  const { sessions } = await readFile(p);
  const id = computeSessionId(args.ide, args.workspace);
  const now = new Date().toISOString();
  const existing = sessions.find((s) => s.id === id);
  if (existing) return existing;
  const session: ClaudeCodeSession = {
    id,
    displayName: deriveDisplayName(args.ide, args.workspace),
    ide: args.ide,
    workspace: args.workspace,
    mode: "agent",
    state: "active",
    openclawSessionId: args.openclawSessionId,
    createdAt: now,
    lastActivityAt: now,
    messageCount: 0,
  };
  sessions.push(session);
  await writeFile(p, { sessions });
  return session;
}

export async function getOrCreateSession(p: string, args: CreateArgs): Promise<ClaudeCodeSession> {
  return createSession(p, args);
}

async function updateSession(
  p: string,
  id: string,
  fn: (s: ClaudeCodeSession) => ClaudeCodeSession
): Promise<ClaudeCodeSession> {
  const { sessions } = await readFile(p);
  const idx = sessions.findIndex((s) => s.id === id);
  if (idx === -1) throw new Error(`Session not found: ${id}`);
  sessions[idx] = fn(sessions[idx]!);
  await writeFile(p, { sessions });
  return sessions[idx]!;
}

export async function setSessionMode(p: string, id: string, mode: ClaudeCodeSessionMode) {
  return updateSession(p, id, (s) => ({ ...s, mode }));
}

export async function renameSession(p: string, id: string, displayName: string) {
  return updateSession(p, id, (s) => ({ ...s, displayName }));
}

export async function endSession(p: string, id: string) {
  return updateSession(p, id, (s) => ({ ...s, state: "ended" }));
}

export async function resurrectSession(p: string, id: string) {
  return updateSession(p, id, (s) => ({ ...s, state: "active" }));
}

export async function touchSession(p: string, id: string) {
  return updateSession(p, id, (s) => ({
    ...s,
    lastActivityAt: new Date().toISOString(),
    messageCount: s.messageCount + 1,
  }));
}
```

- [ ] **Step 4: Run test, confirm pass**

Run: `pnpm --filter bridge test`
Expected: all session tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/bridge/src/services/claude-code-sessions.ts apps/bridge/test/claude-code-sessions.test.ts
git commit -m "bridge: add claude-code sessions service"
```

---

## Task 4: Transcript service (TDD)

**Files:**
- Create: `apps/bridge/src/services/claude-code-transcript.ts`
- Test: `apps/bridge/test/claude-code-transcript.test.ts`

- [ ] **Step 1: Write failing test**

Create `apps/bridge/test/claude-code-transcript.test.ts`:

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  appendTranscript,
  readTranscript,
  transcriptPathFor,
} from "../src/services/claude-code-transcript.js";

async function tmp(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "cc-tx-"));
}

test("transcriptPathFor joins dir and id", () => {
  const p = transcriptPathFor("/a/b", "deadbeef1234");
  assert.ok(p.endsWith("deadbeef1234.jsonl"));
});

test("appendTranscript writes one JSON line per call and readTranscript returns in order", async () => {
  const dir = await tmp();
  const p = transcriptPathFor(dir, "s1");
  await appendTranscript(p, { t: "2026-04-19T10:00:00Z", kind: "ask", msgId: "m1", question: "hi" });
  await appendTranscript(p, { t: "2026-04-19T10:00:01Z", kind: "draft", msgId: "m1", draft: "d" });
  await appendTranscript(p, {
    t: "2026-04-19T10:00:02Z",
    kind: "answer",
    msgId: "m1",
    answer: "hi back",
    source: "agent",
  });
  const events = await readTranscript(p);
  assert.equal(events.length, 3);
  assert.equal(events[0]!.kind, "ask");
  assert.equal(events[2]!.answer, "hi back");
});

test("readTranscript on missing file returns []", async () => {
  const dir = await tmp();
  const events = await readTranscript(path.join(dir, "nope.jsonl"));
  assert.deepEqual(events, []);
});

test("readTranscript skips malformed lines", async () => {
  const dir = await tmp();
  const p = transcriptPathFor(dir, "s1");
  await appendTranscript(p, { t: "2026-04-19T10:00:00Z", kind: "ask", msgId: "m1", question: "q" });
  await fs.appendFile(p, "not-json\n", "utf8");
  const events = await readTranscript(p);
  assert.equal(events.length, 1);
});
```

- [ ] **Step 2: Run test, confirm it fails**

Run: `pnpm --filter bridge test`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the service**

Create `apps/bridge/src/services/claude-code-transcript.ts`:

```typescript
import fs from "node:fs/promises";
import path from "node:path";
import type { ClaudeCodeTranscriptEvent } from "@openclaw-manager/types";

export function transcriptPathFor(dir: string, sessionId: string): string {
  return path.join(dir, `${sessionId}.jsonl`);
}

export async function appendTranscript(
  filePath: string,
  event: ClaudeCodeTranscriptEvent
): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const line = JSON.stringify(event) + "\n";
  await fs.appendFile(filePath, line, "utf8");
}

export async function readTranscript(filePath: string): Promise<ClaudeCodeTranscriptEvent[]> {
  let raw: string;
  try {
    raw = await fs.readFile(filePath, "utf8");
  } catch {
    return [];
  }
  const out: ClaudeCodeTranscriptEvent[] = [];
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      out.push(JSON.parse(trimmed));
    } catch {
      // skip malformed lines
    }
  }
  return out;
}
```

- [ ] **Step 4: Run test, confirm pass**

Run: `pnpm --filter bridge test`
Expected: all transcript tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/bridge/src/services/claude-code-transcript.ts apps/bridge/test/claude-code-transcript.test.ts
git commit -m "bridge: add claude-code transcript service"
```

---

## Task 5: Pending store service (TDD)

**Files:**
- Create: `apps/bridge/src/services/claude-code-pending.ts`
- Test: `apps/bridge/test/claude-code-pending.test.ts`

The pending store has two parts: a JSON file that survives restart (for dashboard visibility) and an in-memory map of held HTTP-reply resolvers keyed by pending id. Restart loses the held connections but keeps the pending file entries.

- [ ] **Step 1: Write failing test**

Create `apps/bridge/test/claude-code-pending.test.ts`:

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  createPending,
  listPending,
  resolvePending,
  awaitPending,
  registerWaiter,
  unregisterWaiter,
} from "../src/services/claude-code-pending.js";

async function tmp(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "cc-pend-"));
}

test("createPending + listPending round-trips", async () => {
  const dir = await tmp();
  const p = path.join(dir, "pending.json");
  const item = await createPending(p, {
    sessionId: "s1",
    msgId: "m1",
    question: "q",
    draft: "d",
  });
  assert.ok(item.id.startsWith("pend-"));
  const list = await listPending(p);
  assert.equal(list.length, 1);
  assert.equal(list[0]!.msgId, "m1");
});

test("resolvePending removes from disk and triggers waiter", async () => {
  const dir = await tmp();
  const p = path.join(dir, "pending.json");
  const item = await createPending(p, { sessionId: "s1", msgId: "m1", question: "q", draft: "d" });
  const waiter = awaitPending(item.id, 1000);
  registerWaiter(item.id, waiter.resolve, waiter.reject);
  await resolvePending(p, item.id, { answer: "final", source: "operator", action: "send-as-is" });
  const got = await waiter.promise;
  assert.equal(got.answer, "final");
  const list = await listPending(p);
  assert.equal(list.length, 0);
});

test("awaitPending times out after given ms if never resolved", async () => {
  const waiter = awaitPending("missing-id", 50);
  registerWaiter("missing-id", waiter.resolve, waiter.reject);
  await assert.rejects(waiter.promise, /timeout/);
  unregisterWaiter("missing-id");
});
```

- [ ] **Step 2: Run test, confirm fail**

Run: `pnpm --filter bridge test`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the service**

Create `apps/bridge/src/services/claude-code-pending.ts`:

```typescript
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import type {
  ClaudeCodePendingItem,
  ClaudeCodeAskResponse,
} from "@openclaw-manager/types";

type Waiter = {
  resolve: (r: ClaudeCodeAskResponse) => void;
  reject: (e: Error) => void;
};

const waiters = new Map<string, Waiter>();

async function readFileSafe(p: string): Promise<ClaudeCodePendingItem[]> {
  try {
    const raw = await fs.readFile(p, "utf8");
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed?.items)) return parsed.items;
    return [];
  } catch {
    return [];
  }
}

async function writeFileAtomic(p: string, items: ClaudeCodePendingItem[]): Promise<void> {
  await fs.mkdir(path.dirname(p), { recursive: true });
  const tmp = `${p}.tmp-${process.pid}-${Date.now()}`;
  await fs.writeFile(tmp, JSON.stringify({ items }, null, 2), "utf8");
  await fs.rename(tmp, p);
}

export async function listPending(p: string): Promise<ClaudeCodePendingItem[]> {
  return readFileSafe(p);
}

export async function createPending(
  p: string,
  args: Omit<ClaudeCodePendingItem, "id" | "createdAt">
): Promise<ClaudeCodePendingItem> {
  const items = await readFileSafe(p);
  const item: ClaudeCodePendingItem = {
    ...args,
    id: `pend-${crypto.randomBytes(6).toString("hex")}`,
    createdAt: new Date().toISOString(),
  };
  items.push(item);
  await writeFileAtomic(p, items);
  return item;
}

export async function resolvePending(
  p: string,
  id: string,
  result: ClaudeCodeAskResponse | { error: string }
): Promise<void> {
  const items = await readFileSafe(p);
  const filtered = items.filter((i) => i.id !== id);
  if (filtered.length !== items.length) {
    await writeFileAtomic(p, filtered);
  }
  const waiter = waiters.get(id);
  if (waiter) {
    waiters.delete(id);
    if ("error" in result) waiter.reject(new Error(result.error));
    else waiter.resolve(result);
  }
}

export function registerWaiter(
  id: string,
  resolve: (r: ClaudeCodeAskResponse) => void,
  reject: (e: Error) => void
): void {
  waiters.set(id, { resolve, reject });
}

export function unregisterWaiter(id: string): void {
  waiters.delete(id);
}

export function awaitPending(
  id: string,
  timeoutMs: number
): {
  promise: Promise<ClaudeCodeAskResponse>;
  resolve: (r: ClaudeCodeAskResponse) => void;
  reject: (e: Error) => void;
} {
  let resolve!: (r: ClaudeCodeAskResponse) => void;
  let reject!: (e: Error) => void;
  const promise = new Promise<ClaudeCodeAskResponse>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  const timer = setTimeout(() => {
    waiters.delete(id);
    reject(new Error("timeout"));
  }, timeoutMs);
  const wrappedResolve = (r: ClaudeCodeAskResponse) => {
    clearTimeout(timer);
    resolve(r);
  };
  const wrappedReject = (e: Error) => {
    clearTimeout(timer);
    reject(e);
  };
  return { promise, resolve: wrappedResolve, reject: wrappedReject };
}
```

- [ ] **Step 4: Run test, confirm pass**

Run: `pnpm --filter bridge test`
Expected: all pending tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/bridge/src/services/claude-code-pending.ts apps/bridge/test/claude-code-pending.test.ts
git commit -m "bridge: add claude-code pending store with held-waiter map"
```

---

## Task 6: Ask orchestrator (TDD)

**Files:**
- Create: `apps/bridge/src/services/claude-code-ask.ts`
- Test: `apps/bridge/test/claude-code-ask.test.ts`

The orchestrator is the brain of the feature: for each inbound `/ask`, it ensures a session exists, appends the `ask` event, calls the gateway for a draft, and either returns the draft directly (agent mode) or holds for operator input (manual mode). The gateway call is injected as a dependency so tests can mock it.

- [ ] **Step 1: Write failing test**

Create `apps/bridge/test/claude-code-ask.test.ts`:

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createAskOrchestrator } from "../src/services/claude-code-ask.js";
import {
  registerWaiter,
  resolvePending,
  awaitPending,
  listPending,
} from "../src/services/claude-code-pending.js";
import { listSessions, setSessionMode, computeSessionId } from "../src/services/claude-code-sessions.js";
import { readTranscript, transcriptPathFor } from "../src/services/claude-code-transcript.js";

async function tmp(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "cc-ask-"));
}

function makePaths(dir: string) {
  return {
    sessionsPath: path.join(dir, "sessions.json"),
    pendingPath: path.join(dir, "pending.json"),
    transcriptsDir: dir,
  };
}

test("agent mode — returns gateway reply synchronously and logs transcript", async () => {
  const dir = await tmp();
  const p = makePaths(dir);
  const orchestrator = createAskOrchestrator({
    ...p,
    pendingTimeoutMs: 1000,
    sharedOpenclawSessionId: "oc-shared",
    callGateway: async () => ({ reply: "hello from openclaw" }),
    broadcast: () => {},
  });

  const res = await orchestrator.ask({
    ide: "antigravity",
    workspace: "C:\\proj",
    msgId: "m1",
    question: "hi",
  });

  assert.equal(res.answer, "hello from openclaw");
  assert.equal(res.source, "agent");
  const sessions = await listSessions(p.sessionsPath);
  assert.equal(sessions.length, 1);
  const tx = await readTranscript(transcriptPathFor(dir, sessions[0]!.id));
  const kinds = tx.map((e) => e.kind);
  assert.deepEqual(kinds, ["ask", "draft", "answer"]);
});

test("manual mode — creates pending item and waits for operator", async () => {
  const dir = await tmp();
  const p = makePaths(dir);
  const sessionId = computeSessionId("antigravity", "C:\\proj");
  const orchestrator = createAskOrchestrator({
    ...p,
    pendingTimeoutMs: 2000,
    sharedOpenclawSessionId: "oc-shared",
    callGateway: async () => ({ reply: "drafted" }),
    broadcast: () => {},
  });

  // Pre-create session + flip to manual
  await orchestrator.ask({
    ide: "antigravity",
    workspace: "C:\\proj",
    msgId: "m0",
    question: "warmup",
  });
  await setSessionMode(p.sessionsPath, sessionId, "manual");

  const inflight = orchestrator.ask({
    ide: "antigravity",
    workspace: "C:\\proj",
    msgId: "m1",
    question: "needs moderation",
  });

  // Wait until the pending item is visible on disk
  for (let i = 0; i < 50; i++) {
    const items = await listPending(p.pendingPath);
    if (items.length > 0) break;
    await new Promise((r) => setTimeout(r, 10));
  }
  const items = await listPending(p.pendingPath);
  assert.equal(items.length, 1);
  assert.equal(items[0]!.draft, "drafted");

  // Operator sends-as-is
  await resolvePending(p.pendingPath, items[0]!.id, {
    answer: items[0]!.draft,
    source: "operator",
    action: "send-as-is",
  });
  const res = await inflight;
  assert.equal(res.answer, "drafted");
  assert.equal(res.source, "operator");
});

test("manual mode discard — flips session to manual (already manual is no-op) and rejects call", async () => {
  const dir = await tmp();
  const p = makePaths(dir);
  const sessionId = computeSessionId("antigravity", "C:\\proj");
  const orchestrator = createAskOrchestrator({
    ...p,
    pendingTimeoutMs: 2000,
    sharedOpenclawSessionId: "oc-shared",
    callGateway: async () => ({ reply: "drafted" }),
    broadcast: () => {},
  });

  await orchestrator.ask({ ide: "antigravity", workspace: "C:\\proj", msgId: "m0", question: "w" });
  await setSessionMode(p.sessionsPath, sessionId, "manual");

  const inflight = orchestrator.ask({
    ide: "antigravity", workspace: "C:\\proj", msgId: "m1", question: "to be discarded"
  });
  for (let i = 0; i < 50; i++) {
    if ((await listPending(p.pendingPath)).length > 0) break;
    await new Promise((r) => setTimeout(r, 10));
  }
  const items = await listPending(p.pendingPath);
  await resolvePending(p.pendingPath, items[0]!.id, { error: "operator discarded reply" });
  await assert.rejects(inflight, /discarded/);
});

test("gateway failure in agent mode surfaces as error", async () => {
  const dir = await tmp();
  const p = makePaths(dir);
  const orchestrator = createAskOrchestrator({
    ...p,
    pendingTimeoutMs: 1000,
    sharedOpenclawSessionId: "oc-shared",
    callGateway: async () => { throw new Error("gateway offline"); },
    broadcast: () => {},
  });
  await assert.rejects(
    orchestrator.ask({ ide: "a", workspace: "/p", msgId: "m1", question: "q" }),
    /gateway/
  );
});
```

- [ ] **Step 2: Run test, confirm fail**

Run: `pnpm --filter bridge test`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the orchestrator**

Create `apps/bridge/src/services/claude-code-ask.ts`:

```typescript
import crypto from "node:crypto";
import type {
  ClaudeCodeAskRequest,
  ClaudeCodeAskResponse,
  ClaudeCodeTranscriptEvent,
} from "@openclaw-manager/types";
import {
  getOrCreateSession,
  listSessions,
  setSessionMode,
  touchSession,
  resurrectSession,
} from "./claude-code-sessions.js";
import {
  appendTranscript,
  transcriptPathFor,
} from "./claude-code-transcript.js";
import {
  createPending,
  awaitPending,
  registerWaiter,
  unregisterWaiter,
} from "./claude-code-pending.js";

export type AskOrchestratorDeps = {
  sessionsPath: string;
  pendingPath: string;
  transcriptsDir: string;
  pendingTimeoutMs: number;
  sharedOpenclawSessionId: string;
  callGateway: (method: string, params?: Record<string, unknown>) => Promise<unknown>;
  broadcast: (kind: string, payload: unknown) => void;
};

function extractReply(raw: unknown): string {
  if (raw && typeof raw === "object") {
    const any = raw as any;
    if (typeof any.reply === "string") return any.reply;
    if (typeof any.message === "string") return any.message;
    if (typeof any.text === "string") return any.text;
    if (any.result && typeof any.result.reply === "string") return any.result.reply;
  }
  if (typeof raw === "string") return raw;
  return JSON.stringify(raw);
}

export function createAskOrchestrator(deps: AskOrchestratorDeps) {
  async function append(sessionId: string, ev: ClaudeCodeTranscriptEvent) {
    await appendTranscript(transcriptPathFor(deps.transcriptsDir, sessionId), ev);
    deps.broadcast("claude_code_transcript_appended", { sessionId, event: ev });
  }

  async function ask(req: ClaudeCodeAskRequest): Promise<ClaudeCodeAskResponse> {
    const session = await getOrCreateSession(deps.sessionsPath, {
      ide: req.ide,
      workspace: req.workspace,
      openclawSessionId: deps.sharedOpenclawSessionId,
    });
    if (session.state === "ended") {
      await resurrectSession(deps.sessionsPath, session.id);
    }
    deps.broadcast("claude_code_session_upserted", { id: session.id });

    const now = new Date().toISOString();
    await append(session.id, {
      t: now,
      kind: "ask",
      msgId: req.msgId,
      question: req.question,
      context: req.context,
    });

    let draft: string;
    try {
      const raw = await deps.callGateway("chat.send", {
        session_id: session.openclawSessionId,
        message: req.question,
      });
      draft = extractReply(raw);
    } catch (e) {
      throw new Error(`gateway: ${(e as Error).message}`);
    }

    await append(session.id, {
      t: new Date().toISOString(),
      kind: "draft",
      msgId: req.msgId,
      draft,
    });

    const latest = (await listSessions(deps.sessionsPath)).find((s) => s.id === session.id)!;
    if (latest.mode === "agent") {
      await append(session.id, {
        t: new Date().toISOString(),
        kind: "answer",
        msgId: req.msgId,
        answer: draft,
        source: "agent",
      });
      await touchSession(deps.sessionsPath, session.id);
      return { answer: draft, source: "agent" };
    }

    // Manual mode — create pending and hold
    const pending = await createPending(deps.pendingPath, {
      sessionId: session.id,
      msgId: req.msgId,
      question: req.question,
      draft,
    });
    deps.broadcast("claude_code_pending_upserted", pending);

    const waiter = awaitPending(pending.id, deps.pendingTimeoutMs);
    registerWaiter(pending.id, waiter.resolve, waiter.reject);

    try {
      const resolved = await waiter.promise;
      await append(session.id, {
        t: new Date().toISOString(),
        kind: "answer",
        msgId: req.msgId,
        answer: resolved.answer,
        source: resolved.source,
        action: resolved.action,
      });
      await touchSession(deps.sessionsPath, session.id);
      deps.broadcast("claude_code_pending_resolved", { id: pending.id });
      return resolved;
    } catch (err) {
      unregisterWaiter(pending.id);
      const message = (err as Error).message;
      if (/discarded/i.test(message)) {
        await append(session.id, {
          t: new Date().toISOString(),
          kind: "discarded",
          msgId: req.msgId,
        });
        // Flip session to manual (idempotent if already)
        await setSessionMode(deps.sessionsPath, session.id, "manual");
      } else if (/timeout/i.test(message)) {
        await append(session.id, {
          t: new Date().toISOString(),
          kind: "timeout",
          msgId: req.msgId,
        });
      }
      deps.broadcast("claude_code_pending_resolved", { id: pending.id });
      throw err;
    }
  }

  return { ask };
}
```

- [ ] **Step 4: Run test, confirm pass**

Run: `pnpm --filter bridge test`
Expected: all ask-orchestrator tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/bridge/src/services/claude-code-ask.ts apps/bridge/test/claude-code-ask.test.ts
git commit -m "bridge: add claude-code ask orchestrator (agent + manual modes)"
```

---

## Task 7: WS broadcast helper

The existing `ws.ts` already attaches a WebSocket server. We need to expose a way for services to broadcast messages. Inspect it first to see if a helper already exists.

**Files:**
- Modify: `apps/bridge/src/ws.ts`

- [ ] **Step 1: Read current ws.ts**

Run: `cat apps/bridge/src/ws.ts`

Check: is there an exported broadcast function? If yes, note its signature; if no, add one.

- [ ] **Step 2: Ensure a `broadcast(type, payload)` is exported**

If `ws.ts` does not already export a function that takes `(type: WsMessageType, payload: unknown)` and sends to all clients, add one with this signature:

```typescript
export function broadcast(type: string, payload: unknown): void {
  const frame = JSON.stringify({ type, payload });
  for (const client of clients) {
    if (client.readyState === 1 /* OPEN */) {
      client.send(frame);
    }
  }
}
```

Where `clients` is the `Set<WebSocket>` already maintained in the file.

If `ws.ts` already exports a broadcast-style function under a different name, add `broadcast` as an alias so Task 8's router can import it.

- [ ] **Step 3: Build to verify**

Run: `pnpm --filter bridge build`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/bridge/src/ws.ts
git commit -m "bridge: expose broadcast helper for ws clients"
```

---

## Task 8: Bridge HTTP routes

**Files:**
- Create: `apps/bridge/src/routes/claude-code.ts`
- Modify: `apps/bridge/src/server.ts`

- [ ] **Step 1: Create the route file**

Create `apps/bridge/src/routes/claude-code.ts`:

```typescript
import { Router, type Router as ExpressRouter } from "express";
import { config } from "../config.js";
import { callGateway } from "../services/gateway.js";
import { broadcast } from "../ws.js";
import {
  listSessions,
  renameSession,
  setSessionMode,
  endSession,
  resurrectSession,
} from "../services/claude-code-sessions.js";
import {
  readTranscript,
  transcriptPathFor,
} from "../services/claude-code-transcript.js";
import {
  listPending,
  resolvePending,
} from "../services/claude-code-pending.js";
import { createAskOrchestrator } from "../services/claude-code-ask.js";
import type {
  ClaudeCodeAskRequest,
  ClaudeCodeConnectConfig,
} from "@openclaw-manager/types";

const router: ExpressRouter = Router();

const orchestrator = createAskOrchestrator({
  sessionsPath: config.claudeCodeSessionsPath,
  pendingPath: config.claudeCodePendingPath,
  transcriptsDir: config.claudeCodeDir,
  pendingTimeoutMs: config.claudeCodePendingTimeoutMs,
  sharedOpenclawSessionId: config.claudeCodeSharedOpenclawSessionId,
  callGateway,
  broadcast,
});

function validId(id: string): boolean {
  return /^[a-f0-9]{12}$/.test(id);
}

router.post("/claude-code/ask", async (req, res) => {
  const body = req.body as ClaudeCodeAskRequest;
  if (!body?.ide || !body?.workspace || !body?.msgId || typeof body.question !== "string") {
    return res.status(400).json({ error: "ide, workspace, msgId, question are required" });
  }
  try {
    const result = await orchestrator.ask(body);
    res.json(result);
  } catch (err) {
    const message = (err as Error).message;
    if (/discarded/i.test(message)) return res.status(409).json({ error: "operator discarded reply" });
    if (/timeout/i.test(message)) return res.status(504).json({ error: "operator timeout" });
    if (/gateway/i.test(message)) return res.status(503).json({ error: message });
    res.status(500).json({ error: message });
  }
});

router.get("/claude-code/sessions", async (_req, res) => {
  res.json(await listSessions(config.claudeCodeSessionsPath));
});

router.patch("/claude-code/sessions/:id", async (req, res) => {
  const id = req.params.id;
  if (!validId(id)) return res.status(400).json({ error: "invalid id" });
  const { mode, state, displayName } = req.body ?? {};
  try {
    let out;
    if (displayName && typeof displayName === "string") {
      out = await renameSession(config.claudeCodeSessionsPath, id, displayName);
    }
    if (mode === "agent" || mode === "manual") {
      out = await setSessionMode(config.claudeCodeSessionsPath, id, mode);
    }
    if (state === "ended") out = await endSession(config.claudeCodeSessionsPath, id);
    if (state === "active") out = await resurrectSession(config.claudeCodeSessionsPath, id);
    broadcast("claude_code_session_upserted", { id });
    res.json(out ?? (await listSessions(config.claudeCodeSessionsPath)).find((s) => s.id === id));
  } catch (err) {
    res.status(404).json({ error: (err as Error).message });
  }
});

router.get("/claude-code/transcripts/:id", async (req, res) => {
  const id = req.params.id;
  if (!validId(id)) return res.status(400).json({ error: "invalid id" });
  const events = await readTranscript(transcriptPathFor(config.claudeCodeDir, id));
  res.json(events);
});

router.get("/claude-code/pending", async (_req, res) => {
  res.json(await listPending(config.claudeCodePendingPath));
});

router.post("/claude-code/pending/:id", async (req, res) => {
  const id = req.params.id;
  const { action, text } = req.body ?? {};
  if (!action) return res.status(400).json({ error: "action required" });
  const pending = (await listPending(config.claudeCodePendingPath)).find((p) => p.id === id);
  if (!pending) return res.status(404).json({ error: "pending not found" });
  try {
    if (action === "send-as-is") {
      await resolvePending(config.claudeCodePendingPath, id, {
        answer: pending.draft, source: "operator", action: "send-as-is",
      });
    } else if (action === "edit" || action === "replace") {
      if (typeof text !== "string" || !text.trim()) {
        return res.status(400).json({ error: "text required for edit/replace" });
      }
      await resolvePending(config.claudeCodePendingPath, id, {
        answer: text, source: "operator", action,
      });
    } else if (action === "discard") {
      await resolvePending(config.claudeCodePendingPath, id, {
        error: "operator discarded reply",
      });
    } else {
      return res.status(400).json({ error: "unknown action" });
    }
    broadcast("claude_code_pending_resolved", { id });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.get("/claude-code/connect-config", (req, res) => {
  const host = req.get("host")?.split(":")[0] ?? "127.0.0.1";
  const bridgeUrl = `http://${host}:${config.port}`;
  const token = config.token;
  const nodeServerPath = "<absolute path to mcp-openclaw>/dist/server.js";
  const envLines = (ide: string) =>
    [
      `OPENCLAW_BRIDGE_URL=${bridgeUrl}`,
      `OPENCLAW_BRIDGE_TOKEN=${token}`,
      `OPENCLAW_IDE=${ide}`,
      `OPENCLAW_WORKSPACE=\${workspaceFolder}`,
    ].join("\n");
  const config_: ClaudeCodeConnectConfig = {
    antigravity: `# Antigravity mcp.config.json snippet:\n{\n  "mcpServers": {\n    "openclaw": {\n      "command": "node",\n      "args": ["${nodeServerPath}"],\n      "env": {\n        "OPENCLAW_BRIDGE_URL": "${bridgeUrl}",\n        "OPENCLAW_BRIDGE_TOKEN": "${token}",\n        "OPENCLAW_IDE": "antigravity",\n        "OPENCLAW_WORKSPACE": "\${workspaceFolder}"\n      }\n    }\n  }\n}`,
    vscode: `# VSCode (Claude extension) mcp config snippet:\n{\n  "openclaw": {\n    "command": "node",\n    "args": ["${nodeServerPath}"],\n    "env": {\n      "OPENCLAW_BRIDGE_URL": "${bridgeUrl}",\n      "OPENCLAW_BRIDGE_TOKEN": "${token}",\n      "OPENCLAW_IDE": "vscode",\n      "OPENCLAW_WORKSPACE": "\${workspaceFolder}"\n    }\n  }\n}`,
    cli: `# Claude Code CLI:\nclaude mcp add openclaw \\\n  -e OPENCLAW_BRIDGE_URL=${bridgeUrl} \\\n  -e OPENCLAW_BRIDGE_TOKEN=${token} \\\n  -e OPENCLAW_IDE=cli \\\n  -e OPENCLAW_WORKSPACE="$PWD" \\\n  -- node ${nodeServerPath}`,
  };
  res.json(config_);
});

export default router;
```

- [ ] **Step 2: Mount the router in server.ts**

In `apps/bridge/src/server.ts`:
1. Add the import near the other routers: `import claudeCodeRouter from "./routes/claude-code.js";`
2. Add the mount line after the other `app.use(...)` calls: `app.use(claudeCodeRouter);`

- [ ] **Step 3: Build bridge**

Run: `pnpm --filter bridge build`
Expected: no errors.

- [ ] **Step 4: Smoke-test the agent path via curl**

Start the bridge in a separate terminal (`pnpm dev:bridge`), then from a shell with `BRIDGE_TOKEN` in env:

```bash
curl -s -X POST http://127.0.0.1:3100/claude-code/ask \
  -H "Authorization: Bearer $BRIDGE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"ide":"cli","workspace":"C:\\\\test","msgId":"m1","question":"ping"}'
```

Expected: 200 JSON with `answer` string (if OpenClaw gateway is up) or 503 `gateway:...` (if gateway is down — still a valid success for this test since it proves the route is mounted and reaches the gateway layer).

- [ ] **Step 5: Commit**

```bash
git add apps/bridge/src/routes/claude-code.ts apps/bridge/src/server.ts
git commit -m "bridge: add /claude-code HTTP routes and mount"
```

---

## Task 9: MCP package scaffold

**Files:**
- Create: `packages/mcp-openclaw/package.json`
- Create: `packages/mcp-openclaw/tsconfig.json`
- Create: `packages/mcp-openclaw/src/server.ts` (minimal empty for now)

- [ ] **Step 1: Create package.json**

Create `packages/mcp-openclaw/package.json`:

```json
{
  "name": "@openclaw-manager/mcp",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "bin": {
    "openclaw-mcp": "dist/server.js"
  },
  "scripts": {
    "build": "tsc",
    "dev": "tsx src/server.ts"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0",
    "@openclaw-manager/types": "workspace:*"
  },
  "devDependencies": {
    "@types/node": "^22.15.2",
    "tsx": "^4.19.4",
    "typescript": "^5.8.3"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

Create `packages/mcp-openclaw/tsconfig.json`:

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

- [ ] **Step 3: Create minimal server.ts**

Create `packages/mcp-openclaw/src/server.ts` with a stub:

```typescript
#!/usr/bin/env node
console.error("openclaw-mcp starting (stub)");
```

- [ ] **Step 4: Install new dependency**

Run from repo root: `pnpm install`
Expected: resolves `@modelcontextprotocol/sdk`, writes lockfile changes.

- [ ] **Step 5: Build to verify**

Run: `pnpm --filter @openclaw-manager/mcp build`
Expected: emits `dist/server.js`.

- [ ] **Step 6: Commit**

```bash
git add packages/mcp-openclaw/ pnpm-lock.yaml
git commit -m "mcp: scaffold @openclaw-manager/mcp package"
```

---

## Task 10: MCP tools implementation

**Files:**
- Modify: `packages/mcp-openclaw/src/server.ts`

- [ ] **Step 1: Implement the stdio server with three tools**

Replace `packages/mcp-openclaw/src/server.ts` with:

```typescript
#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import crypto from "node:crypto";

const BRIDGE_URL = process.env.OPENCLAW_BRIDGE_URL || "http://127.0.0.1:3100";
const BRIDGE_TOKEN = process.env.OPENCLAW_BRIDGE_TOKEN || "";
const IDE = process.env.OPENCLAW_IDE || "unknown";
const WORKSPACE = process.env.OPENCLAW_WORKSPACE || process.cwd();

async function bridgeFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BRIDGE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${BRIDGE_TOKEN}`,
      ...init?.headers,
    },
  });
  const bodyText = await res.text();
  if (!res.ok) {
    let parsed: any = null;
    try { parsed = JSON.parse(bodyText); } catch {}
    throw new Error(parsed?.error ?? `bridge ${res.status}: ${bodyText}`);
  }
  return bodyText ? (JSON.parse(bodyText) as T) : (undefined as T);
}

const server = new Server(
  { name: "openclaw-mcp", version: "0.1.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "openclaw_say",
      description:
        "Send a turn in an ongoing collaborative conversation with OpenClaw. OpenClaw remembers the thread across calls. Use this to ask questions, brainstorm, or work through bugs together with OpenClaw.",
      inputSchema: {
        type: "object",
        properties: {
          message: { type: "string", description: "Your turn in the conversation." },
          context: {
            type: "object",
            description: "Optional context to include (e.g. selected code, stack trace, file path).",
            additionalProperties: true,
          },
        },
        required: ["message"],
      },
    },
    {
      name: "openclaw_conclude",
      description: "Signal that the current collaborative task is done and the session can end.",
      inputSchema: {
        type: "object",
        properties: {
          reason: { type: "string", description: "Optional one-line summary of the outcome." },
        },
      },
    },
    {
      name: "openclaw_session_info",
      description: "Inspect the current Claude-Code/OpenClaw session: id, display name, mode, message count.",
      inputSchema: { type: "object", properties: {} },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const name = req.params.name;
  const args = (req.params.arguments ?? {}) as Record<string, unknown>;

  if (name === "openclaw_say") {
    const message = String(args.message ?? "");
    const context = (args.context as Record<string, unknown>) ?? undefined;
    const msgId = `m-${crypto.randomBytes(6).toString("hex")}`;
    const result = await bridgeFetch<{ answer: string; source: string; action?: string }>(
      "/claude-code/ask",
      {
        method: "POST",
        body: JSON.stringify({ ide: IDE, workspace: WORKSPACE, msgId, question: message, context }),
      }
    );
    return { content: [{ type: "text", text: result.answer }] };
  }

  if (name === "openclaw_conclude") {
    const sessions = await bridgeFetch<Array<{ id: string; ide: string; workspace: string }>>("/claude-code/sessions");
    const norm = WORKSPACE.trim().replace(/\\/g, "/").toLowerCase();
    const match = sessions.find(
      (s) => s.ide === IDE && s.workspace.trim().replace(/\\/g, "/").toLowerCase() === norm
    );
    if (!match) return { content: [{ type: "text", text: "no session to conclude" }] };
    await bridgeFetch(`/claude-code/sessions/${match.id}`, {
      method: "PATCH",
      body: JSON.stringify({ state: "ended" }),
    });
    return { content: [{ type: "text", text: "session ended" }] };
  }

  if (name === "openclaw_session_info") {
    const sessions = await bridgeFetch<Array<{ id: string; displayName: string; mode: string; messageCount: number; ide: string; workspace: string }>>("/claude-code/sessions");
    const norm = WORKSPACE.trim().replace(/\\/g, "/").toLowerCase();
    const match = sessions.find(
      (s) => s.ide === IDE && s.workspace.trim().replace(/\\/g, "/").toLowerCase() === norm
    );
    const text = match
      ? JSON.stringify({ id: match.id, displayName: match.displayName, mode: match.mode, messageCount: match.messageCount }, null, 2)
      : "no session yet";
    return { content: [{ type: "text", text }] };
  }

  throw new Error(`Unknown tool: ${name}`);
});

await server.connect(new StdioServerTransport());
```

- [ ] **Step 2: Build**

Run: `pnpm --filter @openclaw-manager/mcp build`
Expected: no errors.

- [ ] **Step 3: Hand-test with a one-line stdin**

From a terminal with `OPENCLAW_BRIDGE_TOKEN` exported and the bridge running:

```bash
OPENCLAW_IDE=cli OPENCLAW_WORKSPACE=/tmp/test \
OPENCLAW_BRIDGE_URL=http://127.0.0.1:3100 \
  node packages/mcp-openclaw/dist/server.js <<'EOF'
{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}
EOF
```

Expected: JSON-RPC response listing three tools (`openclaw_say`, `openclaw_conclude`, `openclaw_session_info`).

- [ ] **Step 4: Commit**

```bash
git add packages/mcp-openclaw/src/server.ts
git commit -m "mcp: implement openclaw_say / conclude / session_info tools"
```

---

## Task 11: Dashboard bridge-client methods

**Files:**
- Modify: `apps/dashboard/src/lib/bridge-client.ts`

- [ ] **Step 1: Add Claude Code types import**

At the top of `bridge-client.ts`, extend the existing `import type { ... } from "@openclaw-manager/types";` block to include:

```typescript
  ClaudeCodeSession,
  ClaudeCodeTranscriptEvent,
  ClaudeCodePendingItem,
  ClaudeCodeConnectConfig,
  ClaudeCodeSessionMode,
```

- [ ] **Step 2: Append Claude Code client functions**

Append to the bottom of `apps/dashboard/src/lib/bridge-client.ts`:

```typescript
export async function getClaudeCodeSessions(): Promise<ClaudeCodeSession[]> {
  return bridgeFetch<ClaudeCodeSession[]>("/claude-code/sessions");
}

export async function getClaudeCodeTranscript(id: string): Promise<ClaudeCodeTranscriptEvent[]> {
  return bridgeFetch<ClaudeCodeTranscriptEvent[]>(`/claude-code/transcripts/${id}`);
}

export async function getClaudeCodePending(): Promise<ClaudeCodePendingItem[]> {
  return bridgeFetch<ClaudeCodePendingItem[]>("/claude-code/pending");
}

export async function patchClaudeCodeSession(
  id: string,
  updates: { mode?: ClaudeCodeSessionMode; state?: "active" | "ended"; displayName?: string }
): Promise<ClaudeCodeSession> {
  return bridgeFetch<ClaudeCodeSession>(`/claude-code/sessions/${id}`, {
    method: "PATCH",
    body: JSON.stringify(updates),
  });
}

export async function resolveClaudeCodePending(
  id: string,
  action: "send-as-is" | "edit" | "replace" | "discard",
  text?: string
): Promise<{ ok: true }> {
  return bridgeFetch<{ ok: true }>(`/claude-code/pending/${id}`, {
    method: "POST",
    body: JSON.stringify({ action, text }),
  });
}

export async function getClaudeCodeConnectConfig(): Promise<ClaudeCodeConnectConfig> {
  return bridgeFetch<ClaudeCodeConnectConfig>("/claude-code/connect-config");
}
```

- [ ] **Step 3: Build dashboard to verify**

Run: `pnpm --filter dashboard build`
Expected: no type errors. If there are warnings about unused Next cache keys, ignore — only errors are blockers.

- [ ] **Step 4: Commit**

```bash
git add apps/dashboard/src/lib/bridge-client.ts
git commit -m "dashboard: add claude-code bridge-client methods"
```

---

## Task 12: Dashboard sessions list page

**Files:**
- Create: `apps/dashboard/src/app/claude-code/page.tsx`
- Create: `apps/dashboard/src/components/claude-code-sessions-table.tsx`

- [ ] **Step 1: Create the page**

Create `apps/dashboard/src/app/claude-code/page.tsx`:

```tsx
import { AppShell } from "@/components/app-shell";
import { ClaudeCodeSessionsTable } from "@/components/claude-code-sessions-table";
import { getClaudeCodeSessions, getClaudeCodePending } from "@/lib/bridge-client";

export const dynamic = "force-dynamic";

export default async function ClaudeCodePage() {
  const [sessions, pending] = await Promise.all([
    getClaudeCodeSessions().catch(() => []),
    getClaudeCodePending().catch(() => []),
  ]);
  const pendingBySession = new Map<string, number>();
  for (const p of pending) pendingBySession.set(p.sessionId, (pendingBySession.get(p.sessionId) ?? 0) + 1);
  return (
    <AppShell title="Claude Code">
      <ClaudeCodeSessionsTable
        sessions={sessions}
        pendingBySession={Object.fromEntries(pendingBySession)}
      />
    </AppShell>
  );
}
```

- [ ] **Step 2: Create the table component**

Create `apps/dashboard/src/components/claude-code-sessions-table.tsx`:

```tsx
"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ClaudeCodeSession } from "@openclaw-manager/types";

export function ClaudeCodeSessionsTable({
  sessions,
  pendingBySession,
}: {
  sessions: ClaudeCodeSession[];
  pendingBySession: Record<string, number>;
}) {
  const router = useRouter();
  const [showConnect, setShowConnect] = useState(false);

  async function patch(id: string, body: Record<string, unknown>) {
    await fetch(`/api/claude-code/sessions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    router.refresh();
  }

  const active = sessions.filter((s) => s.state === "active");
  const ended = sessions.filter((s) => s.state === "ended");

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <p className="text-sm text-text-muted">
          {active.length} active session{active.length === 1 ? "" : "s"}
          {ended.length > 0 ? ` · ${ended.length} ended` : ""}
        </p>
        <button
          onClick={() => setShowConnect(true)}
          className="rounded bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90"
        >
          Connect a new IDE
        </button>
      </div>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-dark-border text-left text-text-muted">
            <th className="py-2 pr-4">Name</th>
            <th className="py-2 pr-4">Mode</th>
            <th className="py-2 pr-4">State</th>
            <th className="py-2 pr-4">Activity</th>
            <th className="py-2 pr-4">Pending</th>
            <th className="py-2">Actions</th>
          </tr>
        </thead>
        <tbody>
          {sessions.map((s) => {
            const pendingCount = pendingBySession[s.id] ?? 0;
            return (
              <tr key={s.id} className="border-b border-dark-border/50 hover:bg-dark-lighter/30">
                <td className="py-3 pr-4">
                  <Link href={`/claude-code/${s.id}`} className="text-primary hover:underline">
                    {s.displayName}
                  </Link>
                </td>
                <td className="py-3 pr-4">
                  <button
                    onClick={() => patch(s.id, { mode: s.mode === "agent" ? "manual" : "agent" })}
                    className={`rounded px-3 py-1 text-xs ${s.mode === "agent" ? "bg-green-500/20 text-green-400" : "bg-yellow-500/20 text-yellow-400"}`}
                  >
                    {s.mode}
                  </button>
                </td>
                <td className="py-3 pr-4 text-text-gray">{s.state}</td>
                <td className="py-3 pr-4 text-text-muted">
                  {s.messageCount} msgs · {relativeTime(s.lastActivityAt)}
                </td>
                <td className="py-3 pr-4">
                  {pendingCount > 0 ? (
                    <span className="inline-flex items-center gap-2 rounded bg-red-500/20 px-2 py-0.5 text-xs text-red-400">
                      <span className="h-2 w-2 rounded-full bg-red-400" />
                      {pendingCount}
                    </span>
                  ) : (
                    <span className="text-text-muted">—</span>
                  )}
                </td>
                <td className="py-3">
                  {s.state === "active" ? (
                    <button
                      onClick={() => patch(s.id, { state: "ended" })}
                      className="text-xs text-text-muted hover:text-red-400"
                    >
                      End
                    </button>
                  ) : (
                    <button
                      onClick={() => patch(s.id, { state: "active" })}
                      className="text-xs text-text-muted hover:text-green-400"
                    >
                      Resurrect
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
          {sessions.length === 0 && (
            <tr>
              <td colSpan={6} className="py-8 text-center text-text-muted">
                No Claude Code sessions yet. Connect an IDE to start.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {showConnect && <ConnectModal onClose={() => setShowConnect(false)} />}
    </div>
  );
}

function relativeTime(iso: string): string {
  const delta = Date.now() - new Date(iso).getTime();
  const m = Math.floor(delta / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function ConnectModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="max-h-[80vh] w-[min(800px,90vw)] overflow-y-auto rounded bg-dark-card p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <ConnectModalBody />
        <button onClick={onClose} className="mt-4 rounded bg-dark-lighter px-4 py-2 text-sm">
          Close
        </button>
      </div>
    </div>
  );
}

function ConnectModalBody() {
  // Import here to keep the parent a server-compatible boundary via "use client" on this component
  const { ClaudeCodeConnectModalBody } = require("./claude-code-connect-modal");
  return <ClaudeCodeConnectModalBody />;
}
```

- [ ] **Step 3: Add a dashboard proxy route so client components can PATCH the session**

Create `apps/dashboard/src/app/api/claude-code/sessions/[id]/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { patchClaudeCodeSession } from "@/lib/bridge-client";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  try {
    const out = await patchClaudeCodeSession(id, body);
    return NextResponse.json(out);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
```

- [ ] **Step 4: Play-test**

Run: `pnpm dev:dashboard` (with the bridge already running and `OPENCLAW_BRIDGE_TOKEN` set).
Visit: `http://localhost:3000/claude-code` (log in first).
Expected: an empty table with the "Connect a new IDE" button. Trigger one `openclaw_say` via the MCP binary (from Task 10 hand-test) and refresh — the new session appears.

- [ ] **Step 5: Commit**

```bash
git add apps/dashboard/src/app/claude-code/ apps/dashboard/src/components/claude-code-sessions-table.tsx apps/dashboard/src/app/api/claude-code/
git commit -m "dashboard: add claude-code sessions list page"
```

---

## Task 13: Dashboard session detail page with live transcript and pending card

**Files:**
- Create: `apps/dashboard/src/app/claude-code/[id]/page.tsx`
- Create: `apps/dashboard/src/components/claude-code-session-detail.tsx`
- Create: `apps/dashboard/src/components/claude-code-pending-card.tsx`
- Create: `apps/dashboard/src/app/api/claude-code/pending/[id]/route.ts`

- [ ] **Step 1: Add dashboard proxy for pending resolution**

Create `apps/dashboard/src/app/api/claude-code/pending/[id]/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { resolveClaudeCodePending } from "@/lib/bridge-client";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { action, text } = await req.json();
  try {
    const out = await resolveClaudeCodePending(id, action, text);
    return NextResponse.json(out);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
```

- [ ] **Step 2: Create the page**

Create `apps/dashboard/src/app/claude-code/[id]/page.tsx`:

```tsx
import { AppShell } from "@/components/app-shell";
import { ClaudeCodeSessionDetail } from "@/components/claude-code-session-detail";
import {
  getClaudeCodeSessions,
  getClaudeCodeTranscript,
  getClaudeCodePending,
} from "@/lib/bridge-client";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function ClaudeCodeSessionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [sessions, events, pending] = await Promise.all([
    getClaudeCodeSessions().catch(() => []),
    getClaudeCodeTranscript(id).catch(() => []),
    getClaudeCodePending().catch(() => []),
  ]);
  const session = sessions.find((s) => s.id === id);
  if (!session) notFound();
  const sessionPending = pending.filter((p) => p.sessionId === id);
  return (
    <AppShell title={`Claude Code · ${session.displayName}`}>
      <ClaudeCodeSessionDetail
        session={session}
        initialEvents={events}
        initialPending={sessionPending}
      />
    </AppShell>
  );
}
```

- [ ] **Step 3: Create the detail component**

Create `apps/dashboard/src/components/claude-code-session-detail.tsx`:

```tsx
"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type {
  ClaudeCodeSession,
  ClaudeCodeTranscriptEvent,
  ClaudeCodePendingItem,
} from "@openclaw-manager/types";
import { ClaudeCodePendingCard } from "./claude-code-pending-card";

export function ClaudeCodeSessionDetail({
  session,
  initialEvents,
  initialPending,
}: {
  session: ClaudeCodeSession;
  initialEvents: ClaudeCodeTranscriptEvent[];
  initialPending: ClaudeCodePendingItem[];
}) {
  const router = useRouter();
  const [events, setEvents] = useState(initialEvents);
  const [pending, setPending] = useState(initialPending);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Live updates via existing ws
  useEffect(() => {
    const url = `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/api/ws`;
    let ws: WebSocket | null = null;
    try {
      ws = new WebSocket(url);
    } catch {
      return;
    }
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.type === "claude_code_transcript_appended" && msg.payload?.sessionId === session.id) {
          setEvents((prev) => [...prev, msg.payload.event]);
        } else if (msg.type === "claude_code_pending_upserted" && msg.payload?.sessionId === session.id) {
          setPending((prev) => [...prev.filter((p) => p.id !== msg.payload.id), msg.payload]);
        } else if (msg.type === "claude_code_pending_resolved") {
          setPending((prev) => prev.filter((p) => p.id !== msg.payload?.id));
        } else if (msg.type === "claude_code_session_upserted") {
          router.refresh();
        }
      } catch {}
    };
    return () => ws?.close();
  }, [session.id, router]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [events]);

  async function toggleMode() {
    await fetch(`/api/claude-code/sessions/${session.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: session.mode === "agent" ? "manual" : "agent" }),
    });
    router.refresh();
  }

  async function endSession() {
    await fetch(`/api/claude-code/sessions/${session.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ state: "ended" }),
    });
    router.refresh();
  }

  return (
    <div className="grid grid-cols-[1fr_320px] gap-6">
      <div
        ref={scrollRef}
        className="h-[calc(100vh-12rem)] overflow-y-auto rounded border border-dark-border bg-dark-card p-6"
      >
        {events.length === 0 && (
          <p className="text-center text-text-muted">No turns yet. Start a conversation from your IDE.</p>
        )}
        {events.map((e, i) => (
          <TranscriptBubble key={i} event={e} />
        ))}
      </div>
      <aside className="flex flex-col gap-4">
        <div className="rounded border border-dark-border bg-dark-card p-4">
          <h3 className="mb-3 text-sm font-semibold">Mode</h3>
          <button
            onClick={toggleMode}
            className={`w-full rounded px-3 py-2 text-sm ${session.mode === "agent" ? "bg-green-500/20 text-green-400" : "bg-yellow-500/20 text-yellow-400"}`}
          >
            {session.mode === "agent" ? "● Agent — click to take over" : "○ Manual — click to release"}
          </button>
        </div>
        {pending.map((p) => (
          <ClaudeCodePendingCard key={p.id} pending={p} onResolved={(id) => setPending((prev) => prev.filter((x) => x.id !== id))} />
        ))}
        <div className="rounded border border-dark-border bg-dark-card p-4 text-xs text-text-muted">
          <div className="mb-2 font-semibold text-text-gray">Session</div>
          <div>id: <code>{session.id}</code></div>
          <div>ide: {session.ide}</div>
          <div>workspace: <code className="break-all">{session.workspace}</code></div>
          <div>created: {new Date(session.createdAt).toLocaleString()}</div>
          <div>openclaw session: <code>{session.openclawSessionId}</code></div>
        </div>
        {session.state === "active" && (
          <button
            onClick={endSession}
            className="rounded border border-red-500/40 px-3 py-2 text-sm text-red-400 hover:bg-red-500/10"
          >
            End session
          </button>
        )}
      </aside>
    </div>
  );
}

function TranscriptBubble({ event }: { event: ClaudeCodeTranscriptEvent }) {
  if (event.kind === "ask") {
    return (
      <div className="mb-4 flex justify-end">
        <div className="max-w-[80%] rounded-2xl rounded-tr-sm bg-primary/20 px-4 py-2 text-sm">
          <div className="mb-1 text-xs text-text-muted">Claude Code</div>
          <div className="whitespace-pre-wrap">{event.question}</div>
          {event.context && (
            <details className="mt-2 text-xs text-text-muted">
              <summary className="cursor-pointer">context</summary>
              <pre className="mt-1 overflow-x-auto">{JSON.stringify(event.context, null, 2)}</pre>
            </details>
          )}
        </div>
      </div>
    );
  }
  if (event.kind === "answer") {
    const isOperator = event.source === "operator";
    return (
      <div className="mb-4 flex justify-start">
        <div
          className={`max-w-[80%] rounded-2xl rounded-tl-sm px-4 py-2 text-sm ${isOperator ? "bg-yellow-500/15" : "bg-dark-lighter"}`}
        >
          <div className="mb-1 text-xs text-text-muted">
            {isOperator ? `Operator (${event.action})` : "OpenClaw"}
          </div>
          <div className="whitespace-pre-wrap">{event.answer}</div>
        </div>
      </div>
    );
  }
  if (event.kind === "discarded") {
    return <div className="mb-2 text-center text-xs text-red-400">— operator discarded reply —</div>;
  }
  if (event.kind === "timeout") {
    return <div className="mb-2 text-center text-xs text-orange-400">— operator timeout —</div>;
  }
  if (event.kind === "mode_change") {
    return (
      <div className="mb-2 text-center text-xs text-text-muted">
        — mode: {event.from} → {event.to} —
      </div>
    );
  }
  if (event.kind === "ended") {
    return <div className="mb-2 text-center text-xs text-text-muted">— session ended —</div>;
  }
  return null;
}
```

- [ ] **Step 4: Create the pending-card component**

Create `apps/dashboard/src/components/claude-code-pending-card.tsx`:

```tsx
"use client";
import { useState } from "react";
import type { ClaudeCodePendingItem } from "@openclaw-manager/types";

export function ClaudeCodePendingCard({
  pending,
  onResolved,
}: {
  pending: ClaudeCodePendingItem;
  onResolved: (id: string) => void;
}) {
  const [mode, setMode] = useState<"idle" | "edit" | "replace">("idle");
  const [text, setText] = useState(pending.draft);
  const [submitting, setSubmitting] = useState(false);

  async function resolve(action: "send-as-is" | "edit" | "replace" | "discard", body?: string) {
    setSubmitting(true);
    await fetch(`/api/claude-code/pending/${pending.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, text: body }),
    });
    setSubmitting(false);
    onResolved(pending.id);
  }

  return (
    <div className="rounded border border-yellow-500/40 bg-yellow-500/5 p-4">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-yellow-400">
        Pending draft — awaiting your decision
      </div>
      <div className="mb-3">
        <div className="mb-1 text-xs text-text-muted">Claude Code asked:</div>
        <div className="rounded bg-dark-lighter p-2 text-xs whitespace-pre-wrap">{pending.question}</div>
      </div>
      <div className="mb-3">
        <div className="mb-1 text-xs text-text-muted">OpenClaw drafted:</div>
        {mode === "idle" ? (
          <div className="rounded bg-dark-lighter p-2 text-xs whitespace-pre-wrap">{pending.draft}</div>
        ) : (
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="w-full rounded bg-dark-lighter p-2 text-xs"
            rows={6}
            placeholder={mode === "replace" ? "Write your own reply..." : "Edit the draft..."}
          />
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {mode === "idle" && (
          <>
            <button
              disabled={submitting}
              onClick={() => resolve("send-as-is")}
              className="rounded bg-green-500/20 px-3 py-1.5 text-xs text-green-400 hover:bg-green-500/30 disabled:opacity-50"
            >
              Send as-is
            </button>
            <button
              disabled={submitting}
              onClick={() => setMode("edit")}
              className="rounded bg-blue-500/20 px-3 py-1.5 text-xs text-blue-400 hover:bg-blue-500/30"
            >
              Edit
            </button>
            <button
              disabled={submitting}
              onClick={() => { setText(""); setMode("replace"); }}
              className="rounded bg-yellow-500/20 px-3 py-1.5 text-xs text-yellow-400 hover:bg-yellow-500/30"
            >
              Replace
            </button>
            <button
              disabled={submitting}
              onClick={() => resolve("discard")}
              className="rounded bg-red-500/20 px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/30"
            >
              Discard
            </button>
          </>
        )}
        {mode !== "idle" && (
          <>
            <button
              disabled={submitting || !text.trim()}
              onClick={() => resolve(mode, text)}
              className="rounded bg-primary px-3 py-1.5 text-xs text-white disabled:opacity-50"
            >
              Send {mode}
            </button>
            <button
              onClick={() => { setMode("idle"); setText(pending.draft); }}
              className="rounded bg-dark-lighter px-3 py-1.5 text-xs"
            >
              Cancel
            </button>
          </>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Build and play-test**

Run: `pnpm --filter dashboard build`
Expected: no type errors.

With the bridge running, trigger two asks via the MCP binary (from Task 10). Flip the session to `manual` from the dashboard list. Trigger a third ask — the detail page should show a pending draft card. Click each of the four actions and confirm the transcript updates correctly.

- [ ] **Step 6: Commit**

```bash
git add apps/dashboard/src/app/claude-code/[id]/ apps/dashboard/src/components/claude-code-session-detail.tsx apps/dashboard/src/components/claude-code-pending-card.tsx apps/dashboard/src/app/api/claude-code/pending/
git commit -m "dashboard: add claude-code session detail with live transcript and moderation"
```

---

## Task 14: Connect-IDE modal

**Files:**
- Create: `apps/dashboard/src/components/claude-code-connect-modal.tsx`
- Create: `apps/dashboard/src/app/api/claude-code/connect-config/route.ts`

- [ ] **Step 1: Add the proxy route**

Create `apps/dashboard/src/app/api/claude-code/connect-config/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { getClaudeCodeConnectConfig } from "@/lib/bridge-client";

export async function GET() {
  try {
    return NextResponse.json(await getClaudeCodeConnectConfig());
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
```

- [ ] **Step 2: Create the modal body component**

Create `apps/dashboard/src/components/claude-code-connect-modal.tsx`:

```tsx
"use client";
import { useEffect, useState } from "react";
import type { ClaudeCodeConnectConfig } from "@openclaw-manager/types";

export function ClaudeCodeConnectModalBody() {
  const [config, setConfig] = useState<ClaudeCodeConnectConfig | null>(null);
  const [tab, setTab] = useState<"antigravity" | "vscode" | "cli">("antigravity");

  useEffect(() => {
    fetch("/api/claude-code/connect-config")
      .then((r) => r.json())
      .then(setConfig)
      .catch(() => setConfig(null));
  }, []);

  if (!config) return <div className="text-sm text-text-muted">Loading…</div>;

  const snippet = config[tab];

  return (
    <div>
      <h2 className="mb-4 text-xl font-semibold">Connect a new IDE</h2>
      <p className="mb-4 text-sm text-text-muted">
        Paste this into your IDE's MCP configuration. Replace <code>&lt;absolute path to mcp-openclaw&gt;</code> with the path
        to this repo's <code>packages/mcp-openclaw/dist/server.js</code>.
      </p>
      <div className="mb-3 flex gap-2">
        {(["antigravity", "vscode", "cli"] as const).map((k) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`rounded px-3 py-1.5 text-xs ${tab === k ? "bg-primary text-white" : "bg-dark-lighter text-text-muted"}`}
          >
            {k}
          </button>
        ))}
      </div>
      <div className="relative">
        <pre className="max-h-[40vh] overflow-auto rounded bg-dark-lighter p-4 text-xs whitespace-pre-wrap">
          {snippet}
        </pre>
        <button
          onClick={() => navigator.clipboard.writeText(snippet)}
          className="absolute right-2 top-2 rounded bg-primary px-2 py-1 text-xs text-white"
        >
          Copy
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify modal opens from the table**

(Already wired via the `ConnectModalBody` stub in Task 12. No additional change needed.)

- [ ] **Step 4: Build dashboard**

Run: `pnpm --filter dashboard build`
Expected: no errors.

- [ ] **Step 5: Play-test**

Visit `/claude-code`, click **Connect a new IDE**. Expected: modal opens with three tabs, each showing a pre-filled config block; Copy button works.

- [ ] **Step 6: Commit**

```bash
git add apps/dashboard/src/components/claude-code-connect-modal.tsx apps/dashboard/src/app/api/claude-code/connect-config/
git commit -m "dashboard: add connect-IDE modal with per-IDE config snippets"
```

---

## Task 15: Sidebar navigation

**Files:**
- Modify: `apps/dashboard/src/components/sidebar.tsx`

- [ ] **Step 1: Add a "Claude Code" nav item**

In `apps/dashboard/src/components/sidebar.tsx`, find the `NAV_SECTIONS` array. Inside the `"Monitor"` section's `items` array, add a new entry after `"Conversations"`:

```typescript
      { href: "/claude-code", label: "Claude Code", icon: "M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" },
```

- [ ] **Step 2: Build dashboard**

Run: `pnpm --filter dashboard build`
Expected: no errors.

- [ ] **Step 3: Play-test**

Refresh the dashboard. Expected: "Claude Code" appears in the Monitor section; clicking it navigates to the sessions list.

- [ ] **Step 4: Commit**

```bash
git add apps/dashboard/src/components/sidebar.tsx
git commit -m "dashboard: add claude-code to sidebar nav"
```

---

## Task 16: Docs, env example, and smoke script

**Files:**
- Modify: `AGENTS.md`
- Create: `scripts/smoke-claude-code.mjs`

- [ ] **Step 1: Document env vars in AGENTS.md**

In `AGENTS.md`, find the `### Bridge` env var table. Append these rows to it (keeping the table formatting):

```markdown
| `CLAUDE_CODE_PENDING_TIMEOUT_MS` | No | `300000` | Max ms to hold a manual-mode `/claude-code/ask` reply |
| `CLAUDE_CODE_SHARED_OPENCLAW_SESSION_ID` | No | `oc-shared-claude-code` | Shared OpenClaw-side session id all Claude Code sessions use |
```

Then add a short subsection after the Bridge API Reference section:

```markdown
## Claude Code ↔ OpenClaw

A collaborative dialogue channel: Claude Code (any IDE) calls the `@openclaw-manager/mcp` stdio server, which forwards to `/claude-code/ask`. The bridge routes the turn through the OpenClaw gateway, logs the exchange, and (in manual mode) holds the reply until the operator approves it from the dashboard. See `docs/superpowers/specs/2026-04-19-claude-code-openclaw-bridge-design.md` for the full design.

Bridge endpoints: `/claude-code/ask`, `/claude-code/sessions`, `/claude-code/transcripts/:id`, `/claude-code/pending`, `/claude-code/pending/:id`, `/claude-code/connect-config`.

MCP tools: `openclaw_say`, `openclaw_conclude`, `openclaw_session_info`.
```

- [ ] **Step 2: Create the smoke test**

Create `scripts/smoke-claude-code.mjs`:

```javascript
#!/usr/bin/env node
// Sends one /claude-code/ask to the running bridge and prints the result.
// Requires: bridge running, BRIDGE_TOKEN in env.

const BRIDGE_URL = process.env.OPENCLAW_BRIDGE_URL || "http://127.0.0.1:3100";
const BRIDGE_TOKEN = process.env.OPENCLAW_BRIDGE_TOKEN || process.env.BRIDGE_TOKEN;

if (!BRIDGE_TOKEN) {
  console.error("Missing OPENCLAW_BRIDGE_TOKEN (or BRIDGE_TOKEN) in env");
  process.exit(1);
}

const body = {
  ide: "cli",
  workspace: process.cwd(),
  msgId: `m-${Date.now()}`,
  question: "Smoke test from scripts/smoke-claude-code.mjs — please reply with 'ack'.",
};

const res = await fetch(`${BRIDGE_URL}/claude-code/ask`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${BRIDGE_TOKEN}`,
  },
  body: JSON.stringify(body),
});

const text = await res.text();
console.log(`HTTP ${res.status}`);
console.log(text);
process.exit(res.ok ? 0 : 2);
```

- [ ] **Step 3: Hand-run the smoke test**

Run (bridge must be up): `OPENCLAW_BRIDGE_TOKEN=$BRIDGE_TOKEN node scripts/smoke-claude-code.mjs`
Expected: HTTP 200 with `{"answer":"...", "source":"agent"}` (or HTTP 503 `gateway offline` if OpenClaw is down — still proves the route).

- [ ] **Step 4: Build everything end-to-end**

Run: `pnpm build`
Expected: all workspace packages build with no type errors.

- [ ] **Step 5: Commit**

```bash
git add AGENTS.md scripts/smoke-claude-code.mjs
git commit -m "docs: document claude-code bridge + add smoke script"
```

---

## Post-plan self-review notes

**Spec coverage:** every section of the spec has a task. Sessions (Task 3), transcripts (Task 4), pending (Task 5), ask flow (Task 6), routes (Task 8), MCP tools (Tasks 9–10), dashboard list + detail + modal (Tasks 12–14), nav (Task 15), docs + smoke (Task 16). Types (Task 1). Config (Task 2). WS broadcast (Task 7).

**Known limitations / deferred items:**
- The `[[OPENCLAW_DONE]]` sentinel is **not** implemented in v1 — ending a session still works via the dashboard button and the `openclaw_conclude` tool. The sentinel is called out as an open question in the spec; keeping it out of v1 to avoid entangling with how `chat.send` composes system prompts.
- Mode-change event emission on PATCH: the route broadcasts `claude_code_session_upserted` but does not write a `mode_change` transcript event. If you want that in the transcript, add a call to `appendTranscript` + broadcast in the `setSessionMode` branch of the PATCH handler in Task 8. Intentionally kept out of v1 for simplicity — add if your play-test shows you miss it.
- The connect-config `<absolute path to mcp-openclaw>` is a placeholder — the operator replaces it when pasting. If you want the dashboard to know the real path, add `MCP_SERVER_PATH` to bridge env in a follow-up.
