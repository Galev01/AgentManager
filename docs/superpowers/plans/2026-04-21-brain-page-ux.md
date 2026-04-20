# Brain Page UX + Global Brain — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the manager-only v1 of the brain-page redesign: vault-backed global brain, consolidated per-person dossier, log→facts promote, per-person + global injection previews, and a searchable people table.

**Architecture:** Global brain lives at `Brain/WhatsApp.md` in the existing Obsidian vault. A new parser mirrors `packages/brain/src/schema.ts`. The bridge exposes it at `GET/PATCH /brain/agent`; a file watcher emits `brain_agent_changed` on external edits. Per-person + global previews are pure functions rendering the exact system prompt the agent would see — no runtime enforcement in this repo (that lives in the OpenClaw gateway, phase 2).

**Tech Stack:** TypeScript, pnpm monorepo (`packages/types`, `packages/brain`, `apps/bridge`, `apps/dashboard`), Express routes, Next.js App Router dashboard, existing `useBridgeEvents` WebSocket pipe, Node built-in `fs` + `fs/promises`, `fs.watch` for the vault.

**Spec:** `docs/superpowers/specs/2026-04-21-brain-page-ux-design.md`

---

## File structure (created / modified)

```
packages/types/src/index.ts                               MODIFY  + GlobalBrain, GlobalBrainUpdate, BrainInjectionPreview; extend BrainPersonSummary, BridgeEvent
packages/brain/src/paths.ts                               MODIFY  + globalBrainDir, globalBrainFile
packages/brain/src/global-schema.ts                       CREATE  parseGlobalBrain, serializeGlobalBrain, applyGlobalUpdate
packages/brain/src/global.ts                              CREATE  createGlobalBrainClient + atomicWrite
packages/brain/src/watcher.ts                             MODIFY  add onGlobalBrainChange
packages/brain/src/preview.ts                             CREATE  renderInjectionPreview (pure)
packages/brain/src/index.ts                               MODIFY  re-export new surface
packages/brain/test/global-parse.test.ts                  CREATE  unit tests for parse+write
packages/brain/test/preview.test.ts                       CREATE  unit tests for renderInjectionPreview

apps/bridge/src/services/brain.ts                         MODIFY  init global client + expose accessors + emit WS events
apps/bridge/src/routes/brain.ts                           MODIFY  new /brain/agent, /agent/preview, /people/:phone/preview, /log/:index/promote routes + enrich list
apps/bridge/src/ws.ts                                     MODIFY  forward brain_agent_changed events
apps/bridge/test/brain-global.test.ts                     CREATE  GET/PATCH round-trip, WS event
apps/bridge/test/brain-agent-preview.test.ts              CREATE  global-only ordering
apps/bridge/test/brain-person-preview.test.ts             CREATE  merged ordering + curses
apps/bridge/test/brain-log-promote.test.ts                CREATE  promote each target, stale 409, duplicate unchanged
apps/bridge/test/brain-people-list.test.ts                CREATE  enriched summary fields

apps/dashboard/src/lib/bridge-client.ts                   MODIFY  + getGlobalBrain, updateGlobalBrain, getAgentPreview, getPersonPreview, promoteLog
apps/dashboard/src/app/api/brain/agent/route.ts           CREATE  proxy GET/PATCH
apps/dashboard/src/app/api/brain/agent/preview/route.ts   CREATE  proxy GET
apps/dashboard/src/app/api/brain/people/[phone]/preview/route.ts  CREATE  proxy GET
apps/dashboard/src/app/api/brain/people/[phone]/log/[index]/promote/route.ts  CREATE  proxy POST
apps/dashboard/src/app/brain/agent/page.tsx               CREATE  /brain/agent page
apps/dashboard/src/components/brain-collapsible-card.tsx  CREATE  shared card
apps/dashboard/src/components/brain-injection-preview.tsx CREATE  shared preview renderer
apps/dashboard/src/components/brain-log-line.tsx          CREATE  log line + Promote dropdown
apps/dashboard/src/components/brain-global-editor.tsx     CREATE  editor for /brain/agent
apps/dashboard/src/components/brain-person-detail.tsx     MODIFY  rewrite into consolidated dossier
apps/dashboard/src/components/brain-people-table.tsx      MODIFY  add toolbar + new columns
apps/dashboard/src/components/app-shell.tsx               MODIFY  sidebar: Global brain entry
```

`docs/superpowers/specs/2026-04-21-brain-page-ux-design.md` is already on master (`b52444c`). No schema migration needed.

---

## Group 1 — Types foundation

### Task 1: Add types for global brain + preview, extend summary + bridge events

**Files:**
- Modify: `packages/types/src/index.ts`

- [ ] **Step 1: Extend `BrainPersonSummary`**

Find `BrainPersonSummary` and add three optional fields:

```ts
export type BrainPersonSummary = {
  // ... existing fields
  unreadCount?: number;
  lastMessageSnippet?: string | null;
  lastMessageAt?: number | null;
};
```

`lastMessageAt` is a unix ms number (matches `ConversationRow.lastRemoteAt`).

- [ ] **Step 2: Append new exports at the bottom of `packages/types/src/index.ts`**

```ts
export interface GlobalBrain {
  persona: string;
  hardRules: string[];
  globalFacts: string[];
  toneStyle: string;
  doNotSay: string[];
  defaultGoals: string[];
  parseWarning?: string | null;
  updatedAt?: string | null;
}

export type GlobalBrainUpdate = Partial<Omit<GlobalBrain, "parseWarning" | "updatedAt">>;

export interface BrainInjectionPreview {
  system: string;
  breakdown: Array<{
    source: "global" | "person" | "curses";
    label: string;
    text: string;
  }>;
}
```

- [ ] **Step 3: Extend `BridgeEvent` union with `brain_agent_changed`**

Locate the `BridgeEvent` type (the union used by `useBridgeEvents`). Add:

```ts
| { type: "brain_agent_changed"; payload: { updatedAt: string } }
```

If the existing union is structured differently (e.g. a discriminated enum of `type` strings), add `brain_agent_changed` the same way the existing `brain_person_changed` member is shaped.

- [ ] **Step 4: Build types package**

Run: `pnpm --filter @openclaw-manager/types build`
Expected: succeeds, no TS errors.

- [ ] **Step 5: Commit**

```bash
git add packages/types/src/index.ts
git commit -m "feat(types): GlobalBrain + BrainInjectionPreview + enriched BrainPersonSummary"
```

---

## Group 2 — `packages/brain`: parser, writer, client, watcher, preview

### Task 2: Global-brain paths

**Files:**
- Modify: `packages/brain/src/paths.ts`

- [ ] **Step 1: Add `brainDir` + `globalBrainFile` to `BrainPaths`**

```ts
import path from "node:path";

export type BrainPaths = {
  vaultRoot: string;
  peopleDir: string;
  brainDir: string;
  globalBrainFile: string;
};

export function resolveBrainPaths(vaultRoot: string): BrainPaths {
  const brainDir = path.join(vaultRoot, "Brain");
  return {
    vaultRoot,
    peopleDir: path.join(vaultRoot, "People"),
    brainDir,
    globalBrainFile: path.join(brainDir, "WhatsApp.md"),
  };
}

export function personFilePath(peopleDir: string, phone: string): string {
  return path.join(peopleDir, `${phone}.md`);
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/brain/src/paths.ts
git commit -m "feat(brain): add brainDir + globalBrainFile to BrainPaths"
```

---

### Task 3: `parseGlobalBrain` + tests (TDD)

**Files:**
- Create: `packages/brain/src/global-schema.ts`
- Create: `packages/brain/test/global-parse.test.ts`

- [ ] **Step 1: Write failing test for round-trip**

Create `packages/brain/test/global-parse.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseGlobalBrain, serializeGlobalBrain } from "../src/global-schema.js";
import type { GlobalBrain } from "@openclaw-manager/types";

const sample: GlobalBrain = {
  persona: "Hebrew-first, terse, first-person bot for Acme.",
  hardRules: ["Never promise delivery dates.", "Decline pricing pre-qualification."],
  globalFacts: ["Company: Acme.", "Hours: Sun–Thu 09–18."],
  toneStyle: "No emojis, short paragraphs, no corporate voice.",
  doNotSay: ["lowest price", "money back guarantee"],
  defaultGoals: ["qualify leads", "book intro calls"],
};

describe("parseGlobalBrain", () => {
  it("round-trips through serialize + parse", () => {
    const raw = serializeGlobalBrain(sample);
    const parsed = parseGlobalBrain(raw);
    expect(parsed.persona).toBe(sample.persona);
    expect(parsed.hardRules).toEqual(sample.hardRules);
    expect(parsed.globalFacts).toEqual(sample.globalFacts);
    expect(parsed.toneStyle).toBe(sample.toneStyle);
    expect(parsed.doNotSay).toEqual(sample.doNotSay);
    expect(parsed.defaultGoals).toEqual(sample.defaultGoals);
    expect(parsed.parseWarning ?? null).toBeNull();
  });

  it("tolerates sections in any order", () => {
    const raw = [
      "---",
      "kind: brain",
      "agent: whatsapp",
      "---",
      "",
      "# Default Goals",
      "- qualify",
      "",
      "# Persona",
      "One line persona.",
      "",
      "# Hard Rules",
      "- rule",
    ].join("\n");
    const parsed = parseGlobalBrain(raw);
    expect(parsed.persona).toBe("One line persona.");
    expect(parsed.hardRules).toEqual(["rule"]);
    expect(parsed.defaultGoals).toEqual(["qualify"]);
  });

  it("fills empty sections with empty strings/arrays", () => {
    const parsed = parseGlobalBrain("---\nkind: brain\n---\n");
    expect(parsed.persona).toBe("");
    expect(parsed.hardRules).toEqual([]);
    expect(parsed.doNotSay).toEqual([]);
  });

  it("sets parseWarning on missing frontmatter", () => {
    const parsed = parseGlobalBrain("# Persona\nhello\n");
    expect(parsed.parseWarning).toBe("no-frontmatter");
    expect(parsed.persona).toBe("hello");
  });
});
```

