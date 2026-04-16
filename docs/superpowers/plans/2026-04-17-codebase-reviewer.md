# Codebase Reviewer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let OpenClaw review every codebase under `C:\Users\GalLe\Cursor projects` once per day as a professional product manager — producing structured markdown reports in each project, managed through a new Dashboard section with per-idea status tracking and an acknowledgment gate.

**Architecture:** Bridge-owned feature. A new `services/codebase-reviewer/*` module owns a file-based state store (`state.json`, `runs.jsonl`, `ideas.json`) under `.openclaw/extensions/codebase-reviewer/`, launches OpenClaw agent sessions scoped to each project, writes reports into `<project>/.openclaw-review/YYYY-MM-DD.md`, and exposes everything through `/reviews/*` endpoints. OpenClaw cron triggers a daily `/reviews/tick`. Dashboard gets `/reviews`, `/reviews/[id]`, `/reviews/ideas` pages.

**Tech Stack:** Express 5 + TypeScript (bridge), Next.js 15 App Router + Tailwind (dashboard), pnpm workspace, OpenClaw SDK via the existing `callGateway` wrapper, file-based JSON/JSONL state (atomic temp+rename writes).

**Reference spec:** `docs/superpowers/specs/2026-04-17-codebase-reviewer-design.md`

**Testing note:** This repo has no test framework installed. Verification uses `pnpm build` (type safety), one throwaway `tsx`-runnable parser check script, and manual HTTP/UI inspection. Don't add vitest/jest — it's out of scope and diverges from existing patterns.

---

## Task 1: Shared types

**Files:**
- Modify: `packages/types/src/index.ts`

- [ ] **Step 1: Append the reviewer types**

Append these to the end of `packages/types/src/index.ts`:

```ts
// --- Codebase Reviewer ---

export type ReviewProjectStatus =
  | "idle"
  | "queued"
  | "running"
  | "awaiting_ack"
  | "skipped"
  | "failed";

export type ReviewProject = {
  id: string;
  name: string;
  path: string;
  enabled: boolean;
  status: ReviewProjectStatus;
  discoveredAt: string;
  lastRunAt: string | null;
  lastReportPath: string | null;
  lastReportDate: string | null;
  lastAckedAt: string | null;
  eligibleAt: string | null;
  lastError: string | null;
  missing?: boolean;
};

export type ReviewerState = {
  scanRoot: string;
  projects: Record<string, ReviewProject>;
  updatedAt: string;
};

export type ReviewIdeaStatus = "pending" | "accepted" | "rejected" | "deferred";
export type ReviewIdeaImpact = "low" | "medium" | "high";
export type ReviewIdeaEffort = "S" | "M" | "L";
export type ReviewIdeaCategory =
  | "new_feature"
  | "improvement"
  | "ui_ux"
  | "tech_debt";

export type ReviewIdea = {
  id: string;
  projectId: string;
  projectName: string;
  reportDate: string;
  category: ReviewIdeaCategory;
  title: string;
  problem: string;
  solution: string;
  impact: ReviewIdeaImpact;
  effort: ReviewIdeaEffort;
  status: ReviewIdeaStatus;
  createdAt: string;
  statusChangedAt: string | null;
};

export type ReviewRunPhase = "start" | "end" | "error";

export type ReviewRun = {
  runId: string;
  projectId: string;
  trigger: "cron" | "manual";
  phase: ReviewRunPhase;
  timestamp: string;
  sessionId?: string;
  reportPath?: string;
  ideasCount?: number;
  error?: string;
  durationMs?: number;
};

export type ReviewReportSummary = {
  reportDate: string;
  reportPath: string;
  ideasCount: number;
  acked: boolean;
};

export type ReviewerWorkerState = {
  current: string | null;
  queue: string[];
};
```

- [ ] **Step 2: Build to verify type compile**

Run:
```bash
cd "c:/Users/GalLe/Cursor projects/OpenClaw-manager" && pnpm --filter @openclaw-manager/types build
```
Expected: exits 0, `packages/types/dist/index.d.ts` contains the new types.

- [ ] **Step 3: Commit**

```bash
git add packages/types/src/index.ts packages/types/dist
git commit -m "feat(types): add codebase reviewer shared types"
```

---

## Task 2: Bridge config additions

**Files:**
- Modify: `apps/bridge/src/config.ts`

- [ ] **Step 1: Add reviewer env vars + computed paths**

Edit `apps/bridge/src/config.ts`. Add the new fields inside the exported `config` object, after the `brainVaultPath` line (line 18) and before the existing getters:

```ts
  reviewerScanRoot:
    process.env.REVIEWER_SCAN_ROOT || "C:\\Users\\GalLe\\Cursor projects",
  reviewerStateDir:
    process.env.REVIEWER_STATE_DIR ||
    path.join(
      process.env.USERPROFILE || "",
      ".openclaw/workspace/.openclaw/extensions/codebase-reviewer"
    ),
  reviewerTimeoutMs: Number(process.env.REVIEWER_TIMEOUT_MS) || 600000,
  reviewerAckCooldownMs:
    Number(process.env.REVIEWER_ACK_COOLDOWN_MS) || 86400000,
  get reviewerStatePath() {
    return path.join(this.reviewerStateDir, "state.json");
  },
  get reviewerRunsPath() {
    return path.join(this.reviewerStateDir, "runs.jsonl");
  },
  get reviewerIdeasPath() {
    return path.join(this.reviewerStateDir, "ideas.json");
  },
```

- [ ] **Step 2: Build bridge to verify**

```bash
pnpm --filter bridge build
```
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add apps/bridge/src/config.ts
git commit -m "feat(bridge): add reviewer config paths and timeouts"
```

---

## Task 3: State service (`state.json` read/write)

**Files:**
- Create: `apps/bridge/src/services/codebase-reviewer/state.ts`

- [ ] **Step 1: Create the state service**

Create `apps/bridge/src/services/codebase-reviewer/state.ts`:

```ts
import fs from "node:fs/promises";
import path from "node:path";
import { config } from "../../config.js";
import type { ReviewProject, ReviewerState } from "@openclaw-manager/types";

function emptyState(): ReviewerState {
  return {
    scanRoot: config.reviewerScanRoot,
    projects: {},
    updatedAt: new Date().toISOString(),
  };
}

async function ensureDir(): Promise<void> {
  await fs.mkdir(config.reviewerStateDir, { recursive: true });
}

export async function readState(): Promise<ReviewerState> {
  try {
    const raw = await fs.readFile(config.reviewerStatePath, "utf8");
    const parsed = JSON.parse(raw) as ReviewerState;
    if (!parsed.projects) parsed.projects = {};
    if (!parsed.scanRoot) parsed.scanRoot = config.reviewerScanRoot;
    return parsed;
  } catch {
    return emptyState();
  }
}

async function writeStateAtomic(state: ReviewerState): Promise<void> {
  await ensureDir();
  state.updatedAt = new Date().toISOString();
  const tmp = config.reviewerStatePath + ".tmp";
  await fs.writeFile(tmp, JSON.stringify(state, null, 2) + "\n", "utf8");
  await fs.rename(tmp, config.reviewerStatePath);
}

export async function updateProject(
  id: string,
  patch: Partial<ReviewProject>
): Promise<ReviewProject> {
  const state = await readState();
  const existing = state.projects[id];
  if (!existing) throw new Error(`project not found: ${id}`);
  const next: ReviewProject = { ...existing, ...patch };
  state.projects[id] = next;
  await writeStateAtomic(state);
  return next;
}

export async function upsertProject(project: ReviewProject): Promise<void> {
  const state = await readState();
  state.projects[project.id] = project;
  await writeStateAtomic(state);
}

export async function replaceState(next: ReviewerState): Promise<void> {
  await writeStateAtomic(next);
}

export async function getProject(id: string): Promise<ReviewProject | null> {
  const state = await readState();
  return state.projects[id] ?? null;
}

export async function listProjects(): Promise<ReviewProject[]> {
  const state = await readState();
  return Object.values(state.projects);
}
```

- [ ] **Step 2: Build bridge to verify**

```bash
pnpm --filter bridge build
```
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add apps/bridge/src/services/codebase-reviewer/state.ts
git commit -m "feat(bridge): add reviewer state store"
```

---

## Task 4: Runs log service (`runs.jsonl`)

**Files:**
- Create: `apps/bridge/src/services/codebase-reviewer/runs.ts`

- [ ] **Step 1: Create the runs log service**

Create `apps/bridge/src/services/codebase-reviewer/runs.ts`:

```ts
import fs from "node:fs/promises";
import { config } from "../../config.js";
import type { ReviewRun } from "@openclaw-manager/types";

export async function appendRun(run: ReviewRun): Promise<void> {
  await fs.mkdir(config.reviewerStateDir, { recursive: true });
  await fs.appendFile(config.reviewerRunsPath, JSON.stringify(run) + "\n", "utf8");
}

export async function tailRuns(limit = 50): Promise<ReviewRun[]> {
  let raw: string;
  try {
    raw = await fs.readFile(config.reviewerRunsPath, "utf8");
  } catch {
    return [];
  }
  const lines = raw.split("\n").filter((l) => l.trim());
  const sliced = lines.slice(-limit);
  const out: ReviewRun[] = [];
  for (const line of sliced) {
    try {
      out.push(JSON.parse(line) as ReviewRun);
    } catch {
      // skip malformed line
    }
  }
  return out.reverse(); // newest first
}
```

- [ ] **Step 2: Build bridge to verify**

```bash
pnpm --filter bridge build
```
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add apps/bridge/src/services/codebase-reviewer/runs.ts
git commit -m "feat(bridge): add reviewer runs log"
```

---

## Task 5: Ideas service (`ideas.json`)

**Files:**
- Create: `apps/bridge/src/services/codebase-reviewer/ideas.ts`

- [ ] **Step 1: Create the ideas service**

Create `apps/bridge/src/services/codebase-reviewer/ideas.ts`:

```ts
import fs from "node:fs/promises";
import { config } from "../../config.js";
import type {
  ReviewIdea,
  ReviewIdeaStatus,
  ReviewIdeaImpact,
  ReviewIdeaEffort,
  ReviewIdeaCategory,
} from "@openclaw-manager/types";

