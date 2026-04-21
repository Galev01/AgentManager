# OpenClaw Integration — Collaboration Envelope

**Date:** 2026-04-21
**Status:** Draft — pending operator review
**Authors:** Claude Code + OpenClaw (consult-openclaw brainstorm)
**Supersedes:** extends `2026-04-19-claude-code-openclaw-bridge-design.md`

## Summary

Introduce a shared **collaboration envelope** (`intent`, `state`, `artifact`, `refs`, `priority`, `parent_msg_id`, `author`) that every turn in an OpenClaw-mediated dialogue carries. In phase 1 the envelope is wired end-to-end between Claude Code and OpenClaw over the existing MCP + bridge path. In phase 2 the same envelope becomes the substrate for agent-to-agent traffic (`main` ↔ `reviewer`, plugin agents, future consult flows).

The envelope is the lever. Everything else in this design — the dashboard transcript rendering, the decision-escalation rail, the universal system-prompt preamble, the MCP API shape — follows from treating intent and lifecycle as first-class rather than leaving them implicit in free-form prose.

## Why now

Three pain points surfaced in the brainstorm:

1. **No intent vocabulary.** Every CC→OC turn looks the same to the receiver. "Second opinion" vs "decide for me" vs "just narrating progress" are indistinguishable, so OC's response shape is guesswork and CC re-sends context that was already provided.
2. **No lifecycle contract.** Neither side can tell whether a message is opening a task, reporting progress, blocked on a decision, review-ready, or done. Dashboard state, urgency cues, and future cross-agent orchestration all need a common notion of "owned", "waiting", "review-ready", "done".
3. **Ad-hoc context payloads.** `{file, selection, stack}` is whatever the caller felt like attaching. Without a typed reference shape, OC cannot render links, cannot dedupe narration that's already in `message`, and cannot reliably point back at artifacts it produced earlier.

Intent is upstream of payload schema — once both sides know what kind of help is being requested, the right fields to carry fall out. So the envelope addresses all three.

## Non-goals (phase 1)

- Agent-to-agent routing using the envelope (`main` asking `reviewer`, etc.). Phase 2.
- Proactive OC→CC push / `openclaw_check_inbox`. Already deferred from the v1 bridge design.
- OC reading files directly from the workspace.
- Multi-operator moderation.
- Deprecating `openclaw_say` in favor of a new tool. Extend in place instead.

## Design principles

- **Protocol semantics are shared across all agents; role prompts may specialize behavior but must not redefine envelope meaning.**
- **State is an author assertion, not a negotiated field.** Each turn's `state` is the author's claim about the thread at that moment. The receiver can disagree in their next turn by emitting a different state. No override/proposal field.
- **`author` is transport-derived identity metadata, not caller-declared content.** Callers never supply it in phase 1; the bridge assigns it from session context.
- **Artifact names the primary deliverable of the turn**, not every rhetorical element inside it.
- **Refs point to evidence**, not narration that is already in `message`.
- **Public API permissive, canonical storage strict.** Callers may omit any envelope field except `message`. The bridge normalizes to a canonical envelope before logging, routing, and replying.
- **Make semantic transitions visible by default; make operator intervention deliberate by default.** (UI principle for the dashboard transcript and escalation rail.)

## The envelope

Canonical shape (internal representation, normalized by the bridge):

```jsonc
{
  "msg_id":         "m-<hex12>",           // bridge-assigned when absent; unique within session
  "parent_msg_id":  "m-<hex12>" | null,    // references a prior turn in the same session
  "author": {                              // bridge-assigned; see "Bridge-derived author" below
    "kind": "ide" | "agent" | "operator" | "system",
    "id":   "antigravity" | "vscode" | "cli" | "claude-code" | "main" | "reviewer" | "<operator-id>" | "bridge" | "gateway"
  },
  "intent":    "decide" | "brainstorm" | "plan" | "review" | "research" | "unblock" | "handoff" | "report",
  "state":     "new" | "in_progress" | "blocked" | "review_ready" | "done" | "parked",
  "artifact":  "none" | "question" | "decision" | "spec" | "plan" | "review_notes" | "patch" | "summary",
  "priority":  "low" | "normal" | "high" | "urgent",
  "refs": [
    { "kind": "file",    "path": "apps/bridge/src/...", "range": "L42-L88", "relation": "source_of_truth" },
    { "kind": "commit",  "sha":  "8458801" },
    { "kind": "spec",    "path": "docs/superpowers/specs/..." },
    { "kind": "error",   "text": "..." },
    { "kind": "session", "id":   "agent:claude-code:cc-xxxx", "relation": "prior_attempt" }
  ],
  "message": "<natural-language body>"
}
```