- [ ] **Step 2: Run test — verify failure**

Run: `pnpm --filter @openclaw-manager/brain test`
Expected: FAIL — module `../src/global-schema.js` not found.

- [ ] **Step 3: Implement `parseGlobalBrain` + `serializeGlobalBrain`**

Create `packages/brain/src/global-schema.ts`. Reuse the frontmatter splitter/parser from `schema.ts` by mimicking its patterns (do NOT import private helpers — duplicate the small helpers for clarity). Code:

```ts
import type { GlobalBrain, GlobalBrainUpdate } from "@openclaw-manager/types";

const SECTION_ORDER = [
  "Persona",
  "Hard Rules",
  "Global Facts",
  "Tone / Style",
  "Do Not Say",
  "Default Goals",
] as const;
type SectionName = typeof SECTION_ORDER[number];

function splitFrontmatter(raw: string): { fmBlock: string; body: string; warning: string | null } {
  const normalized = raw.replace(/\r\n/g, "\n");
  if (!normalized.startsWith("---\n")) {
    return { fmBlock: "", body: normalized, warning: "no-frontmatter" };
  }
  const end = normalized.indexOf("\n---", 4);
  if (end === -1) return { fmBlock: "", body: normalized, warning: "unterminated-frontmatter" };
  const fmBlock = normalized.slice(4, end);
  const afterDash = normalized.indexOf("\n", end + 4);
  const body = afterDash === -1 ? "" : normalized.slice(afterDash + 1);
  return { fmBlock, body, warning: null };
}

function parseFrontmatter(fmBlock: string): { fm: Record<string, string>; warning: string | null } {
  const fm: Record<string, string> = {};
  if (!fmBlock.trim()) return { fm, warning: null };
  for (const line of fmBlock.split("\n")) {
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const colon = line.indexOf(":");
    if (colon === -1) continue;
    const key = line.slice(0, colon).trim();
    const rest = line.slice(colon + 1).trim();
    if (key) fm[key] = rest;
  }
  return { fm, warning: null };
}

function parseSections(body: string): Record<SectionName, string[]> {
  const sections: Record<SectionName, string[]> = {
    "Persona": [],
    "Hard Rules": [],
    "Global Facts": [],
    "Tone / Style": [],
    "Do Not Say": [],
    "Default Goals": [],
  };
  let current: SectionName | null = null;
  for (const line of body.split("\n")) {
    const m = line.match(/^#\s+(.+?)\s*$/);
    if (m) {
      const name = m[1] as SectionName;
      if ((SECTION_ORDER as readonly string[]).includes(name)) {
        current = name;
        continue;
      }
    }
    if (current !== null) sections[current].push(line);
  }
  return sections;
}

function bulletLines(lines: string[]): string[] {
  const items: string[] = [];
  for (const raw of lines) {
    const m = raw.match(/^\s*-\s+(.*)$/);
    if (m) items.push(m[1].trim());
  }
  return items;
}

function paragraphText(lines: string[]): string {
  return lines.join("\n").replace(/^\s+|\s+$/g, "");
}

export function parseGlobalBrain(raw: string): GlobalBrain {
  const { fmBlock, body, warning: fmWarn } = splitFrontmatter(raw);
  const { fm } = parseFrontmatter(fmBlock);
  const sections = parseSections(body);
  return {
    persona: paragraphText(sections["Persona"]),
    hardRules: bulletLines(sections["Hard Rules"]),
    globalFacts: bulletLines(sections["Global Facts"]),
    toneStyle: paragraphText(sections["Tone / Style"]),
    doNotSay: bulletLines(sections["Do Not Say"]),
    defaultGoals: bulletLines(sections["Default Goals"]),
    parseWarning: fmWarn,
    updatedAt: fm.updated || null,
  };
}

function bulletBlock(items: string[]): string {
  if (items.length === 0) return "";
  return items.map((item) => `- ${item}`).join("\n");
}

export function serializeGlobalBrain(brain: GlobalBrain, now: string = new Date().toISOString()): string {
  const fm: string[] = [
    "---",
    "kind: brain",
    "agent: whatsapp",
    `updated: ${now}`,
    "---",
  ];
  const sections = [
    `# Persona\n${brain.persona.trim()}`,
    `# Hard Rules\n${bulletBlock(brain.hardRules)}`,
    `# Global Facts\n${bulletBlock(brain.globalFacts)}`,
    `# Tone / Style\n${brain.toneStyle.trim()}`,
    `# Do Not Say\n${bulletBlock(brain.doNotSay)}`,
    `# Default Goals\n${bulletBlock(brain.defaultGoals)}`,
  ];
  return fm.join("\n") + "\n\n" + sections.join("\n\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
}

export function applyGlobalUpdate(brain: GlobalBrain, update: GlobalBrainUpdate): GlobalBrain {
  return {
    ...brain,
    persona: update.persona ?? brain.persona,
    hardRules: update.hardRules ?? brain.hardRules,
    globalFacts: update.globalFacts ?? brain.globalFacts,
    toneStyle: update.toneStyle ?? brain.toneStyle,
    doNotSay: update.doNotSay ?? brain.doNotSay,
    defaultGoals: update.defaultGoals ?? brain.defaultGoals,
  };
}
```

- [ ] **Step 4: Run test — verify pass**

Run: `pnpm --filter @openclaw-manager/brain test`
Expected: all 4 cases pass.

- [ ] **Step 5: Commit**

```bash
git add packages/brain/src/global-schema.ts packages/brain/test/global-parse.test.ts
git commit -m "feat(brain): parseGlobalBrain + serializeGlobalBrain with tests"
```

---

### Task 4: `createGlobalBrainClient` with atomic write

**Files:**
- Create: `packages/brain/src/global.ts`

- [ ] **Step 1: Write the client**

```ts
import fs from "node:fs/promises";
import path from "node:path";
import type { GlobalBrain, GlobalBrainUpdate } from "@openclaw-manager/types";
import type { BrainPaths } from "./paths.js";
import { parseGlobalBrain, serializeGlobalBrain, applyGlobalUpdate } from "./global-schema.js";

export type GlobalBrainClient = {
  paths: BrainPaths;
  ensureLayout(): Promise<void>;
  get(): Promise<GlobalBrain>;
  update(update: GlobalBrainUpdate): Promise<GlobalBrain>;
};

async function atomicWrite(filePath: string, content: string): Promise<void> {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  const tmp = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  await fs.writeFile(tmp, content, "utf8");
  await fs.rename(tmp, filePath);
}

function emptyBrain(): GlobalBrain {
  return {
    persona: "",
    hardRules: [],
    globalFacts: [],
    toneStyle: "",
    doNotSay: [],
    defaultGoals: [],
    parseWarning: null,
    updatedAt: null,
  };
}

export function createGlobalBrainClient(paths: BrainPaths): GlobalBrainClient {
  async function ensureLayout(): Promise<void> {
    await fs.mkdir(paths.brainDir, { recursive: true });
  }

  async function get(): Promise<GlobalBrain> {
    try {
      const raw = await fs.readFile(paths.globalBrainFile, "utf8");
      return parseGlobalBrain(raw);
    } catch (err: any) {
      if (err && err.code === "ENOENT") return emptyBrain();
      throw err;
    }
  }

  async function update(upd: GlobalBrainUpdate): Promise<GlobalBrain> {
    await ensureLayout();
    const current = await get();
    const merged = applyGlobalUpdate(current, upd);
    const now = new Date().toISOString();
    const content = serializeGlobalBrain(merged, now);
    await atomicWrite(paths.globalBrainFile, content);
    return { ...merged, parseWarning: null, updatedAt: now };
  }

  return { paths, ensureLayout, get, update };
}
```

- [ ] **Step 2: Build brain package**

Run: `pnpm --filter @openclaw-manager/brain build`
Expected: success.

- [ ] **Step 3: Commit**

```bash
git add packages/brain/src/global.ts
git commit -m "feat(brain): createGlobalBrainClient with atomic write"
```

---

### Task 5: Extend watcher for Brain/WhatsApp.md

**Files:**
- Modify: `packages/brain/src/watcher.ts`

- [ ] **Step 1: Add parallel watcher for `brainDir`**

Change signature to expose a global-brain listener. Add at the bottom of `watcher.ts`:

```ts
export type GlobalBrainChangeEvent = { kind: "changed" | "removed" };

type GlobalListener = (event: GlobalBrainChangeEvent) => void;

// (at the top of the existing BrainWatcher type, add:)
export type BrainWatcher = {
  start(): void;
  stop(): void;
  onChange(listener: Listener): () => void;
  onGlobalChange(listener: GlobalListener): () => void;
};
```

Inside `createBrainWatcher`, add a second `fs.watch` on `paths.brainDir` that fires only for `WhatsApp.md`:

```ts
const globalListeners: GlobalListener[] = [];
let globalWatcher: fs.FSWatcher | null = null;
let globalDebounce: ReturnType<typeof setTimeout> | null = null;

function emitGlobal(event: GlobalBrainChangeEvent): void {
  for (const l of globalListeners) {
    try { l(event); } catch { /* ignore */ }
  }
}