type IdeasFile = { ideas: ReviewIdea[]; updatedAt: string };

async function ensureDir(): Promise<void> {
  await fs.mkdir(config.reviewerStateDir, { recursive: true });
}

async function readFile(): Promise<IdeasFile> {
  try {
    const raw = await fs.readFile(config.reviewerIdeasPath, "utf8");
    const parsed = JSON.parse(raw) as IdeasFile;
    if (!Array.isArray(parsed.ideas)) parsed.ideas = [];
    return parsed;
  } catch {
    return { ideas: [], updatedAt: new Date().toISOString() };
  }
}

async function writeFile(file: IdeasFile): Promise<void> {
  await ensureDir();
  file.updatedAt = new Date().toISOString();
  const tmp = config.reviewerIdeasPath + ".tmp";
  await fs.writeFile(tmp, JSON.stringify(file, null, 2) + "\n", "utf8");
  await fs.rename(tmp, config.reviewerIdeasPath);
}

export async function listIdeas(filters?: {
  projectId?: string[];
  status?: ReviewIdeaStatus[];
  impact?: ReviewIdeaImpact[];
  effort?: ReviewIdeaEffort[];
  category?: ReviewIdeaCategory[];
}): Promise<ReviewIdea[]> {
  const { ideas } = await readFile();
  return ideas.filter((idea) => {
    if (filters?.projectId?.length && !filters.projectId.includes(idea.projectId)) return false;
    if (filters?.status?.length && !filters.status.includes(idea.status)) return false;
    if (filters?.impact?.length && !filters.impact.includes(idea.impact)) return false;
    if (filters?.effort?.length && !filters.effort.includes(idea.effort)) return false;
    if (filters?.category?.length && !filters.category.includes(idea.category)) return false;
    return true;
  });
}

export async function getIdea(id: string): Promise<ReviewIdea | null> {
  const { ideas } = await readFile();
  return ideas.find((i) => i.id === id) ?? null;
}

export async function listIdeasForReport(
  projectId: string,
  reportDate: string
): Promise<ReviewIdea[]> {
  const { ideas } = await readFile();
  return ideas.filter((i) => i.projectId === projectId && i.reportDate === reportDate);
}

export async function replaceIdeasForReport(
  projectId: string,
  reportDate: string,
  next: ReviewIdea[]
): Promise<void> {
  const file = await readFile();
  file.ideas = file.ideas.filter(
    (i) => !(i.projectId === projectId && i.reportDate === reportDate)
  );
  file.ideas.push(...next);
  await writeFile(file);
}

export async function setIdeaStatus(
  id: string,
  status: ReviewIdeaStatus
): Promise<ReviewIdea> {
  const file = await readFile();
  const idea = file.ideas.find((i) => i.id === id);
  if (!idea) throw new Error(`idea not found: ${id}`);
  idea.status = status;
  idea.statusChangedAt = new Date().toISOString();
  await writeFile(file);
  return idea;
}
```

- [ ] **Step 2: Build bridge to verify**

```bash
pnpm --filter bridge build
```
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add apps/bridge/src/services/codebase-reviewer/ideas.ts
git commit -m "feat(bridge): add reviewer ideas store"
```

---

## Task 6: Project discovery

**Files:**
- Create: `apps/bridge/src/services/codebase-reviewer/discovery.ts`

- [ ] **Step 1: Create the discovery service**

Create `apps/bridge/src/services/codebase-reviewer/discovery.ts`:

```ts
import fs from "node:fs/promises";
import path from "node:path";
import { config } from "../../config.js";
import type { ReviewProject } from "@openclaw-manager/types";
import { readState, replaceState } from "./state.js";

const MANIFEST_FILES = [
  "package.json",
  "pyproject.toml",
  "pubspec.yaml",
  "Cargo.toml",
  "go.mod",
];

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function isProject(folder: string): Promise<boolean> {
  try {
    const gitDir = path.join(folder, ".git");
    const stat = await fs.stat(gitDir);
    if (stat.isDirectory()) return true;
  } catch {
    // no .git
  }
  for (const file of MANIFEST_FILES) {
    try {
      await fs.access(path.join(folder, file));
      return true;
    } catch {
      // keep checking
    }
  }
  return false;
}

export async function scanProjects(): Promise<{
  added: string[];
  missing: string[];
  total: number;
}> {
  const state = await readState();
  const existing = new Map(Object.values(state.projects).map((p) => [p.path, p]));

  let entries: string[] = [];
  try {
    const dirents = await fs.readdir(config.reviewerScanRoot, { withFileTypes: true });
    entries = dirents.filter((d) => d.isDirectory()).map((d) => d.name);
  } catch {
    entries = [];
  }

  const added: string[] = [];
  const seenPaths = new Set<string>();

  for (const name of entries) {
    const fullPath = path.join(config.reviewerScanRoot, name);
    if (!(await isProject(fullPath))) continue;
    seenPaths.add(fullPath);

    const prev = existing.get(fullPath);
    if (prev) {
      // returning or still present — clear missing flag
      if (prev.missing) {
        prev.missing = false;
        state.projects[prev.id] = prev;
      }
      continue;
    }

    const baseId = slugify(name) || "project";
    let id = baseId;
    let i = 1;
    while (state.projects[id]) {
      id = `${baseId}-${i++}`;
    }
    const nowIso = new Date().toISOString();
    const project: ReviewProject = {
      id,
      name,
      path: fullPath,
      enabled: true,
      status: "idle",
      discoveredAt: nowIso,
      lastRunAt: null,
      lastReportPath: null,
      lastReportDate: null,
      lastAckedAt: null,
      eligibleAt: null,
      lastError: null,
    };
    state.projects[id] = project;
    added.push(id);
  }

  const missing: string[] = [];
  for (const project of Object.values(state.projects)) {
    if (!seenPaths.has(project.path)) {
      if (!project.missing) {
        project.missing = true;
        state.projects[project.id] = project;
      }
      missing.push(project.id);
    }
  }

  state.scanRoot = config.reviewerScanRoot;
  await replaceState(state);
  return { added, missing, total: Object.keys(state.projects).length };
}
```

- [ ] **Step 2: Build bridge to verify**

```bash
pnpm --filter bridge build
```
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add apps/bridge/src/services/codebase-reviewer/discovery.ts
git commit -m "feat(bridge): add reviewer project discovery"
```

---

## Task 7: Scheduler (eligibility)

**Files:**
- Create: `apps/bridge/src/services/codebase-reviewer/scheduler.ts`

- [ ] **Step 1: Create the scheduler**

Create `apps/bridge/src/services/codebase-reviewer/scheduler.ts`:

```ts
import { config } from "../../config.js";
import type { ReviewProject } from "@openclaw-manager/types";

export function isEligible(project: ReviewProject, now: Date = new Date()): boolean {
  if (!project.enabled) return false;
  if (project.missing) return false;
  if (project.status !== "idle" && project.status !== "failed") return false;
  if (project.eligibleAt && new Date(project.eligibleAt).getTime() > now.getTime()) return false;
  // If a report exists and has never been acked, project is blocked until ack.
  if (project.lastReportPath && !project.lastAckedAt) return false;
  return true;
}

export function computeEligibleAtAfterAck(now: Date = new Date()): string {
  const next = new Date(now.getTime() + config.reviewerAckCooldownMs);
  return next.toISOString();
}
```

- [ ] **Step 2: Build bridge to verify**

```bash
pnpm --filter bridge build
```
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add apps/bridge/src/services/codebase-reviewer/scheduler.ts
git commit -m "feat(bridge): add reviewer scheduler eligibility rules"
```

---

## Task 8: Gitignore writer

**Files:**
- Create: `apps/bridge/src/services/codebase-reviewer/gitignore.ts`

- [ ] **Step 1: Create the gitignore helper**

Create `apps/bridge/src/services/codebase-reviewer/gitignore.ts`:

```ts
import fs from "node:fs/promises";
import path from "node:path";

const ENTRY = ".openclaw-review/";

async function isGitRepo(projectPath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(path.join(projectPath, ".git"));
    return stat.isDirectory() || stat.isFile(); // worktrees have a .git file
  } catch {
    return false;
  }
}

export async function ensureGitignore(projectPath: string): Promise<void> {
  if (!(await isGitRepo(projectPath))) return;
  const file = path.join(projectPath, ".gitignore");
  let contents = "";
  try {
    contents = await fs.readFile(file, "utf8");
  } catch {
    contents = "";
  }
  const lines = contents.split(/\r?\n/).map((l) => l.trim());
  if (lines.includes(ENTRY)) return;
  const needsNewline = contents.length > 0 && !contents.endsWith("\n");
  const append = (needsNewline ? "\n" : "") + ENTRY + "\n";
  await fs.writeFile(file, contents + append, "utf8");
}
```

- [ ] **Step 2: Build bridge to verify**

```bash
pnpm --filter bridge build
```
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add apps/bridge/src/services/codebase-reviewer/gitignore.ts
git commit -m "feat(bridge): add idempotent gitignore writer for review dir"
```

---

## Task 9: Report parser

**Files:**
- Create: `apps/bridge/src/services/codebase-reviewer/parser.ts`
- Create (throwaway, deleted at end of task): `scripts/check-parser.ts`

- [ ] **Step 1: Create the parser**

Create `apps/bridge/src/services/codebase-reviewer/parser.ts`:

```ts
import type {
  ReviewIdea,
  ReviewIdeaCategory,
  ReviewIdeaEffort,
  ReviewIdeaImpact,
} from "@openclaw-manager/types";

