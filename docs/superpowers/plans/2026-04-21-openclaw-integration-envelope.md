# Collaboration Envelope Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the phase-1 collaboration envelope end-to-end for Claude Code ↔ OpenClaw, per `docs/superpowers/specs/2026-04-21-openclaw-integration-envelope-design.md`.

**Architecture:** Add shared envelope types to `@openclaw-manager/types`. Introduce an `envelope.ts` bridge service that normalizes caller input, derives `author` from transport context, and applies defensive fallbacks. Thread the canonical envelope through the `claude-code-ask` orchestrator, transcript JSONL, and pending-item storage. Extend the MCP `openclaw_say` tool with optional envelope fields (backwards-compatible). On the dashboard, render an A-lite chip strip per turn, a ref chip row, and an escalation card on the right rail for `decide + blocked` turns; add a sidebar badge counting such sessions.

**Tech Stack:** TypeScript (strict), Node.js, Express 5 (bridge), Next.js 15 + React 19 (dashboard), Tailwind CSS 4, Vitest (bridge tests), `@modelcontextprotocol/sdk` (MCP), pnpm monorepo.

---

## File Map

### Created
- `apps/bridge/src/services/envelope.ts` — normalize + defaults + author derivation + fallback
- `apps/bridge/src/services/envelope.test.ts` — unit tests for envelope service
- `apps/bridge/src/services/__tests__/claude-code-ask-envelope.test.ts` — orchestrator integration
- `apps/dashboard/src/components/cc-envelope-chips.tsx` — intent/state/artifact chip strip
- `apps/dashboard/src/components/cc-ref-chips.tsx` — refs row with `+N more`
- `apps/dashboard/src/components/cc-escalation-card.tsx` — "Decision needed" right-rail card

### Modified
- `packages/types/src/index.ts` — add envelope types; extend `ClaudeCodeTranscriptEvent`, `ClaudeCodePendingItem`, `ClaudeCodeAskRequest`, `ClaudeCodeAskResponse`
- `apps/bridge/src/services/claude-code-ask.ts` — thread envelope through ask/draft/answer, include in transcript and pending items, handle system `author.kind` on timeout
- `apps/bridge/src/routes/claude-code.ts` — accept envelope fields in `POST /claude-code/ask` body
- `packages/mcp-openclaw/src/server.ts` — add optional envelope fields to `openclaw_say` input schema; pass them to the bridge
- `apps/dashboard/src/lib/bridge-client.ts` — accept/return envelope fields in the client
- `apps/dashboard/src/components/claude-code-session-detail.tsx` — use new chips, wire escalation card
- `apps/dashboard/src/components/claude-code-pending-card.tsx` — render envelope chrome inline
- `apps/dashboard/src/components/claude-code-sessions-table.tsx` — add "Needs decision" column
- `apps/dashboard/src/components/app-shell.tsx` — add sidebar badge for CC "decision needed" count
- `apps/dashboard/src/app/api/claude-code/...` — whichever route the sidebar consumes for the badge count
- `AGENTS.md` — new "Collaboration Envelope" subsection under "Claude Code ↔ OpenClaw"

### Test-only
- `apps/bridge/src/services/envelope.test.ts`
- `apps/bridge/src/services/__tests__/claude-code-ask-envelope.test.ts`

---

## Task 1: Add envelope types to `@openclaw-manager/types`

**Files:**
- Modify: `packages/types/src/index.ts` (append new types; extend existing `ClaudeCodeTranscriptEvent`, `ClaudeCodePendingItem`, `ClaudeCodeAskRequest`, `ClaudeCodeAskResponse`)

- [ ] **Step 1: Append envelope type definitions at the end of `packages/types/src/index.ts`**

```typescript
// --- Claude Code ↔ OpenClaw Collaboration Envelope (phase 1) ---

export type CCIntent =
  | "decide"
  | "brainstorm"
  | "plan"
  | "review"
  | "research"
  | "unblock"
  | "handoff"
  | "report";

export type CCAuthorState =
  | "new"
  | "in_progress"
  | "blocked"
  | "review_ready"
  | "done"
  | "parked";

export type CCSystemState = "timeout";
export type CCState = CCAuthorState | CCSystemState;

export type CCArtifact =
  | "none"
  | "question"
  | "decision"
  | "spec"
  | "plan"
  | "review_notes"
  | "patch"
  | "summary";

export type CCPriority = "low" | "normal" | "high" | "urgent";

export type CCAuthorKind = "ide" | "agent" | "operator" | "system";

export type CCAuthor = {
  kind: CCAuthorKind;
  id: string;
};

export type CCRefRelation =
  | "background"
  | "source_of_truth"
  | "prior_attempt"
  | "parallel_work";

export type CCRef =
  | { kind: "file"; path: string; range?: string; relation?: CCRefRelation }
  | { kind: "commit"; sha: string; relation?: CCRefRelation }
  | { kind: "spec"; path: string; relation?: CCRefRelation }
  | { kind: "error"; text: string; relation?: CCRefRelation }
  | { kind: "session"; id: string; relation?: CCRefRelation };

/** Canonical internal envelope (after bridge normalization). */
export type CCEnvelope = {
  msgId: string;
  parentMsgId: string | null;
  author: CCAuthor;
  intent: CCIntent;
  state: CCState;
  artifact: CCArtifact;
  priority: CCPriority;
  refs: CCRef[];
  message: string;
  /** Advisory raw values preserved when caller supplied unknown/invalid enums.
   *  Internal only; never surfaced to callers in phase 1. */
  _raw?: {
    intent?: string;
    state?: string;
    artifact?: string;
    refs?: unknown[];
    author?: unknown;
  };
  /** Confidence of inferred fields. Internal only. */
  _intentConfidence?: "low" | "normal";
};

/** Shape accepted in `openclaw_say` / `POST /claude-code/ask`. All fields
 *  except `message` are optional. The bridge normalizes into `CCEnvelope`. */
export type CCEnvelopeInput = {
  message: string;
  intent?: CCIntent;
  state?: CCAuthorState;
  artifact?: CCArtifact;
  priority?: CCPriority;
  refs?: CCRef[];
  parentMsgId?: string;
  msgId?: string;
};
```

- [ ] **Step 2: Extend `ClaudeCodeTranscriptEvent` with an optional `envelope` field**

Edit the existing `ClaudeCodeTranscriptEvent` type (around line 465) to add an optional envelope:

```typescript
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
  /** Canonical envelope for this turn. Absent on legacy pre-envelope events. */
  envelope?: CCEnvelope;
};
```

- [ ] **Step 3: Extend `ClaudeCodePendingItem` to carry the envelope**

Edit the existing `ClaudeCodePendingItem` type (around line 480):

```typescript
export type ClaudeCodePendingItem = {
  id: string;
  sessionId: string;
  msgId: string;
  question: string;
  draft: string;
  createdAt: string;
  /** Full canonical envelope for the asking turn. Required on items created
   *  after envelope wiring lands; absent on legacy rows. */
  envelope?: CCEnvelope;
  /** Envelope proposed for the reply (author.kind: 'agent' or 'operator'). */
  draftEnvelope?: CCEnvelope;
};
```

- [ ] **Step 4: Extend `ClaudeCodeAskRequest` with optional envelope input fields**

Edit `ClaudeCodeAskRequest` (around line 489):

```typescript
export type ClaudeCodeAskRequest = {
  ide: string;
  workspace: string;
  clientId?: string;
  msgId: string;
  question: string;
  context?: Record<string, unknown>;
  // Envelope input (all optional; bridge normalizes):
  intent?: CCIntent;
  state?: CCAuthorState;
  artifact?: CCArtifact;
  priority?: CCPriority;
  refs?: CCRef[];
  parentMsgId?: string;
};
```

- [ ] **Step 5: Extend `ClaudeCodeAskResponse` with the reply envelope**

Edit `ClaudeCodeAskResponse` (around line 501):

```typescript
export type ClaudeCodeAskResponse = {
  answer: string;
  source: ClaudeCodeAnswerSource;
  action?: ClaudeCodeOperatorAction;
  /** Canonical envelope for the reply turn. Added in phase 1. */
  envelope?: CCEnvelope;
};
```

- [ ] **Step 6: Build types to verify compilation**

Run: `pnpm --filter @openclaw-manager/types build`
Expected: build succeeds with no errors.

- [ ] **Step 7: Commit**

```bash
git add packages/types/src/index.ts
git commit -m "types: add collaboration envelope for CC↔OC phase 1

Adds CCEnvelope, CCEnvelopeInput, CCIntent, CCAuthorState, CCState,
CCArtifact, CCPriority, CCAuthor, CCAuthorKind, CCRef, CCRefRelation.
Extends ClaudeCodeTranscriptEvent, ClaudeCodePendingItem,
ClaudeCodeAskRequest, and ClaudeCodeAskResponse with optional envelope
fields (back-compat)."
```

---