function scheduleGlobal(kind: "changed" | "removed"): void {
  if (globalDebounce) clearTimeout(globalDebounce);
  globalDebounce = setTimeout(() => {
    globalDebounce = null;
    emitGlobal({ kind });
  }, 150);
}
```

In the existing `start()` function, after the people-dir watcher setup, add:

```ts
try {
  fs.mkdirSync(paths.brainDir, { recursive: true });
} catch { /* ignore */ }
try {
  globalWatcher = fs.watch(paths.brainDir, { persistent: false }, (_event, filename) => {
    if (!filename) return;
    const name = typeof filename === "string" ? filename : String(filename);
    if (name !== "WhatsApp.md") return;
    const full = path.join(paths.brainDir, name);
    fs.access(full, fs.constants.F_OK, (err) => {
      scheduleGlobal(err ? "removed" : "changed");
    });
  });
  globalWatcher.on("error", () => { /* swallow */ });
} catch {
  globalWatcher = null;
}
```

In `stop()`:

```ts
if (globalWatcher) {
  try { globalWatcher.close(); } catch { /* ignore */ }
  globalWatcher = null;
}
if (globalDebounce) { clearTimeout(globalDebounce); globalDebounce = null; }
```

And expose `onGlobalChange`:

```ts
function onGlobalChange(listener: GlobalListener): () => void {
  globalListeners.push(listener);
  return () => {
    const idx = globalListeners.indexOf(listener);
    if (idx >= 0) globalListeners.splice(idx, 1);
  };
}

return { start, stop, onChange, onGlobalChange };
```

- [ ] **Step 2: Build**

Run: `pnpm --filter @openclaw-manager/brain build`
Expected: success.

- [ ] **Step 3: Commit**

```bash
git add packages/brain/src/watcher.ts
git commit -m "feat(brain): watcher emits onGlobalChange for Brain/WhatsApp.md"
```

---

### Task 6: `renderInjectionPreview` pure function + tests (TDD)

**Files:**
- Create: `packages/brain/src/preview.ts`
- Create: `packages/brain/test/preview.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect } from "vitest";
import { renderInjectionPreview } from "../src/preview.js";
import type { BrainPerson, GlobalBrain } from "@openclaw-manager/types";

function makeBrain(overrides: Partial<GlobalBrain> = {}): GlobalBrain {
  return {
    persona: "p", hardRules: ["hr"], globalFacts: ["gf"], toneStyle: "ts",
    doNotSay: ["dns"], defaultGoals: ["dg"], parseWarning: null, updatedAt: null,
    ...overrides,
  };
}

function makePerson(overrides: Partial<BrainPerson> = {}): BrainPerson {
  return {
    phone: "972500000000", jid: null, name: "X", aliases: [], tags: [],
    relationship: null, language: null, status: "active", created: null, lastSeen: null,
    summary: "s", facts: ["f"], preferences: ["pr"], openThreads: ["ot"],
    notes: "", log: [], cursing: false, cursingRate: 70, curses: [],
    raw: "", parseWarning: null,
    ...overrides,
  };
}

describe("renderInjectionPreview", () => {
  it("global-only produces chunks in spec order", () => {
    const out = renderInjectionPreview({ brain: makeBrain() });
    const sources = out.breakdown.map((c) => `${c.source}:${c.label}`);
    expect(sources).toEqual([
      "global:persona",
      "global:hardRules",
      "global:globalFacts",
      "global:toneStyle",
      "global:doNotSay",
      "global:defaultGoals",
    ]);
  });

  it("merged preview appends person chunks in order", () => {
    const out = renderInjectionPreview({ brain: makeBrain(), person: makePerson() });
    const sources = out.breakdown.map((c) => `${c.source}:${c.label}`);
    expect(sources).toEqual([
      "global:persona","global:hardRules","global:globalFacts","global:toneStyle","global:doNotSay","global:defaultGoals",
      "person:summary","person:facts","person:preferences","person:openThreads",
    ]);
  });

  it("curses:rate appears iff cursing is on", () => {
    const off = renderInjectionPreview({ brain: makeBrain(), person: makePerson({ cursing: false }) });
    expect(off.breakdown.some((c) => c.source === "curses")).toBe(false);
    const on = renderInjectionPreview({ brain: makeBrain(), person: makePerson({ cursing: true, curses: ["nope"] }) });
    expect(on.breakdown.at(-1)).toMatchObject({ source: "curses", label: "rate" });
  });

  it("skips empty global chunks", () => {
    const out = renderInjectionPreview({ brain: makeBrain({ hardRules: [], doNotSay: [] }) });
    const labels = out.breakdown.map((c) => c.label);
    expect(labels).not.toContain("hardRules");
    expect(labels).not.toContain("doNotSay");
  });

  it("breakdown.source is exactly global | person | curses", () => {
    const out = renderInjectionPreview({ brain: makeBrain(), person: makePerson({ cursing: true, curses: ["x"] }) });
    for (const c of out.breakdown) {
      expect(["global","person","curses"]).toContain(c.source);
    }
  });
});
```

- [ ] **Step 2: Run — verify failure**

Run: `pnpm --filter @openclaw-manager/brain test`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement renderer**

```ts
import type { BrainInjectionPreview, BrainPerson, GlobalBrain } from "@openclaw-manager/types";

type Chunk = BrainInjectionPreview["breakdown"][number];

function list(label: string, source: Chunk["source"], items: string[]): Chunk | null {
  if (items.length === 0) return null;
  return { source, label, text: items.map((i) => `- ${i}`).join("\n") };
}

function para(label: string, source: Chunk["source"], text: string): Chunk | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  return { source, label, text: trimmed };
}

export function renderInjectionPreview(input: { brain: GlobalBrain; person?: BrainPerson }): BrainInjectionPreview {
  const chunks: Chunk[] = [];
  const push = (c: Chunk | null) => { if (c) chunks.push(c); };

  const { brain, person } = input;
  push(para("persona", "global", brain.persona));
  push(list("hardRules", "global", brain.hardRules));
  push(list("globalFacts", "global", brain.globalFacts));
  push(para("toneStyle", "global", brain.toneStyle));
  push(list("doNotSay", "global", brain.doNotSay));
  push(list("defaultGoals", "global", brain.defaultGoals));

  if (person) {
    push(para("summary", "person", person.summary));
    push(list("facts", "person", person.facts));
    push(list("preferences", "person", person.preferences));
    push(list("openThreads", "person", person.openThreads));
    if (person.cursing === true && person.curses.length > 0) {
      push({
        source: "curses",
        label: "rate",
        text: `When replying to this contact, pick one of the following lines at random ${person.cursingRate ?? 70}% of the time:\n${person.curses.map((c) => `- ${c}`).join("\n")}`,
      });
    }
  }

  const system = chunks.map((c) => c.text).join("\n\n");
  return { system, breakdown: chunks };
}
```

- [ ] **Step 4: Run — verify pass**

Run: `pnpm --filter @openclaw-manager/brain test`
Expected: 5 preview tests pass (plus prior parse tests).

- [ ] **Step 5: Commit**

```bash
git add packages/brain/src/preview.ts packages/brain/test/preview.test.ts
git commit -m "feat(brain): renderInjectionPreview with ordering tests"
```

---

### Task 7: Export new surface from `packages/brain/src/index.ts`

**Files:**
- Modify: `packages/brain/src/index.ts`

- [ ] **Step 1: Add exports**

Append:

```ts
export {
  parseGlobalBrain,
  serializeGlobalBrain,
  applyGlobalUpdate,
} from "./global-schema.js";
export {
  createGlobalBrainClient,
  type GlobalBrainClient,
} from "./global.js";
export {
  renderInjectionPreview,
} from "./preview.js";
export type { GlobalBrainChangeEvent } from "./watcher.js";
```

- [ ] **Step 2: Build + test**

Run: `pnpm --filter @openclaw-manager/brain build && pnpm --filter @openclaw-manager/brain test`
Expected: both pass.

- [ ] **Step 3: Commit**

```bash
git add packages/brain/src/index.ts
git commit -m "feat(brain): export global-brain + preview surface"
```

---

## Group 3 — `apps/bridge`: service wiring + routes + integration tests

### Task 8: Global-brain service wiring

**Files:**
- Modify: `apps/bridge/src/services/brain.ts`

- [ ] **Step 1: Extend the existing service**

At the top, add imports:

```ts
import {
  createGlobalBrainClient,
  type GlobalBrainClient,
  type GlobalBrainChangeEvent,
} from "@openclaw-manager/brain";
```

Below the existing `client`, `watcher`, `listeners` module state, add:

```ts
let globalClient: GlobalBrainClient | null = null;
type GlobalChangeListener = (event: GlobalBrainChangeEvent) => void;
const globalListeners: GlobalChangeListener[] = [];
```

Inside `init()`, right after `watcher = createBrainWatcher(client.paths);`, before `watcher.start();`:

```ts
globalClient = createGlobalBrainClient(client.paths);
void globalClient.ensureLayout();
watcher.onGlobalChange((event) => {
  for (const l of globalListeners) {
    try { l(event); } catch { /* ignore */ }
  }
});
```

At the bottom of the file export:

```ts
export function getGlobalBrainClient(): GlobalBrainClient {
  if (!globalClient) throw new Error("Brain vault not configured (set BRAIN_VAULT_PATH)");
  return globalClient;
}