const CATEGORY_MAP: Record<string, ReviewIdeaCategory> = {
  "new feature ideas": "new_feature",
  "improvements to existing features": "improvement",
  "ui/ux suggestions": "ui_ux",
  "technical debt / risks": "tech_debt",
};

const PROSE_HEADINGS = new Set(["executive summary", "recommended next step"]);

function normalizeHeading(h: string): string {
  return h.trim().toLowerCase().replace(/\s+/g, " ");
}

function slugifyTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "idea";
}

function parseImpact(raw: string): ReviewIdeaImpact {
  const v = raw.trim().toLowerCase();
  if (v === "low" || v === "high") return v;
  if (v === "medium" || v === "med") return "medium";
  return "medium";
}

function parseEffort(raw: string): ReviewIdeaEffort {
  const v = raw.trim().toUpperCase();
  if (v === "S" || v === "M" || v === "L") return v as ReviewIdeaEffort;
  return "M";
}

type IdeaDraft = {
  title: string;
  problem: string;
  solution: string;
  impact: ReviewIdeaImpact;
  effort: ReviewIdeaEffort;
};

function extractField(body: string, label: RegExp): string {
  const line = body.split(/\r?\n/).find((l) => label.test(l));
  if (!line) return "";
  return line.replace(label, "").trim();
}

export type ParserWarning = { kind: "unknown_category"; heading: string };

export type ParseResult = {
  ideas: ReviewIdea[];
  warnings: ParserWarning[];
};

export function parseReport(
  markdown: string,
  opts: { projectId: string; projectName: string; reportDate: string }
): ParseResult {
  const lines = markdown.split(/\r?\n/);
  const ideas: ReviewIdea[] = [];
  const warnings: ParserWarning[] = [];
  const nowIso = new Date().toISOString();

  let currentCategory: ReviewIdeaCategory | null = null;
  let currentProseSkip = false;
  let draft: IdeaDraft | null = null;
  let draftBodyLines: string[] = [];

  const flush = () => {
    if (!draft || !currentCategory) return;
    const body = draftBodyLines.join("\n");
    draft.problem = extractField(body, /^\s*[-*]\s*Problem:\s*/i) || draft.problem;
    draft.solution = extractField(body, /^\s*[-*]\s*(Proposed\s+)?Solution:\s*/i) || draft.solution;
    const impactLine = extractField(body, /^\s*[-*]\s*Impact:\s*/i);
    const effortLine = extractField(body, /^\s*[-*]\s*Effort:\s*/i);
    if (impactLine) draft.impact = parseImpact(impactLine);
    if (effortLine) draft.effort = parseEffort(effortLine);
    const id = `${opts.projectId}-${opts.reportDate}-${slugifyTitle(draft.title)}`;
    ideas.push({
      id,
      projectId: opts.projectId,
      projectName: opts.projectName,
      reportDate: opts.reportDate,
      category: currentCategory,
      title: draft.title,
      problem: draft.problem,
      solution: draft.solution,
      impact: draft.impact,
      effort: draft.effort,
      status: "pending",
      createdAt: nowIso,
      statusChangedAt: null,
    });
    draft = null;
    draftBodyLines = [];
  };

  for (const line of lines) {
    const h2 = /^##\s+(.+?)\s*$/.exec(line);
    if (h2) {
      flush();
      const key = normalizeHeading(h2[1]);
      if (PROSE_HEADINGS.has(key)) {
        currentCategory = null;
        currentProseSkip = true;
        continue;
      }
      const cat = CATEGORY_MAP[key];
      if (cat) {
        currentCategory = cat;
        currentProseSkip = false;
      } else {
        warnings.push({ kind: "unknown_category", heading: h2[1] });
        currentCategory = "improvement";
        currentProseSkip = false;
      }
      continue;
    }
    const h3 = /^###\s+(.+?)\s*$/.exec(line);
    if (h3) {
      flush();
      if (currentProseSkip || !currentCategory) continue;
      draft = {
        title: h3[1].trim(),
        problem: "",
        solution: "",
        impact: "medium",
        effort: "M",
      };
      draftBodyLines = [];
      continue;
    }
    if (draft) draftBodyLines.push(line);
  }
  flush();

  // dedupe by id (last one wins)
  const seen = new Map<string, ReviewIdea>();
  for (const idea of ideas) seen.set(idea.id, idea);
  return { ideas: [...seen.values()], warnings };
}
```

- [ ] **Step 2: Create a throwaway parser verification script**

Create `scripts/check-parser.ts` (repo root — if `scripts/` doesn't exist, create it):

```ts
import { parseReport } from "../apps/bridge/src/services/codebase-reviewer/parser.js";

const sample = `# Codebase Review — Sample — 2026-04-17

## Executive Summary
Some prose that should be ignored.

## New Feature Ideas
### Real-time ETA chips
- Problem: Users lack visibility into arrival times.
- Proposed Solution: Render live ETA chips next to ride cards.
- Impact: high
- Effort: M

### Driver night mode
- Problem: Night drivers get glare.
- Proposed Solution: Add a dark theme toggle.
- Impact: medium
- Effort: S

## Improvements to Existing Features
### Faster settings load
- Problem: Settings page takes 3s.
- Proposed Solution: Cache config.
- Impact: low
- Effort: S

## UI/UX Suggestions
### Rounded cards
- Problem: Cards look sharp and dated.
- Proposed Solution: Apply rounded-xl.
- Impact: low
- Effort: S

## Technical Debt / Risks
### Deprecated API
- Problem: Using legacy geocoder.
- Proposed Solution: Migrate to v2.
- Impact: high
- Effort: L

## Bogus Section
### This should warn
- Problem: x
- Proposed Solution: y

## Recommended Next Step
Do the ETA chips first.
`;

const result = parseReport(sample, {
  projectId: "sample",
  projectName: "Sample",
  reportDate: "2026-04-17",
});

const expectCategories = ["new_feature", "new_feature", "improvement", "ui_ux", "tech_debt", "improvement"];
const actualCategories = result.ideas.map((i) => i.category);
const categoriesOk = JSON.stringify(expectCategories) === JSON.stringify(actualCategories);

console.log("ideas:", result.ideas.length);
console.log("warnings:", result.warnings);
console.log("categories ok:", categoriesOk);
if (!categoriesOk) {
  console.log("got:", actualCategories);
  process.exit(1);
}
if (result.ideas.length !== 6) {
  console.log("expected 6 ideas, got", result.ideas.length);
  process.exit(1);
}
if (result.warnings.length !== 1) {
  console.log("expected 1 warning, got", result.warnings.length);
  process.exit(1);
}
const first = result.ideas[0];
if (first.impact !== "high" || first.effort !== "M") {
  console.log("first idea field parse failed:", first);
  process.exit(1);
}
if (first.id !== "sample-2026-04-17-real-time-eta-chips") {
  console.log("first idea id wrong:", first.id);
  process.exit(1);
}
console.log("parser check: OK");
```

- [ ] **Step 3: Run the parser check**

```bash
cd "c:/Users/GalLe/Cursor projects/OpenClaw-manager" && pnpm --filter bridge build && node --experimental-specifier-resolution=node apps/bridge/dist/services/codebase-reviewer/parser.js >/dev/null 2>&1; npx tsx scripts/check-parser.ts
```
Expected: prints `parser check: OK` and exits 0.

- [ ] **Step 4: Delete the throwaway script and commit**

```bash
rm scripts/check-parser.ts
# if scripts/ is now empty, remove it too
rmdir scripts 2>/dev/null || true
git add apps/bridge/src/services/codebase-reviewer/parser.ts
git commit -m "feat(bridge): add reviewer report parser"
```

---

## Task 10: Prompt template

**Files:**
- Create: `apps/bridge/src/services/codebase-reviewer/prompt.ts`

- [ ] **Step 1: Create the prompt module**

Create `apps/bridge/src/services/codebase-reviewer/prompt.ts`:

```ts
export function buildReviewPrompt(opts: {
  projectName: string;
  projectPath: string;
  reportDate: string;
}): string {
  return `You are a senior product manager embedded in this codebase. You are also a fluent engineer who can read code, but your job here is product, not implementation.

Project name: ${opts.projectName}
Project path: ${opts.projectPath}
Today: ${opts.reportDate}

Walk the codebase. Read README files, entry points, routes, UI components, data models, tests, and the recent git log. Form a mental model of what this product is, who uses it, and where it is weakest.

Then produce a product review focused on **features, improvements, and UI/UX ideas** — not refactors for their own sake. Propose concrete, high-signal ideas a product manager would actually ship. Avoid vague advice. Avoid implementation patches.

Return **only** the markdown below. No preamble, no closing remarks. Use these exact top-level headings in this order. Under each non-prose heading, add one or more \`###\` ideas with the bullet fields shown. Impact must be one of \`low\`, \`medium\`, \`high\`. Effort must be one of \`S\`, \`M\`, \`L\`.

# Codebase Review — ${opts.projectName} — ${opts.reportDate}

## Executive Summary
<one to three short paragraphs: what this project is, its current state, and the single most important thing a PM should focus on>

## New Feature Ideas
### <Title>
- Problem: <one paragraph>
- Proposed Solution: <one paragraph>
- Impact: low|medium|high
- Effort: S|M|L

## Improvements to Existing Features
### <Title>
- Problem: ...
- Proposed Solution: ...
- Impact: ...
- Effort: ...

## UI/UX Suggestions
### <Title>
- Problem: ...
- Proposed Solution: ...
- Impact: ...
- Effort: ...

## Technical Debt / Risks
### <Title>
- Problem: ...
- Proposed Solution: ...
- Impact: ...
- Effort: ...

## Recommended Next Step
<one short paragraph naming the single best next thing to do>
`;
}
```

- [ ] **Step 2: Build bridge to verify**

```bash
pnpm --filter bridge build
```
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add apps/bridge/src/services/codebase-reviewer/prompt.ts
git commit -m "feat(bridge): add reviewer PM prompt template"
```