## Task 2: Create bridge `envelope.ts` service

**Files:**
- Create: `apps/bridge/src/services/envelope.ts`

This module owns: normalizing caller input into a canonical `CCEnvelope`, deriving `author` from transport, coercing invalid enum values, dropping malformed refs, assigning `msgId` when absent, and mapping legacy `context` to typed `refs`.

- [ ] **Step 1: Create `apps/bridge/src/services/envelope.ts` with the full normalize/derive/validate surface**

```typescript
import crypto from "node:crypto";
import type {
  CCArtifact,
  CCAuthor,
  CCAuthorKind,
  CCAuthorState,
  CCEnvelope,
  CCEnvelopeInput,
  CCIntent,
  CCPriority,
  CCRef,
  CCState,
} from "@openclaw-manager/types";

const INTENTS: readonly CCIntent[] = [
  "decide",
  "brainstorm",
  "plan",
  "review",
  "research",
  "unblock",
  "handoff",
  "report",
] as const;

const AUTHOR_STATES: readonly CCAuthorState[] = [
  "new",
  "in_progress",
  "blocked",
  "review_ready",
  "done",
  "parked",
] as const;

const ARTIFACTS: readonly CCArtifact[] = [
  "none",
  "question",
  "decision",
  "spec",
  "plan",
  "review_notes",
  "patch",
  "summary",
] as const;

const PRIORITIES: readonly CCPriority[] = ["low", "normal", "high", "urgent"] as const;

const REF_KINDS = new Set(["file", "commit", "spec", "error", "session"]);
const REF_RELATIONS = new Set([
  "background",
  "source_of_truth",
  "prior_attempt",
  "parallel_work",
]);

export function newMsgId(): string {
  return `m-${crypto.randomBytes(6).toString("hex")}`;
}

function coerceEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T
): { value: T; raw?: string } {
  if (typeof value !== "string") return { value: fallback };
  if ((allowed as readonly string[]).includes(value)) return { value: value as T };
  return { value: fallback, raw: value };
}

function coerceRef(item: unknown): { ref: CCRef | null; raw?: unknown } {
  if (!item || typeof item !== "object") return { ref: null, raw: item };
  const rec = item as Record<string, unknown>;
  const kind = rec.kind;
  if (typeof kind !== "string" || !REF_KINDS.has(kind)) return { ref: null, raw: item };
  const relation =
    typeof rec.relation === "string" && REF_RELATIONS.has(rec.relation)
      ? (rec.relation as CCRef["relation"])
      : undefined;
  switch (kind) {
    case "file": {
      if (typeof rec.path !== "string") return { ref: null, raw: item };
      const range = typeof rec.range === "string" ? rec.range : undefined;
      return { ref: { kind: "file", path: rec.path, range, relation } };
    }
    case "commit": {
      if (typeof rec.sha !== "string") return { ref: null, raw: item };
      return { ref: { kind: "commit", sha: rec.sha, relation } };
    }
    case "spec": {
      if (typeof rec.path !== "string") return { ref: null, raw: item };
      return { ref: { kind: "spec", path: rec.path, relation } };
    }
    case "error": {
      if (typeof rec.text !== "string") return { ref: null, raw: item };
      return { ref: { kind: "error", text: rec.text, relation } };
    }
    case "session": {
      if (typeof rec.id !== "string") return { ref: null, raw: item };
      return { ref: { kind: "session", id: rec.id, relation } };
    }
    default:
      return { ref: null, raw: item };
  }
}

/** Map legacy `context` keys (file, selection, stack) onto typed refs. */
export function contextToRefs(context: Record<string, unknown> | undefined): CCRef[] {
  if (!context) return [];
  const refs: CCRef[] = [];
  if (typeof context.file === "string") {
    const range = typeof context.range === "string" ? context.range : undefined;
    refs.push({ kind: "file", path: context.file, range });
  }
  if (typeof context.selection === "string" && !context.file) {
    // Selection without a file is best captured as a freeform error-style note.
    refs.push({ kind: "error", text: context.selection });
  }
  if (typeof context.stack === "string") {
    refs.push({ kind: "error", text: context.stack });
  }
  return refs;
}

export type AuthorContext =
  | { kind: "ide"; id: string }
  | { kind: "agent"; id: string }
  | { kind: "operator"; id: string }
  | { kind: "system"; id: "bridge" | "gateway" };

export function deriveAuthor(ctx: AuthorContext): CCAuthor {
  const id = ctx.id && typeof ctx.id === "string" ? ctx.id : "unknown";
  const kind: CCAuthorKind = ctx.kind;
  return { kind, id };
}

export type NormalizeOptions = {
  /** Transport-derived author; always overrides caller-supplied author. */
  authorContext: AuthorContext;
  /** When the caller omits parentMsgId but we know the thread, supply it. */
  parentMsgIdFallback?: string | null;
  /** When `true`, the bridge treats an absent state as `in_progress` rather
   *  than `new`. Use for turns mid-thread. */
  midThread?: boolean;
  /** Existing msgIds in this session, used to detect duplicates. */
  existingMsgIds?: ReadonlySet<string>;
};

/** Normalize permissive caller input into a canonical CCEnvelope.
 *  Never throws for malformed fields except when `message` is missing/empty. */
export function normalizeEnvelope(
  input: CCEnvelopeInput & { context?: Record<string, unknown> },
  opts: NormalizeOptions
): CCEnvelope {
  if (!input || typeof input.message !== "string" || input.message.trim() === "") {
    throw new Error("message required");
  }

  const raw: CCEnvelope["_raw"] = {};

  const intentCoerced = coerceEnum<CCIntent>(input.intent, INTENTS, "report");
  if (intentCoerced.raw !== undefined) raw.intent = intentCoerced.raw;

  const defaultState: CCAuthorState = opts.midThread ? "in_progress" : "new";
  const stateCoerced = coerceEnum<CCAuthorState>(input.state, AUTHOR_STATES, defaultState);
  if (stateCoerced.raw !== undefined) raw.state = stateCoerced.raw;

  const artifactCoerced = coerceEnum<CCArtifact>(input.artifact, ARTIFACTS, "none");
  if (artifactCoerced.raw !== undefined) raw.artifact = artifactCoerced.raw;

  const priorityCoerced = coerceEnum<CCPriority>(input.priority, PRIORITIES, "normal");

  const refsIn = Array.isArray(input.refs) ? input.refs : [];
  const contextRefs = contextToRefs((input as unknown as { context?: Record<string, unknown> }).context);
  const combined: unknown[] = [...refsIn, ...contextRefs];
  const refs: CCRef[] = [];
  const rejectedRefs: unknown[] = [];
  for (const r of combined) {
    const { ref, raw: rr } = coerceRef(r);
    if (ref) refs.push(ref);
    else rejectedRefs.push(rr ?? r);
  }
  if (rejectedRefs.length) raw.refs = rejectedRefs;

  // msgId: accept caller's if well-formed and unique; else bridge-assign.
  let msgId = typeof input.msgId === "string" && /^m-[a-f0-9]{6,32}$/.test(input.msgId)
    ? input.msgId
    : newMsgId();
  if (opts.existingMsgIds && opts.existingMsgIds.has(msgId)) {
    msgId = newMsgId();
  }

  const parentMsgId =
    typeof input.parentMsgId === "string" && input.parentMsgId.length > 0
      ? input.parentMsgId
      : opts.parentMsgIdFallback ?? null;

  const author = deriveAuthor(opts.authorContext);

  const envelope: CCEnvelope = {
    msgId,
    parentMsgId,
    author,
    intent: intentCoerced.value,
    state: stateCoerced.value,
    artifact: artifactCoerced.value,
    priority: priorityCoerced.value,
    refs,
    message: input.message,
  };

  if (Object.keys(raw).length > 0) envelope._raw = raw;
  if (!input.intent) envelope._intentConfidence = "low";

  return envelope;
}

/** Construct a system-authored envelope for events like timeouts. */
export function systemEnvelope(
  message: string,
  state: CCState,
  sourceId: "bridge" | "gateway",
  parentMsgId: string | null
): CCEnvelope {
  return {
    msgId: newMsgId(),
    parentMsgId,
    author: { kind: "system", id: sourceId },
    intent: "report",
    state,
    artifact: "none",
    priority: "normal",
    refs: [],
    message,
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/bridge/src/services/envelope.ts
git commit -m "bridge: envelope normalize + author derive + fallback service

Owns canonical envelope construction for CC↔OC turns. Enum coercion
preserves raw invalid values on _raw.*; malformed refs are dropped
into _raw.refs; duplicate msgIds are overwritten; missing message is
the sole condition that throws. Legacy {file,selection,stack} context
maps to typed refs via contextToRefs()."
```

---

## Task 3: Unit tests for `envelope.ts`

**Files:**
- Create: `apps/bridge/src/services/envelope.test.ts`