Field details:

- `msg_id` — bridge-assigned when absent. Must be unique within session scope. Existing format `m-<12 hex>` kept.
- `parent_msg_id` — explicit threading. `null` for root turns. Used to reconstruct sub-threads in the UI and to attribute state transitions.
- `author.kind` — one of four (`ide | agent | operator | system`), bridge-derived (see below). Never caller-authored in phase 1. `ide` is the IDE-side of a CC↔OC session (the caller of `openclaw_say`); `agent` is a gateway-hosted agent that produces a reply.
- `intent` — **what kind of collaboration is requested.** Task-agnostic, collaboration-oriented. Eight values, no more in phase 1.
- `state` — **where this work item is in its lifecycle.** Six author-usable values. `timeout` exists as a seventh system-only state, emitted only when `author.kind === "system"`.
- `artifact` — **what form the primary deliverable takes.** Eight values. Defaults to `none` when absent.
- `priority` — default `normal`. Used for sidebar badges, sort order, and (phase 2) routing heuristics.
- `refs[]` — typed evidence list. `relation` is optional and drawn from `background | source_of_truth | prior_attempt | parallel_work`.

### Intent definitions (prompt-robust glossary)

**One-sentence definition:** `intent` is the collaboration mode requested or being performed by this turn.

| Intent | When to use |
|---|---|
| `decide` | Pick between options or render a verdict. Reply is decisive. |
| `brainstorm` | Explore possibilities without converging. Reply is divergent. |
| `plan` | Turn a goal into concrete steps. Reply is procedural. |
| `review` | Evaluate an artifact against criteria. Reply is evaluative. |
| `research` | Gather, compare, or inspect facts before deciding. Reply is informational. |
| `unblock` | Resolve a blocker or missing dependency. Reply removes an obstacle. |
| `handoff` | Transfer ownership or package context for another agent. Reply acknowledges receipt. |
| `report` | Status update, result summary, or completion note. Reply acknowledges or flags. |

**Common confusions (use the first, not the second):**
- Use `report` (status or result) instead of `review` when you are delivering, not evaluating.
- Use `plan` (concrete ordered steps) instead of `brainstorm` when you have already converged.
- Use `decide` (pick one) instead of `brainstorm` when the ask is a verdict, even if framed open-endedly.

### State definitions

**One-sentence definition:** `state` is the author's asserted lifecycle status for the thread after this turn.

| State | Meaning |
|---|---|
| `new` | Thread just opened; no prior work. Default for root turns authored by callers. |
| `in_progress` | Work actively being done on this thread. |
| `blocked` | Work paused waiting for input from the other party (answer, decision, missing ref). |
| `review_ready` | A deliverable is posted and awaits evaluation. |
| `done` | Thread closed successfully. Author believes no further turns needed. |
| `parked` | Thread suspended intentionally, not blocked on the other party. |
| `timeout` | System-only. Emitted by bridge when a pending draft expires past `CLAUDE_CODE_PENDING_TIMEOUT_MS`. |

### Artifact definitions

**One-sentence definition:** `artifact` is the primary output shape delivered by this turn.

| Artifact | When to tag |
|---|---|
| `none` | Conversational turn, no primary deliverable. |
| `question` | The turn's primary purpose is asking for an answer. |
| `decision` | The turn delivers a verdict or chosen option. |
| `spec` | The turn delivers a written design spec or design-doc content. |
| `plan` | The turn delivers an ordered step list or implementation plan. |
| `review_notes` | The turn delivers critique against a prior artifact. |
| `patch` | The turn delivers code / diff / applied changes. |
| `summary` | The turn delivers a recap, status snapshot, or completion note. |

**Common confusions (use the first, not the second):**
- Use `decision` (a rendered verdict) instead of `summary` when the turn's primary payload is the verdict itself.
- Use `review_notes` (critique against criteria) instead of `summary` when the turn evaluates prior work.
- Use `question` (asks for an answer) instead of `none` when the turn's primary purpose is asking, even if written conversationally.