export function onGlobalBrainChange(listener: GlobalChangeListener): () => void {
  globalListeners.push(listener);
  return () => {
    const idx = globalListeners.indexOf(listener);
    if (idx >= 0) globalListeners.splice(idx, 1);
  };
}
```

- [ ] **Step 2: Build bridge**

Run: `pnpm --filter @openclaw-manager/bridge build`
Expected: success.

- [ ] **Step 3: Commit**

```bash
git add apps/bridge/src/services/brain.ts
git commit -m "feat(bridge): global-brain service init + onGlobalBrainChange listeners"
```

---

### Task 9: WS wiring — forward `brain_agent_changed`

**Files:**
- Modify: `apps/bridge/src/ws.ts`

- [ ] **Step 1: Subscribe to global changes, emit WS event**

Find the existing block that forwards `brain_person_changed` / `brain_person_removed`. Alongside it, import and wire the global change listener. Add near the top:

```ts
import { onBrainChange, onGlobalBrainChange } from "./services/brain.js";
```

(If `onBrainChange` is already imported, just append `onGlobalBrainChange`.)

Next to the existing person-change forwarder, add:

```ts
onGlobalBrainChange((event) => {
  broadcast({
    type: "brain_agent_changed",
    payload: { updatedAt: new Date().toISOString(), kind: event.kind },
  });
});
```

Use whatever local function name is used today to broadcast to connected WS clients — match the existing pattern for person changes.

- [ ] **Step 2: Commit**

```bash
git add apps/bridge/src/ws.ts
git commit -m "feat(bridge): forward brain_agent_changed on global-brain file changes"
```

---

### Task 10: `GET/PATCH /brain/agent` + integration test (TDD)

**Files:**
- Modify: `apps/bridge/src/routes/brain.ts`
- Create: `apps/bridge/test/brain-global.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/bridge/test/brain-global.test.ts`. Match the shape of the existing `brain-cursing-rate.test.ts` — use the same vitest + supertest harness (or native http caller) it uses; reuse its test-vault setup. Key cases:

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { makeTestApp, withTempVault } from "./helpers.js"; // if helpers.ts exists — otherwise inline the setup like brain-cursing-rate.test.ts does

describe("GET/PATCH /brain/agent", () => {
  it("returns empty brain when file is missing", async () => {
    await withTempVault(async ({ request }) => {
      const res = await request.get("/brain/agent");
      expect(res.status).toBe(200);
      expect(res.body.persona).toBe("");
      expect(res.body.hardRules).toEqual([]);
    });
  });

  it("PATCH persists fields and round-trips via GET", async () => {
    await withTempVault(async ({ request }) => {
      await request.patch("/brain/agent").send({ persona: "hi", hardRules: ["r1"] });
      const res = await request.get("/brain/agent");
      expect(res.body.persona).toBe("hi");
      expect(res.body.hardRules).toEqual(["r1"]);
    });
  });
});
```

If `apps/bridge/test` has no helpers module, inline the setup by reading how `brain-cursing-rate.test.ts` constructs the bridge + vault and copying that setup here.

- [ ] **Step 2: Run — verify failure**

Run: `pnpm --filter @openclaw-manager/bridge test -- brain-global`
Expected: FAIL — no routes registered for `/brain/agent`.

- [ ] **Step 3: Implement the routes**

In `apps/bridge/src/routes/brain.ts`, add imports + routes:

```ts
import { getGlobalBrainClient, getBrainClient, isBrainEnabled } from "../services/brain.js";
import type { GlobalBrainUpdate } from "@openclaw-manager/types";
```

Add before `export default router;`:

```ts
router.get("/brain/agent", async (_req, res) => {
  if (!ensureEnabled(res)) return;
  try {
    const brain = await getGlobalBrainClient().get();
    res.json(brain);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.patch("/brain/agent", async (req, res) => {
  if (!ensureEnabled(res)) return;
  const body = req.body ?? {};
  const update: GlobalBrainUpdate = {};
  if (typeof body.persona === "string") update.persona = body.persona;
  if (typeof body.toneStyle === "string") update.toneStyle = body.toneStyle;
  if (Array.isArray(body.hardRules)) update.hardRules = body.hardRules.map(String);
  if (Array.isArray(body.globalFacts)) update.globalFacts = body.globalFacts.map(String);
  if (Array.isArray(body.doNotSay)) update.doNotSay = body.doNotSay.map(String);
  if (Array.isArray(body.defaultGoals)) update.defaultGoals = body.defaultGoals.map(String);
  try {
    const brain = await getGlobalBrainClient().update(update);
    res.json(brain);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});
```

- [ ] **Step 4: Run tests — verify pass**

Run: `pnpm --filter @openclaw-manager/bridge test -- brain-global`
Expected: both tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/bridge/src/routes/brain.ts apps/bridge/test/brain-global.test.ts
git commit -m "feat(bridge): GET/PATCH /brain/agent + round-trip test"
```

---

### Task 11: `GET /brain/agent/preview` + test

**Files:**
- Modify: `apps/bridge/src/routes/brain.ts`
- Create: `apps/bridge/test/brain-agent-preview.test.ts`

- [ ] **Step 1: Write the failing test**

Fields to assert: response has `system` string and `breakdown` array; every breakdown entry has `source === "global"`; labels in order `persona, hardRules, globalFacts, toneStyle, doNotSay, defaultGoals` (skipping empty ones).

- [ ] **Step 2: Run — verify failure**

Run: `pnpm --filter @openclaw-manager/bridge test -- brain-agent-preview`

- [ ] **Step 3: Implement the route**

In `apps/bridge/src/routes/brain.ts`:

```ts
import { renderInjectionPreview } from "@openclaw-manager/brain";