The bridge uses Vitest. Convention: tests live next to source or under `__tests__/`. We use the co-located `.test.ts` pattern here (matches existing `services/*.test.ts` files in the repo).

- [ ] **Step 1: Create `apps/bridge/src/services/envelope.test.ts`**

```typescript
import { describe, expect, it } from "vitest";
import {
  contextToRefs,
  deriveAuthor,
  newMsgId,
  normalizeEnvelope,
  systemEnvelope,
} from "./envelope.js";

describe("normalizeEnvelope", () => {
  it("assigns bridge-derived author and populates defaults", () => {
    const env = normalizeEnvelope(
      { message: "hi" },
      { authorContext: { kind: "ide", id: "antigravity" } }
    );
    expect(env.author).toEqual({ kind: "ide", id: "antigravity" });
    expect(env.intent).toBe("report"); // fallback
    expect(env.state).toBe("new"); // root default
    expect(env.artifact).toBe("none");
    expect(env.priority).toBe("normal");
    expect(env.refs).toEqual([]);
    expect(env.parentMsgId).toBeNull();
    expect(env.msgId).toMatch(/^m-[a-f0-9]{12}$/);
    expect(env._intentConfidence).toBe("low");
  });

  it("defaults state to in_progress when midThread", () => {
    const env = normalizeEnvelope(
      { message: "still going" },
      { authorContext: { kind: "ide", id: "cli" }, midThread: true }
    );
    expect(env.state).toBe("in_progress");
  });

  it("preserves valid caller-supplied envelope fields", () => {
    const env = normalizeEnvelope(
      {
        message: "pick A or B",
        intent: "decide",
        state: "blocked",
        artifact: "question",
        priority: "high",
        parentMsgId: "m-parent",
      },
      { authorContext: { kind: "ide", id: "antigravity" } }
    );
    expect(env.intent).toBe("decide");
    expect(env.state).toBe("blocked");
    expect(env.artifact).toBe("question");
    expect(env.priority).toBe("high");
    expect(env.parentMsgId).toBe("m-parent");
    expect(env._intentConfidence).toBeUndefined();
  });

  it("coerces invalid intent/state/artifact/priority and preserves raw", () => {
    const env = normalizeEnvelope(
      {
        message: "m",
        intent: "chitchat" as never,
        state: "banana" as never,
        artifact: "novella" as never,
        priority: "CRITICAL" as never,
      },
      { authorContext: { kind: "ide", id: "vscode" } }
    );
    expect(env.intent).toBe("report");
    expect(env.state).toBe("new");
    expect(env.artifact).toBe("none");
    expect(env.priority).toBe("normal");
    expect(env._raw).toEqual({
      intent: "chitchat",
      state: "banana",
      artifact: "novella",
    });
  });

  it("drops malformed refs, keeps good ones, archives raw", () => {
    const env = normalizeEnvelope(
      {
        message: "m",
        refs: [
          { kind: "file", path: "src/a.ts" },
          { kind: "file" } as never, // missing path
          { kind: "weird" } as never, // bad kind
          { kind: "session", id: "agent:claude-code:cc-xxx", relation: "prior_attempt" },
        ],
      },
      { authorContext: { kind: "ide", id: "cli" } }
    );
    expect(env.refs).toHaveLength(2);
    expect(env.refs[0]).toEqual({ kind: "file", path: "src/a.ts", range: undefined, relation: undefined });
    expect(env.refs[1]).toEqual({
      kind: "session",
      id: "agent:claude-code:cc-xxx",
      relation: "prior_attempt",
    });
    expect(env._raw?.refs).toHaveLength(2);
  });

  it("maps legacy context {file,selection,stack} to typed refs", () => {
    const env = normalizeEnvelope(
      {
        message: "m",
        // @ts-expect-error -- `context` is legacy on request body but not on the input type
        context: { file: "src/x.ts", range: "L10-L20", stack: "Error at..." },
      },
      { authorContext: { kind: "ide", id: "cli" } }
    );
    const files = env.refs.filter((r) => r.kind === "file");
    const errs = env.refs.filter((r) => r.kind === "error");
    expect(files).toEqual([{ kind: "file", path: "src/x.ts", range: "L10-L20" }]);
    expect(errs).toEqual([{ kind: "error", text: "Error at..." }]);
  });

  it("reassigns msgId when caller's duplicates an existing one", () => {
    const env = normalizeEnvelope(
      { message: "m", msgId: "m-abcdef123456" },
      {
        authorContext: { kind: "ide", id: "cli" },
        existingMsgIds: new Set(["m-abcdef123456"]),
      }
    );
    expect(env.msgId).not.toBe("m-abcdef123456");
    expect(env.msgId).toMatch(/^m-[a-f0-9]{12}$/);
  });

  it("assigns a bridge msgId when caller omits it", () => {
    const env = normalizeEnvelope(
      { message: "m" },
      { authorContext: { kind: "ide", id: "cli" } }
    );
    expect(env.msgId).toMatch(/^m-[a-f0-9]{12}$/);
  });

  it("throws when message is missing or empty", () => {
    expect(() =>
      normalizeEnvelope({ message: "" }, { authorContext: { kind: "ide", id: "cli" } })
    ).toThrow(/message required/);
    expect(() =>
      normalizeEnvelope(
        { message: "   " },
        { authorContext: { kind: "ide", id: "cli" } }
      )
    ).toThrow(/message required/);
  });

  it("ignores caller-supplied author (advisory only)", () => {
    const env = normalizeEnvelope(
      // @ts-expect-error — author is never in CCEnvelopeInput
      { message: "m", author: { kind: "operator", id: "root" } },
      { authorContext: { kind: "ide", id: "cli" } }
    );
    expect(env.author).toEqual({ kind: "ide", id: "cli" });
  });
});

describe("deriveAuthor", () => {
  it("round-trips all four kinds", () => {
    expect(deriveAuthor({ kind: "ide", id: "antigravity" })).toEqual({
      kind: "ide",
      id: "antigravity",
    });
    expect(deriveAuthor({ kind: "agent", id: "claude-code" })).toEqual({
      kind: "agent",
      id: "claude-code",
    });
    expect(deriveAuthor({ kind: "operator", id: "default" })).toEqual({
      kind: "operator",
      id: "default",
    });
    expect(deriveAuthor({ kind: "system", id: "bridge" })).toEqual({
      kind: "system",
      id: "bridge",
    });
  });
});

describe("systemEnvelope", () => {
  it("constructs a system-authored turn", () => {
    const env = systemEnvelope("draft expired", "timeout", "bridge", "m-parent");
    expect(env.author).toEqual({ kind: "system", id: "bridge" });
    expect(env.state).toBe("timeout");
    expect(env.intent).toBe("report");
    expect(env.artifact).toBe("none");
    expect(env.parentMsgId).toBe("m-parent");
    expect(env.message).toBe("draft expired");
  });
});

describe("contextToRefs", () => {
  it("returns empty for undefined context", () => {
    expect(contextToRefs(undefined)).toEqual([]);
  });

  it("emits file ref with optional range", () => {
    expect(contextToRefs({ file: "a.ts", range: "L1-L5" })).toEqual([
      { kind: "file", path: "a.ts", range: "L1-L5" },
    ]);
  });

  it("emits error ref for selection without a file", () => {
    expect(contextToRefs({ selection: "let x = 1" })).toEqual([
      { kind: "error", text: "let x = 1" },
    ]);
  });
});

describe("newMsgId", () => {
  it("matches the m-<hex12> shape", () => {
    expect(newMsgId()).toMatch(/^m-[a-f0-9]{12}$/);
  });
});
```

- [ ] **Step 2: Run tests — expect all to pass**