### Bridge-derived `author`

The bridge assigns `author` from transport context before logging the turn:

- CC-originated MCP call → `{ kind: "ide", id: "<ide-name>" }`. `id` is pulled from the MCP request's `ide` field (`antigravity`, `vscode`, `cli`, `claude-code`). If the IDE is unknown, fall back to `"unknown"`.
- OC-originated reply (assistant message from the gateway agent handling the session) → `{ kind: "agent", id: "<gateway-agent-id>" }`. In phase 1, every CC↔OC session runs under the `claude-code` gateway agent, so this is `{ kind: "agent", id: "claude-code" }`.
- Dashboard operator action (send-as-is / edit / replace / compose) → `{ kind: "operator", id: "<operator-id or 'default'>" }`.
- Timeout, gateway-closed, moderation-discard system events → `{ kind: "system", id: "bridge" }` or `{ kind: "system", id: "gateway" }`.
- Phase 2 agent-to-agent traffic → `{ kind: "agent", id: "<source-agent-id>" }` derived from the initiating session.

If a caller supplies `author` in the request, the bridge logs the advisory value but overwrites it in the canonical envelope.

### Defaulting rules for missing envelope fields

When the bridge normalizes an incoming call:

| Field | Default when absent |
|---|---|
| `msg_id` | bridge-assigns `m-<hex12>` |
| `parent_msg_id` | `null` (root turn) unless thread context binds it |
| `author` | bridge-derived (see above) |
| `intent` | weak inference from context (tool, preceding turn); canonical envelope tags `intent_confidence: "low"` so downstream consumers can flag it |
| `state` | `new` for caller-authored root turns; `in_progress` for continuing threads |
| `artifact` | `none` |
| `priority` | `normal` |
| `refs` | `[]` |

`intent_confidence` is internal only; not exposed to callers.

### Fallback behavior for invalid or malformed envelope fields

Prompt-produced structured fields will occasionally drift, so the bridge must normalize defensively rather than rejecting a turn wholesale.

| Condition | Bridge behavior |
|---|---|
| `intent`, `state`, or `artifact` has an unknown enum value | Coerce to the field's default (`new` / `none` for state/artifact; weak inference for `intent`). Preserve the raw supplied value on the canonical envelope as `_raw.intent` / `_raw.state` / `_raw.artifact`. Emit an internal validation warning. |
| `refs[]` item is malformed (unknown `kind`, missing required props) | Drop that item; keep the rest. Append the dropped entry to `_raw.refs` for later forensic review. |
| Duplicate `msg_id` within a session | Overwrite the caller's `msg_id` with a bridge-assigned one; append `parent_msg_id` pointing to the first occurrence if present. |
| `priority` out of enum | Coerce to `normal`. |
| `author` supplied by caller | Logged advisory; overwritten by the transport-derived value. |
| `message` missing or empty | Only this condition fails the turn; bridge returns HTTP 400 `{ error: "message required" }`. |

Core principle: **preserve raw payload, coerce invalid fields in the canonical model, annotate validation warnings internally, do not fail the whole turn unless the core required data is unusable.**

## MCP API extension

`openclaw_say` grows optional envelope fields. Shape:

```ts
openclaw_say({
  message: string,                        // required
  intent?: Intent,
  state?: State,
  artifact?: Artifact,
  priority?: Priority,
  refs?: Ref[],
  parent_msg_id?: string,
  msg_id?: string,
  context?: Record<string, unknown>       // legacy, preserved; bridge maps known keys into refs
})
```

- No new tool added in phase 1. Existing `openclaw_say` callers (prose-only) keep working.
- `context` remains accepted for backwards compatibility. The bridge maps well-known keys (`file`, `selection`, `stack`) into typed `refs` during normalization.
- `openclaw_conclude` and `openclaw_session_info` unchanged in signature. `openclaw_conclude` effectively emits a final turn with `state: done`, `intent: report`, and `author.kind: "ide"` (the IDE initiating completion).

Public API stays permissive. Internally the bridge operates on the canonical envelope (all fields populated via defaulting).

## Universal preamble (prompt substrate)

Today `claude-code-ask.ts` injects a `FIRST_TURN_PREAMBLE` as a fake user turn on the first call of a new OC session. This was a quick-win shim. The design goal moving forward:

