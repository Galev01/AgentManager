# Multi-Root Scan + Add Project By Path Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the codebase reviewer discover projects across multiple folders on the user's PC, and also let the user add individual projects by absolute path through the dashboard.

**Architecture:**
- `config.reviewerScanRoots: string[]` derived from env var `REVIEWER_SCAN_ROOTS` (semicolon-separated, Windows-friendly), falling back to legacy single `REVIEWER_SCAN_ROOT`. A legacy getter `reviewerScanRoot` is kept returning `scanRoots[0]` for any residual callers.
- `ReviewerState.scanRoots: string[]` replaces `scanRoot`. On read, existing state files migrate transparently (`scanRoot` → `[scanRoot]`).
- `discovery.ts` loops over all roots. A project added via the new "Add by path" flow gets `adhoc: true`; for adhoc projects, missing detection uses direct `fs.stat` on the path instead of the seen-paths set (since they're not under any root).
- New endpoint `POST /reviews/projects/add` validates the path (absolute, directory exists, has `.git` or a known manifest file) and registers it as an adhoc project.
- Dashboard: `/reviews` shows the configured scan roots as a small chip list under the worker row, plus an "Add project" inline form next to the "Rescan projects" button.

**Tech Stack:** Same as prior plan — TypeScript across `packages/types`, Express in `apps/bridge`, Next.js App Router + Tailwind in `apps/dashboard`. Verification via `tsc --noEmit`.

---

## File Structure

**Modified:**
- `packages/types/src/index.ts` — `ReviewerState.scanRoots: string[]`; extend `ReviewsProjectsResponse` (in dashboard client) via new `scanRoots` field; add `adhoc?: boolean` to `ReviewProject`.
- `apps/bridge/src/config.ts` — add `reviewerScanRoots: string[]` getter; keep `reviewerScanRoot` as legacy alias returning `scanRoots[0]`.
- `apps/bridge/src/services/codebase-reviewer/state.ts` — migrate on read (`scanRoot → scanRoots`); default uses `config.reviewerScanRoots`.
- `apps/bridge/src/services/codebase-reviewer/discovery.ts` — loop roots; handle `adhoc` missing-check via `fs.stat`.
- `apps/bridge/src/routes/reviews.ts` — include `scanRoots` in `GET /reviews/projects` response; add `POST /reviews/projects/add`.
- `apps/dashboard/src/lib/bridge-client.ts` — update `ReviewsProjectsResponse` to include `scanRoots`; add `addReviewProject(absolutePath)`.
- `apps/dashboard/src/app/reviews/actions.ts` — add `addProjectAction(absolutePath)`.
- `apps/dashboard/src/components/reviews-table.tsx` — add `scanRoots` prop display + inline "Add project" form.
- `apps/dashboard/src/app/reviews/page.tsx` — pass `scanRoots` into the table.

**Created:** none.

---

## Task 1: Types — ReviewerState.scanRoots and ReviewProject.adhoc

**Files:**
- Modify: `packages/types/src/index.ts` around line 286-290 (`ReviewerState`) and 270-284 (`ReviewProject`).

- [ ] **Step 1: Add `adhoc?: boolean` to `ReviewProject`**

Find the existing `ReviewProject` type (around lines 270-284). Immediately after the `missing?: boolean;` line, add:

```typescript
  adhoc?: boolean;
```

So the type becomes:

```typescript
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
  adhoc?: boolean;
};
```

- [ ] **Step 2: Replace `ReviewerState`**

Find:

```typescript
export type ReviewerState = {
  scanRoot: string;
  projects: Record<string, ReviewProject>;
  updatedAt: string;
};
```

Replace with:

```typescript
export type ReviewerState = {
  scanRoots: string[];
  projects: Record<string, ReviewProject>;
  updatedAt: string;
};
```

- [ ] **Step 3: Verify**

```bash
cd packages/types && npx tsc --noEmit
```

Expected: clean exit. (Downstream breakage in `apps/bridge` is expected and will be fixed in subsequent tasks — do NOT attempt to build the bridge here.)

- [ ] **Step 4: Commit**

```bash
git add packages/types/src/index.ts
git commit -m "feat(types): multi-root scan and adhoc project fields"
```

---

## Task 2: Config — derive multiple scan roots

**Files:**
- Modify: `apps/bridge/src/config.ts` lines 19-20 (`reviewerScanRoot` block).

- [ ] **Step 1: Replace the `reviewerScanRoot` line with both new and legacy shapes**

Find:

```typescript
  reviewerScanRoot:
    process.env.REVIEWER_SCAN_ROOT || "C:\\Users\\GalLe\\Cursor projects",
```

Replace with:

```typescript
  reviewerScanRoots: (
    process.env.REVIEWER_SCAN_ROOTS ||
    process.env.REVIEWER_SCAN_ROOT ||
    "C:\\Users\\GalLe\\Cursor projects"
  )
    .split(/[;]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0),
  get reviewerScanRoot(): string {
    return (this as any).reviewerScanRoots[0] ?? "";
  },
```

Notes:
- Semicolon is the separator (Windows-safe; paths may contain `:` and `,` is awkward on Windows too).
- `reviewerScanRoot` stays as a getter that returns the first root, for any residual caller that hasn't been updated.
- `as any` is because the `as const` wrapper at the end of the config object makes `this` typing a headache; the cast is scoped to this one getter.

- [ ] **Step 2: Verify**

```bash
cd apps/bridge && npx tsc --noEmit
```

Expected: clean exit. (`state.ts` and `discovery.ts` still reference `reviewerScanRoot` — that's fine for this task, it returns `scanRoots[0]`. The type check is about the new code compiling.)

Note: some downstream refs will break in state.ts at build time because `ReviewerState.scanRoot` → `scanRoots` in types. If `tsc --noEmit` surfaces errors in `state.ts`, proceed — those are fixed in Task 3. But if errors are in `config.ts` itself, fix before committing.

- [ ] **Step 3: Commit**

```bash
git add apps/bridge/src/config.ts
git commit -m "feat(bridge): support multiple scan roots via REVIEWER_SCAN_ROOTS"
```

---

## Task 3: State — migrate `scanRoot` → `scanRoots` on read

**Files:**
- Modify: `apps/bridge/src/services/codebase-reviewer/state.ts`

- [ ] **Step 1: Rewrite the file**

Replace the entire content of `apps/bridge/src/services/codebase-reviewer/state.ts` with:

```typescript
import fs from "node:fs/promises";
import { config } from "../../config.js";
import type { ReviewProject, ReviewerState } from "@openclaw-manager/types";

function emptyState(): ReviewerState {
  return {
    scanRoots: [...config.reviewerScanRoots],
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
    const parsed = JSON.parse(raw) as Partial<ReviewerState> & {
      scanRoot?: string;
    };
    if (!parsed.projects) parsed.projects = {};
    if (!Array.isArray(parsed.scanRoots)) {
      if (parsed.scanRoot && typeof parsed.scanRoot === "string") {
        parsed.scanRoots = [parsed.scanRoot];
      } else {
        parsed.scanRoots = [...config.reviewerScanRoots];
      }
    }
    delete (parsed as any).scanRoot;
    return parsed as ReviewerState;
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

Key changes:
- `emptyState` uses `scanRoots` from config.
- `readState` migrates legacy `scanRoot` string to `scanRoots` array transparently, then strips the old field so it doesn't re-serialize.

- [ ] **Step 2: Verify**

```bash
cd apps/bridge && npx tsc --noEmit
```

Expected: clean. (discovery.ts still references `state.scanRoot` and `config.reviewerScanRoot` — will be fixed in Task 4. For this task, `tsc` should still be clean because `reviewerScanRoot` is a legacy getter and `state.scanRoot = ...` in discovery.ts will be a typescript error once types are in. Likely `tsc` fails here — in which case, DO NOT fix discovery.ts in this task, commit only state.ts, and the next task will fix discovery.)

Fallback: if `tsc --noEmit` on the bridge now fails only in `discovery.ts`, stage only state.ts and commit. The error chain will be resolved by Task 4.

- [ ] **Step 3: Commit**

```bash
git add apps/bridge/src/services/codebase-reviewer/state.ts
git commit -m "feat(bridge): migrate reviewer state to multi-root schema"
```

---

## Task 4: Discovery — scan multiple roots and handle adhoc

**Files:**
- Modify: `apps/bridge/src/services/codebase-reviewer/discovery.ts`

- [ ] **Step 1: Rewrite the file**

Replace the entire content of `apps/bridge/src/services/codebase-reviewer/discovery.ts` with:

```typescript
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

export async function isProject(folder: string): Promise<boolean> {
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

async function pathExists(p: string): Promise<boolean> {
  try {
    const s = await fs.stat(p);
    return s.isDirectory();
  } catch {
    return false;
  }
}

export async function scanProjects(): Promise<{
  added: string[];
  missing: string[];
  total: number;
}> {
  const state = await readState();
  const existing = new Map(Object.values(state.projects).map((p) => [p.path, p]));

  const roots = state.scanRoots.length
    ? state.scanRoots
    : config.reviewerScanRoots;

  const added: string[] = [];
  const seenPaths = new Set<string>();

  for (const root of roots) {
    let entries: string[] = [];
    try {
      const dirents = await fs.readdir(root, { withFileTypes: true });
      entries = dirents.filter((d) => d.isDirectory()).map((d) => d.name);
    } catch {
      continue;
    }

    for (const name of entries) {
      const fullPath = path.join(root, name);
      if (!(await isProject(fullPath))) continue;
      seenPaths.add(fullPath);

      const prev = existing.get(fullPath);
      if (prev) {
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
  }

  const missing: string[] = [];
  for (const project of Object.values(state.projects)) {
    if (project.adhoc) {
      const exists = await pathExists(project.path);
      if (!exists) {
        if (!project.missing) {
          project.missing = true;
          state.projects[project.id] = project;
        }
        missing.push(project.id);
      } else if (project.missing) {
        project.missing = false;
        state.projects[project.id] = project;
      }
      continue;
    }
    if (!seenPaths.has(project.path)) {
      if (!project.missing) {
        project.missing = true;
        state.projects[project.id] = project;
      }
      missing.push(project.id);
    }
  }

  state.scanRoots = [...roots];
  await replaceState(state);
  return { added, missing, total: Object.keys(state.projects).length };
}

export async function addProjectByPath(absolutePath: string): Promise<{
  project: ReviewProject;
  created: boolean;
}> {
  if (!path.isAbsolute(absolutePath)) {
    throw new Error("path must be absolute");
  }
  const normalized = path.normalize(absolutePath);
  if (!(await pathExists(normalized))) {
    throw new Error("directory not found");
  }
  if (!(await isProject(normalized))) {
    throw new Error("not a recognized project (no .git or manifest file)");
  }
  const state = await readState();
  for (const p of Object.values(state.projects)) {
    if (p.path === normalized) {
      if (p.missing) {
        p.missing = false;
        state.projects[p.id] = p;
        await replaceState(state);
      }
      return { project: p, created: false };
    }
  }
  const name = path.basename(normalized) || "project";
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
    path: normalized,
    enabled: true,
    status: "idle",
    discoveredAt: nowIso,
    lastRunAt: null,
    lastReportPath: null,
    lastReportDate: null,
    lastAckedAt: null,
    eligibleAt: null,
    lastError: null,
    adhoc: true,
  };
  state.projects[id] = project;
  await replaceState(state);
  return { project, created: true };
}
```

Changes:
- Loops all roots; silently skips unreadable roots.
- Adhoc projects have their own missing-check using `fs.stat`.
- Exports `addProjectByPath(absolutePath)` for the new HTTP route.

- [ ] **Step 2: Verify**

```bash
cd apps/bridge && npx tsc --noEmit
```

Expected: clean exit.

- [ ] **Step 3: Commit**

```bash
git add apps/bridge/src/services/codebase-reviewer/discovery.ts
git commit -m "feat(bridge): scan multiple roots and support adhoc project missing detection"
```

---

## Task 5: Bridge route — include scanRoots + POST add

**Files:**
- Modify: `apps/bridge/src/routes/reviews.ts`

- [ ] **Step 1: Add imports**

Near the top of the file, find the import for `scanProjects` from `discovery.js`:

```typescript
import { scanProjects } from "../services/codebase-reviewer/discovery.js";
```

Replace with:

```typescript
import {
  scanProjects,
  addProjectByPath,
} from "../services/codebase-reviewer/discovery.js";
```

Also add, near the existing state imports:

```typescript
import { readState } from "../services/codebase-reviewer/state.js";
```

(Only if not already imported. If the file already imports from `state.js`, extend that import list to include `readState`.)

- [ ] **Step 2: Enrich `GET /reviews/projects` to include scanRoots**

Find the handler:

```typescript
router.get("/reviews/projects", async (_req: Request, res: Response) => {
  try {
    const projects = await listProjects();
    res.json({ projects, worker: getWorkerState() });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "failed" });
  }
});
```

Replace with:

```typescript
router.get("/reviews/projects", async (_req: Request, res: Response) => {
  try {
    const [projects, state] = await Promise.all([listProjects(), readState()]);
    res.json({ projects, worker: getWorkerState(), scanRoots: state.scanRoots });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "failed" });
  }
});
```

- [ ] **Step 3: Add `POST /reviews/projects/add` handler**

Find the existing `router.post("/reviews/projects/scan", ...)` handler and insert the new handler directly after it (before the `router.patch(...)` line for `/reviews/projects/:id`):

```typescript
router.post("/reviews/projects/add", async (req: Request, res: Response) => {
  const raw = req.body?.path;
  if (typeof raw !== "string" || raw.trim().length === 0) {
    return void res.status(400).json({ error: "path required" });
  }
  try {
    const result = await addProjectByPath(raw.trim());
    res.json(result);
  } catch (err: any) {
    const message = err?.message || "failed";
    const code =
      message === "path must be absolute" ||
      message === "directory not found" ||
      message.startsWith("not a recognized project")
        ? 400
        : 500;
    res.status(code).json({ error: message });
  }
});
```

- [ ] **Step 4: Verify**

```bash
cd apps/bridge && npx tsc --noEmit
```

Expected: clean exit.

- [ ] **Step 5: Commit**

```bash
git add apps/bridge/src/routes/reviews.ts
git commit -m "feat(bridge): expose scanRoots and add POST /reviews/projects/add"
```

---

## Task 6: Dashboard bridge-client — scanRoots + addReviewProject

**Files:**
- Modify: `apps/dashboard/src/lib/bridge-client.ts`

- [ ] **Step 1: Update `ReviewsProjectsResponse` type**

Find:

```typescript
export type ReviewsProjectsResponse = {
  projects: ReviewProject[];
  worker: ReviewerWorkerState;
};
```

Replace with:

```typescript
export type ReviewsProjectsResponse = {
  projects: ReviewProject[];
  worker: ReviewerWorkerState;
  scanRoots: string[];
};
```

- [ ] **Step 2: Add `addReviewProject` function**

Find the `scanReviewProjects` function:

```typescript
export async function scanReviewProjects(): Promise<{
  added: string[];
  missing: string[];
  total: number;
}> {
  return bridgeFetch("/reviews/projects/scan", { method: "POST" });
}
```

Immediately after it, add:

```typescript
export async function addReviewProject(
  absolutePath: string
): Promise<{ project: ReviewProject; created: boolean }> {
  return bridgeFetch("/reviews/projects/add", {
    method: "POST",
    body: JSON.stringify({ path: absolutePath }),
  });
}
```

- [ ] **Step 3: Verify**

```bash
cd apps/dashboard && npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add apps/dashboard/src/lib/bridge-client.ts
git commit -m "feat(dashboard): bridge-client for scanRoots and addReviewProject"
```

---

## Task 7: Dashboard — addProjectAction server action

**Files:**
- Modify: `apps/dashboard/src/app/reviews/actions.ts`

- [ ] **Step 1: Add the action**

Add `addReviewProject` to the imports from `@/lib/bridge-client` (merge into the existing import line). Then append to the end of the file:

```typescript
export async function addProjectAction(
  absolutePath: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await addReviewProject(absolutePath);
    revalidatePath("/reviews");
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message || "failed" };
  }
}
```

- [ ] **Step 2: Verify**

```bash
cd apps/dashboard && npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add apps/dashboard/src/app/reviews/actions.ts
git commit -m "feat(dashboard): addProjectAction server action"
```

---

## Task 8: Dashboard — scan roots chips + "Add project" form in reviews-table

**Files:**
- Modify: `apps/dashboard/src/components/reviews-table.tsx`
- Modify: `apps/dashboard/src/app/reviews/page.tsx`

- [ ] **Step 1: Update `ReviewsTable` to accept and render scan roots + add-project form**

In `apps/dashboard/src/components/reviews-table.tsx`:

1. Update the `actions.ts` import block to also import `addProjectAction`:

```typescript
import {
  ackAction,
  addProjectAction,
  runNowAction,
  scanAction,
  toggleEnabledAction,
} from "@/app/reviews/actions";
```

2. Add `useState` to the React import at the top of the file (the file already imports `useTransition`; extend it):

```typescript
import { useState, useTransition } from "react";
```

3. Change the component's prop signature. Find:

```typescript
export function ReviewsTable({
  projects,
  worker,
}: {
  projects: ReviewProject[];
  worker: ReviewerWorkerState;
}) {
```

Replace with:

```typescript
export function ReviewsTable({
  projects,
  worker,
  scanRoots,
}: {
  projects: ReviewProject[];
  worker: ReviewerWorkerState;
  scanRoots: string[];
}) {
```

4. Inside the component body, directly after the existing `const [pending, startTransition] = useTransition();` line, add:

```typescript
  const [showAdd, setShowAdd] = useState(false);
  const [newPath, setNewPath] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
```

5. Find the existing toolbar block — the `<div className="flex items-center gap-4 text-sm text-zinc-400">` that contains the Worker status and "Rescan projects" button. Replace that entire block with:

```tsx
      <div className="space-y-2">
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
          <div className="ml-auto flex gap-2">
            <button
              disabled={pending}
              onClick={() => {
                setShowAdd((v) => !v);
                setAddError(null);
              }}
              className="rounded bg-zinc-800 px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-700 disabled:opacity-50"
            >
              {showAdd ? "Cancel" : "Add project"}
            </button>
            <button
              disabled={pending}
              onClick={() => startTransition(() => scanAction())}
              className="rounded bg-zinc-800 px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-700 disabled:opacity-50"
            >
              Rescan projects
            </button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1 text-xs text-zinc-500">
          <span>Scan roots:</span>
          {scanRoots.length === 0 ? (
            <span className="text-zinc-600">none configured</span>
          ) : (
            scanRoots.map((r) => (
              <span
                key={r}
                className="rounded bg-zinc-800/80 px-2 py-0.5 font-mono text-[11px] text-zinc-400"
              >
                {r}
              </span>
            ))
          )}
        </div>
        {showAdd && (
          <div className="flex items-center gap-2 rounded border border-zinc-800 bg-zinc-900/60 px-3 py-2">
            <input
              type="text"
              value={newPath}
              onChange={(e) => setNewPath(e.target.value)}
              placeholder="Absolute path (e.g. C:\Users\you\code\my-repo)"
              className="flex-1 rounded bg-zinc-950 px-2 py-1 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-primary/50"
            />
            <button
              disabled={pending || newPath.trim().length === 0}
              onClick={() =>
                startTransition(async () => {
                  const result = await addProjectAction(newPath.trim());
                  if (result.ok) {
                    setNewPath("");
                    setShowAdd(false);
                    setAddError(null);
                  } else {
                    setAddError(result.error);
                  }
                })
              }
              className="rounded bg-primary/20 px-3 py-1 text-xs font-medium text-primary hover:bg-primary/30 disabled:opacity-50"
            >
              Add
            </button>
          </div>
        )}
        {addError && (
          <p className="text-xs text-red-300">Couldn't add: {addError}</p>
        )}
      </div>
```

This replaces only the toolbar; the rest of the component (the `<div className="overflow-hidden rounded border border-zinc-800">...</div>` wrapping the table) is untouched.

- [ ] **Step 2: Update `/reviews` page to pass `scanRoots`**

In `apps/dashboard/src/app/reviews/page.tsx`:

1. Add `scanRoots` to the initial state:

```typescript
  let projects: ReviewProject[] = [];
  let worker: ReviewerWorkerState = { current: null, queue: [] };
  let scanRoots: string[] = [];
  let error: string | null = null;
```

2. Extract `scanRoots` from the result:

```typescript
    const result = await getReviewProjects();
    projects = result.projects;
    worker = result.worker;
    scanRoots = result.scanRoots;
```

3. Pass the prop to `<ReviewsTable>`:

```tsx
          <ReviewsTable projects={projects} worker={worker} scanRoots={scanRoots} />
```

- [ ] **Step 3: Verify**

```bash
cd apps/dashboard && npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add apps/dashboard/src/components/reviews-table.tsx apps/dashboard/src/app/reviews/page.tsx
git commit -m "feat(dashboard): show scan roots and add-project form on reviews list"
```

---

## Task 9: Final stack-wide verification

- [ ] **Step 1: Type check all three packages**

```bash
cd packages/types && npx tsc --noEmit
cd ../../apps/bridge && npx tsc --noEmit
cd ../dashboard && npx tsc --noEmit
```

All three must exit clean.

- [ ] **Step 2: Manual verification (user-driven, after merge)**

To actually exercise this:
1. Set `REVIEWER_SCAN_ROOTS="C:\Users\GalLe\Cursor projects;C:\Users\GalLe\other-folder"` in bridge env and restart bridge.
2. Visit `/reviews` — scan roots appear as chips below the worker row.
3. Click "Rescan projects" — projects from both roots should appear.
4. Click "Add project" — type an absolute path to a repo outside those roots — it should appear with an "adhoc" origin (though UI doesn't distinguish).
5. Invalid paths return an inline error below the form.

---

## Self-Review

**Spec coverage:**
- ✅ Multiple scan roots via env (`REVIEWER_SCAN_ROOTS`, `;`-separated, backward-compatible with `REVIEWER_SCAN_ROOT`) — Tasks 2, 3, 4.
- ✅ Scan roots visible in dashboard — Task 8.
- ✅ Add individual projects by absolute path — Tasks 4, 5, 6, 7, 8.
- ✅ Adhoc projects don't break missing-detection — Task 4.
- ✅ Legacy state files migrate on read — Task 3.

**Placeholder scan:** none — all code present.

**Type consistency:** `ReviewerState.scanRoots: string[]` matches across types, state.ts, discovery.ts, route response, bridge-client, page. `adhoc?: boolean` matches across types, discovery.ts.