Run: `pnpm --filter bridge test -- envelope.test.ts`
Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add apps/bridge/src/services/envelope.test.ts
git commit -m "bridge: unit tests for envelope normalize/derive/fallback"
```

---

## Task 4: Thread envelope through `claude-code-ask.ts`

**Files:**
- Modify: `apps/bridge/src/services/claude-code-ask.ts`

Goals: attach a canonical envelope to each transcript event (`ask`, `draft`, `answer`, `timeout`, `discarded`); propagate the caller's envelope input from the request; add `draftEnvelope` to pending items so the operator UI can render chrome; include an `envelope` field on the final `ClaudeCodeAskResponse`.

- [ ] **Step 1: Add imports at the top of `claude-code-ask.ts`**

Add after the existing imports:

```typescript
import {
  normalizeEnvelope,
  systemEnvelope,
  type AuthorContext,
} from "./envelope.js";
import type { CCEnvelope } from "@openclaw-manager/types";
import { readTranscript } from "./claude-code-transcript.js";
```

- [ ] **Step 2: Replace the `ask` function body with envelope-threaded version**

Locate the `async function ask(req: ClaudeCodeAskRequest)` inside `createAskOrchestrator`. Replace its body with the following. Do not change the surrounding function signature. Keep the existing imports and helper usage (`getOrCreateSession`, `resurrectSession`, `setOpenclawSessionId`, `deriveOpenclawSessionId`, `appendTranscript`, `transcriptPathFor`, `createPending`, `awaitPending`, `setSessionMode`, `touchSession`, `deps.callGateway`, `deps.broadcast`, `buildGatewayKey`, `ensureSessionExists`, `pollForReply`).

```typescript
  async function ask(req: ClaudeCodeAskRequest): Promise<ClaudeCodeAskResponse> {
    let session = await getOrCreateSession(deps.sessionsPath, {
      ide: req.ide,
      workspace: req.workspace,
      clientId: req.clientId,
    });
    if (session.state === "ended") {
      await resurrectSession(deps.sessionsPath, session.id);
    }
    if (session.openclawSessionId === LEGACY_SHARED_OPENCLAW_SESSION_ID) {
      session = await setOpenclawSessionId(
        deps.sessionsPath,
        session.id,
        deriveOpenclawSessionId(session.id)
      );
    }
    deps.broadcast("claude_code_session_upserted", { id: session.id });

    // Load existing msgIds to detect duplicates.
    const transcriptPath = transcriptPathFor(deps.transcriptsDir, session.id);
    const prior = await readTranscript(transcriptPath);
    const existingMsgIds = new Set<string>();
    for (const ev of prior) if (ev.msgId) existingMsgIds.add(ev.msgId);

    // Normalize the asking turn's envelope. Author = ide-kind (the IDE the
    // MCP call came from). Root turn iff session has no prior asks.
    const midThread = prior.some((e) => e.kind === "ask");
    const askAuthor: AuthorContext = {
      kind: "ide",
      id: req.ide && req.ide.length > 0 ? req.ide : "unknown",
    };
    const askEnvelope = normalizeEnvelope(
      {
        message: req.question,
        msgId: req.msgId,
        parentMsgId: req.parentMsgId,
        intent: req.intent,
        state: req.state,
        artifact: req.artifact,
        priority: req.priority,
        refs: req.refs,
        // pass context for legacy {file,selection,stack} mapping
        ...(req.context ? { context: req.context } : {}),
      } as never,
      {
        authorContext: askAuthor,
        midThread,
        existingMsgIds,
        parentMsgIdFallback: null,
      }
    );

    await append(session.id, {
      t: new Date().toISOString(),
      kind: "ask",
      msgId: askEnvelope.msgId,
      question: req.question,
      context: req.context,
      envelope: askEnvelope,
    });

    const gatewayKey = buildGatewayKey(deps.openclawAgentId, session.openclawSessionId);

    let draft: string;
    try {
      const baselineLength = await ensureSessionExists(deps.callGateway, gatewayKey);
      const messageToGateway =
        baselineLength === 0 ? wrapFirstMessage(req.question) : req.question;

      await deps.callGateway("sessions.send", {
        key: gatewayKey,
        idempotencyKey: askEnvelope.msgId,
        message: messageToGateway,
      });

      draft = await pollForReply(
        deps.callGateway,
        gatewayKey,
        baselineLength,
        deps.replyTimeoutMs ?? 120000,
        deps.replyPollIntervalMs ?? 500
      );
    } catch (e) {
      throw new Error(`gateway: ${(e as Error).message}`);
    }

    // Construct the draft's envelope. Author = gateway agent composing the reply.
    const draftEnvelope: CCEnvelope = normalizeEnvelope(
      {
        message: draft,
        parentMsgId: askEnvelope.msgId,
        state: "review_ready",
        intent: askEnvelope.intent,
        artifact: askEnvelope.artifact === "question" ? "decision" : "none",
      },
      {
        authorContext: { kind: "agent", id: deps.openclawAgentId },
        midThread: true,
        parentMsgIdFallback: askEnvelope.msgId,
      }
    );

    await append(session.id, {
      t: new Date().toISOString(),
      kind: "draft",
      msgId: askEnvelope.msgId,
      draft,
      envelope: draftEnvelope,
    });

    const latest = (await listSessions(deps.sessionsPath)).find((s) => s.id === session.id)!;
    if (latest.mode === "agent") {
      const answerEnvelope: CCEnvelope = {
        ...draftEnvelope,
        msgId: draftEnvelope.msgId, // same draft id
        state: "done",
      };
      await append(session.id, {
        t: new Date().toISOString(),
        kind: "answer",
        msgId: askEnvelope.msgId,
        answer: draft,
        source: "agent",
        envelope: answerEnvelope,
      });
      await touchSession(deps.sessionsPath, session.id);
      return { answer: draft, source: "agent", envelope: answerEnvelope };
    }

    // Manual mode — create pending with both envelopes and hold.
    const pending = await createPending(deps.pendingPath, {
      sessionId: session.id,
      msgId: askEnvelope.msgId,
      question: req.question,
      draft,
      envelope: askEnvelope,
      draftEnvelope,
    });
    deps.broadcast("claude_code_pending_upserted", pending);

    try {
      const resolved = await awaitPending(pending.id, deps.pendingTimeoutMs);
      const operatorEnvelope: CCEnvelope = {
        ...draftEnvelope,
        msgId: draftEnvelope.msgId,
        author: { kind: "operator", id: "default" },
        state: "done",
      };
      await append(session.id, {
        t: new Date().toISOString(),
        kind: "answer",
        msgId: askEnvelope.msgId,
        answer: resolved.answer,
        source: resolved.source,
        action: resolved.action,
        envelope: operatorEnvelope,
      });
      await touchSession(deps.sessionsPath, session.id);
      deps.broadcast("claude_code_pending_resolved", { id: pending.id });
      return { ...resolved, envelope: operatorEnvelope };
    } catch (err) {
      const message = (err as Error).message;
      if (/discarded/i.test(message)) {
        const discardedEnvelope = systemEnvelope(
          "operator discarded reply",
          "blocked",
          "bridge",
          askEnvelope.msgId
        );
        await append(session.id, {
          t: new Date().toISOString(),
          kind: "discarded",
          msgId: askEnvelope.msgId,
          envelope: discardedEnvelope,
        });
        await setSessionMode(deps.sessionsPath, session.id, "manual");
      } else if (/timeout/i.test(message)) {
        const timeoutEnvelope = systemEnvelope(
          "pending draft expired",
          "timeout",
          "bridge",
          askEnvelope.msgId
        );
        await append(session.id, {
          t: new Date().toISOString(),
          kind: "timeout",
          msgId: askEnvelope.msgId,
          envelope: timeoutEnvelope,
        });
      }
      deps.broadcast("claude_code_pending_resolved", { id: pending.id });
      throw err;
    }
  }
```

- [ ] **Step 3: Build the bridge to catch any type drift**

Run: `pnpm --filter bridge build`
Expected: build succeeds.

- [ ] **Step 4: Run the existing bridge test suite to catch regressions**

Run: `pnpm --filter bridge test`
Expected: all prior tests plus the new `envelope.test.ts` pass. If any existing ask-orchestrator test fails due to the extra `envelope` field on events/responses, that's addressed in Task 5 — commit the plumbing first.

- [ ] **Step 5: Commit**

```bash
git add apps/bridge/src/services/claude-code-ask.ts
git commit -m "bridge(ask): thread collaboration envelope through ask/draft/answer

Every transcript event now carries a canonical CCEnvelope. The ask
turn's author is derived from the MCP request's `ide` field; the
draft/answer turn's author is the gateway agent hosting the session.
Manual-mode pending items carry both askEnvelope and draftEnvelope.
Timeout and discard paths emit system-authored envelopes."
```

---

## Task 5: Integration test — envelope round-trips through ask orchestrator

**Files:**
- Create: `apps/bridge/src/services/__tests__/claude-code-ask-envelope.test.ts`

Goals: exercise agent mode happy path, manual mode happy path (via resolve), fallback coercion on caller input, timeout, and discard — verify the correct envelope kind/state/author appears on each transcript event.

- [ ] **Step 1: Create the integration test**

```typescript
import { describe, expect, it, beforeEach } from "vitest";
import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";
import { createAskOrchestrator } from "../claude-code-ask.js";
import { readTranscript, transcriptPathFor } from "../claude-code-transcript.js";
import { listPending, resolvePending } from "../claude-code-pending.js";
import { listSessions, setSessionMode } from "../claude-code-sessions.js";

type GatewayStub = (method: string, params?: Record<string, unknown>) => Promise<unknown>;

async function makeTmpDir(): Promise<{
  sessionsPath: string;
  pendingPath: string;
  transcriptsDir: string;
}> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "cc-ask-env-"));
  return {
    sessionsPath: path.join(root, "sessions.json"),
    pendingPath: path.join(root, "pending.json"),
    transcriptsDir: root,
  };
}