- **Protocol substrate** (envelope semantics) lives in the gateway-side system/developer prompt composition when the session is created under the agent, not in a fake conversational turn.
- **Role preamble** lives per agent (`main` / `claude-code` / `reviewer` / plugin agents) and describes what that agent specializes in, without redefining envelope semantics.
- **Task/session-local context** (current objective, tool constraints, operator preferences) layers on top.

### Universal preamble content (normative)

The universal preamble given to every agent must cover:

- The eight intents, the six author states + system-only `timeout`, the eight artifacts.
- "State is an author assertion, not a negotiated field."
- "Artifact names the primary deliverable of the turn."
- "Refs point to evidence, not narration already in `message`."
- "When changing state or intent from the prior turn, make the reason clear in `message`."
- Response posture by intent: decisive on `decide`, evaluative on `review`, divergent on `brainstorm`, procedural on `plan`, informational on `research`.
- How to end a thread: set `state: done`; the legacy `[[OPENCLAW_DONE]]` sentinel remains accepted during migration but is deprecated.

### Migration path

1. Phase 1 implementation keeps `FIRST_TURN_PREAMBLE` as-is to avoid regressing the bridge today.
2. A follow-up task moves protocol substrate into gateway-side session bootstrapping and drops the shim.
3. Per-agent role blocks remain editable by the operator via the existing agents page.

## Dashboard UI changes

### Sidebar

- **"Claude Code" item** gains a badge showing the count of active sessions whose latest turn has `state: blocked` AND `intent: decide`. Visual: the same red dot + number treatment used elsewhere; cleared when the state transitions away from blocked or the session ends.
- **Reviews / other pages** unchanged in phase 1.

### `/claude-code` list

No schema change. New column (optional, behind the existing density tweak): **Needs decision** — boolean flag derived from the latest turn's envelope. Sortable.

### `/claude-code/[id]` detail — A-lite transcript

Per-turn rendering:

- Compact metadata line above or beside the message: `[intent]  [state]  [artifact?]`.
- **Emphasis ladder (most → least loud):**
  1. State chip — strongest color (blocked = warn, review_ready = accent, done = muted-ok).
  2. Artifact tag — outlined, with icon, visible only for high-value shapes: `question`, `decision`, `patch`, `review_notes`, `spec`. Hidden for `summary` / `none` on dense layouts.
  3. Intent chip — neutral/subtle; visually subdued.
- **Dedupe dimming:** if a turn repeats the prior turn's `intent` AND `state`, render both chips dimmed (opacity ~0.5). A state change always renders at full emphasis and pairs with a thin accent rule above the turn bubble to draw the eye to transitions.
- **Layout stability:** dim repeated `intent` / `state` chips rather than removing them, so scan rhythm stays steady across a long transcript. Full omission is acceptable only for `artifact: none`.
- **Refs row** below the message body: clickable chips; first 2–3 visible plus `+N more` chevron. File refs link to file+line in the appropriate surface (editor / dashboard file viewer if present). Session refs link to the other session's detail page.
- **Author gutter:** small avatar/glyph indicating `author.kind`:
  - `ide` (CC-originated) — IDE-origin glyph keyed on `author.id` (`antigravity` / `vscode` / `cli` / `claude-code` / `unknown`).
  - `agent` — gateway-agent glyph keyed on `author.id` (`claude-code` / `main` / `reviewer` / future).
  - `operator` — operator avatar.
  - `system` — infrastructural glyph (muted, smaller).
- **Control tags** (`[[OPENCLAW_DONE]]`, `[[reply_to_current]]`) continue to be stripped before rendering.

### `/claude-code/[id]` detail — right rail

Above the existing mode toggle, a new **Escalation** card appears when the latest turn matches an escalation rule.