---

## Task 11: Runner (agent session orchestration)

**Files:**
- Create: `apps/bridge/src/services/codebase-reviewer/runner.ts`

- [ ] **Step 1: Create the runner**

Create `apps/bridge/src/services/codebase-reviewer/runner.ts`:

```ts
import { callGateway } from "../gateway.js";
import { config } from "../../config.js";
import { buildReviewPrompt } from "./prompt.js";

export type RunResult = { sessionId: string; markdown: string };

function pickString(obj: unknown, keys: string[]): string | undefined {
  if (!obj || typeof obj !== "object") return undefined;
  const rec = obj as Record<string, unknown>;
  for (const k of keys) {
    const v = rec[k];
    if (typeof v === "string" && v.length > 0) return v;
  }
  return undefined;
}

async function getSessionState(sessionId: string): Promise<{
  state: string | undefined;
  lastAssistant: string | undefined;
}> {
  // sessions.list returns all sessions — find ours and read its state + latest message
  const list = await callGateway("sessions.list", {}) as unknown;
  const sessions = Array.isArray(list) ? list : (list as { sessions?: unknown[] })?.sessions;
  if (!Array.isArray(sessions)) return { state: undefined, lastAssistant: undefined };
  const match = sessions.find((s: any) => s?.id === sessionId) as Record<string, unknown> | undefined;
  if (!match) return { state: undefined, lastAssistant: undefined };
  const state = pickString(match, ["state", "status"]);
  const lastAssistant = pickString(match, ["lastAssistantMessage", "lastMessage", "lastOutput"]);
  return { state, lastAssistant };
}

async function getFinalMessage(sessionId: string): Promise<string | undefined> {
  // Try sessions.usage first (some SDK builds return full transcript here), fall back to list.
  try {
    const usage = await callGateway("sessions.usage", { session: sessionId }) as unknown;
    if (usage && typeof usage === "object") {
      const transcript = (usage as Record<string, unknown>).transcript;
      if (Array.isArray(transcript)) {
        for (let i = transcript.length - 1; i >= 0; i--) {
          const msg = transcript[i] as Record<string, unknown>;
          if (msg?.role === "assistant" && typeof msg.content === "string") {
            return msg.content;
          }
        }
      }
      const last = pickString(usage as object, ["lastAssistantMessage", "lastMessage"]);
      if (last) return last;
    }
  } catch {
    // ignore, fall through
  }
  const { lastAssistant } = await getSessionState(sessionId);
  return lastAssistant;
}

export async function runReview(opts: {
  projectName: string;
  projectPath: string;
  reportDate: string;
}): Promise<RunResult> {
  const created = await callGateway("sessions.create", { cwd: opts.projectPath }) as unknown;
  const sessionId = pickString(created, ["id", "sessionId"]);
  if (!sessionId) throw new Error("sessions.create did not return a session id");

  const prompt = buildReviewPrompt(opts);
  await callGateway("sessions.send", { session: sessionId, message: prompt });

  const started = Date.now();
  const terminalStates = new Set(["done", "completed", "finished", "idle", "stopped"]);
  const errorStates = new Set(["error", "failed", "aborted"]);

  while (true) {
    if (Date.now() - started > config.reviewerTimeoutMs) {
      try { await callGateway("sessions.abort", { session: sessionId }); } catch {}
      throw new Error(`timeout after ${config.reviewerTimeoutMs}ms`);
    }
    await new Promise((r) => setTimeout(r, 3000));
    const { state } = await getSessionState(sessionId);
    if (state && errorStates.has(state.toLowerCase())) {
      throw new Error(`session ended in ${state} state`);
    }
    if (state && terminalStates.has(state.toLowerCase())) break;
  }

  const final = await getFinalMessage(sessionId);
  if (!final) throw new Error("no assistant output found for session");
  const trimmed = final.trim();
  if (!trimmed.startsWith("# Codebase Review")) {
    throw new Error("agent output did not follow the required template");
  }
  return { sessionId, markdown: trimmed };
}
```

- [ ] **Step 2: Build bridge to verify**

```bash
pnpm --filter bridge build
```
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add apps/bridge/src/services/codebase-reviewer/runner.ts
git commit -m "feat(bridge): add reviewer agent session runner"
```

---

## Task 12: Worker (serial queue)

**Files:**
- Create: `apps/bridge/src/services/codebase-reviewer/worker.ts`

- [ ] **Step 1: Create the worker**

Create `apps/bridge/src/services/codebase-reviewer/worker.ts`:

```ts
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { getProject, updateProject, listProjects } from "./state.js";
import { appendRun } from "./runs.js";
import { replaceIdeasForReport } from "./ideas.js";
import { ensureGitignore } from "./gitignore.js";
import { parseReport } from "./parser.js";
import { runReview } from "./runner.js";
import { isEligible } from "./scheduler.js";
import type { ReviewRun } from "@openclaw-manager/types";

type Job = { projectId: string; trigger: "cron" | "manual" };

const queue: Job[] = [];
let current: string | null = null;
let running = false;