function makeGateway(reply = "hello from oc"): GatewayStub {
  const state: { messages: Array<{ role: string; content: Array<{ type: string; text: string }> }> } = {
    messages: [],
  };
  return async (method, params) => {
    if (method === "sessions.get") return { messages: [...state.messages] };
    if (method === "sessions.create") {
      return { ok: true, key: (params as { key: string }).key };
    }
    if (method === "sessions.send") {
      state.messages.push({
        role: "user",
        content: [{ type: "text", text: String((params as { message: string }).message) }],
      });
      state.messages.push({
        role: "assistant",
        content: [{ type: "text", text: reply }],
      });
      return { ok: true };
    }
    throw new Error(`unexpected gateway method ${method}`);
  };
}

describe("claude-code-ask envelope integration", () => {
  let paths: Awaited<ReturnType<typeof makeTmpDir>>;
  const noop = () => {};

  beforeEach(async () => {
    paths = await makeTmpDir();
  });

  it("agent mode: ask+draft+answer all carry envelopes with correct authors", async () => {
    const orch = createAskOrchestrator({
      ...paths,
      pendingTimeoutMs: 60_000,
      openclawAgentId: "claude-code",
      callGateway: makeGateway("answer body"),
      broadcast: noop,
      replyPollIntervalMs: 5,
      replyTimeoutMs: 1_000,
    });

    const result = await orch.ask({
      ide: "cli",
      workspace: "/tmp/w",
      msgId: "m-abcdef123456",
      question: "pick A or B",
      intent: "decide",
      state: "blocked",
      artifact: "question",
    });

    expect(result.answer).toBe("answer body");
    expect(result.source).toBe("agent");
    expect(result.envelope?.author).toEqual({ kind: "agent", id: "claude-code" });
    expect(result.envelope?.state).toBe("done");

    const sessions = await listSessions(paths.sessionsPath);
    const events = await readTranscript(transcriptPathFor(paths.transcriptsDir, sessions[0]!.id));

    const ask = events.find((e) => e.kind === "ask")!;
    expect(ask.envelope?.author).toEqual({ kind: "ide", id: "cli" });
    expect(ask.envelope?.intent).toBe("decide");
    expect(ask.envelope?.state).toBe("blocked");
    expect(ask.envelope?.artifact).toBe("question");

    const draft = events.find((e) => e.kind === "draft")!;
    expect(draft.envelope?.author).toEqual({ kind: "agent", id: "claude-code" });
    expect(draft.envelope?.state).toBe("review_ready");
    expect(draft.envelope?.parentMsgId).toBe(ask.envelope?.msgId);

    const answer = events.find((e) => e.kind === "answer")!;
    expect(answer.envelope?.state).toBe("done");
  });

  it("manual mode: pending item carries both envelopes; operator reply is authored by operator", async () => {
    const orch = createAskOrchestrator({
      ...paths,
      pendingTimeoutMs: 5_000,
      openclawAgentId: "claude-code",
      callGateway: makeGateway("draft body"),
      broadcast: noop,
      replyPollIntervalMs: 5,
      replyTimeoutMs: 1_000,
    });

    // First turn creates the session, then flip to manual.
    const runPromise = orch
      .ask({
        ide: "cli",
        workspace: "/tmp/w",
        msgId: "m-first0000001",
        question: "first",
      })
      .then(() =>
        // second turn after flipping to manual
        orch.ask({
          ide: "cli",
          workspace: "/tmp/w",
          msgId: "m-second0000001",
          question: "decide please",
          intent: "decide",
          state: "blocked",
          artifact: "question",
        })
      );

    // Wait briefly, flip session to manual, then resolve the pending from the "operator".
    await new Promise((r) => setTimeout(r, 50));
    const [session] = await listSessions(paths.sessionsPath);
    await setSessionMode(paths.sessionsPath, session!.id, "manual");

    // Trigger the second ask while in manual — we need to serialize.
    // Instead, call once in agent mode, then flip, then issue the real manual ask.
    // Reset and do the simpler manual flow:
    await runPromise.catch(() => {}); // ignore the sequencing result

    // Fire the manual-mode ask and resolve its pending item.
    const manualAsk = orch.ask({
      ide: "cli",
      workspace: "/tmp/w",
      msgId: "m-manual00000001",
      question: "manual decide",
      intent: "decide",
      state: "blocked",
      artifact: "question",
    });

    // Poll for pending item, then resolve it.
    let pending: Awaited<ReturnType<typeof listPending>>[number] | undefined;
    for (let i = 0; i < 50; i++) {
      const items = await listPending(paths.pendingPath);
      if (items.length > 0) {
        pending = items[0];
        break;
      }
      await new Promise((r) => setTimeout(r, 10));
    }
    if (!pending) throw new Error("no pending item appeared");

    // Envelope + draftEnvelope both attached to pending item.
    expect(pending.envelope?.author).toEqual({ kind: "ide", id: "cli" });
    expect(pending.envelope?.intent).toBe("decide");
    expect(pending.envelope?.state).toBe("blocked");
    expect(pending.draftEnvelope?.author).toEqual({ kind: "agent", id: "claude-code" });

    await resolvePending(paths.pendingPath, pending.id, {
      answer: "take A",
      source: "operator",
      action: "replace",
    });

    const resolved = await manualAsk;
    expect(resolved.source).toBe("operator");
    expect(resolved.action).toBe("replace");
    expect(resolved.envelope?.author).toEqual({ kind: "operator", id: "default" });
    expect(resolved.envelope?.state).toBe("done");
  });

  it("coerces invalid caller enums, preserves raw on canonical envelope", async () => {
    const orch = createAskOrchestrator({
      ...paths,
      pendingTimeoutMs: 1_000,
      openclawAgentId: "claude-code",
      callGateway: makeGateway("ok"),
      broadcast: noop,
      replyPollIntervalMs: 5,
      replyTimeoutMs: 1_000,
    });

    await orch.ask({
      ide: "cli",
      workspace: "/tmp/w",
      msgId: "m-coerced00001",
      question: "q",
      // @ts-expect-error — invalid enums exercised
      intent: "chitchat",
      // @ts-expect-error
      state: "banana",
    });

    const sessions = await listSessions(paths.sessionsPath);
    const events = await readTranscript(transcriptPathFor(paths.transcriptsDir, sessions[0]!.id));
    const ask = events.find((e) => e.kind === "ask")!;
    expect(ask.envelope?.intent).toBe("report"); // coerced default
    expect(ask.envelope?.state).toBe("new"); // coerced default
    expect(ask.envelope?._raw?.intent).toBe("chitchat");
    expect(ask.envelope?._raw?.state).toBe("banana");
  });

  it("throws 'message required' on empty question", async () => {
    const orch = createAskOrchestrator({
      ...paths,
      pendingTimeoutMs: 1_000,
      openclawAgentId: "claude-code",
      callGateway: makeGateway(),
      broadcast: noop,
      replyPollIntervalMs: 5,
      replyTimeoutMs: 1_000,
    });

    await expect(
      orch.ask({
        ide: "cli",
        workspace: "/tmp/w",
        msgId: "m-empty0000001",
        question: "",
      })
    ).rejects.toThrow(/message required/);
  });
});
```

- [ ] **Step 2: Run the integration test**

Run: `pnpm --filter bridge test -- claude-code-ask-envelope.test.ts`
Expected: all cases pass.

- [ ] **Step 3: Run the full bridge test suite to confirm no regressions**

Run: `pnpm --filter bridge test`
Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add apps/bridge/src/services/__tests__/claude-code-ask-envelope.test.ts
git commit -m "bridge(test): envelope round-trip through ask orchestrator

Covers agent-mode happy path, manual-mode resolve with operator author,
invalid-enum coercion preserving _raw values, and empty-message 400."
```

---

## Task 6: Update `POST /claude-code/ask` route to accept envelope fields

**Files:**
- Modify: `apps/bridge/src/routes/claude-code.ts`

The existing handler already calls `orchestrator.ask(body)`, and `ClaudeCodeAskRequest` was extended in Task 1 — so the route change is minimal (pass-through of the new fields). The main additions are: accept the new body fields by shape validation, and return a 400 when `normalizeEnvelope` throws `message required`.

- [ ] **Step 1: Update `router.post("/claude-code/ask", ...)` in `claude-code.ts`**

Replace the existing handler with:

```typescript
router.post("/claude-code/ask", async (req, res) => {
  const body = req.body as ClaudeCodeAskRequest;
  if (
    !body?.ide ||
    !body?.workspace ||
    !body?.msgId ||
    typeof body.question !== "string"
  ) {
    return res.status(400).json({ error: "ide, workspace, msgId, question are required" });
  }
  try {
    const result = await orchestrator.ask(body);
    res.json(result);
  } catch (err) {
    const message = (err as Error).message;
    if (/message required/i.test(message)) {
      return res.status(400).json({ error: "message required" });
    }
    if (/discarded/i.test(message)) return res.status(409).json({ error: "operator discarded reply" });
    if (/timeout/i.test(message)) return res.status(504).json({ error: "operator timeout" });
    if (/gateway/i.test(message)) return res.status(503).json({ error: message });
    res.status(500).json({ error: message });
  }
});
```