- **Default rule** (not editable in phase 1): `intent = decide` AND `state = blocked`.
- **Card contents:** eyebrow "Decision needed", the question text (from the turn's `message`), and three action buttons:
  - `Take over` — flips session mode to `manual`, scrolls to the pending-draft card.
  - `Reply in place` — opens an inline reply textarea that composes an operator turn with `intent: decide`, `artifact: decision`.
  - `Ignore rule for this session` — suppresses the card for this thread; preference persists.
- **Per-session auto-switch:** a session-level setting "Auto-switch to manual on decision-block" defaults **off**. When on, the bridge flips the session to manual and emits a toast: "Switched to manual: blocked decision turn detected". The card still appears.

### Connect modal & other pages

- `/claude-code/connect-config` output unchanged in phase 1.
- Other pages (`/agents`, `/sessions`, `/reviews`) get no envelope surfacing in phase 1.

## Storage schema

### Transcript (`<session-id>.jsonl`)

Existing event kinds (`ask`, `draft`, `answer`, `discarded`, `timeout`, `ended`, `mode_change`) remain valid. Each event gains an `envelope` object when applicable:

```jsonl
{"t":"...","kind":"ask","envelope":{"msg_id":"m-a1","intent":"decide","state":"blocked","artifact":"question","priority":"normal","refs":[...],"author":{"kind":"ide","id":"claude-code"}},"question":"..."}
{"t":"...","kind":"draft","envelope":{"msg_id":"m-a1","intent":"decide","state":"review_ready","artifact":"decision","author":{"kind":"agent","id":"claude-code"}},"draft":"..."}
{"t":"...","kind":"answer","envelope":{"msg_id":"m-a1","intent":"decide","state":"done","artifact":"decision","author":{"kind":"operator","id":"default"}},"answer":"...","source":"operator","action":"edit"}
```

- Pre-envelope events still parse — the bridge treats a missing `envelope` as "unknown" and the UI renders without chips.
- `source` + `action` kept alongside `envelope.author` for one release cycle; UI prefers `envelope.author` when present.

### Pending (`pending.json`)

Each pending item carries the full envelope alongside its `question` / `draft` so the operator's moderation UI can render the same chrome as the transcript:

```json
{
  "id": "pend-xyz",
  "session_id": "a3f1c0b9e2d4",
  "msg_id": "m-a1",
  "envelope": { "...": "full canonical envelope..." },
  "question": "...",
  "draft": "...",
  "created_at": "2026-04-21T..."
}
```

### Sessions index (`sessions.json`)

No schema change. The dashboard computes "latest turn envelope" per session by tailing the transcript; no duplicate state kept on the session record.

## Testing strategy

Bridge (Vitest, existing convention):

- `envelope-normalize.ts` unit: every defaulting rule, `context`→`refs` mapping, `author` derivation by transport kind.
- `claude-code-ask.ts` integration: envelope round-trips through ask/draft/answer for agent mode and manual mode; mode-flip-midflight; timeout emits system `author.kind=system` with `state=timeout`.
- `pending.json` schema: full envelope survives write+read; backwards-compat shim reads legacy rows without `envelope`.
- Legacy-replay test: a transcript fixture with mixed pre-/post-envelope events parses without error.

MCP package:

- Tool schema: `openclaw_say` accepts and passes new optional fields; omitting them still works.
- Context-to-refs mapping: `{file, selection, stack}` attached via `context` produces typed `refs[]` in the bridge.

Dashboard:

- A-lite rendering visual smoke: sample session with all 8 intents / 6 states / 8 artifacts displays without overflow.
- Dedupe-dimming logic: consecutive turns with identical intent+state render dimmed chips; transition turns render full emphasis.
- Escalation card: appears only when latest turn is `decide+blocked`; three buttons behave per spec; auto-switch toggle persists.

End-to-end smoke: one `openclaw_say` with full envelope from a real IDE round-trips and the dashboard shows the expected chrome.

## Deliverables checklist (phase 1)

- [ ] `packages/types`: add `Envelope`, `Intent`, `State`, `Artifact`, `Priority`, `Ref`, `Author` types.
- [ ] Bridge: new `envelope.ts` service with normalize/derive helpers and unit tests.
- [ ] Bridge: `claude-code-ask.ts` stores envelope on transcript events and threads it through pending.
- [ ] Bridge: `author` derivation wired into all four sources (ide / agent / operator / system).
- [ ] MCP `packages/mcp-openclaw`: `openclaw_say` input schema gains optional envelope fields; `context`→`refs` mapper preserved.
- [ ] Dashboard: transcript component renders A-lite chrome, dedupe-dimming, refs row, author gutter.
- [ ] Dashboard: escalation card on the right rail with the three actions + per-session auto-switch toggle.
- [ ] Dashboard: sidebar badge for sessions needing a decision.
- [ ] Dashboard: legacy-event fallback rendering.
- [ ] Docs: update `AGENTS.md` section "Claude Code ↔ OpenClaw" with envelope fields and principles.
- [ ] `.env.example`: no new vars for phase 1.

## Phase 2 preview (not in this spec)

Recommended ordering after phase 1 lands:

1. **Gateway-side session-prompt composition.** Move the universal protocol substrate out of the `FIRST_TURN_PREAMBLE` shim into how the gateway constructs the session's system/developer prompt when it's created under an agent. Drop the fake first-turn injection.
2. **Escalation-rule editor.** User-defined rules on the session detail page (beyond the built-in `decide+blocked`) — e.g., "escalate on `priority: urgent`", "escalate on `artifact: patch` with `author.kind: agent`".
3. **Agent-to-agent routing.** `main` asking `reviewer` (or any other gateway agent) using the same envelope, with bridge-mediated dispatch and a dashboard session type that surfaces agent-to-agent traffic alongside CC↔OC.
4. **Proactive OC→CC push + `openclaw_check_inbox`.** OC-initiated turns queued for CC's next MCP call.
5. **Cross-agent audit view.** One thread, multiple participant agents, shared envelope rendered in a single unified transcript.

## Open questions to resolve during implementation

- **Per-agent preamble storage.** Where do role preambles live — a new file per agent under `openclaw-plugin/management/agents/`, or inline in the existing agents config at the gateway? Decide when the universal preamble migrates off the first-turn shim.
- **`intent_confidence` surfacing.** Internal-only in phase 1, but if UI ever shows it we need a design for "uncertain intent" chips. Defer.
- **Multi-turn `parent_msg_id` chains vs flat threads.** Phase 1 treats threading as a reconstruction concern; if the UI wants nested sub-threads, revisit the render pipeline.
- **Operator identity.** `operator.id = "default"` is fine for single-operator deployments. Multi-operator deferred.

## Appendix — example exchange

A grounded walkthrough of two turns:

**CC turn (blocked on a decision):**

```jsonc
// wire:
{
  "message": "Auth middleware refactor: extract timing-safe comparison into a helper, or keep it inline? Both pass tests.",
  "intent": "decide",
  "state": "blocked",
  "artifact": "question",
  "refs": [
    { "kind": "file", "path": "apps/bridge/src/auth.ts", "range": "L12-L38", "relation": "source_of_truth" }
  ]
}

// canonical after bridge normalization:
{
  "msg_id": "m-8f3c1a7b22d0",
  "parent_msg_id": null,
  "author": { "kind": "ide", "id": "claude-code" },  // assigned from the MCP request's `ide` field
  "intent": "decide",
  "state": "blocked",
  "artifact": "question",
  "priority": "normal",
  "refs": [ { "kind": "file", "path": "apps/bridge/src/auth.ts", "range": "L12-L38", "relation": "source_of_truth" } ],
  "message": "Auth middleware refactor: extract timing-safe comparison into a helper, or keep it inline? Both pass tests."
}
```

Dashboard renders:
- state=blocked chip at full emphasis, color=warn.
- intent=decide chip subdued.
- artifact=question outlined tag.
- One ref chip: `auth.ts L12-L38`.
- Escalation card appears on the right rail because `decide + blocked`.

**OC turn (delivers the decision):**

```jsonc
// wire:
{
  "message": "Extract the helper. You already have two call-sites and a third is likely once the plugin layer lands.",
  "intent": "decide",
  "state": "done",
  "artifact": "decision",
  "parent_msg_id": "m-8f3c1a7b22d0"
}

// canonical after bridge normalization:
{
  "msg_id": "m-0b2cf1e19348",
  "parent_msg_id": "m-8f3c1a7b22d0",
  "author": { "kind": "agent", "id": "claude-code" }, // gateway agent hosting the CC↔OC session
  "intent": "decide",
  "state": "done",
  "artifact": "decision",
  "priority": "normal",
  "refs": [],
  "message": "Extract the helper. You already have two call-sites and a third is likely once the plugin layer lands."
}
```

Dashboard renders:
- state=done chip with ok-muted color + thin transition rule above (state changed from blocked to done).
- artifact=decision tag visible.
- Intent chip dimmed (repeats prior turn's intent).
- No refs.
- Escalation card clears.