function todayDate(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function getWorkerState(): { current: string | null; queue: string[] } {
  return { current, queue: queue.map((j) => j.projectId) };
}

export function enqueue(projectId: string, trigger: "cron" | "manual"): boolean {
  if (current === projectId) return false;
  if (queue.some((j) => j.projectId === projectId)) return false;
  queue.push({ projectId, trigger });
  void drain();
  return true;
}

async function drain(): Promise<void> {
  if (running) return;
  running = true;
  try {
    while (queue.length > 0) {
      const job = queue.shift()!;
      current = job.projectId;
      await process(job);
      current = null;
    }
  } finally {
    running = false;
  }
}

async function process(job: Job): Promise<void> {
  const project = await getProject(job.projectId);
  if (!project) return;

  const runId = crypto.randomUUID();
  const startTs = Date.now();
  const reportDate = todayDate();

  await updateProject(project.id, { status: "running", lastError: null });
  const startRun: ReviewRun = {
    runId,
    projectId: project.id,
    trigger: job.trigger,
    phase: "start",
    timestamp: new Date(startTs).toISOString(),
  };
  await appendRun(startRun);

  try {
    const result = await runReview({
      projectName: project.name,
      projectPath: project.path,
      reportDate,
    });

    const reviewDir = path.join(project.path, ".openclaw-review");
    await fs.mkdir(reviewDir, { recursive: true });
    const reportPath = path.join(reviewDir, `${reportDate}.md`);
    const tmp = reportPath + ".tmp";
    await fs.writeFile(tmp, result.markdown + "\n", "utf8");
    await fs.rename(tmp, reportPath);
    await ensureGitignore(project.path);

    const parsed = parseReport(result.markdown, {
      projectId: project.id,
      projectName: project.name,
      reportDate,
    });
    await replaceIdeasForReport(project.id, reportDate, parsed.ideas);

    await updateProject(project.id, {
      status: "awaiting_ack",
      lastRunAt: new Date().toISOString(),
      lastReportPath: reportPath,
      lastReportDate: reportDate,
      lastAckedAt: null,
      eligibleAt: null,
      lastError: null,
    });

    const endRun: ReviewRun = {
      runId,
      projectId: project.id,
      trigger: job.trigger,
      phase: "end",
      timestamp: new Date().toISOString(),
      sessionId: result.sessionId,
      reportPath,
      ideasCount: parsed.ideas.length,
      durationMs: Date.now() - startTs,
    };
    await appendRun(endRun);
    for (const w of parsed.warnings) {
      await appendRun({
        runId,
        projectId: project.id,
        trigger: job.trigger,
        phase: "end",
        timestamp: new Date().toISOString(),
        error: `warning: ${w.kind} ${w.heading}`,
      });
    }
  } catch (err: any) {
    await updateProject(project.id, {
      status: "failed",
      lastError: err?.message || "unknown error",
    });
    const errorRun: ReviewRun = {
      runId,
      projectId: project.id,
      trigger: job.trigger,
      phase: "error",
      timestamp: new Date().toISOString(),
      error: err?.message || "unknown error",
      durationMs: Date.now() - startTs,
    };
    await appendRun(errorRun);
  }
}

/** Called from server startup to clean up half-done jobs from a previous crash. */
export async function repairOnStartup(): Promise<void> {
  const projects = await listProjects();
  for (const p of projects) {
    if (p.status === "running" || p.status === "queued") {
      await updateProject(p.id, {
        status: "failed",
        lastError: "interrupted by restart",
      });
    }
  }
}

/** Enqueue every eligible project. Returns the IDs enqueued and those skipped. */
export async function enqueueAllEligible(
  trigger: "cron" | "manual"
): Promise<{ enqueued: string[]; skipped: string[] }> {
  const projects = await listProjects();
  const enqueued: string[] = [];
  const skipped: string[] = [];
  for (const p of projects) {
    if (isEligible(p)) {
      if (enqueue(p.id, trigger)) enqueued.push(p.id);
      else skipped.push(p.id);
    } else {
      skipped.push(p.id);
    }
  }
  return { enqueued, skipped };
}
```

- [ ] **Step 2: Build bridge to verify**

```bash
pnpm --filter bridge build
```
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add apps/bridge/src/services/codebase-reviewer/worker.ts
git commit -m "feat(bridge): add reviewer serial worker"
```

---

## Task 13: Reviews route module

**Files:**
- Create: `apps/bridge/src/routes/reviews.ts`

- [ ] **Step 1: Create the route module**

Create `apps/bridge/src/routes/reviews.ts`:

```ts
import fs from "node:fs/promises";
import { Router, type Request, type Response } from "express";
import {
  getProject,
  listProjects,
  updateProject,
} from "../services/codebase-reviewer/state.js";
import { scanProjects } from "../services/codebase-reviewer/discovery.js";
import {
  enqueue,
  enqueueAllEligible,
  getWorkerState,
} from "../services/codebase-reviewer/worker.js";
import { computeEligibleAtAfterAck } from "../services/codebase-reviewer/scheduler.js";
import { tailRuns } from "../services/codebase-reviewer/runs.js";
import {
  listIdeas,
  listIdeasForReport,
  setIdeaStatus,
} from "../services/codebase-reviewer/ideas.js";
import type {
  ReviewIdeaStatus,
  ReviewIdeaImpact,
  ReviewIdeaEffort,
  ReviewIdeaCategory,
  ReviewReportSummary,
} from "@openclaw-manager/types";
import path from "node:path";

const router: Router = Router();

const ID_RE = /^[a-z0-9-]+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function badId(res: Response): void {
  res.status(400).json({ error: "invalid id" });
}
function badDate(res: Response): void {
  res.status(400).json({ error: "invalid date" });
}

router.get("/reviews/projects", async (_req: Request, res: Response) => {
  try {
    const projects = await listProjects();
    res.json({ projects, worker: getWorkerState() });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "failed" });
  }
});

router.post("/reviews/projects/scan", async (_req: Request, res: Response) => {
  try {
    const result = await scanProjects();
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "failed" });
  }
});

router.patch("/reviews/projects/:id", async (req: Request, res: Response) => {
  const id = req.params.id as string;
  if (!ID_RE.test(id)) return badId(res);
  try {
    const existing = await getProject(id);
    if (!existing) return void res.status(404).json({ error: "not found" });
    const patch: { enabled?: boolean } = {};
    if (typeof req.body?.enabled === "boolean") patch.enabled = req.body.enabled;
    const next = await updateProject(id, patch);
    res.json({ project: next });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "failed" });
  }
});

router.post("/reviews/projects/:id/run", async (req: Request, res: Response) => {
  const id = req.params.id as string;
  if (!ID_RE.test(id)) return badId(res);
  try {
    const project = await getProject(id);
    if (!project) return void res.status(404).json({ error: "not found" });
    if (project.missing) {
      return void res
        .status(409)
        .json({ enqueued: false, reason: "project folder missing" });
    }
    const ok = enqueue(id, "manual");
    res.json({ enqueued: ok, reason: ok ? undefined : "already queued or running" });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "failed" });
  }
});

router.post("/reviews/projects/:id/ack", async (req: Request, res: Response) => {
  const id = req.params.id as string;
  if (!ID_RE.test(id)) return badId(res);
  try {
    const project = await getProject(id);
    if (!project) return void res.status(404).json({ error: "not found" });
    const now = new Date();
    const next = await updateProject(id, {
      status: "idle",
      lastAckedAt: now.toISOString(),
      eligibleAt: computeEligibleAtAfterAck(now),
    });
    res.json({ project: next });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "failed" });
  }
});

router.get(
  "/reviews/projects/:id/reports",
  async (req: Request, res: Response) => {
    const id = req.params.id as string;
    if (!ID_RE.test(id)) return badId(res);
    try {
      const project = await getProject(id);
      if (!project) return void res.status(404).json({ error: "not found" });
      const dir = path.join(project.path, ".openclaw-review");
      let files: string[] = [];
      try {
        files = (await fs.readdir(dir)).filter((f) => /^\d{4}-\d{2}-\d{2}\.md$/.test(f));
      } catch {
        files = [];
      }
      files.sort((a, b) => (a < b ? 1 : -1));
      const summaries: ReviewReportSummary[] = [];
      for (const f of files) {
        const date = f.replace(/\.md$/, "");
        const ideas = await listIdeasForReport(id, date);
        summaries.push({
          reportDate: date,
          reportPath: path.join(dir, f),
          ideasCount: ideas.length,
          acked:
            project.lastReportDate === date
              ? project.lastAckedAt !== null
              : true,
        });
      }
      res.json({ reports: summaries });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "failed" });
    }
  }
);

router.get(
  "/reviews/projects/:id/reports/:date",
  async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const date = req.params.date as string;
    if (!ID_RE.test(id)) return badId(res);
    if (!DATE_RE.test(date)) return badDate(res);
    try {
      const project = await getProject(id);
      if (!project) return void res.status(404).json({ error: "not found" });
      const file = path.join(project.path, ".openclaw-review", `${date}.md`);
      let markdown: string;
      try {
        markdown = await fs.readFile(file, "utf8");
      } catch {
        return void res.status(404).json({ error: "report not found" });
      }
      const ideas = await listIdeasForReport(id, date);
      res.json({ markdown, ideas });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "failed" });
    }
  }
);

function parseArrayParam<T extends string>(
  raw: unknown,
  allowed: Set<T>
): T[] | undefined {
  const arr = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const strs = arr.map((v) => String(v)).filter((s) => allowed.has(s as T)) as T[];
  return strs.length ? strs : undefined;
}

router.get("/reviews/ideas", async (req: Request, res: Response) => {
  try {
    const ideas = await listIdeas({
      projectId: Array.isArray(req.query.project)
        ? req.query.project.map(String)
        : req.query.project
          ? [String(req.query.project)]
          : undefined,
      status: parseArrayParam<ReviewIdeaStatus>(
        req.query.status,
        new Set(["pending", "accepted", "rejected", "deferred"])
      ),
      impact: parseArrayParam<ReviewIdeaImpact>(
        req.query.impact,
        new Set(["low", "medium", "high"])
      ),
      effort: parseArrayParam<ReviewIdeaEffort>(
        req.query.effort,
        new Set(["S", "M", "L"])
      ),
      category: parseArrayParam<ReviewIdeaCategory>(
        req.query.category,
        new Set(["new_feature", "improvement", "ui_ux", "tech_debt"])
      ),
    });
    res.json({ ideas });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "failed" });
  }
});

router.patch("/reviews/ideas/:id", async (req: Request, res: Response) => {
  try {
    const status = req.body?.status as ReviewIdeaStatus | undefined;
    if (!status || !["pending", "accepted", "rejected", "deferred"].includes(status)) {
      return void res.status(400).json({ error: "invalid status" });
    }
    const idea = await setIdeaStatus(req.params.id as string, status);
    res.json({ idea });
  } catch (err: any) {
    res.status(404).json({ error: err?.message || "not found" });
  }
});

router.post("/reviews/tick", async (_req: Request, res: Response) => {
  try {
    await scanProjects();
    const result = await enqueueAllEligible("cron");
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "failed" });
  }
});

router.get("/reviews/runs", async (req: Request, res: Response) => {
  try {
    const limit = Math.max(1, Math.min(500, Number(req.query.limit) || 50));
    const runs = await tailRuns(limit);
    res.json({ runs });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "failed" });
  }
});

export default router;
```

- [ ] **Step 2: Build bridge to verify**

```bash
pnpm --filter bridge build
```
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add apps/bridge/src/routes/reviews.ts
git commit -m "feat(bridge): add /reviews routes"
```

---

## Task 14: Mount router + startup hooks

**Files:**
- Modify: `apps/bridge/src/server.ts`

- [ ] **Step 1: Import and mount the reviews router**

Edit `apps/bridge/src/server.ts`. Add an import line near the other route imports (alphabetical-ish is fine; put it after `brainRouter`):

```ts
import reviewsRouter from "./routes/reviews.js";
import { repairOnStartup } from "./services/codebase-reviewer/worker.js";
import { scanProjects } from "./services/codebase-reviewer/discovery.js";
```

Then mount it near the other `app.use()` calls (end of the block, after `app.use(brainRouter);`):

```ts
app.use(reviewsRouter);
```

And after the existing `attachWebSocket(server);` line, add:

```ts
void (async () => {
  try { await repairOnStartup(); } catch (e) { console.warn("reviewer repair failed:", e); }
  try { await scanProjects(); } catch (e) { console.warn("reviewer scan failed:", e); }
})();
```

- [ ] **Step 2: Build bridge**

```bash
pnpm --filter bridge build
```
Expected: exits 0.

- [ ] **Step 3: Smoke-test the endpoints**

In one terminal, start the bridge:
```bash
pnpm dev:bridge
```

In another terminal, load the token and hit the endpoints (replace `<TOKEN>` with `BRIDGE_TOKEN` from the bridge `.env`):

```bash
TOKEN=cb5fcc10443c58e41367cc5281d75089ef35554d72e3cf38
curl -s -H "Authorization: Bearer $TOKEN" http://127.0.0.1:3100/reviews/projects | head
curl -s -X POST -H "Authorization: Bearer $TOKEN" http://127.0.0.1:3100/reviews/projects/scan
curl -s -H "Authorization: Bearer $TOKEN" http://127.0.0.1:3100/reviews/projects | python -c "import json,sys; d=json.load(sys.stdin); print('count:', len(d['projects']))"
```
Expected: the scan endpoint returns `{"added":[...],"missing":[...],"total":N}`, and the subsequent projects call shows the same count. Confirm a file appeared at `C:\Users\GalLe\.openclaw\workspace\.openclaw\extensions\codebase-reviewer\state.json`.

Stop the bridge (Ctrl+C).

- [ ] **Step 4: Commit**

```bash
git add apps/bridge/src/server.ts
git commit -m "feat(bridge): mount /reviews router and add startup scan/repair"
```

---

## Task 15: Dashboard bridge-client methods

**Files:**
- Modify: `apps/dashboard/src/lib/bridge-client.ts`

- [ ] **Step 1: Add imports**

Edit `apps/dashboard/src/lib/bridge-client.ts`. Add to the imports block (after `BrainPersonUpdate`):

```ts
  ReviewProject,
  ReviewIdea,
  ReviewIdeaStatus,
  ReviewIdeaImpact,
  ReviewIdeaEffort,
  ReviewIdeaCategory,
  ReviewRun,
  ReviewReportSummary,
  ReviewerWorkerState,
```

- [ ] **Step 2: Append reviewer client methods at end of file**

Append to the end of `bridge-client.ts`:

```ts
// --- Codebase Reviewer ---

export type ReviewsProjectsResponse = {
  projects: ReviewProject[];
  worker: ReviewerWorkerState;
};

export async function getReviewProjects(): Promise<ReviewsProjectsResponse> {
  return bridgeFetch<ReviewsProjectsResponse>("/reviews/projects");
}

export async function scanReviewProjects(): Promise<{
  added: string[];
  missing: string[];
  total: number;
}> {
  return bridgeFetch("/reviews/projects/scan", { method: "POST" });
}

export async function setReviewProjectEnabled(
  id: string,
  enabled: boolean
): Promise<{ project: ReviewProject }> {
  return bridgeFetch(`/reviews/projects/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({ enabled }),
  });
}

export async function runReviewNow(
  id: string
): Promise<{ enqueued: boolean; reason?: string }> {
  return bridgeFetch(`/reviews/projects/${encodeURIComponent(id)}/run`, {
    method: "POST",
  });
}

export async function ackReviewProject(
  id: string
): Promise<{ project: ReviewProject }> {
  return bridgeFetch(`/reviews/projects/${encodeURIComponent(id)}/ack`, {
    method: "POST",
  });
}

export async function getReviewReports(
  id: string
): Promise<{ reports: ReviewReportSummary[] }> {
  return bridgeFetch(`/reviews/projects/${encodeURIComponent(id)}/reports`);
}

export async function getReviewReport(
  id: string,
  date: string
): Promise<{ markdown: string; ideas: ReviewIdea[] }> {
  return bridgeFetch(
    `/reviews/projects/${encodeURIComponent(id)}/reports/${encodeURIComponent(date)}`
  );
}

export type ReviewIdeasFilters = {
  project?: string[];
  status?: ReviewIdeaStatus[];
  impact?: ReviewIdeaImpact[];
  effort?: ReviewIdeaEffort[];
  category?: ReviewIdeaCategory[];
};

export async function getReviewIdeas(
  filters?: ReviewIdeasFilters
): Promise<{ ideas: ReviewIdea[] }> {
  const params = new URLSearchParams();
  const add = (key: string, vals: string[] | undefined) => {
    if (!vals) return;
    for (const v of vals) params.append(key, v);
  };
  add("project", filters?.project);
  add("status", filters?.status);
  add("impact", filters?.impact);
  add("effort", filters?.effort);
  add("category", filters?.category);
  const qs = params.toString();
  return bridgeFetch(`/reviews/ideas${qs ? `?${qs}` : ""}`);
}

export async function setReviewIdeaStatus(
  id: string,
  status: ReviewIdeaStatus
): Promise<{ idea: ReviewIdea }> {
  return bridgeFetch(`/reviews/ideas/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}

export async function getReviewRuns(limit = 50): Promise<{ runs: ReviewRun[] }> {
  return bridgeFetch(`/reviews/runs?limit=${limit}`);
}
```

- [ ] **Step 3: Build dashboard to verify types**

```bash
pnpm --filter dashboard build
```
Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add apps/dashboard/src/lib/bridge-client.ts
git commit -m "feat(dashboard): add reviewer bridge-client methods"
```

---

## Task 16: Sidebar nav entry

**Files:**
- Modify: `apps/dashboard/src/components/sidebar.tsx`

- [ ] **Step 1: Add "Reviews" item under the "Manage" section**

Find the `Manage` section in `NAV_SECTIONS` (around line 19-25). Add this item as the last entry in that section's `items` array (after `Cron Jobs`):

```ts
      { href: "/reviews", label: "Reviews", icon: "M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" },
```

- [ ] **Step 2: Build dashboard**

```bash
pnpm --filter dashboard build
```
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add apps/dashboard/src/components/sidebar.tsx
git commit -m "feat(dashboard): add Reviews nav item"
```

---

## Task 17: `/reviews` list page

**Files:**
- Create: `apps/dashboard/src/app/reviews/page.tsx`
- Create: `apps/dashboard/src/app/reviews/actions.ts`
- Create: `apps/dashboard/src/components/reviews-table.tsx`

- [ ] **Step 1: Create server actions**

Create `apps/dashboard/src/app/reviews/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import {
  ackReviewProject,
  runReviewNow,
  scanReviewProjects,
  setReviewProjectEnabled,
} from "@/lib/bridge-client";

export async function scanAction(): Promise<void> {
  await scanReviewProjects();
  revalidatePath("/reviews");
}

export async function runNowAction(id: string): Promise<void> {
  await runReviewNow(id);
  revalidatePath("/reviews");
}

export async function ackAction(id: string): Promise<void> {
  await ackReviewProject(id);
  revalidatePath("/reviews");
  revalidatePath(`/reviews/${id}`);
}

export async function toggleEnabledAction(
  id: string,
  enabled: boolean
): Promise<void> {
  await setReviewProjectEnabled(id, enabled);
  revalidatePath("/reviews");
}
```

- [ ] **Step 2: Create the table component**

Create `apps/dashboard/src/components/reviews-table.tsx`:

```tsx
"use client";
import Link from "next/link";
import { useTransition } from "react";
import type { ReviewProject, ReviewerWorkerState } from "@openclaw-manager/types";
import {
  ackAction,
  runNowAction,
  scanAction,
  toggleEnabledAction,
} from "@/app/reviews/actions";

function relative(iso: string | null): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const abs = Math.abs(diff);
  const mins = Math.round(abs / 60000);
  const hours = Math.round(mins / 60);
  const days = Math.round(hours / 24);
  const sign = diff >= 0 ? "ago" : "in";
  if (abs < 60000) return "just now";
  if (mins < 60) return `${sign} ${mins}m`;
  if (hours < 48) return `${sign} ${hours}h`;
  return `${sign} ${days}d`;
}

function StatusBadge({ status, missing }: { status: ReviewProject["status"]; missing?: boolean }) {
  if (missing) return <span className="rounded bg-red-500/10 px-2 py-0.5 text-xs text-red-400">missing</span>;
  const map: Record<ReviewProject["status"], string> = {
    idle: "bg-zinc-500/10 text-zinc-300",
    queued: "bg-sky-500/10 text-sky-300",
    running: "bg-emerald-500/10 text-emerald-300",
    awaiting_ack: "bg-amber-500/10 text-amber-300",
    skipped: "bg-zinc-700/10 text-zinc-400",
    failed: "bg-red-500/10 text-red-400",
  };
  return <span className={`rounded px-2 py-0.5 text-xs ${map[status]}`}>{status.replace("_", " ")}</span>;
}

export function ReviewsTable({
  projects,
  worker,
}: {
  projects: ReviewProject[];
  worker: ReviewerWorkerState;
}) {
  const [pending, startTransition] = useTransition();
  const sorted = [...projects].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4 text-sm text-zinc-400">
        <div>
          Worker:{" "}
          {worker.current
            ? <span className="text-emerald-300">running {worker.current}</span>
            : <span>idle</span>}
          {worker.queue.length > 0 && (
            <span className="ml-2 text-zinc-500">queued: {worker.queue.join(", ")}</span>
          )}
        </div>
        <button
          disabled={pending}
          onClick={() => startTransition(() => scanAction())}
          className="ml-auto rounded bg-zinc-800 px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-700 disabled:opacity-50"
        >
          Rescan projects
        </button>
      </div>
      <div className="overflow-hidden rounded border border-zinc-800">
        <table className="w-full text-sm">
          <thead className="bg-zinc-900/60 text-left text-xs uppercase tracking-wide text-zinc-400">
            <tr>
              <th className="px-4 py-2">Project</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2">Last run</th>
              <th className="px-4 py-2">Eligible</th>
              <th className="px-4 py-2">Enabled</th>
              <th className="px-4 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((p) => (
              <tr key={p.id} className="border-t border-zinc-800">
                <td className="px-4 py-2">
                  <Link href={`/reviews/${p.id}`} className="font-medium text-zinc-100 hover:text-sky-300">
                    {p.name}
                  </Link>
                  <div className="text-xs text-zinc-500">{p.path}</div>
                </td>
                <td className="px-4 py-2"><StatusBadge status={p.status} missing={p.missing} /></td>
                <td className="px-4 py-2 text-zinc-400">{relative(p.lastRunAt)}</td>
                <td className="px-4 py-2 text-zinc-400">
                  {p.eligibleAt ? relative(p.eligibleAt) : p.status === "awaiting_ack" ? "awaiting ack" : "now"}
                </td>
                <td className="px-4 py-2">
                  <input
                    type="checkbox"
                    checked={p.enabled}
                    disabled={pending}
                    onChange={(e) =>
                      startTransition(() => toggleEnabledAction(p.id, e.target.checked))
                    }
                  />
                </td>
                <td className="px-4 py-2 text-right space-x-2">
                  <button
                    disabled={pending || p.missing || p.status === "running" || p.status === "queued"}
                    onClick={() => startTransition(() => runNowAction(p.id))}
                    className="rounded bg-sky-600/20 px-2 py-1 text-xs text-sky-300 hover:bg-sky-600/30 disabled:opacity-40"
                  >
                    Run now
                  </button>
                  {p.status === "awaiting_ack" && (
                    <button
                      disabled={pending}
                      onClick={() => startTransition(() => ackAction(p.id))}
                      className="rounded bg-amber-600/20 px-2 py-1 text-xs text-amber-300 hover:bg-amber-600/30 disabled:opacity-40"
                    >
                      Acknowledge
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create the page**

Create `apps/dashboard/src/app/reviews/page.tsx`:

```tsx
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { ReviewsTable } from "@/components/reviews-table";
import { getReviewProjects } from "@/lib/bridge-client";
import type { ReviewProject, ReviewerWorkerState } from "@openclaw-manager/types";

export const metadata = { title: "Reviews" };
export const dynamic = "force-dynamic";

export default async function ReviewsPage() {
  let projects: ReviewProject[] = [];
  let worker: ReviewerWorkerState = { current: null, queue: [] };
  let error: string | null = null;
  try {
    const result = await getReviewProjects();
    projects = result.projects;
    worker = result.worker;
  } catch (e: any) {
    error = e?.message || "failed to load";
  }
  return (
    <AppShell title="Reviews">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-zinc-100">Codebase Reviews</h1>
            <p className="mt-1 text-sm text-zinc-400">
              OpenClaw reviews each project once per day as a product manager. Acknowledge a report to unlock the next 24-hour window.
            </p>
          </div>
          <Link href="/reviews/ideas" className="text-sm text-sky-300 hover:text-sky-200">
            → Idea backlog
          </Link>
        </div>
        {error ? (
          <div className="rounded border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
            Failed to load reviews: {error}
          </div>
        ) : (
          <ReviewsTable projects={projects} worker={worker} />
        )}
      </div>
    </AppShell>
  );
}
```

- [ ] **Step 4: Build dashboard**

```bash
pnpm --filter dashboard build
```
Expected: exits 0.

- [ ] **Step 5: Manual verification**

With the bridge running (`pnpm dev:bridge`) and dashboard (`pnpm dev:dashboard`), open http://localhost:3000/reviews in a browser. Expected: table of projects populated from the earlier scan, worker status shows "idle", "Rescan projects" works, toggling "Enabled" persists across refresh.

- [ ] **Step 6: Commit**

```bash
git add apps/dashboard/src/app/reviews/page.tsx apps/dashboard/src/app/reviews/actions.ts apps/dashboard/src/components/reviews-table.tsx
git commit -m "feat(dashboard): add reviews list page"
```

---

## Task 18: `/reviews/[projectId]` detail page

**Files:**
- Create: `apps/dashboard/src/app/reviews/[projectId]/page.tsx`
- Create: `apps/dashboard/src/app/reviews/[projectId]/idea-actions.ts`
- Create: `apps/dashboard/src/components/review-report-viewer.tsx`

- [ ] **Step 1: Create idea status server action**

Create `apps/dashboard/src/app/reviews/[projectId]/idea-actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { setReviewIdeaStatus } from "@/lib/bridge-client";
import type { ReviewIdeaStatus } from "@openclaw-manager/types";

export async function setIdeaStatusAction(
  projectId: string,
  ideaId: string,
  status: ReviewIdeaStatus
): Promise<void> {
  await setReviewIdeaStatus(ideaId, status);
  revalidatePath(`/reviews/${projectId}`);
  revalidatePath("/reviews/ideas");
}
```

- [ ] **Step 2: Create the report viewer component**

Create `apps/dashboard/src/components/review-report-viewer.tsx`:

```tsx
"use client";
import { useTransition } from "react";
import type { ReviewIdea, ReviewIdeaStatus } from "@openclaw-manager/types";
import { setIdeaStatusAction } from "@/app/reviews/[projectId]/idea-actions";

const STATUSES: ReviewIdeaStatus[] = ["pending", "accepted", "rejected", "deferred"];

function statusClass(s: ReviewIdeaStatus): string {
  return {
    pending: "bg-zinc-700/40 text-zinc-300",
    accepted: "bg-emerald-600/30 text-emerald-200",
    rejected: "bg-red-600/30 text-red-200",
    deferred: "bg-amber-600/30 text-amber-200",
  }[s];
}

export function ReviewReportViewer({
  projectId,
  markdown,
  ideas,
}: {
  projectId: string;
  markdown: string;
  ideas: ReviewIdea[];
}) {
  const [pending, startTransition] = useTransition();
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
      <pre className="col-span-1 overflow-auto whitespace-pre-wrap rounded border border-zinc-800 bg-zinc-950 p-4 text-xs text-zinc-200 lg:col-span-3">
        {markdown}
      </pre>
      <div className="col-span-1 space-y-3 lg:col-span-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">
          Ideas ({ideas.length})
        </h2>
        {ideas.map((idea) => (
          <div key={idea.id} className="rounded border border-zinc-800 p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="text-sm font-medium text-zinc-100">{idea.title}</div>
              <span className="text-[10px] uppercase tracking-wide text-zinc-500">
                {idea.category.replace("_", " ")}
              </span>
            </div>
            <div className="mt-1 text-xs text-zinc-400">
              Impact: {idea.impact} · Effort: {idea.effort}
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              {STATUSES.map((s) => (
                <button
                  key={s}
                  disabled={pending || idea.status === s}
                  onClick={() =>
                    startTransition(() => setIdeaStatusAction(projectId, idea.id, s))
                  }
                  className={`rounded px-2 py-0.5 text-[10px] ${
                    idea.status === s ? statusClass(s) : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
                  } disabled:opacity-50`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create the detail page**

Create `apps/dashboard/src/app/reviews/[projectId]/page.tsx`:

```tsx
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { ReviewReportViewer } from "@/components/review-report-viewer";
import {
  getReviewProjects,
  getReviewReport,
  getReviewReports,
} from "@/lib/bridge-client";
import { ackAction, runNowAction } from "../actions";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ date?: string }>;
};

export default async function ReviewDetailPage({ params, searchParams }: Props) {
  const { projectId } = await params;
  const { date } = await searchParams;
  let projectName = projectId;
  let status: string = "idle";
  let missing = false;
  let awaitingAck = false;
  try {
    const { projects } = await getReviewProjects();
    const p = projects.find((x) => x.id === projectId);
    if (p) {
      projectName = p.name;
      status = p.status;
      missing = !!p.missing;
      awaitingAck = p.status === "awaiting_ack";
    }
  } catch { /* degraded */ }

  let reports: Awaited<ReturnType<typeof getReviewReports>>["reports"] = [];
  try {
    reports = (await getReviewReports(projectId)).reports;
  } catch { /* empty */ }

  const selectedDate = date || reports[0]?.reportDate;
  let markdown = "";
  let ideas: Awaited<ReturnType<typeof getReviewReport>>["ideas"] = [];
  if (selectedDate) {
    try {
      const r = await getReviewReport(projectId, selectedDate);
      markdown = r.markdown;
      ideas = r.ideas;
    } catch { /* empty */ }
  }

  return (
    <AppShell title={projectName}>
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex items-start justify-between">
          <div>
            <Link href="/reviews" className="text-xs text-zinc-400 hover:text-zinc-200">
              ← All reviews
            </Link>
            <h1 className="mt-1 text-2xl font-semibold text-zinc-100">{projectName}</h1>
            <p className="mt-1 text-sm text-zinc-500">status: {status.replace("_", " ")}{missing ? " · missing" : ""}</p>
          </div>
          <div className="flex gap-2">
            <form action={runNowAction.bind(null, projectId)}>
              <button
                disabled={missing || status === "running" || status === "queued"}
                className="rounded bg-sky-600/20 px-3 py-1.5 text-xs text-sky-300 hover:bg-sky-600/30 disabled:opacity-40"
              >
                Run now
              </button>
            </form>
            {awaitingAck && (
              <form action={ackAction.bind(null, projectId)}>
                <button className="rounded bg-amber-600/20 px-3 py-1.5 text-xs text-amber-300 hover:bg-amber-600/30">
                  Acknowledge
                </button>
              </form>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
          <aside className="col-span-1 space-y-1">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">History</h2>
            {reports.length === 0 && <p className="text-xs text-zinc-500">No reports yet.</p>}
            {reports.map((r) => (
              <Link
                key={r.reportDate}
                href={`/reviews/${projectId}?date=${r.reportDate}`}
                className={`block rounded px-2 py-1.5 text-sm ${
                  r.reportDate === selectedDate
                    ? "bg-zinc-800 text-zinc-100"
                    : "text-zinc-400 hover:bg-zinc-800/60"
                }`}
              >
                <div>{r.reportDate}</div>
                <div className="text-[10px] text-zinc-500">
                  {r.ideasCount} ideas · {r.acked ? "acked" : "open"}
                </div>
              </Link>
            ))}
          </aside>
          <div className="col-span-1 lg:col-span-3">
            {markdown ? (
              <ReviewReportViewer projectId={projectId} markdown={markdown} ideas={ideas} />
            ) : (
              <p className="text-sm text-zinc-500">Select a report to view it.</p>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
```

- [ ] **Step 4: Build dashboard**

```bash
pnpm --filter dashboard build
```
Expected: exits 0.

- [ ] **Step 5: Commit**

```bash
git add apps/dashboard/src/app/reviews/[projectId]/page.tsx apps/dashboard/src/app/reviews/[projectId]/idea-actions.ts apps/dashboard/src/components/review-report-viewer.tsx
git commit -m "feat(dashboard): add per-project review detail page"
```

---

## Task 19: `/reviews/ideas` backlog page

**Files:**
- Create: `apps/dashboard/src/app/reviews/ideas/page.tsx`
- Create: `apps/dashboard/src/components/ideas-backlog.tsx`

- [ ] **Step 1: Create the backlog client component**

Create `apps/dashboard/src/components/ideas-backlog.tsx`:

```tsx
"use client";
import Link from "next/link";
import { useTransition } from "react";
import type {
  ReviewIdea,
  ReviewIdeaStatus,
} from "@openclaw-manager/types";
import { setIdeaStatusAction } from "@/app/reviews/[projectId]/idea-actions";

const STATUSES: ReviewIdeaStatus[] = ["pending", "accepted", "rejected", "deferred"];

export function IdeasBacklog({ ideas }: { ideas: ReviewIdea[] }) {
  const [pending, startTransition] = useTransition();
  return (
    <div className="overflow-hidden rounded border border-zinc-800">
      <table className="w-full text-sm">
        <thead className="bg-zinc-900/60 text-left text-xs uppercase tracking-wide text-zinc-400">
          <tr>
            <th className="px-4 py-2">Project</th>
            <th className="px-4 py-2">Date</th>
            <th className="px-4 py-2">Category</th>
            <th className="px-4 py-2">Title</th>
            <th className="px-4 py-2">Impact</th>
            <th className="px-4 py-2">Effort</th>
            <th className="px-4 py-2">Status</th>
          </tr>
        </thead>
        <tbody>
          {ideas.map((idea) => (
            <tr key={idea.id} className="border-t border-zinc-800 align-top">
              <td className="px-4 py-2">
                <Link href={`/reviews/${idea.projectId}`} className="text-sky-300 hover:text-sky-200">
                  {idea.projectName}
                </Link>
              </td>
              <td className="px-4 py-2 text-zinc-400">{idea.reportDate}</td>
              <td className="px-4 py-2 text-zinc-400">{idea.category.replace("_", " ")}</td>
              <td className="px-4 py-2">
                <details>
                  <summary className="cursor-pointer text-zinc-100">{idea.title}</summary>
                  <div className="mt-1 space-y-1 text-xs text-zinc-400">
                    <p><span className="text-zinc-500">Problem:</span> {idea.problem}</p>
                    <p><span className="text-zinc-500">Solution:</span> {idea.solution}</p>
                  </div>
                </details>
              </td>
              <td className="px-4 py-2 text-zinc-300">{idea.impact}</td>
              <td className="px-4 py-2 text-zinc-300">{idea.effort}</td>
              <td className="px-4 py-2">
                <div className="flex flex-wrap gap-1">
                  {STATUSES.map((s) => (
                    <button
                      key={s}
                      disabled={pending || idea.status === s}
                      onClick={() =>
                        startTransition(() =>
                          setIdeaStatusAction(idea.projectId, idea.id, s)
                        )
                      }
                      className={`rounded px-2 py-0.5 text-[10px] ${
                        idea.status === s
                          ? "bg-zinc-700 text-zinc-100"
                          : "bg-zinc-800/50 text-zinc-400 hover:bg-zinc-700"
                      } disabled:opacity-50`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 2: Create the page**

Create `apps/dashboard/src/app/reviews/ideas/page.tsx`:

```tsx
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { IdeasBacklog } from "@/components/ideas-backlog";
import { getReviewIdeas } from "@/lib/bridge-client";
import type {
  ReviewIdea,
  ReviewIdeaStatus,
  ReviewIdeaImpact,
  ReviewIdeaEffort,
  ReviewIdeaCategory,
} from "@openclaw-manager/types";

export const metadata = { title: "Idea backlog" };
export const dynamic = "force-dynamic";

type SP = Promise<{
  project?: string | string[];
  status?: string | string[];
  impact?: string | string[];
  effort?: string | string[];
  category?: string | string[];
}>;

function toArr(v: string | string[] | undefined): string[] | undefined {
  if (!v) return undefined;
  return Array.isArray(v) ? v : [v];
}

export default async function IdeasPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  let ideas: ReviewIdea[] = [];
  try {
    const result = await getReviewIdeas({
      project: toArr(sp.project),
      status: toArr(sp.status) as ReviewIdeaStatus[] | undefined,
      impact: toArr(sp.impact) as ReviewIdeaImpact[] | undefined,
      effort: toArr(sp.effort) as ReviewIdeaEffort[] | undefined,
      category: toArr(sp.category) as ReviewIdeaCategory[] | undefined,
    });
    ideas = result.ideas;
  } catch { /* degraded */ }

  const hasActiveFilters = !!(sp.project || sp.status || sp.impact || sp.effort || sp.category);

  return (
    <AppShell title="Idea backlog">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex items-start justify-between">
          <div>
            <Link href="/reviews" className="text-xs text-zinc-400 hover:text-zinc-200">
              ← Reviews
            </Link>
            <h1 className="mt-1 text-2xl font-semibold text-zinc-100">Idea backlog</h1>
            <p className="mt-1 text-sm text-zinc-400">
              Every idea across every review. Set a status to triage.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {(["pending", "accepted", "rejected", "deferred"] as const).map((s) => (
              <Link
                key={s}
                href={`/reviews/ideas?status=${s}`}
                className="rounded border border-zinc-800 px-2 py-1 text-zinc-300 hover:bg-zinc-800"
              >
                {s}
              </Link>
            ))}
            {hasActiveFilters && (
              <Link
                href="/reviews/ideas"
                className="rounded border border-zinc-800 px-2 py-1 text-zinc-500 hover:bg-zinc-800"
              >
                clear
              </Link>
            )}
          </div>
        </div>
        <IdeasBacklog ideas={ideas} />
      </div>
    </AppShell>
  );
}
```

- [ ] **Step 3: Build dashboard**

```bash
pnpm --filter dashboard build
```
Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add apps/dashboard/src/app/reviews/ideas/page.tsx apps/dashboard/src/components/ideas-backlog.tsx
git commit -m "feat(dashboard): add idea backlog page"
```

---

## Task 20: Create the daily OpenClaw cron entry

**Files:** none (this is a one-off configuration step against the running OpenClaw instance).

- [ ] **Step 1: Verify the bridge is reachable from OpenClaw**

With both services running, confirm `curl -s http://127.0.0.1:3100/health` returns `{"ok":true,...}`.

- [ ] **Step 2: Create the cron entry via the existing dashboard UI**

Open http://localhost:3000/cron, click "Add cron job", and fill in:

- **Name:** `codebase-reviewer-daily`
- **Schedule:** `0 8 * * *` (08:00 local every day)
- **Command:** `curl -s -X POST -H "Authorization: Bearer cb5fcc10443c58e41367cc5281d75089ef35554d72e3cf38" http://127.0.0.1:3100/reviews/tick`

(Use the actual `BRIDGE_TOKEN` from `apps/bridge/.env` — the one above is the current value from memory but double-check before submitting.)

Save and confirm the entry shows up in the list with `nextRunAt` in the future.

- [ ] **Step 3: Trigger it once manually**

In the cron UI, click "Run" on the new job. In the bridge logs, expect to see a call to `/reviews/tick`. In `/reviews`, expect eligible projects to move to `queued` then `running`.

- [ ] **Step 4: Commit the documented schedule**

This task only changes OpenClaw state, not repo files. Skip commit.

---

## Task 21: End-to-end smoke test

**Files:** none (manual verification).

- [ ] **Step 1: Clean-slate a single project run**

Pick one small project from the scan list (e.g. `Hebrew_cipher`). Confirm in the `/reviews` list that it is `enabled`, `idle`, and has no prior report.

- [ ] **Step 2: Click "Run now" for that project**

Watch the row: should go `queued` → `running` → `awaiting_ack`. Bridge logs should show session creation, prompt send, polling, final message capture, report write.

- [ ] **Step 3: Inspect the produced report**

Open the project folder. Verify:
- `Hebrew_cipher/.openclaw-review/<today>.md` exists.
- `Hebrew_cipher/.gitignore` contains `.openclaw-review/` (if it's a git repo).
- Report starts with `# Codebase Review — Hebrew_cipher — YYYY-MM-DD` and contains the six top-level headings.

- [ ] **Step 4: Inspect ideas on the dashboard**

Click into the project page at `/reviews/hebrew-cipher`. Confirm the report renders, ideas appear with impact/effort/category. Click status buttons and verify persistence across a hard refresh.

- [ ] **Step 5: Acknowledge and verify the 24h gate**

Click "Acknowledge". Expected: status becomes `idle`, the `Eligible` column shows ~"in 24h". Confirm in `state.json` that `lastAckedAt` is set and `eligibleAt` is ~24h in the future.

- [ ] **Step 6: Verify the skip-without-ack path**

Pick a second project, run it, leave it `awaiting_ack`. Manually call `/reviews/tick`:
```bash
curl -s -X POST -H "Authorization: Bearer $TOKEN" http://127.0.0.1:3100/reviews/tick
```
Expected response includes the awaiting-ack project in `skipped`, never in `enqueued`.

- [ ] **Step 7: Verify the backlog view**

Open `/reviews/ideas`. Confirm ideas from both projects show up, filters work (click status chips, then "clear").

- [ ] **Step 8: Commit a docs note for the rollout**

If anything was configured out-of-repo (the cron entry), jot a brief note. Otherwise, no commit needed. End of plan.

---

## Self-review summary

- **Spec coverage:** Every spec section maps to tasks:
  - Goal/non-goals: embedded in tasks 11 (runner prompt) and 12 (worker)
  - Data model: tasks 1, 3, 4, 5
  - Architecture: tasks 13, 14 (routes + mounting), task 20 (cron)
  - Discovery: task 6
  - Scheduling/eligibility: task 7
  - Worker (serial queue): task 12
  - Runner/agent: task 11
  - Prompt: task 10
  - Report format + parsing (incl. heading → category map): task 9
  - Report writing/gitignore: tasks 8 + 12
  - Dashboard pages (list/detail/backlog): tasks 17, 18, 19
  - Bridge API: tasks 13, 14
  - Env vars: task 2
  - Error handling & edge cases (startup repair, overwrite same-day, validation regex): tasks 6, 12, 13, 14
  - Manual rollout (scan, one-run, cron, overnight): task 21
  - Testing strategy (parser check + manual e2e given no framework): tasks 9, 21

- **Placeholder scan:** No TBDs, no "similar to above", no vague "add validation" — each step has concrete code or concrete commands.

- **Type consistency:** `ReviewProject`, `ReviewIdea`, `ReviewRun`, `ReviewerWorkerState` are defined in Task 1 and used consistently by name in all subsequent tasks. Method names match across services (`enqueue`, `enqueueAllEligible`, `getWorkerState`, `scanProjects`, `updateProject`, `getProject`, `listProjects`, `appendRun`, `tailRuns`, `listIdeas`, `listIdeasForReport`, `replaceIdeasForReport`, `setIdeaStatus`, `isEligible`, `computeEligibleAtAfterAck`, `ensureGitignore`, `parseReport`, `buildReviewPrompt`, `runReview`).