- [ ] **Step 2: Build bridge + run tests to confirm route still compiles and integration tests pass**

Run: `pnpm --filter bridge build && pnpm --filter bridge test`
Expected: success.

- [ ] **Step 3: Commit**

```bash
git add apps/bridge/src/routes/claude-code.ts
git commit -m "bridge(route): accept envelope fields on /claude-code/ask; 400 on empty message"
```

---

## Task 7: Extend MCP `openclaw_say` input schema

**Files:**
- Modify: `packages/mcp-openclaw/src/server.ts`

Goals: grow the `openclaw_say` tool's JSON schema with optional envelope fields; pass them through to the bridge; leave `openclaw_conclude` and `openclaw_session_info` untouched.

- [ ] **Step 1: Replace the `openclaw_say` tool definition (the entry in the `tools` array)**

```typescript
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
            description: "Optional legacy context (e.g. file, selection, stack). Bridge maps known keys into typed refs.",
            additionalProperties: true,
          },
          intent: {
            type: "string",
            enum: ["decide", "brainstorm", "plan", "review", "research", "unblock", "handoff", "report"],
            description: "Collaboration mode requested by this turn.",
          },
          state: {
            type: "string",
            enum: ["new", "in_progress", "blocked", "review_ready", "done", "parked"],
            description: "Author's asserted lifecycle status for the thread after this turn.",
          },
          artifact: {
            type: "string",
            enum: ["none", "question", "decision", "spec", "plan", "review_notes", "patch", "summary"],
            description: "Primary output shape delivered by this turn.",
          },
          priority: {
            type: "string",
            enum: ["low", "normal", "high", "urgent"],
          },
          parent_msg_id: {
            type: "string",
            description: "Parent turn's msg_id within this session (threading).",
          },
          refs: {
            type: "array",
            items: { type: "object", additionalProperties: true },
            description: "Typed evidence references. See envelope spec.",
          },
        },
        required: ["message"],
      },
    },
```

- [ ] **Step 2: Update the `openclaw_say` handler to forward the new fields**

Inside `server.setRequestHandler(CallToolRequestSchema, ...)`, update the `if (name === "openclaw_say")` branch body:

```typescript
  if (name === "openclaw_say") {
    const message = String(args.message ?? "");
    const context = (args.context as Record<string, unknown>) ?? undefined;
    const msgId = `m-${crypto.randomBytes(6).toString("hex")}`;
    const payload: Record<string, unknown> = {
      ide: IDE,
      workspace: WORKSPACE,
      clientId: CLIENT_ID,
      msgId,
      question: message,
      context,
    };
    if (typeof args.intent === "string") payload.intent = args.intent;
    if (typeof args.state === "string") payload.state = args.state;
    if (typeof args.artifact === "string") payload.artifact = args.artifact;
    if (typeof args.priority === "string") payload.priority = args.priority;
    if (typeof args.parent_msg_id === "string") payload.parentMsgId = args.parent_msg_id;
    if (Array.isArray(args.refs)) payload.refs = args.refs;

    const result = await bridgeFetch<{ answer: string; source: string; action?: string; envelope?: unknown }>(
      "/claude-code/ask",
      { method: "POST", body: JSON.stringify(payload) }
    );
    return { content: [{ type: "text", text: result.answer }] };
  }
```

Note: the MCP tool still returns only `result.answer` as text to Claude Code in phase 1 — envelope metadata is consumed by the dashboard, not echoed back to CC.

- [ ] **Step 3: Build the MCP package to confirm compilation**

Run: `pnpm --filter @openclaw-manager/mcp build`
Expected: succeeds.

- [ ] **Step 4: Commit**

```bash
git add packages/mcp-openclaw/src/server.ts
git commit -m "mcp: openclaw_say accepts optional envelope fields

Adds intent/state/artifact/priority/parent_msg_id/refs to the tool input
schema. Forwards to POST /claude-code/ask as envelope-shaped body keys.
Existing callers that supply only {message} and optional {context}
continue to work."
```

---

## Task 8: Dashboard bridge-client + API route pass-through

**Files:**
- Modify: `apps/dashboard/src/lib/bridge-client.ts`

The bridge-client already round-trips typed responses via `@openclaw-manager/types`. After Task 1 extended `ClaudeCodeTranscriptEvent`, `ClaudeCodePendingItem`, and `ClaudeCodeAskResponse` with envelope fields, no further client method additions are required; only an audit for compile-time correctness matters.

- [ ] **Step 1: Confirm `bridge-client.ts` compiles with the new types**

Run: `pnpm --filter dashboard build 2>&1 | tail -40`
Expected: build succeeds. If any usage site explicitly types event/pending/response shapes without envelope, widen the types.

- [ ] **Step 2: Commit (only if any file was touched)**

```bash
git add apps/dashboard/src/lib/bridge-client.ts
git commit -m "dashboard(client): compile-clean against envelope-extended types"
```

If nothing changed, skip this commit and proceed to Task 9.

---

## Task 9: Create `cc-envelope-chips.tsx`

**Files:**
- Create: `apps/dashboard/src/components/cc-envelope-chips.tsx`

Renders a compact chip strip for one transcript event: `[intent] [state] [artifact?]`, with emphasis ladder (state strongest, artifact selectively loud, intent subdued), and dedupe-dimming when the prior turn's intent+state match.

- [ ] **Step 1: Create the component**

```tsx
"use client";

import type { CCArtifact, CCEnvelope, CCIntent, CCState } from "@openclaw-manager/types";

const STATE_COLOR: Record<CCState, string> = {
  new: "bg-accent/15 text-accent",
  in_progress: "bg-info/15 text-info",
  blocked: "bg-warn/20 text-warn",
  review_ready: "bg-accent/20 text-accent",
  done: "bg-ok/15 text-ok-muted",
  parked: "bg-panel text-text-muted",
  timeout: "bg-err/15 text-err",
};

const INTENT_LABEL: Record<CCIntent, string> = {
  decide: "decide",
  brainstorm: "brainstorm",
  plan: "plan",
  review: "review",
  research: "research",
  unblock: "unblock",
  handoff: "handoff",
  report: "report",
};

const LOUD_ARTIFACTS: ReadonlySet<CCArtifact> = new Set([
  "question",
  "decision",
  "patch",
  "review_notes",
  "spec",
]);

const ARTIFACT_ICON: Partial<Record<CCArtifact, string>> = {
  question: "?",
  decision: "✓",
  spec: "¶",
  plan: "☰",
  review_notes: "✎",
  patch: "±",
  summary: "·",
};

export type CCEnvelopeChipsProps = {
  envelope: CCEnvelope;
  prior?: Pick<CCEnvelope, "intent" | "state"> | null;
  transitioned?: boolean;
};

export function CCEnvelopeChips({ envelope, prior, transitioned }: CCEnvelopeChipsProps) {
  const intentDim =
    prior && prior.intent === envelope.intent && prior.state === envelope.state;
  const stateDim = intentDim && !transitioned;
  const showArtifact = envelope.artifact !== "none";
  const artifactLoud = LOUD_ARTIFACTS.has(envelope.artifact);

  return (
    <div
      data-testid="cc-envelope-chips"
      className="flex items-center gap-2 font-mono text-[11px]"
    >
      <span
        className={`px-1.5 py-0.5 rounded border border-border/60 ${
          intentDim ? "opacity-50" : "opacity-90"
        } text-text-muted`}
      >
        {INTENT_LABEL[envelope.intent]}
      </span>
      <span
        className={`px-1.5 py-0.5 rounded ${STATE_COLOR[envelope.state]} ${
          stateDim ? "opacity-50" : "opacity-100"
        } font-medium uppercase tracking-wide`}
      >
        {envelope.state}
      </span>
      {showArtifact ? (
        <span
          className={`px-1.5 py-0.5 rounded border border-border ${
            artifactLoud ? "opacity-100" : "opacity-70"
          } text-text`}
          title={`artifact: ${envelope.artifact}`}
        >
          {ARTIFACT_ICON[envelope.artifact] ?? "•"} {envelope.artifact}
        </span>
      ) : null}
    </div>
  );
}
```

Notes for the implementer:
- `bg-accent`, `bg-warn`, `bg-err`, `bg-info`, `bg-ok`, `text-text-muted`, `text-text`, `border-border`, `bg-panel` are design-token classes wired via Tailwind config in the "Operator Console" redesign (`apps/dashboard/src/app/globals.css` / Tailwind config). If any class is absent, use the nearest equivalent in the repo's token set — **do not invent hex values here.**
- Keep the file a pure view; no data fetching.

- [ ] **Step 2: Commit**