router.get("/brain/agent/preview", async (_req, res) => {
  if (!ensureEnabled(res)) return;
  try {
    const brain = await getGlobalBrainClient().get();
    const preview = renderInjectionPreview({ brain });
    res.json(preview);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});
```

- [ ] **Step 4: Run — verify pass**

- [ ] **Step 5: Commit**

```bash
git add apps/bridge/src/routes/brain.ts apps/bridge/test/brain-agent-preview.test.ts
git commit -m "feat(bridge): GET /brain/agent/preview"
```

---

### Task 12: `GET /brain/people/:phone/preview` + test

**Files:**
- Modify: `apps/bridge/src/routes/brain.ts`
- Create: `apps/bridge/test/brain-person-preview.test.ts`

- [ ] **Step 1: Write the failing test**

Cases:

- Known phone, global + person populated: breakdown contains `global:*` chunks then `person:summary, person:facts, person:preferences, person:openThreads`.
- Cursing off: no `curses:*` entries.
- Cursing on with at least one curse line: last breakdown entry has `source: "curses"` and `label: "rate"`.
- Unknown phone → 404.

- [ ] **Step 2: Run — verify failure**

- [ ] **Step 3: Implement**

```ts
router.get("/brain/people/:phone/preview", async (req, res) => {
  if (!ensureEnabled(res)) return;
  try {
    const brainClient = getBrainClient();
    const person = await brainClient.getPerson(req.params.phone);
    if (!person) { res.status(404).json({ error: "Not found" }); return; }
    const brain = await getGlobalBrainClient().get();
    res.json(renderInjectionPreview({ brain, person }));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});
```

- [ ] **Step 4: Run — verify pass**

- [ ] **Step 5: Commit**

```bash
git add apps/bridge/src/routes/brain.ts apps/bridge/test/brain-person-preview.test.ts
git commit -m "feat(bridge): GET /brain/people/:phone/preview"
```

---

### Task 13: `POST /brain/people/:phone/log/:index/promote` + test

**Files:**
- Modify: `apps/bridge/src/routes/brain.ts`
- Create: `apps/bridge/test/brain-log-promote.test.ts`

- [ ] **Step 1: Write the failing test**

Cases:

- Promote to each of `facts`, `preferences`, `openThreads` — verify the target array now contains the log line.
- Duplicate promote (target already contains verbatim line) → response `{ unchanged: true }`, status 200; target array not duplicated.
- Stale index (index points outside `log[]` or `log[index] !== expectedText` if the body supplies `expectedText`) → status 409 with `{ error: /log entry moved or changed/ }`.
- Unknown phone → 404.
- Bad `target` value → 400.

Test body:

```ts
const res = await request
  .post(`/brain/people/${phone}/log/0/promote`)
  .send({ target: "facts" });
expect(res.status).toBe(201);
```

Include one test where the server-side promote is done twice with the same target to confirm `unchanged: true` behavior.

- [ ] **Step 2: Run — verify failure**

- [ ] **Step 3: Implement**

```ts
router.post("/brain/people/:phone/log/:index/promote", async (req, res) => {
  if (!ensureEnabled(res)) return;
  const target = req.body?.target;
  if (target !== "facts" && target !== "preferences" && target !== "openThreads") {
    res.status(400).json({ error: "target must be facts | preferences | openThreads" });
    return;
  }
  const idx = Number(req.params.index);
  if (!Number.isInteger(idx) || idx < 0) {
    res.status(400).json({ error: "index must be a non-negative integer" });
    return;
  }
  try {
    const brainClient = getBrainClient();
    const person = await brainClient.getPerson(req.params.phone);
    if (!person) { res.status(404).json({ error: "Not found" }); return; }
    const line = person.log[idx];
    if (typeof line !== "string") {
      res.status(409).json({ error: "log entry moved or changed; refresh and retry" });
      return;
    }
    const list = person[target as "facts" | "preferences" | "openThreads"];
    if (list.includes(line)) {
      res.status(200).json({ unchanged: true, person });
      return;
    }
    const update: Record<string, string[]> = {};
    update[target] = [...list, line];
    const updated = await brainClient.updatePerson(req.params.phone, update as any);
    res.status(201).json({ unchanged: false, person: updated });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});
```

- [ ] **Step 4: Run — verify pass**

- [ ] **Step 5: Commit**

```bash
git add apps/bridge/src/routes/brain.ts apps/bridge/test/brain-log-promote.test.ts
git commit -m "feat(bridge): POST /brain/people/:phone/log/:index/promote"
```

---

### Task 14: Enrich `GET /brain/people` with `unreadCount`, `lastMessageSnippet`, `lastMessageAt`

**Files:**
- Modify: `apps/bridge/src/routes/brain.ts`
- Create: `apps/bridge/test/brain-people-list.test.ts`

- [ ] **Step 1: Locate the conversations data source**

The bridge already exposes `/conversations` backed by `ConversationRow` (`packages/types/src/index.ts`). Find the internal service file the existing `/conversations` route calls (search for `handler` / `getConversations` in `apps/bridge/src/routes/conversations.ts`). Reuse the same in-process function — do not fetch HTTP back to self.

- [ ] **Step 2: Write failing test**

```ts
it("GET /brain/people includes unreadCount, snippet, lastMessageAt", async () => {
  // seed vault with a person and seed conversation store with a few inbound messages
  // then:
  const res = await request.get("/brain/people");
  const me = res.body.find((p: any) => p.phone === seededPhone);
  expect(me.unreadCount).toBeGreaterThanOrEqual(0);
  expect(typeof me.lastMessageAt === "number" || me.lastMessageAt === null).toBe(true);
  expect(typeof me.lastMessageSnippet === "string" || me.lastMessageSnippet === null).toBe(true);
});
```

The exact seeding depends on how `brain-cursing-rate.test.ts` and the conversation-store test helpers work — match that harness.

- [ ] **Step 3: Run — verify failure**

- [ ] **Step 4: Implement**

In `apps/bridge/src/routes/brain.ts`, change the `GET /brain/people` handler:

```ts
import { listConversations } from "../services/conversations.js"; // or equivalent — match what /conversations uses

router.get("/brain/people", async (_req, res) => {
  if (!ensureEnabled(res)) return;
  try {
    const [people, convos] = await Promise.all([
      getBrainClient().listPeople(),
      listConversations().catch(() => [] as Array<import("@openclaw-manager/types").ConversationRow>),
    ]);
    const byPhone = new Map(convos.map((c) => [c.phone, c]));
    const enriched = people.map((p) => {
      const c = byPhone.get(p.phone);
      if (!c) return { ...p, unreadCount: 0, lastMessageSnippet: null, lastMessageAt: null };
      const unreadCount = computeUnread(c); // see helper below
      return {
        ...p,
        unreadCount,
        lastMessageSnippet: truncate(c.lastRemoteContent, 30),
        lastMessageAt: c.lastRemoteAt,
      };
    });
    res.json(enriched);
  } catch (err) {
    res.status(503).json({ error: `Failed to list people: ${String(err)}` });
  }
});

function computeUnread(c: import("@openclaw-manager/types").ConversationRow): number {
  // Proxy: 1 if last remote message is newer than the last outbound (agent or human), else 0.
  // Good enough for v1 — a numeric count requires walking events per conversation which is expensive in this list path.
  const lastOut = Math.max(c.lastAgentReplyAt ?? 0, c.lastHumanReplyAt ?? 0);
  const lastIn = c.lastRemoteAt ?? 0;
  return lastIn > lastOut ? 1 : 0;
}

function truncate(s: string | null, max: number): string | null {
  if (!s) return null;
  if (s.length <= max) return s;
  return s.slice(0, max - 1).trimEnd() + "…";
}
```

If the import path `../services/conversations.js` is wrong, open `apps/bridge/src/routes/conversations.ts` and adopt whatever helper or inline query it uses.

- [ ] **Step 5: Run — verify pass**

Run: `pnpm --filter @openclaw-manager/bridge test -- brain-people-list`

- [ ] **Step 6: Commit**

```bash
git add apps/bridge/src/routes/brain.ts apps/bridge/test/brain-people-list.test.ts
git commit -m "feat(bridge): enrich /brain/people with unreadCount + snippet + lastMessageAt"
```

---

## Group 4 — Dashboard bridge-client + Next API proxies

### Task 15: Extend `apps/dashboard/src/lib/bridge-client.ts`

**Files:**
- Modify: `apps/dashboard/src/lib/bridge-client.ts`

- [ ] **Step 1: Add helpers**

Append (using whatever helper `bridgeFetch` is called today — match existing style):

```ts
import type { GlobalBrain, GlobalBrainUpdate, BrainInjectionPreview, BrainPerson } from "@openclaw-manager/types";

export async function getGlobalBrain(): Promise<GlobalBrain> {
  return bridgeFetch<GlobalBrain>("/brain/agent");
}
export async function updateGlobalBrain(update: GlobalBrainUpdate): Promise<GlobalBrain> {
  return bridgeFetch<GlobalBrain>("/brain/agent", { method: "PATCH", body: JSON.stringify(update) });
}
export async function getAgentPreview(): Promise<BrainInjectionPreview> {
  return bridgeFetch<BrainInjectionPreview>("/brain/agent/preview");
}
export async function getPersonPreview(phone: string): Promise<BrainInjectionPreview> {
  return bridgeFetch<BrainInjectionPreview>(`/brain/people/${encodeURIComponent(phone)}/preview`);
}
export async function promoteLog(
  phone: string,
  index: number,
  target: "facts" | "preferences" | "openThreads",
): Promise<{ unchanged: boolean; person: BrainPerson }> {
  return bridgeFetch(`/brain/people/${encodeURIComponent(phone)}/log/${index}/promote`, {
    method: "POST",
    body: JSON.stringify({ target }),
  });
}
```

If `bridgeFetch` needs explicit `Content-Type`, match how the existing `createBrainPerson` POST wrapper sets headers.

- [ ] **Step 2: Typecheck dashboard**

Run: `pnpm --filter @openclaw-manager/dashboard typecheck`
Expected: success.

- [ ] **Step 3: Commit**

```bash
git add apps/dashboard/src/lib/bridge-client.ts
git commit -m "feat(dashboard): bridge-client helpers for global brain + preview + promote"
```

---

### Task 16: Next API route `/api/brain/agent` (GET + PATCH proxy)

**Files:**
- Create: `apps/dashboard/src/app/api/brain/agent/route.ts`

- [ ] **Step 1: Write the route**

```ts
import { NextResponse } from "next/server";
import { getGlobalBrain, updateGlobalBrain } from "@/lib/bridge-client";
import { isAuthenticated } from "@/lib/session";

export async function GET() {
  const authed = await isAuthenticated();
  if (!authed) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return NextResponse.json(await getGlobalBrain());
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed" }, { status: 502 });
  }
}

export async function PATCH(request: Request) {
  const authed = await isAuthenticated();
  if (!authed) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await request.json();
    return NextResponse.json(await updateGlobalBrain(body));
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed" }, { status: 502 });
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/dashboard/src/app/api/brain/agent/route.ts
git commit -m "feat(dashboard): /api/brain/agent GET+PATCH proxy"
```

---

### Task 17: Next API route `/api/brain/agent/preview`

**Files:**
- Create: `apps/dashboard/src/app/api/brain/agent/preview/route.ts`

- [ ] **Step 1: Write the route**

```ts
import { NextResponse } from "next/server";
import { getAgentPreview } from "@/lib/bridge-client";
import { isAuthenticated } from "@/lib/session";

export async function GET() {
  const authed = await isAuthenticated();
  if (!authed) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return NextResponse.json(await getAgentPreview());
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed" }, { status: 502 });
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/dashboard/src/app/api/brain/agent/preview/route.ts
git commit -m "feat(dashboard): /api/brain/agent/preview proxy"
```

---

### Task 18: Next API route `/api/brain/people/[phone]/preview`

**Files:**
- Create: `apps/dashboard/src/app/api/brain/people/[phone]/preview/route.ts`

- [ ] **Step 1: Write the route**

```ts
import { NextResponse } from "next/server";
import { getPersonPreview } from "@/lib/bridge-client";
import { isAuthenticated } from "@/lib/session";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ phone: string }> },
) {
  const authed = await isAuthenticated();
  if (!authed) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { phone } = await params;
  try {
    return NextResponse.json(await getPersonPreview(decodeURIComponent(phone)));
  } catch (err: any) {
    const status = /not found/i.test(err.message || "") ? 404 : 502;
    return NextResponse.json({ error: err.message || "Failed" }, { status });
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/dashboard/src/app/api/brain/people/[phone]/preview/route.ts
git commit -m "feat(dashboard): /api/brain/people/[phone]/preview proxy"
```

---

### Task 19: Next API route `/api/brain/people/[phone]/log/[index]/promote`

**Files:**
- Create: `apps/dashboard/src/app/api/brain/people/[phone]/log/[index]/promote/route.ts`

- [ ] **Step 1: Write the route**

```ts
import { NextResponse } from "next/server";
import { promoteLog } from "@/lib/bridge-client";
import { isAuthenticated } from "@/lib/session";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ phone: string; index: string }> },
) {
  const authed = await isAuthenticated();
  if (!authed) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { phone, index } = await params;
  const body = await request.json().catch(() => ({}));
  const target = body.target;
  if (target !== "facts" && target !== "preferences" && target !== "openThreads") {
    return NextResponse.json({ error: "target invalid" }, { status: 400 });
  }
  try {
    const result = await promoteLog(decodeURIComponent(phone), Number(index), target);
    return NextResponse.json(result);
  } catch (err: any) {
    const msg: string = err.message || "Failed";
    if (/moved or changed/i.test(msg)) return NextResponse.json({ error: msg }, { status: 409 });
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/dashboard/src/app/api/brain/people/[phone]/log/[index]/promote/route.ts
git commit -m "feat(dashboard): /api/brain/people/[phone]/log/[index]/promote proxy"
```

---

## Group 5 — Dashboard shared components

### Task 20: `CollapsibleCard`

**Files:**
- Create: `apps/dashboard/src/components/brain-collapsible-card.tsx`

- [ ] **Step 1: Write component**

```tsx
"use client";

import { useEffect, useState, type ReactNode } from "react";

export function CollapsibleCard({
  title,
  storageKey,
  defaultOpen = true,
  hint,
  actions,
  children,
}: {
  title: string;
  storageKey?: string;
  defaultOpen?: boolean;
  hint?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  useEffect(() => {
    if (!storageKey || typeof window === "undefined") return;
    const raw = window.localStorage.getItem(storageKey);
    if (raw === "open") setOpen(true);
    else if (raw === "closed") setOpen(false);
  }, [storageKey]);

  function toggle() {
    setOpen((cur) => {
      const next = !cur;
      if (storageKey) window.localStorage.setItem(storageKey, next ? "open" : "closed");
      return next;
    });
  }

  return (
    <section className="rounded-lg border border-zinc-700 bg-zinc-800">
      <header className="flex items-center gap-3 border-b border-zinc-700 px-5 py-3">
        <button
          type="button"
          onClick={toggle}
          className="flex items-center gap-2 text-sm font-semibold text-zinc-100 hover:text-white"
        >
          <span className={`inline-block transition-transform ${open ? "rotate-90" : ""}`}>▸</span>
          {title}
        </button>
        {hint && <span className="text-xs text-zinc-500">{hint}</span>}
        <div className="flex-1" />
        {actions}
      </header>
      {open && <div className="px-5 py-4">{children}</div>}
    </section>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/dashboard/src/components/brain-collapsible-card.tsx
git commit -m "feat(dashboard): CollapsibleCard with localStorage persistence"
```

---

### Task 21: `InjectionPreview`

**Files:**
- Create: `apps/dashboard/src/components/brain-injection-preview.tsx`

- [ ] **Step 1: Write component**

```tsx
"use client";

import { useState } from "react";
import type { BrainInjectionPreview } from "@openclaw-manager/types";

const SOURCE_CLASS: Record<string, string> = {
  global: "bg-blue-900/40 text-blue-200 border-blue-800",
  person: "bg-emerald-900/40 text-emerald-200 border-emerald-800",
  curses: "bg-pink-900/40 text-pink-200 border-pink-800",
};

export function InjectionPreview({
  load,
}: {
  load: () => Promise<BrainInjectionPreview>;
}) {
  const [data, setData] = useState<BrainInjectionPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    setError(null);
    try { setData(await load()); }
    catch (err: any) { setError(err.message); }
    finally { setLoading(false); }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <button
          onClick={refresh}
          disabled={loading}
          className="rounded bg-zinc-700 px-3 py-1 text-xs text-zinc-100 hover:bg-zinc-600 disabled:opacity-50"
        >
          {loading ? "Loading…" : data ? "Refresh" : "Load preview"}
        </button>
        {error && <span className="text-xs text-red-300">{error}</span>}
      </div>
      {data && (
        <div className="space-y-2">
          {data.breakdown.map((c, i) => (
            <div key={i} className="rounded border border-zinc-700 bg-zinc-900 p-3">
              <div className="mb-1 flex items-center gap-2">
                <span className={`rounded border px-1.5 py-0.5 text-[10px] uppercase tracking-wider ${SOURCE_CLASS[c.source] ?? ""}`}>
                  {c.source}:{c.label}
                </span>
              </div>
              <pre className="whitespace-pre-wrap break-words text-xs text-zinc-300 font-mono leading-relaxed">{c.text}</pre>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/dashboard/src/components/brain-injection-preview.tsx
git commit -m "feat(dashboard): InjectionPreview component"
```

---

### Task 22: `LogLineWithPromote`

**Files:**
- Create: `apps/dashboard/src/components/brain-log-line.tsx`

- [ ] **Step 1: Write component**

```tsx
"use client";

import { useState } from "react";

type Target = "facts" | "preferences" | "openThreads";

export function LogLineWithPromote({
  line,
  onPromote,
}: {
  line: string;
  onPromote: (target: Target) => Promise<{ unchanged: boolean }>;
}) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  async function go(target: Target) {
    setBusy(true);
    setMsg(null);
    try {
      const r = await onPromote(target);
      setMsg(r.unchanged ? `already in ${target}` : `added to ${target}`);
      setOpen(false);
    } catch (err: any) {
      setMsg(err.message || "failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="group flex items-start gap-2 font-mono text-xs text-zinc-300 leading-relaxed">
      <span className="flex-1">{line}</span>
      <div className="relative shrink-0">
        <button
          onClick={() => setOpen((v) => !v)}
          disabled={busy}
          className="rounded px-2 py-0.5 text-[11px] text-zinc-400 opacity-0 transition group-hover:opacity-100 hover:bg-zinc-700 disabled:opacity-50"
        >
          Promote ▾
        </button>
        {open && (
          <div className="absolute right-0 top-full z-10 mt-1 min-w-[140px] rounded border border-zinc-600 bg-zinc-800 shadow-lg">
            {(["facts", "preferences", "openThreads"] as const).map((t) => (
              <button key={t} onClick={() => go(t)} disabled={busy}
                className="block w-full px-3 py-1.5 text-left text-xs text-zinc-200 hover:bg-zinc-700 disabled:opacity-50">
                {t}
              </button>
            ))}
          </div>
        )}
        {msg && <span className="ml-2 text-[11px] text-zinc-500">{msg}</span>}
      </div>
    </li>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/dashboard/src/components/brain-log-line.tsx
git commit -m "feat(dashboard): LogLineWithPromote"
```

---

## Group 6 — `/brain/agent` page

### Task 23: `GlobalBrainEditor` component

**Files:**
- Create: `apps/dashboard/src/components/brain-global-editor.tsx`

- [ ] **Step 1: Write component**

Port the line-editor + sticky save/discard pattern from `brain-person-detail.tsx`, adapted to `GlobalBrain`. The six sections: Persona (textarea), Hard Rules (newline-delimited), Global Facts (newline-delimited), Tone / Style (textarea), Do Not Say (newline-delimited), Default Goals (newline-delimited). Accepts `initial: GlobalBrain` and an `onSaved(newBrain)` callback. Uses `useBridgeEvents` to detect external `brain_agent_changed` events and shows the existing "note changed on disk" banner pattern when local edits are dirty. Posts via `fetch("/api/brain/agent", { method: "PATCH", body })`.

Detailed contract:

```tsx
"use client";

import { useEffect, useState } from "react";
import { useBridgeEvents } from "@/lib/ws-client";
import type { GlobalBrain, GlobalBrainUpdate } from "@openclaw-manager/types";

type EditorState = {
  persona: string;
  hardRules: string;     // newline-delimited
  globalFacts: string;   // newline-delimited
  toneStyle: string;
  doNotSay: string;      // newline-delimited
  defaultGoals: string;  // newline-delimited
};

function toEditor(b: GlobalBrain): EditorState {
  return {
    persona: b.persona,
    hardRules: b.hardRules.join("\n"),
    globalFacts: b.globalFacts.join("\n"),
    toneStyle: b.toneStyle,
    doNotSay: b.doNotSay.join("\n"),
    defaultGoals: b.defaultGoals.join("\n"),
  };
}

function toUpdate(e: EditorState): GlobalBrainUpdate {
  const split = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean);
  return {
    persona: e.persona,
    hardRules: split(e.hardRules),
    globalFacts: split(e.globalFacts),
    toneStyle: e.toneStyle,
    doNotSay: split(e.doNotSay),
    defaultGoals: split(e.defaultGoals),
  };
}

export function GlobalBrainEditor({
  initial,
  onSaved,
}: {
  initial: GlobalBrain;
  onSaved?: (next: GlobalBrain) => void;
}) {
  const [server, setServer] = useState<GlobalBrain>(initial);
  const [edit, setEdit] = useState<EditorState>(() => toEditor(initial));
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);

  useEffect(() => {
    setServer(initial);
    setEdit(toEditor(initial));
    setDirty(false);
  }, [initial]);

  useBridgeEvents((msg) => {
    if (msg.type !== "brain_agent_changed") return;
    void (async () => {
      try {
        const res = await fetch("/api/brain/agent", { cache: "no-store" });
        if (!res.ok) return;
        const fresh: GlobalBrain = await res.json();
        setServer(fresh);
        if (!dirty) setEdit(toEditor(fresh));
        else setBanner("Global brain changed on disk — your edits are kept. Click Save to overwrite.");
      } catch { /* ignore */ }
    })();
  });

  function update<K extends keyof EditorState>(k: K, v: EditorState[K]) {
    setEdit((p) => ({ ...p, [k]: v }));
    setDirty(true);
    setBanner(null);
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/brain/agent", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(toUpdate(edit)),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Save failed");
      const fresh: GlobalBrain = await res.json();
      setServer(fresh);
      setEdit(toEditor(fresh));
      setDirty(false);
      setBanner(null);
      onSaved?.(fresh);
    } catch (err: any) { setError(err.message); }
    finally { setSaving(false); }
  }

  function handleDiscard() { setEdit(toEditor(server)); setDirty(false); setBanner(null); }

  const inputClass = "w-full rounded border border-zinc-600 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:border-blue-500 focus:outline-none";
  const textareaClass = inputClass + " font-mono leading-relaxed";

  return (
    <div className="space-y-4">
      {error && <div className="rounded border border-red-700 bg-red-900/30 px-4 py-3 text-sm text-red-300">{error}</div>}
      {banner && <div className="rounded border border-yellow-700 bg-yellow-900/20 px-4 py-3 text-sm text-yellow-200">{banner}</div>}
      {server.parseWarning && (
        <div className="rounded border border-orange-700 bg-orange-900/20 px-4 py-3 text-sm text-orange-200">
          Note had a parsing issue: <code className="font-mono">{server.parseWarning}</code>. Displaying best-effort data.
        </div>
      )}

      <Section label="Persona"><textarea rows={3} className={textareaClass} value={edit.persona} onChange={(e) => update("persona", e.target.value)} /></Section>
      <Section label="Hard Rules" hint="One per line."><textarea rows={5} className={textareaClass} value={edit.hardRules} onChange={(e) => update("hardRules", e.target.value)} /></Section>
      <Section label="Global Facts" hint="One per line."><textarea rows={5} className={textareaClass} value={edit.globalFacts} onChange={(e) => update("globalFacts", e.target.value)} /></Section>
      <Section label="Tone / Style"><textarea rows={3} className={textareaClass} value={edit.toneStyle} onChange={(e) => update("toneStyle", e.target.value)} /></Section>
      <Section label="Do Not Say" hint="One phrase per line. Runtime filter lives in the gateway (phase 2); this file is the source of truth for the phrases."><textarea rows={5} className={textareaClass} value={edit.doNotSay} onChange={(e) => update("doNotSay", e.target.value)} /></Section>
      <Section label="Default Goals" hint="One per line."><textarea rows={4} className={textareaClass} value={edit.defaultGoals} onChange={(e) => update("defaultGoals", e.target.value)} /></Section>

      <div className="sticky bottom-4 flex items-center gap-3 rounded-lg border border-zinc-700 bg-zinc-800/95 px-4 py-3 backdrop-blur">
        <span className="text-xs text-zinc-400">{dirty ? "Unsaved changes" : "All saved"}</span>
        <div className="flex-1" />
        <button onClick={handleDiscard} disabled={!dirty || saving} className="rounded px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-700 disabled:opacity-50">Discard</button>
        <button onClick={handleSave} disabled={!dirty || saving} className="rounded bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50">{saving ? "Saving…" : "Save"}</button>
      </div>
    </div>
  );
}

function Section({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs uppercase tracking-wider text-zinc-400">{label}</span>
      {hint && <span className="mb-2 block text-xs text-zinc-500">{hint}</span>}
      {children}
    </label>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/dashboard/src/components/brain-global-editor.tsx
git commit -m "feat(dashboard): GlobalBrainEditor"
```

---

### Task 24: `/brain/agent` page

**Files:**
- Create: `apps/dashboard/src/app/brain/agent/page.tsx`

- [ ] **Step 1: Write page**

```tsx
import { AppShell } from "@/components/app-shell";
import { DegradedBanner } from "@/components/degraded-banner";
import { GlobalBrainEditor } from "@/components/brain-global-editor";
import { CollapsibleCard } from "@/components/brain-collapsible-card";
import { InjectionPreview } from "@/components/brain-injection-preview";
import { getGlobalBrain, getBrainStatus } from "@/lib/bridge-client";
import type { GlobalBrain } from "@openclaw-manager/types";

export const dynamic = "force-dynamic";
export const metadata = { title: "Brain · Global" };

export default async function BrainAgentPage() {
  let brain: GlobalBrain | null = null;
  let enabled = false;
  let bridgeError = false;

  try {
    const status = await getBrainStatus();
    enabled = status.enabled;
  } catch { bridgeError = true; }

  if (enabled) {
    try { brain = await getGlobalBrain(); } catch { bridgeError = true; }
  }

  return (
    <AppShell title="Brain · Global">
      <div className="mx-auto max-w-3xl space-y-6">
        {bridgeError && <DegradedBanner />}
        <div>
          <h1 className="text-2xl font-semibold text-zinc-100">WhatsApp agent — global brain</h1>
          <p className="mt-1 text-sm text-zinc-400">
            Lives at <code className="font-mono">Brain/WhatsApp.md</code> in your Obsidian vault. The gateway reads this file before per-person context on every reply. Runtime enforcement of Do-Not-Say / kill-switch / silent-mode is a phase-2 gateway change.
          </p>
        </div>

        {!enabled && !bridgeError && (
          <div className="rounded border border-yellow-700 bg-yellow-900/20 px-4 py-3 text-sm text-yellow-200">
            Brain vault is not configured. Set <code className="font-mono">BRAIN_VAULT_PATH</code> in the bridge's <code className="font-mono">.env</code> and restart.
          </div>
        )}

        {enabled && brain && (
          <>
            <GlobalBrainEditor initial={brain} />
            <CollapsibleCard title="Injection preview" storageKey="brain.agent.preview" defaultOpen={false} hint="What every reply prompt starts with.">
              <InjectionPreviewLoader />
            </CollapsibleCard>
          </>
        )}
      </div>
    </AppShell>
  );
}

// Client wrapper so the server page can still be a server component
function InjectionPreviewLoader() {
  return <InjectionPreview load={async () => {
    const r = await fetch("/api/brain/agent/preview", { cache: "no-store" });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "Failed");
    return r.json();
  }} />;
}
```

If `InjectionPreview` needs to be a client component and the wrapper as shown won't compile inside a server component page, extract the wrapper into its own file with `"use client";` at the top.

- [ ] **Step 2: Commit**

```bash
git add apps/dashboard/src/app/brain/agent/page.tsx
git commit -m "feat(dashboard): /brain/agent page with editor + preview"
```

---

### Task 25: Sidebar nav entry

**Files:**
- Modify: `apps/dashboard/src/components/app-shell.tsx` (or wherever the sidebar is rendered — grep for the existing `/brain/people` link and add next to it)

- [ ] **Step 1: Add "Global brain" link**

Add a nav entry `href="/brain/agent"` labelled `Global brain` adjacent to the existing `Brain · People` entry. Match the existing nav-item component signature.

- [ ] **Step 2: Commit**

```bash
git add apps/dashboard/src/components/app-shell.tsx
git commit -m "feat(dashboard): sidebar entry for Global brain"
```

---

## Group 7 — `/brain/people/:phone` consolidated dossier

### Task 26: Refactor `brain-person-detail.tsx` header + card layout

**Files:**
- Modify: `apps/dashboard/src/components/brain-person-detail.tsx`

- [ ] **Step 1: Wrap existing sections in `CollapsibleCard`s**

Keep all existing editor state + Save/Discard logic intact. Replace the current `<Section>` renderings with `CollapsibleCard` wrappers. Structure (top to bottom):

1. **Header strip** — render identity fields (Name, Phone readonly, Relationship, Language, Status select, Last seen) outside any card — flat block.
2. **Global brain snapshot** — `CollapsibleCard title="Global brain" defaultOpen={false} storageKey={\`brain.collapsed.${person.phone}.global\`}` — render 1-line persona preview from a new fetch `GET /api/brain/agent` (cache inside the component), plus a `<Link href="/brain/agent">Edit global →</Link>`.
3. **Person brain** — `CollapsibleCard title="Person brain" defaultOpen={true} storageKey={...person}` — wraps existing Summary / Facts / Preferences / Open Threads / Notes / Curses editors unchanged.
4. **Injection preview** — `CollapsibleCard title="Injection preview" defaultOpen={false} storageKey={...preview}` — uses `InjectionPreview` with `load={() => fetch("/api/brain/people/"+phone+"/preview").then(...)}`
5. **Recent chat** — `CollapsibleCard title="Recent chat" defaultOpen={true} storageKey={...chat}` — Task 27 below.
6. **Log** — `CollapsibleCard title="Log" defaultOpen={true} storageKey={...log}` — Task 28 below.

Keep the sticky Save/Discard bar (with its dirty indicator) at the page bottom. `localStorage` keys use `brain.collapsed.<phone>.<section>`.

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @openclaw-manager/dashboard typecheck`
Expected: success.

- [ ] **Step 3: Commit**

```bash
git add apps/dashboard/src/components/brain-person-detail.tsx
git commit -m "feat(dashboard): dossier layout with CollapsibleCard sections"
```

---

### Task 27: Recent-chat card

**Files:**
- Modify: `apps/dashboard/src/components/brain-person-detail.tsx`

- [ ] **Step 1: Add chat preview state + fetch**

Inside `BrainPersonDetail`, add:

```tsx
const [events, setEvents] = useState<ConversationEvent[] | null>(null);
useEffect(() => {
  let cancelled = false;
  async function load() {
    try {
      // The conversationKey for a phone is the JID when available, else the phone
      const key = person.jid || person.phone;
      const res = await fetch(`/api/messages?conversationKey=${encodeURIComponent(key)}&limit=20`, { cache: "no-store" });
      if (!cancelled && res.ok) setEvents(await res.json());
    } catch { /* ignore */ }
  }
  void load();
  return () => { cancelled = true; };
}, [person.phone, person.jid]);
```

Open `apps/dashboard/src/app/api/messages` (or wherever the current dashboard fetches messages for `/conversations/:key`) to confirm the exact query-param shape; adjust accordingly. If there's no direct route, add a thin `/api/messages` proxy that calls `getMessages(key, limit)` from `bridge-client`.

Render inside the "Recent chat" `CollapsibleCard`:

```tsx
<div className="space-y-2">
  {events === null && <div className="text-xs text-zinc-500">Loading…</div>}
  {events && events.length === 0 && <div className="text-xs text-zinc-500">No messages yet.</div>}
  {events?.map((e) => (
    <div key={e.id} className={`rounded-lg px-3 py-2 text-sm ${e.actor === "user" ? "bg-zinc-900 text-zinc-200" : "bg-blue-900/30 text-blue-100 ml-8"}`}>
      <div className="mb-0.5 text-[11px] uppercase tracking-wider text-zinc-500">{e.actor} · {new Date(e.at).toLocaleString()}</div>
      <div className="whitespace-pre-wrap">{e.text || "(no text)"}</div>
    </div>
  ))}
  <a href={`/conversations/${encodeURIComponent(person.jid || person.phone)}`} className="block pt-2 text-xs text-blue-400 hover:text-blue-300">Open full thread →</a>
</div>
```

- [ ] **Step 2: Commit**

```bash
git add apps/dashboard/src/components/brain-person-detail.tsx
git commit -m "feat(dashboard): recent-chat card on person dossier"
```

---

### Task 28: Log with `LogLineWithPromote`

**Files:**
- Modify: `apps/dashboard/src/components/brain-person-detail.tsx`

- [ ] **Step 1: Replace the existing log `<ul>` markup**

Where the existing code does:

```tsx
<ul className="mt-4 space-y-1.5 text-sm text-zinc-200">
  {logReversed.map((entry, i) => (
    <li key={i} className="font-mono text-xs text-zinc-300 leading-relaxed">{entry}</li>
  ))}
</ul>
```

Replace with:

```tsx
import { LogLineWithPromote } from "./brain-log-line";
import { promoteLog } from "@/lib/bridge-client";
// note: logReversed gives items in reverse order. For promote, use the original index in person.log.

<ul className="mt-4 space-y-1.5 text-sm text-zinc-200">
  {person.log.map((entry, i) => (
    <LogLineWithPromote
      key={i}
      line={entry}
      onPromote={async (target) => {
        const res = await fetch(`/api/brain/people/${encodeURIComponent(person.phone)}/log/${i}/promote`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ target }),
        });
        if (!res.ok) {
          const err = (await res.json().catch(() => ({}))).error || "Failed";
          throw new Error(err);
        }
        const data = await res.json();
        if (data.person) { setPerson(data.person); setEdit(toEditor(data.person)); }
        return { unchanged: !!data.unchanged };
      }}
    />
  ))}
</ul>
```

Keep the "append new log entry" input underneath unchanged. Note the switch from `logReversed` to `person.log` — display the log in append order so the index passed to the API matches. If you prefer reverse display, compute the correct server-side index from the reversed view index: `const originalIndex = person.log.length - 1 - displayIndex;`.

- [ ] **Step 2: Commit**

```bash
git add apps/dashboard/src/components/brain-person-detail.tsx
git commit -m "feat(dashboard): promote button on each log line"
```

---

## Group 8 — `/brain/people` table polish

### Task 29: Toolbar — search / status filter / sort

**Files:**
- Modify: `apps/dashboard/src/components/brain-people-table.tsx`

- [ ] **Step 1: Add toolbar + filter state**

Add three pieces of state at the top of `BrainPeopleTable`:

```tsx
const [query, setQuery] = useState("");
const [status, setStatus] = useState<"all" | "active" | "archived" | "blocked">("active");
const [sortBy, setSortBy] = useState<"lastSeen" | "name" | "unread">("lastSeen");
```

Compute the filtered list before the table body (replaces direct `people.map(...)`):

```tsx
const view = useMemo(() => {
  const q = query.trim().toLowerCase();
  let list = people.filter((p) => status === "all" || p.status === status);
  if (q) {
    list = list.filter((p) =>
      (p.name || "").toLowerCase().includes(q) ||
      p.phone.toLowerCase().includes(q) ||
      (p.summary || "").toLowerCase().includes(q),
    );
  }
  list = [...list].sort((a, b) => {
    if (sortBy === "name") return (a.name || "").localeCompare(b.name || "");
    if (sortBy === "unread") return (b.unreadCount ?? 0) - (a.unreadCount ?? 0);
    return (b.lastMessageAt ?? 0) - (a.lastMessageAt ?? 0);
  });
  return list;
}, [people, query, status, sortBy]);
```

Render the toolbar above the existing table wrapper:

```tsx
<div className="flex flex-wrap items-center gap-3">
  <input
    type="text"
    placeholder="🔍 search name / phone / summary"
    value={query}
    onChange={(e) => setQuery(e.target.value)}
    className="flex-1 min-w-[240px] rounded border border-zinc-600 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:border-blue-500 focus:outline-none"
  />
  <select value={status} onChange={(e) => setStatus(e.target.value as any)} className="rounded border border-zinc-600 bg-zinc-900 px-2 py-2 text-sm text-zinc-100">
    <option value="all">All statuses</option><option value="active">Active</option><option value="archived">Archived</option><option value="blocked">Blocked</option>
  </select>
  <select value={sortBy} onChange={(e) => setSortBy(e.target.value as any)} className="rounded border border-zinc-600 bg-zinc-900 px-2 py-2 text-sm text-zinc-100">
    <option value="lastSeen">Last seen</option><option value="name">Name</option><option value="unread">Unread</option>
  </select>
</div>
```

Replace the body mapping `people.map` with `view.map`.

- [ ] **Step 2: Commit**

```bash
git add apps/dashboard/src/components/brain-people-table.tsx
git commit -m "feat(dashboard): people-table toolbar — search + status filter + sort"
```

---

### Task 30: New columns — unread badge + snippet + last-message timestamp

**Files:**
- Modify: `apps/dashboard/src/components/brain-people-table.tsx`

- [ ] **Step 1: Add new columns**

In `<thead>` replace the existing header row with:

```tsx
<tr className="border-b border-zinc-700 bg-zinc-900/50 text-left text-xs uppercase tracking-wider text-zinc-400">
  <th className="w-10 px-4 py-3"></th>
  <th className="px-4 py-3">Name</th>
  <th className="px-4 py-3">Meta</th>
  <th className="px-4 py-3">Last message</th>
  <th className="px-4 py-3">Last seen</th>
  <th className="px-4 py-3"></th>
</tr>
```

Replace the row body:

```tsx
{view.map((p) => (
  <tr key={p.phone} className="hover:bg-zinc-700/30 transition">
    <td className="px-4 py-3">
      {(p.unreadCount ?? 0) > 0 && (
        <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-600 px-1.5 text-[10px] font-semibold text-white">
          {p.unreadCount}
        </span>
      )}
    </td>
    <td className="px-4 py-3 font-medium text-zinc-100">{p.name}</td>
    <td className="px-4 py-3 text-xs text-zinc-400">
      {[p.relationship, p.language].filter(Boolean).join(" · ") || "—"}
      <div className="font-mono text-[11px] text-zinc-500">{p.phone}</div>
    </td>
    <td className="px-4 py-3 text-xs text-zinc-300 max-w-[260px] truncate">{p.lastMessageSnippet ?? "—"}</td>
    <td className="px-4 py-3 text-xs text-zinc-400">{p.lastSeen || (p.lastMessageAt ? new Date(p.lastMessageAt).toLocaleString() : "—")}</td>
    <td className="px-4 py-3 text-right">
      <Link href={`/brain/people/${encodeURIComponent(p.phone)}`} className="rounded px-3 py-1 text-xs font-semibold text-blue-400 hover:bg-blue-900/30 hover:text-blue-300 transition">
        Open
      </Link>
    </td>
  </tr>
))}
```

- [ ] **Step 2: Commit**

```bash
git add apps/dashboard/src/components/brain-people-table.tsx
git commit -m "feat(dashboard): people-table new columns — unread, snippet, last-message"
```

---

## Group 9 — Finish

### Task 31: Full-stack smoke run

**Files:**
- None (verification only)

- [ ] **Step 1: Build entire repo**

Run from repo root: `pnpm -r build`
Expected: all packages build, no TS errors.

- [ ] **Step 2: Run all tests**

Run: `pnpm -r test` (or the closest equivalent if only some packages have test scripts)
Expected: all tests pass — new `global-parse`, `preview`, `brain-global`, `brain-agent-preview`, `brain-person-preview`, `brain-log-promote`, `brain-people-list`, plus existing `brain-cursing-rate` regression.

- [ ] **Step 3: Start dev stack manually**

Run the bridge (`pnpm --filter @openclaw-manager/bridge dev`) + dashboard (`pnpm --filter @openclaw-manager/dashboard dev`). Confirm:

- `/brain/agent` loads, shows six editable sections. Save sticks. Injection preview renders in spec order.
- `/brain/people/:phone` shows the dossier with all six cards. Collapse state persists after reload.
- `/brain/people` shows toolbar + new columns; search filters rows; status selector restricts; sort toggles reorder.
- Edit `Brain/WhatsApp.md` in Obsidian → dashboard `/brain/agent` shows the "note changed on disk" banner if dirty, or auto-refreshes if not.
- Promote a log line → person's Facts section gains the line; duplicate promote shows `already in facts`.

- [ ] **Step 4: Final commit (manual QA note, if needed)**

No file changes if smoke passed. If it didn't, fix inline and commit the fix before proceeding.

---

### Task 32: Deploy

**Files:**
- None (ops).

- [ ] **Step 1: Push the finished branch to server remote**

From the worktree:

```bash
git -C "C:/Users/GalLe/Cursor projects/OpenClaw-manager/.worktrees/brain-page" push server feat/brain-page-ux
```

If Gal has been running this plan directly on `master` (as the spec commits landed), push `master` instead.

- [ ] **Step 2: Redeploy per project memory**

- Restart the Windows bridge NSSM service.
- Redeploy the CentOS dashboard (`root@192.168.0.240`) via the existing redeploy procedure.
- Run the manual QA checklist from Task 31 step 3 against the live URL.

- [ ] **Step 3: Close the plan**

Mark the plan done in `docs/superpowers/plans/2026-04-21-brain-page-ux.md` or link it from a follow-up phase-2 plan for runtime enforcement in the gateway repo.

---

## Self-review checklist for this plan

- [x] Every task names exact file paths.
- [x] Every code step shows code (no "add appropriate error handling").
- [x] Tests are written before implementation (TDD) for parser, preview, and every new bridge route.
- [x] Commits every 2–5 steps; small diffs.
- [x] No "TBD", no "implement later".
- [x] Every spec section has a task (types ← G1; global-brain file + parser + preview ← G2; routes + WS event + enriched list ← G3; dashboard APIs ← G4; shared components ← G5; /brain/agent page ← G6; dossier redesign + log promote ← G7; table polish ← G8; smoke + deploy ← G9).
- [x] Type names match across tasks (`GlobalBrain`, `BrainInjectionPreview`, `BrainPersonSummary` extensions).
- [x] Spec non-goals (runtime enforcement, pending drafts, do-not-say post-filter, kill switch) are NOT present anywhere in this plan.