```bash
git add apps/dashboard/src/components/cc-envelope-chips.tsx
git commit -m "dashboard: CCEnvelopeChips — A-lite chip strip per turn

Renders [intent] [state] [artifact?] with emphasis ladder: state
strongest, artifact loud only for question/decision/patch/review_notes/
spec, intent subdued. Dedupe-dims when prior turn repeats intent+state;
dim rather than remove to preserve scan rhythm."
```

---

## Task 10: Create `cc-ref-chips.tsx`

**Files:**
- Create: `apps/dashboard/src/components/cc-ref-chips.tsx`

Renders the refs row below a turn's body. First three visible; overflow collapses into `+N more` chevron.

- [ ] **Step 1: Create the component**

```tsx
"use client";

import { useState } from "react";
import type { CCRef } from "@openclaw-manager/types";

function refLabel(ref: CCRef): string {
  switch (ref.kind) {
    case "file":
      return ref.range ? `${ref.path} ${ref.range}` : ref.path;
    case "commit":
      return ref.sha.slice(0, 8);
    case "spec":
      return ref.path;
    case "error":
      return ref.text.length > 60 ? ref.text.slice(0, 60) + "…" : ref.text;
    case "session":
      return ref.id;
  }
}

function refHref(ref: CCRef): string | null {
  switch (ref.kind) {
    case "session":
      // assumes session ids of form "agent:<a>:<id>"; strip prefix to open detail
      const short = ref.id.split(":").pop();
      return short ? `/claude-code/${short}` : null;
    case "spec":
    case "file":
      return null; // implementer can wire an editor scheme if desired
    default:
      return null;
  }
}

const REF_KIND_GLYPH: Record<CCRef["kind"], string> = {
  file: "📄",
  commit: "⋄",
  spec: "§",
  error: "!",
  session: "⇄",
};

export type CCRefChipsProps = {
  refs: CCRef[];
};

export function CCRefChips({ refs }: CCRefChipsProps) {
  const [expanded, setExpanded] = useState(false);
  if (!refs || refs.length === 0) return null;
  const visible = expanded ? refs : refs.slice(0, 3);
  const hiddenCount = refs.length - visible.length;

  return (
    <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
      {visible.map((r, i) => {
        const href = refHref(r);
        const body = (
          <>
            <span className="opacity-70">{REF_KIND_GLYPH[r.kind]}</span>
            <span className="truncate max-w-[28ch]">{refLabel(r)}</span>
            {r.relation ? (
              <span className="opacity-60 text-[10px] uppercase ml-1">{r.relation}</span>
            ) : null}
          </>
        );
        const className =
          "inline-flex items-center gap-1 rounded border border-border/60 bg-panel/60 px-1.5 py-0.5 font-mono text-[11px] text-text";
        return href ? (
          <a key={i} href={href} className={className}>
            {body}
          </a>
        ) : (
          <span key={i} className={className}>
            {body}
          </span>
        );
      })}
      {hiddenCount > 0 ? (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="inline-flex items-center gap-1 rounded border border-border/60 px-1.5 py-0.5 font-mono text-[11px] text-text-muted hover:text-text"
        >
          +{hiddenCount} more
        </button>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/dashboard/src/components/cc-ref-chips.tsx
git commit -m "dashboard: CCRefChips — typed ref row under each turn

Shows first 3 refs with kind-glyph + label + optional relation; overflow
collapses into '+N more' chevron. Session refs link to the referenced
session's detail page."
```

---

## Task 11: Wire envelope chrome into `claude-code-session-detail.tsx` and `claude-code-pending-card.tsx`

**Files:**
- Modify: `apps/dashboard/src/components/claude-code-session-detail.tsx`
- Modify: `apps/dashboard/src/components/claude-code-pending-card.tsx`

- [ ] **Step 1: In `claude-code-session-detail.tsx`, import the new components**

At the top of the file, add:

```tsx
import { CCEnvelopeChips } from "./cc-envelope-chips";
import { CCRefChips } from "./cc-ref-chips";
```

- [ ] **Step 2: In the turn-renderer (the JSX that iterates transcript events), render chips + refs**

Locate the code that maps over the transcript events. For each event `e` (of type `ClaudeCodeTranscriptEvent`) where `e.envelope` is present, wrap the turn body with:

```tsx
// Inside the map, track `prior` across iterations:
const prior = idx > 0 ? events[idx - 1]?.envelope ?? null : null;
const transitioned = !!prior && (prior.intent !== e.envelope?.intent || prior.state !== e.envelope?.state);

return (
  <div key={idx} className={`flex flex-col gap-2 py-3 ${transitioned ? "border-t border-accent/40" : ""}`}>
    {e.envelope ? (
      <CCEnvelopeChips envelope={e.envelope} prior={prior ?? null} transitioned={transitioned} />
    ) : null}
    {/* existing turn-body rendering (author gutter, text bubble, context preview) */}
    {/* ...existing JSX... */}
    {e.envelope?.refs && e.envelope.refs.length > 0 ? (
      <CCRefChips refs={e.envelope.refs} />
    ) : null}
  </div>
);
```

Author gutter uses `e.envelope?.author.kind` / `.id` to pick a glyph per the spec's "Author gutter" section. If the existing component already renders an author affordance tied to `source`, add a branch that prefers `envelope.author` when present.

- [ ] **Step 3: In `claude-code-pending-card.tsx`, render the ask envelope + draft envelope chrome**

Wrap the question panel with `<CCEnvelopeChips envelope={item.envelope} />` (from the pending item) and the draft panel with `<CCEnvelopeChips envelope={item.draftEnvelope} />`. Render `<CCRefChips refs={item.envelope.refs}/>` below the question.

- [ ] **Step 4: Build dashboard to verify**

Run: `pnpm --filter dashboard build`
Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add apps/dashboard/src/components/claude-code-session-detail.tsx apps/dashboard/src/components/claude-code-pending-card.tsx
git commit -m "dashboard(cc): render envelope chips + refs on transcript and pending card"
```

---

## Task 12: Create `cc-escalation-card.tsx` and wire into right rail

**Files:**
- Create: `apps/dashboard/src/components/cc-escalation-card.tsx`
- Modify: `apps/dashboard/src/components/claude-code-session-detail.tsx`

- [ ] **Step 1: Create `cc-escalation-card.tsx`**

```tsx
"use client";

import { useState } from "react";
import type { CCEnvelope, ClaudeCodeSession } from "@openclaw-manager/types";

export type CCEscalationCardProps = {
  session: ClaudeCodeSession;
  latestTurn: CCEnvelope;
  autoSwitchOnDecisionBlock?: boolean;
  onTakeOver: () => void | Promise<void>;
  onReplyInPlace: (text: string) => void | Promise<void>;
  onIgnoreForSession: () => void | Promise<void>;
  onToggleAutoSwitch: (next: boolean) => void | Promise<void>;
};

export function CCEscalationCard({
  session,
  latestTurn,
  autoSwitchOnDecisionBlock,
  onTakeOver,
  onReplyInPlace,
  onIgnoreForSession,
  onToggleAutoSwitch,
}: CCEscalationCardProps) {
  const [replying, setReplying] = useState(false);
  const [draft, setDraft] = useState("");
  const shouldShow =
    latestTurn.intent === "decide" &&
    latestTurn.state === "blocked" &&
    latestTurn.author.kind === "ide";

  if (!shouldShow) return null;

  return (
    <div className="rounded-md border border-accent/50 bg-accent/10 p-3 flex flex-col gap-2">
      <div className="text-[11px] font-mono uppercase tracking-wide text-accent">
        Decision needed
      </div>
      <div className="text-sm text-text">{latestTurn.message}</div>
      {replying ? (
        <div className="flex flex-col gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={4}
            className="rounded border border-border bg-panel p-2 text-sm font-mono text-text"
            placeholder="Your verdict…"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={async () => {
                if (draft.trim()) {
                  await onReplyInPlace(draft.trim());
                  setReplying(false);
                  setDraft("");
                }
              }}
              className="rounded bg-accent text-bg px-2 py-1 text-xs font-medium"
            >
              Send verdict
            </button>
            <button
              type="button"
              onClick={() => {
                setReplying(false);
                setDraft("");
              }}
              className="rounded border border-border px-2 py-1 text-xs text-text-muted"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onTakeOver}
            className="rounded bg-accent text-bg px-2 py-1 text-xs font-medium"
          >
            Take over
          </button>
          <button
            type="button"
            onClick={() => setReplying(true)}
            className="rounded border border-border px-2 py-1 text-xs text-text"
          >
            Reply in place
          </button>
          <button
            type="button"
            onClick={onIgnoreForSession}
            className="rounded border border-border px-2 py-1 text-xs text-text-muted"
          >
            Ignore rule
          </button>
        </div>
      )}
      <label className="flex items-center gap-2 text-[11px] font-mono text-text-muted pt-1">
        <input
          type="checkbox"
          checked={!!autoSwitchOnDecisionBlock}
          onChange={(e) => onToggleAutoSwitch(e.target.checked)}
        />
        Auto-switch to manual on decision-block
      </label>
    </div>
  );
}
```

- [ ] **Step 2: In `claude-code-session-detail.tsx`, wire the card into the right rail above the mode toggle**

Import and render:

```tsx
import { CCEscalationCard } from "./cc-escalation-card";

// inside the right-rail JSX:
{latestEnvelope ? (
  <CCEscalationCard
    session={session}
    latestTurn={latestEnvelope}
    autoSwitchOnDecisionBlock={autoSwitchPref}
    onTakeOver={async () => {
      // PATCH /claude-code/sessions/:id { mode: "manual" }
      await bridgeClient.setCcSessionMode(session.id, "manual");
    }}
    onReplyInPlace={async (text) => {
      // POST /claude-code/pending/:id { action: "replace", text }
      // if no pending yet, operator can still flip to manual and reply later
      const pending = pendings.find((p) => p.sessionId === session.id);
      if (pending) await bridgeClient.resolveCcPending(pending.id, "replace", text);
    }}
    onIgnoreForSession={() => {
      setIgnoreEscalation(true);
      // persisted in localStorage keyed by session.id
      localStorage.setItem(`cc-ignore-escalation-${session.id}`, "1");
    }}
    onToggleAutoSwitch={(next) => {
      setAutoSwitchPref(next);
      localStorage.setItem(`cc-autoswitch-${session.id}`, next ? "1" : "0");
    }}
  />
) : null}
```

Notes:
- `latestEnvelope` is derived by tailing `events` and returning `events[events.length - 1]?.envelope ?? null`.
- `autoSwitchPref` and `ignoreEscalation` live in `useState` seeded from `localStorage`.
- `bridgeClient.setCcSessionMode` and `bridgeClient.resolveCcPending` already exist (existing PATCH / POST calls). If the exact names differ in `bridge-client.ts`, use the existing helpers as-is.

- [ ] **Step 3: Build dashboard**

Run: `pnpm --filter dashboard build`
Expected: succeeds.

- [ ] **Step 4: Commit**

```bash
git add apps/dashboard/src/components/cc-escalation-card.tsx apps/dashboard/src/components/claude-code-session-detail.tsx
git commit -m "dashboard(cc): escalation card on right rail for decide+blocked turns

Shows 'Decision needed' with Take over / Reply in place / Ignore rule
actions. Per-session auto-switch-to-manual toggle persisted to
localStorage. Card only appears when the latest IDE-authored turn is
intent=decide AND state=blocked."
```

---

## Task 13: Sidebar badge + "Needs decision" column on sessions table

**Files:**
- Modify: `apps/dashboard/src/components/claude-code-sessions-table.tsx`
- Modify: `apps/dashboard/src/components/app-shell.tsx` (or the sidebar component used by it)
- Modify: `apps/dashboard/src/app/api/claude-code/sessions/route.ts` (or equivalent route the sidebar consumes; add the needs-decision count if it's not already derivable)

- [ ] **Step 1: In `claude-code-sessions-table.tsx`, add a `Needs decision` column**

Each row: compute `needsDecision` by tailing that session's latest transcript event. To avoid N fetches, the sessions list route should return the latest envelope per session inline (add a `latestEnvelope?: CCEnvelope | null` field on what the route responds with). If the route does not yet return this, add it:

```typescript
// apps/dashboard/src/app/api/claude-code/sessions/route.ts (server):
// For each session, read the last non-empty line of its transcript file via
// bridgeClient.getCcTranscript(id) and attach `latestEnvelope` (or null).
```

Then in the table row:

```tsx
<td className="px-3 py-2">
  {row.latestEnvelope?.intent === "decide" && row.latestEnvelope?.state === "blocked" ? (
    <span className="inline-flex items-center gap-1 rounded bg-warn/20 text-warn px-1.5 py-0.5 text-[11px] font-mono">
      ● decision
    </span>
  ) : null}
</td>
```

Add a matching `<th>` labeled "Needs decision".

- [ ] **Step 2: Compute the badge count and wire it into the sidebar**

In the server-side loader that produces sidebar badge counts (follow the existing pattern — the redesign already supports badge counts per the dashboard-redesign spec), add:

```typescript
const ccDecisionCount = (await bridgeClient.listCcSessions())
  .filter((s) => s.latestEnvelope?.intent === "decide" && s.latestEnvelope?.state === "blocked")
  .length;
```

Pass `ccDecisionCount` to the sidebar's "Claude Code" item as its `badge` prop. Render as a small pill next to the nav label. If the sidebar component currently uses a `badgeFor(key)` mapping, add `"claude-code" → ccDecisionCount`.

- [ ] **Step 3: Build dashboard**

Run: `pnpm --filter dashboard build`
Expected: succeeds.

- [ ] **Step 4: Commit**

```bash
git add apps/dashboard/src/components/claude-code-sessions-table.tsx apps/dashboard/src/components/app-shell.tsx apps/dashboard/src/app/api/claude-code/sessions/route.ts
git commit -m "dashboard(cc): sessions table 'Needs decision' column + sidebar badge

Sessions route returns latestEnvelope per session; table flags rows where
intent=decide AND state=blocked; sidebar Claude Code item shows the
count of such sessions."
```

---

## Task 14: Update `AGENTS.md` with the Collaboration Envelope section

**Files:**
- Modify: `AGENTS.md`

- [ ] **Step 1: Find the "Claude Code ↔ OpenClaw" section (around line 209 in the current file) and append a new subsection**

Add below the existing paragraph:

```markdown
### Collaboration Envelope (phase 1)

Every CC↔OC turn carries a canonical envelope normalized by the bridge:

| Field | Required? | Notes |
|---|---|---|
| `message` | yes | Natural-language body. The only field that causes a 400 when missing. |
| `intent` | no | `decide \| brainstorm \| plan \| review \| research \| unblock \| handoff \| report` — what kind of collaboration is requested. |
| `state` | no | `new \| in_progress \| blocked \| review_ready \| done \| parked` — author's asserted lifecycle status. `timeout` is system-only. |
| `artifact` | no | `none \| question \| decision \| spec \| plan \| review_notes \| patch \| summary` — output shape. Defaults to `none`. |
| `priority` | no | `low \| normal \| high \| urgent`. Defaults to `normal`. |
| `refs[]` | no | Typed evidence: `file / commit / spec / error / session`, optional `relation`. |
| `parent_msg_id` | no | Threading. |
| `msg_id` | no | Bridge-assigned when absent. |
| `author` | — | **Bridge-derived, never caller-supplied.** `{ kind: "ide"|"agent"|"operator"|"system", id }`. |

Design principles:

- **State is an author assertion, not a negotiated field.** Receiver can disagree in the next turn by declaring a different state.
- **Artifact names the primary deliverable of the turn**, not every rhetorical element inside it.
- **Refs point to evidence**, not narration already in `message`.
- **Protocol semantics are shared across all agents; role prompts may specialize behavior but must not redefine envelope meaning.**

Full spec: `docs/superpowers/specs/2026-04-21-openclaw-integration-envelope-design.md`.

Bridge module: `apps/bridge/src/services/envelope.ts`.
Dashboard chrome: `cc-envelope-chips.tsx`, `cc-ref-chips.tsx`, `cc-escalation-card.tsx`.
```

- [ ] **Step 2: Commit**

```bash
git add AGENTS.md
git commit -m "docs(agents): describe collaboration envelope fields and principles"
```

---

## Self-Review Checklist (for the implementer running this plan)

After finishing all 14 tasks:

- [ ] `pnpm --filter bridge test` — full bridge suite passes (new envelope unit + integration tests, no regressions).
- [ ] `pnpm --filter dashboard build` — dashboard type-checks and builds.
- [ ] `pnpm --filter @openclaw-manager/mcp build` — MCP package builds.
- [ ] Git log shows exactly one commit per task (14 commits), each with the specified message body.
- [ ] The committed transcript for a real CC↔OC session (e.g. this very brainstorm) shows envelopes on newly-appended events after the implementation lands. Legacy pre-envelope events still parse and render (chrome simply omitted).
- [ ] The dashboard sidebar "Claude Code" item shows no badge when no sessions are in `decide+blocked`; shows a count when at least one is.
- [ ] The escalation card appears on the right rail of the session detail page exactly when the latest IDE-authored turn is `intent=decide` AND `state=blocked`; it disappears after the state transitions.

---

## Out of scope for this plan

- Migrating `FIRST_TURN_PREAMBLE` off the fake-first-turn shim into gateway-side session-prompt composition (phase 2, first).
- Escalation-rule editor UI beyond the built-in `decide+blocked` rule (phase 2).
- Agent-to-agent routing using the envelope (phase 2).
- Proactive OC→CC push + `openclaw_check_inbox` MCP tool (phase 2).
- Cross-agent audit view (phase 2).
- Surfacing `_raw.*` validation warnings in the dashboard (deferred until drift is observed in practice).

---
