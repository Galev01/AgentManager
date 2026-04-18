# Review Inbox Triage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the codebase-review feature from a passive report archive into an actionable inbox: each review run gets a triage state, a severity rank, a clear recommended action, and a cross-project inbox view.

**Architecture:** Per-report metadata (triage state + notes) is persisted as a new JSON file (`report-meta.json`) in the existing reviewer state directory, alongside `state.json` and `ideas.json`. Severity is **derived** on read from the report's ideas (no migration). The bridge gains four new endpoints (one PATCH for triage, one GET for the cross-project inbox, plus enriched existing endpoints). The dashboard gains a new `/reviews/inbox` route, a `RecommendedActionPanel` component on the project detail page, severity/triage badge components, and improved empty states + lifecycle display on the existing reviews list.

**Tech Stack:** TypeScript across `packages/types`, Express in `apps/bridge`, Next.js App Router (server + client components) + Tailwind in `apps/dashboard`. No test runner exists in this monorepo (confirmed by exploration), so verification is via `tsc --noEmit`, the bridge dev server + `curl`, and the dashboard dev server in a browser.

**Out of scope (separate plans):** Auto-digest with deltas, Review-to-Issue handoff to a task system, dedup/grouping, IA reorganization, session continuity, action+evidence split layout.

**PM source:** `.openclaw-review/2026-04-17.md` — addresses "Review Inbox with Triage States", "Severity Ladder and Color Semantics", "Make Reviews the System's Next Best Action Layer", "No Explicit Lifecycle for Review Runs", and "Empty-State Guidance".

---

## File Structure

**New files:**
- `apps/bridge/src/services/codebase-reviewer/report-meta.ts` — JSON-backed CRUD for per-report triage metadata
- `apps/bridge/src/services/codebase-reviewer/severity.ts` — pure function deriving severity from ideas
- `apps/dashboard/src/components/severity-badge.tsx` — reusable severity badge
- `apps/dashboard/src/components/triage-badge.tsx` — reusable triage state badge
- `apps/dashboard/src/components/triage-actions.tsx` — client-component button group for setting triage state
- `apps/dashboard/src/components/recommended-action-panel.tsx` — top-of-page CTA panel for review detail
- `apps/dashboard/src/components/inbox-table.tsx` — cross-project review inbox table with filters + bulk actions
- `apps/dashboard/src/components/reviews-empty-state.tsx` — guided empty-state component
- `apps/dashboard/src/app/reviews/inbox/page.tsx` — new `/reviews/inbox` route
- `apps/dashboard/src/app/reviews/inbox/actions.ts` — server actions for triage updates and bulk operations

**Modified files:**
- `packages/types/src/index.ts` — add `ReviewSeverity`, `ReviewTriageState`, `ReviewReportMeta`, extend `ReviewReportSummary`
- `apps/bridge/src/config.ts` — add `reviewerReportMetaPath` getter
- `apps/bridge/src/routes/reviews.ts` — enrich `GET /reviews/projects/:id/reports` and `GET /reviews/projects/:id/reports/:date`; add `PATCH /reviews/projects/:id/reports/:date/triage`; add `GET /reviews/inbox`
- `apps/dashboard/src/lib/bridge-client.ts` — add `setReportTriage`, `getReviewInbox`; update return types
- `apps/dashboard/src/components/sidebar.tsx` — add "Inbox" link under Manage
- `apps/dashboard/src/components/reviews-table.tsx` — add severity column, last-success/last-failure/duration columns, replace blank rendering when empty
- `apps/dashboard/src/app/reviews/page.tsx` — wire up empty state
- `apps/dashboard/src/app/reviews/[projectId]/page.tsx` — wire RecommendedActionPanel + triage controls + severity into header and history sidebar
- `apps/dashboard/src/app/reviews/actions.ts` — add `setTriageAction` server action

**Each file's responsibility:**
- `report-meta.ts`: same shape as `ideas.ts` — atomic JSON read/write for triage metadata keyed by `(projectId, reportDate)`. Default triage = `'new'` when no record exists.
- `severity.ts`: single pure function `deriveSeverity(ideas: ReviewIdea[]): ReviewSeverity` — no I/O, easy to reason about.
- All UI components are presentational where possible; only `triage-actions.tsx` and `inbox-table.tsx` are client components.

---

## Severity Derivation Rules

The reviewer ideas have `impact: 'low' | 'medium' | 'high'`. Severity has 5 levels (`critical | high | medium | low | info`) per the PM spec. Derivation:

```
const highCount = ideas.filter(i => i.impact === 'high').length;
if (highCount >= 3) return 'critical';
if (highCount >= 1) return 'high';
if (ideas.some(i => i.impact === 'medium')) return 'medium';
if (ideas.length > 0) return 'low';
return 'info';
```

Tooltip copy per level:
- **critical** — "3+ high-impact findings — review urgently"
- **high** — "Contains at least one high-impact finding"
- **medium** — "Medium-impact findings only"
- **low** — "Low-impact findings only"
- **info** — "No actionable findings — informational"

Color tokens (Tailwind, dark theme — matches existing badge style):
- critical: `bg-red-500/15 text-red-300 ring-1 ring-red-500/30`
- high: `bg-orange-500/15 text-orange-300 ring-1 ring-orange-500/30`
- medium: `bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/30`
- low: `bg-sky-500/15 text-sky-300 ring-1 ring-sky-500/30`
- info: `bg-zinc-500/15 text-zinc-400 ring-1 ring-zinc-500/30`

---

## Triage State Rules

States: `'new' | 'needs_attention' | 'actionable' | 'dismissed' | 'resolved'`. Default = `'new'` for any report with no metadata record.

State transitions (no enforcement — UI just exposes them):
- `new` → any other state (operator triages it)
- `needs_attention` / `actionable` → `dismissed` or `resolved`
- `dismissed` / `resolved` → `new` (reopen)

Color tokens:
- new: `bg-sky-500/15 text-sky-300`
- needs_attention: `bg-amber-500/15 text-amber-300`
- actionable: `bg-emerald-500/15 text-emerald-300`
- dismissed: `bg-zinc-700/15 text-zinc-500`
- resolved: `bg-zinc-500/15 text-zinc-400`

Recommended action mapping (used by `RecommendedActionPanel`):
- triage=`new`, severity=`critical`/`high` → primary CTA: "Investigate now"; secondary: "Mark needs attention", "Dismiss"
- triage=`new`, severity=`medium`/`low`/`info` → primary CTA: "Triage"; secondary: "Mark actionable", "Dismiss"
- triage=`needs_attention` → primary CTA: "Mark resolved"; secondary: "Mark actionable"
- triage=`actionable` → primary CTA: "Mark resolved"; secondary: "Dismiss"
- triage=`dismissed` / `resolved` → primary CTA: "Reopen"; secondary: none

Each CTA invokes the `setTriageAction` server action.

---

## Verification Approach

This monorepo has no configured test runner (no `vitest`/`jest` in `apps/dashboard/package.json`, no `*.test.ts` files). Per-task verification therefore uses:

1. **Type check:** `cd apps/bridge && npx tsc --noEmit` and `cd apps/dashboard && npx tsc --noEmit` and `cd packages/types && npx tsc --noEmit`. These must pass.
2. **Pure-function sanity:** for `severity.ts`, write a one-off Node script in a `*.spec.mjs` file under the same directory, run with `node`, then delete it after the task. Steps below show the exact script.
3. **Bridge endpoint smoke:** start bridge dev server (assumed already running on `127.0.0.1:3100` with `BRIDGE_TOKEN` set; if not, the user runs it). Use `curl` with the token from env to verify each new/modified endpoint.
4. **Dashboard smoke:** start `apps/dashboard` in dev mode, open browser to the relevant route, verify rendering matches the screenshots described in each task.

If a step says "verify in browser" and no browser is available to the executing subagent, it should explicitly report that as an unverified step rather than claim success.

---

## Task 1: Add types for severity, triage, and report metadata

**Files:**
- Modify: `packages/types/src/index.ts:332-337` (extend `ReviewReportSummary`); insert new types after `ReviewReportSummary` block

- [ ] **Step 1: Add new types**

In `packages/types/src/index.ts`, locate the existing `ReviewReportSummary` (currently at lines 332-337) and replace it, then append the new types. The full diff inserted/replaced:

```typescript
export type ReviewSeverity = "critical" | "high" | "medium" | "low" | "info";

export type ReviewTriageState =
  | "new"
  | "needs_attention"
  | "actionable"
  | "dismissed"
  | "resolved";

export type ReviewReportMeta = {
  projectId: string;
  reportDate: string;
  triageState: ReviewTriageState;
  triageChangedAt: string | null;
  triageNote: string | null;
};

export type ReviewReportSummary = {
  reportDate: string;
  reportPath: string;
  ideasCount: number;
  acked: boolean;
  severity: ReviewSeverity;
  triageState: ReviewTriageState;
  triageChangedAt: string | null;
};

export type ReviewInboxItem = {
  projectId: string;
  projectName: string;
  reportDate: string;
  ideasCount: number;
  severity: ReviewSeverity;
  triageState: ReviewTriageState;
  triageChangedAt: string | null;
  acked: boolean;
};
```

The `ReviewReportSummary` type already exists; this step replaces it with the extended version (adds three fields) and inserts the four new types around it.

- [ ] **Step 2: Verify types compile**

Run: `cd packages/types && npx tsc --noEmit`
Expected: clean exit, no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/types/src/index.ts
git commit -m "feat(types): add severity, triage, and report metadata types for review inbox"
```

---

## Task 2: Add config path for report metadata

**Files:**
- Modify: `apps/bridge/src/config.ts:36-38` (add new getter alongside existing `reviewerIdeasPath`)

- [ ] **Step 1: Add `reviewerReportMetaPath` getter**

In `apps/bridge/src/config.ts`, find this block (lines 36-38):

```typescript
  get reviewerIdeasPath() {
    return path.join(this.reviewerStateDir, "ideas.json");
  },
```

Add directly after it:

```typescript
  get reviewerReportMetaPath() {
    return path.join(this.reviewerStateDir, "report-meta.json");
  },
```

- [ ] **Step 2: Verify bridge compiles**

Run: `cd apps/bridge && npx tsc --noEmit`
Expected: clean exit, no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/bridge/src/config.ts
git commit -m "feat(bridge): add reviewerReportMetaPath config"
```

---

## Task 3: Implement severity derivation pure function

**Files:**
- Create: `apps/bridge/src/services/codebase-reviewer/severity.ts`

- [ ] **Step 1: Write the module**

Create `apps/bridge/src/services/codebase-reviewer/severity.ts`:

```typescript
import type { ReviewIdea, ReviewSeverity } from "@openclaw-manager/types";

export function deriveSeverity(ideas: ReviewIdea[]): ReviewSeverity {
  const highCount = ideas.filter((i) => i.impact === "high").length;
  if (highCount >= 3) return "critical";
  if (highCount >= 1) return "high";
  if (ideas.some((i) => i.impact === "medium")) return "medium";
  if (ideas.length > 0) return "low";
  return "info";
}
```

- [ ] **Step 2: Write a temporary spec script and run it**

Create `apps/bridge/src/services/codebase-reviewer/severity.spec.mjs`:

```javascript
import { deriveSeverity } from "./severity.js";

function assertEq(actual, expected, label) {
  if (actual !== expected) {
    console.error(`FAIL ${label}: expected ${expected}, got ${actual}`);
    process.exit(1);
  }
  console.log(`OK   ${label}`);
}

const make = (impact) => ({ impact });

assertEq(deriveSeverity([]), "info", "empty -> info");
assertEq(deriveSeverity([make("low")]), "low", "one low -> low");
assertEq(deriveSeverity([make("medium")]), "medium", "one medium -> medium");
assertEq(deriveSeverity([make("low"), make("medium")]), "medium", "low+medium -> medium");
assertEq(deriveSeverity([make("high")]), "high", "one high -> high");
assertEq(deriveSeverity([make("high"), make("high")]), "high", "two high -> high");
assertEq(deriveSeverity([make("high"), make("high"), make("high")]), "critical", "three high -> critical");
assertEq(deriveSeverity([make("high"), make("low"), make("high"), make("high")]), "critical", "3+ high -> critical");
console.log("ALL OK");
```

First build the bridge so the `.js` exists:
```bash
cd apps/bridge && npx tsc --noEmit && npx tsc
```

Then run:
```bash
cd apps/bridge && node dist/services/codebase-reviewer/severity.spec.mjs 2>&1 || node src/services/codebase-reviewer/severity.spec.mjs 2>&1
```

If the bridge build outputs to a different location, adjust the path. As a fallback, run with `tsx`:
```bash
cd apps/bridge && npx tsx src/services/codebase-reviewer/severity.spec.mjs
```

Expected: 8 lines of `OK ...` followed by `ALL OK`.

- [ ] **Step 3: Delete the spec script**

```bash
rm apps/bridge/src/services/codebase-reviewer/severity.spec.mjs
```

- [ ] **Step 4: Commit**

```bash
git add apps/bridge/src/services/codebase-reviewer/severity.ts
git commit -m "feat(bridge): add deriveSeverity pure function for review reports"
```

---

## Task 4: Implement report-meta JSON store

**Files:**
- Create: `apps/bridge/src/services/codebase-reviewer/report-meta.ts`

- [ ] **Step 1: Write the module**

Create `apps/bridge/src/services/codebase-reviewer/report-meta.ts`:

```typescript
import fs from "node:fs/promises";
import { config } from "../../config.js";
import type { ReviewReportMeta, ReviewTriageState } from "@openclaw-manager/types";

type ReportMetaFile = { entries: ReviewReportMeta[]; updatedAt: string };

async function ensureDir(): Promise<void> {
  await fs.mkdir(config.reviewerStateDir, { recursive: true });
}

async function readFile(): Promise<ReportMetaFile> {
  try {
    const raw = await fs.readFile(config.reviewerReportMetaPath, "utf8");
    const parsed = JSON.parse(raw) as ReportMetaFile;
    if (!Array.isArray(parsed.entries)) parsed.entries = [];
    return parsed;
  } catch {
    return { entries: [], updatedAt: new Date().toISOString() };
  }
}

async function writeFile(file: ReportMetaFile): Promise<void> {
  await ensureDir();
  file.updatedAt = new Date().toISOString();
  const tmp = config.reviewerReportMetaPath + ".tmp";
  await fs.writeFile(tmp, JSON.stringify(file, null, 2) + "\n", "utf8");
  await fs.rename(tmp, config.reviewerReportMetaPath);
}

export function defaultMeta(projectId: string, reportDate: string): ReviewReportMeta {
  return {
    projectId,
    reportDate,
    triageState: "new",
    triageChangedAt: null,
    triageNote: null,
  };
}

export async function getMeta(
  projectId: string,
  reportDate: string
): Promise<ReviewReportMeta> {
  const { entries } = await readFile();
  const found = entries.find(
    (e) => e.projectId === projectId && e.reportDate === reportDate
  );
  return found ?? defaultMeta(projectId, reportDate);
}

export async function listMeta(): Promise<ReviewReportMeta[]> {
  const { entries } = await readFile();
  return entries;
}

export async function setTriage(
  projectId: string,
  reportDate: string,
  triageState: ReviewTriageState,
  triageNote?: string | null
): Promise<ReviewReportMeta> {
  const file = await readFile();
  const idx = file.entries.findIndex(
    (e) => e.projectId === projectId && e.reportDate === reportDate
  );
  const now = new Date().toISOString();
  const next: ReviewReportMeta = {
    projectId,
    reportDate,
    triageState,
    triageChangedAt: now,
    triageNote: triageNote ?? null,
  };
  if (idx >= 0) file.entries[idx] = next;
  else file.entries.push(next);
  await writeFile(file);
  return next;
}
```

- [ ] **Step 2: Verify bridge compiles**

Run: `cd apps/bridge && npx tsc --noEmit`
Expected: clean exit, no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/bridge/src/services/codebase-reviewer/report-meta.ts
git commit -m "feat(bridge): add report-meta JSON store for review triage state"
```

---

## Task 5: Enrich GET /reviews/projects/:id/reports with severity and triage

**Files:**
- Modify: `apps/bridge/src/routes/reviews.ts` — imports + the `GET /reviews/projects/:id/reports` handler at lines 111-146

- [ ] **Step 1: Add imports**

In `apps/bridge/src/routes/reviews.ts`, add to the imports block at the top (after the existing `ideas.js` import block at lines 16-20):

```typescript
import { getMeta, setTriage } from "../services/codebase-reviewer/report-meta.js";
import { deriveSeverity } from "../services/codebase-reviewer/severity.js";
```

Also add `ReviewTriageState` to the type-only import block at lines 21-27. The new block should look like:

```typescript
import type {
  ReviewIdeaStatus,
  ReviewIdeaImpact,
  ReviewIdeaEffort,
  ReviewIdeaCategory,
  ReviewReportSummary,
  ReviewTriageState,
} from "@openclaw-manager/types";
```

- [ ] **Step 2: Replace the reports list handler**

In `apps/bridge/src/routes/reviews.ts`, replace the entire `router.get("/reviews/projects/:id/reports", ...)` handler (lines 111-146) with:

```typescript
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
        const meta = await getMeta(id, date);
        summaries.push({
          reportDate: date,
          reportPath: path.join(dir, f),
          ideasCount: ideas.length,
          acked:
            project.lastReportDate === date
              ? project.lastAckedAt !== null
              : true,
          severity: deriveSeverity(ideas),
          triageState: meta.triageState,
          triageChangedAt: meta.triageChangedAt,
        });
      }
      res.json({ reports: summaries });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "failed" });
    }
  }
);
```

- [ ] **Step 3: Verify bridge compiles**

Run: `cd apps/bridge && npx tsc --noEmit`
Expected: clean exit, no errors.

- [ ] **Step 4: Smoke test the endpoint**

Start (or assume running) bridge dev server. With the bridge token from `apps/bridge/.env` or environment, find a real project id by first calling:

```bash
curl -s -H "Authorization: Bearer $BRIDGE_TOKEN" http://127.0.0.1:3100/reviews/projects | head -200
```

Pick an `id` that has reports, then:

```bash
curl -s -H "Authorization: Bearer $BRIDGE_TOKEN" http://127.0.0.1:3100/reviews/projects/<id>/reports
```

Expected: JSON `{ reports: [...] }` where each entry now has `severity` (one of critical/high/medium/low/info) and `triageState` (defaulting to `"new"`).

If the bridge isn't running, document this as an unverified step and proceed.

- [ ] **Step 5: Commit**

```bash
git add apps/bridge/src/routes/reviews.ts
git commit -m "feat(bridge): include severity and triage in reports list response"
```

---

## Task 6: Add PATCH /reviews/projects/:id/reports/:date/triage endpoint

**Files:**
- Modify: `apps/bridge/src/routes/reviews.ts` — add new handler after the existing report-detail handler (after line 171)

- [ ] **Step 1: Add the route**

In `apps/bridge/src/routes/reviews.ts`, immediately after the `router.get("/reviews/projects/:id/reports/:date", ...)` handler (which ends around line 171), insert:

```typescript
const TRIAGE_STATES: ReviewTriageState[] = [
  "new",
  "needs_attention",
  "actionable",
  "dismissed",
  "resolved",
];

router.patch(
  "/reviews/projects/:id/reports/:date/triage",
  async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const date = req.params.date as string;
    if (!ID_RE.test(id)) return badId(res);
    if (!DATE_RE.test(date)) return badDate(res);
    const triageState = req.body?.triageState as ReviewTriageState | undefined;
    if (!triageState || !TRIAGE_STATES.includes(triageState)) {
      return void res.status(400).json({ error: "invalid triageState" });
    }
    const triageNote =
      typeof req.body?.triageNote === "string" ? req.body.triageNote : null;
    try {
      const project = await getProject(id);
      if (!project) return void res.status(404).json({ error: "not found" });
      const reportPath = path.join(project.path, ".openclaw-review", `${date}.md`);
      try {
        await fs.access(reportPath);
      } catch {
        return void res.status(404).json({ error: "report not found" });
      }
      const meta = await setTriage(id, date, triageState, triageNote);
      res.json({ meta });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "failed" });
    }
  }
);
```

- [ ] **Step 2: Verify bridge compiles**

Run: `cd apps/bridge && npx tsc --noEmit`
Expected: clean exit, no errors.

- [ ] **Step 3: Smoke test**

```bash
curl -s -X PATCH \
  -H "Authorization: Bearer $BRIDGE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"triageState":"actionable"}' \
  http://127.0.0.1:3100/reviews/projects/<id>/reports/<date>/triage
```

Expected: `{ meta: { projectId, reportDate, triageState: "actionable", triageChangedAt: "<iso>", triageNote: null } }`

Verify persistence by re-reading the reports list (Task 5 endpoint) — `triageState` for that date should now be `"actionable"`.

Test invalid input:
```bash
curl -s -X PATCH \
  -H "Authorization: Bearer $BRIDGE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"triageState":"bogus"}' \
  http://127.0.0.1:3100/reviews/projects/<id>/reports/<date>/triage
```
Expected: 400 with `{ error: "invalid triageState" }`.

- [ ] **Step 4: Commit**

```bash
git add apps/bridge/src/routes/reviews.ts
git commit -m "feat(bridge): add PATCH endpoint for report triage state"
```

---

## Task 7: Add GET /reviews/inbox cross-project endpoint

**Files:**
- Modify: `apps/bridge/src/routes/reviews.ts` — add new handler before the final `export default router;` line

- [ ] **Step 1: Add imports if not present**

Confirm the import line for `ReviewInboxItem` in the type-only import block. Update the type imports block to include it:

```typescript
import type {
  ReviewIdeaStatus,
  ReviewIdeaImpact,
  ReviewIdeaEffort,
  ReviewIdeaCategory,
  ReviewReportSummary,
  ReviewTriageState,
  ReviewInboxItem,
} from "@openclaw-manager/types";
```

- [ ] **Step 2: Add the route**

In `apps/bridge/src/routes/reviews.ts`, immediately before `export default router;`, insert:

```typescript
const SEVERITY_ORDER: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  info: 4,
};
const TRIAGE_ORDER: Record<string, number> = {
  new: 0,
  needs_attention: 1,
  actionable: 2,
  dismissed: 3,
  resolved: 4,
};

router.get("/reviews/inbox", async (req: Request, res: Response) => {
  try {
    const projects = await listProjects();
    const triageFilter = parseArrayParam<ReviewTriageState>(
      req.query.triage,
      new Set(["new", "needs_attention", "actionable", "dismissed", "resolved"])
    );
    const items: ReviewInboxItem[] = [];
    for (const project of projects) {
      if (project.missing) continue;
      const dir = path.join(project.path, ".openclaw-review");
      let files: string[] = [];
      try {
        files = (await fs.readdir(dir)).filter((f) =>
          /^\d{4}-\d{2}-\d{2}\.md$/.test(f)
        );
      } catch {
        continue;
      }
      for (const f of files) {
        const date = f.replace(/\.md$/, "");
        const ideas = await listIdeasForReport(project.id, date);
        const meta = await getMeta(project.id, date);
        if (triageFilter && !triageFilter.includes(meta.triageState)) continue;
        items.push({
          projectId: project.id,
          projectName: project.name,
          reportDate: date,
          ideasCount: ideas.length,
          severity: deriveSeverity(ideas),
          triageState: meta.triageState,
          triageChangedAt: meta.triageChangedAt,
          acked:
            project.lastReportDate === date
              ? project.lastAckedAt !== null
              : true,
        });
      }
    }
    items.sort((a, b) => {
      const triageDiff = TRIAGE_ORDER[a.triageState] - TRIAGE_ORDER[b.triageState];
      if (triageDiff !== 0) return triageDiff;
      const sevDiff = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
      if (sevDiff !== 0) return sevDiff;
      return a.reportDate < b.reportDate ? 1 : -1;
    });
    res.json({ items });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "failed" });
  }
});
```

- [ ] **Step 3: Verify bridge compiles**

Run: `cd apps/bridge && npx tsc --noEmit`
Expected: clean exit, no errors.

- [ ] **Step 4: Smoke test**

```bash
curl -s -H "Authorization: Bearer $BRIDGE_TOKEN" http://127.0.0.1:3100/reviews/inbox
curl -s -H "Authorization: Bearer $BRIDGE_TOKEN" "http://127.0.0.1:3100/reviews/inbox?triage=new&triage=needs_attention"
```

Expected: `{ items: [...] }` with items sorted: triage `new` first, then by severity (critical → info), then most recent date first. Filtering returns only matching triage states.

- [ ] **Step 5: Commit**

```bash
git add apps/bridge/src/routes/reviews.ts
git commit -m "feat(bridge): add cross-project review inbox endpoint with triage filter"
```

---

## Task 8: Extend bridge-client with new endpoints

**Files:**
- Modify: `apps/dashboard/src/lib/bridge-client.ts:21-31` (add type imports), and append new functions to the Codebase Reviewer section (after line 458)

- [ ] **Step 1: Add type imports**

In `apps/dashboard/src/lib/bridge-client.ts`, the type import block at lines 1-31 currently lists Review types. Add to the list:

```typescript
  ReviewTriageState,
  ReviewReportMeta,
  ReviewInboxItem,
```

So the imports become:

```typescript
import type {
  // ... existing imports unchanged ...
  ReviewProject,
  ReviewIdea,
  ReviewIdeaStatus,
  ReviewIdeaImpact,
  ReviewIdeaEffort,
  ReviewIdeaCategory,
  ReviewRun,
  ReviewReportSummary,
  ReviewerWorkerState,
  ReviewTriageState,
  ReviewReportMeta,
  ReviewInboxItem,
} from "@openclaw-manager/types";
```

- [ ] **Step 2: Append new client functions**

At the end of `apps/dashboard/src/lib/bridge-client.ts`, after the existing `getReviewRuns` function (line 456-458), append:

```typescript

export async function setReportTriage(
  projectId: string,
  reportDate: string,
  triageState: ReviewTriageState,
  triageNote?: string | null
): Promise<{ meta: ReviewReportMeta }> {
  return bridgeFetch(
    `/reviews/projects/${encodeURIComponent(projectId)}/reports/${encodeURIComponent(reportDate)}/triage`,
    {
      method: "PATCH",
      body: JSON.stringify({ triageState, triageNote: triageNote ?? null }),
    }
  );
}

export async function getReviewInbox(
  triage?: ReviewTriageState[]
): Promise<{ items: ReviewInboxItem[] }> {
  const params = new URLSearchParams();
  if (triage) for (const t of triage) params.append("triage", t);
  const qs = params.toString();
  return bridgeFetch(`/reviews/inbox${qs ? `?${qs}` : ""}`);
}
```

- [ ] **Step 3: Verify dashboard compiles**

Run: `cd apps/dashboard && npx tsc --noEmit`
Expected: clean exit, no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/dashboard/src/lib/bridge-client.ts
git commit -m "feat(dashboard): add bridge-client functions for triage and inbox"
```

---

## Task 9: Build SeverityBadge component

**Files:**
- Create: `apps/dashboard/src/components/severity-badge.tsx`

- [ ] **Step 1: Write the component**

Create `apps/dashboard/src/components/severity-badge.tsx`:

```typescript
import type { ReviewSeverity } from "@openclaw-manager/types";

const STYLE: Record<ReviewSeverity, string> = {
  critical: "bg-red-500/15 text-red-300 ring-1 ring-red-500/30",
  high: "bg-orange-500/15 text-orange-300 ring-1 ring-orange-500/30",
  medium: "bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/30",
  low: "bg-sky-500/15 text-sky-300 ring-1 ring-sky-500/30",
  info: "bg-zinc-500/15 text-zinc-400 ring-1 ring-zinc-500/30",
};

const TOOLTIP: Record<ReviewSeverity, string> = {
  critical: "3+ high-impact findings — review urgently",
  high: "Contains at least one high-impact finding",
  medium: "Medium-impact findings only",
  low: "Low-impact findings only",
  info: "No actionable findings — informational",
};

export function SeverityBadge({ severity }: { severity: ReviewSeverity }) {
  return (
    <span
      title={TOOLTIP[severity]}
      className={`rounded px-2 py-0.5 text-xs font-medium uppercase tracking-wide ${STYLE[severity]}`}
    >
      {severity}
    </span>
  );
}
```

Note: also add the `ReviewSeverity` import to `apps/dashboard/src/lib/bridge-client.ts` type imports if any consumer imports it from there. The badge imports it directly from types, so this is fine.

- [ ] **Step 2: Verify dashboard compiles**

Run: `cd apps/dashboard && npx tsc --noEmit`
Expected: clean exit, no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/dashboard/src/components/severity-badge.tsx
git commit -m "feat(dashboard): add SeverityBadge component"
```

---

## Task 10: Build TriageBadge component

**Files:**
- Create: `apps/dashboard/src/components/triage-badge.tsx`

- [ ] **Step 1: Write the component**

Create `apps/dashboard/src/components/triage-badge.tsx`:

```typescript
import type { ReviewTriageState } from "@openclaw-manager/types";

const STYLE: Record<ReviewTriageState, string> = {
  new: "bg-sky-500/15 text-sky-300",
  needs_attention: "bg-amber-500/15 text-amber-300",
  actionable: "bg-emerald-500/15 text-emerald-300",
  dismissed: "bg-zinc-700/15 text-zinc-500",
  resolved: "bg-zinc-500/15 text-zinc-400",
};

const LABEL: Record<ReviewTriageState, string> = {
  new: "new",
  needs_attention: "needs attention",
  actionable: "actionable",
  dismissed: "dismissed",
  resolved: "resolved",
};

export function TriageBadge({ state }: { state: ReviewTriageState }) {
  return (
    <span className={`rounded px-2 py-0.5 text-xs ${STYLE[state]}`}>
      {LABEL[state]}
    </span>
  );
}
```

- [ ] **Step 2: Verify dashboard compiles**

Run: `cd apps/dashboard && npx tsc --noEmit`
Expected: clean exit.

- [ ] **Step 3: Commit**

```bash
git add apps/dashboard/src/components/triage-badge.tsx
git commit -m "feat(dashboard): add TriageBadge component"
```

---

## Task 11: Add setTriageAction server action

**Files:**
- Modify: `apps/dashboard/src/app/reviews/actions.ts`

- [ ] **Step 1: Add the action**

In `apps/dashboard/src/app/reviews/actions.ts`, add to the imports at the top:

```typescript
import { setReportTriage } from "@/lib/bridge-client";
import type { ReviewTriageState } from "@openclaw-manager/types";
```

Then append at the bottom of the file:

```typescript
export async function setTriageAction(
  projectId: string,
  reportDate: string,
  triageState: ReviewTriageState
): Promise<void> {
  await setReportTriage(projectId, reportDate, triageState);
  revalidatePath("/reviews");
  revalidatePath("/reviews/inbox");
  revalidatePath(`/reviews/${projectId}`);
}
```

- [ ] **Step 2: Verify dashboard compiles**

Run: `cd apps/dashboard && npx tsc --noEmit`
Expected: clean exit.

- [ ] **Step 3: Commit**

```bash
git add apps/dashboard/src/app/reviews/actions.ts
git commit -m "feat(dashboard): add setTriageAction server action"
```

---

## Task 12: Build TriageActions client component

**Files:**
- Create: `apps/dashboard/src/components/triage-actions.tsx`

- [ ] **Step 1: Write the component**

Create `apps/dashboard/src/components/triage-actions.tsx`:

```typescript
"use client";
import { useTransition } from "react";
import type { ReviewTriageState } from "@openclaw-manager/types";
import { setTriageAction } from "@/app/reviews/actions";

const ALL_STATES: { value: ReviewTriageState; label: string }[] = [
  { value: "new", label: "New" },
  { value: "needs_attention", label: "Needs attention" },
  { value: "actionable", label: "Actionable" },
  { value: "dismissed", label: "Dismissed" },
  { value: "resolved", label: "Resolved" },
];

export function TriageActions({
  projectId,
  reportDate,
  current,
}: {
  projectId: string;
  reportDate: string;
  current: ReviewTriageState;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex flex-wrap items-center gap-1">
      {ALL_STATES.map((s) => {
        const isCurrent = s.value === current;
        return (
          <button
            key={s.value}
            disabled={pending || isCurrent}
            onClick={() =>
              startTransition(() =>
                setTriageAction(projectId, reportDate, s.value)
              )
            }
            className={`rounded px-2 py-1 text-xs ${
              isCurrent
                ? "bg-zinc-700 text-zinc-300 cursor-default"
                : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200"
            } disabled:opacity-50`}
          >
            {s.label}
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Verify dashboard compiles**

Run: `cd apps/dashboard && npx tsc --noEmit`
Expected: clean exit.

- [ ] **Step 3: Commit**

```bash
git add apps/dashboard/src/components/triage-actions.tsx
git commit -m "feat(dashboard): add TriageActions client component"
```

---

## Task 13: Build RecommendedActionPanel component

**Files:**
- Create: `apps/dashboard/src/components/recommended-action-panel.tsx`

- [ ] **Step 1: Write the component**

Create `apps/dashboard/src/components/recommended-action-panel.tsx`:

```typescript
"use client";
import { useTransition } from "react";
import type {
  ReviewSeverity,
  ReviewTriageState,
} from "@openclaw-manager/types";
import { setTriageAction } from "@/app/reviews/actions";
import { SeverityBadge } from "./severity-badge";
import { TriageBadge } from "./triage-badge";

type Action = { label: string; next: ReviewTriageState; primary?: boolean };

function actionsFor(
  severity: ReviewSeverity,
  triageState: ReviewTriageState
): Action[] {
  if (triageState === "new") {
    if (severity === "critical" || severity === "high") {
      return [
        { label: "Investigate now", next: "needs_attention", primary: true },
        { label: "Mark actionable", next: "actionable" },
        { label: "Dismiss", next: "dismissed" },
      ];
    }
    return [
      { label: "Mark actionable", next: "actionable", primary: true },
      { label: "Mark needs attention", next: "needs_attention" },
      { label: "Dismiss", next: "dismissed" },
    ];
  }
  if (triageState === "needs_attention") {
    return [
      { label: "Mark resolved", next: "resolved", primary: true },
      { label: "Mark actionable", next: "actionable" },
    ];
  }
  if (triageState === "actionable") {
    return [
      { label: "Mark resolved", next: "resolved", primary: true },
      { label: "Dismiss", next: "dismissed" },
    ];
  }
  return [{ label: "Reopen", next: "new", primary: true }];
}

function recommendationCopy(
  severity: ReviewSeverity,
  triageState: ReviewTriageState
): string {
  if (triageState !== "new") {
    return `This review is in "${triageState.replace("_", " ")}". Update its state when the situation changes.`;
  }
  if (severity === "critical")
    return "Critical findings detected — investigate immediately and triage to needs attention or actionable.";
  if (severity === "high")
    return "At least one high-impact finding — investigate and pick a triage state.";
  if (severity === "medium")
    return "Medium-impact findings — decide whether this is worth a follow-up.";
  if (severity === "low")
    return "Low-impact findings — consider dismissing or batching.";
  return "No actionable findings — likely safe to dismiss.";
}

export function RecommendedActionPanel({
  projectId,
  reportDate,
  severity,
  triageState,
}: {
  projectId: string;
  reportDate: string;
  severity: ReviewSeverity;
  triageState: ReviewTriageState;
}) {
  const [pending, startTransition] = useTransition();
  const actions = actionsFor(severity, triageState);
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
      <div className="flex items-center gap-2">
        <span className="text-xs uppercase tracking-wide text-zinc-500">
          Recommended action
        </span>
        <SeverityBadge severity={severity} />
        <TriageBadge state={triageState} />
      </div>
      <p className="mt-2 text-sm text-zinc-300">
        {recommendationCopy(severity, triageState)}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {actions.map((a) => (
          <button
            key={a.next}
            disabled={pending}
            onClick={() =>
              startTransition(() =>
                setTriageAction(projectId, reportDate, a.next)
              )
            }
            className={`rounded px-3 py-1.5 text-xs font-medium ${
              a.primary
                ? "bg-primary/20 text-primary hover:bg-primary/30"
                : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
            } disabled:opacity-50`}
          >
            {a.label}
          </button>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify dashboard compiles**

Run: `cd apps/dashboard && npx tsc --noEmit`
Expected: clean exit.

- [ ] **Step 3: Commit**

```bash
git add apps/dashboard/src/components/recommended-action-panel.tsx
git commit -m "feat(dashboard): add RecommendedActionPanel component"
```

---

## Task 14: Wire RecommendedActionPanel into project detail page

**Files:**
- Modify: `apps/dashboard/src/app/reviews/[projectId]/page.tsx`

- [ ] **Step 1: Update detail page**

In `apps/dashboard/src/app/reviews/[projectId]/page.tsx`, add import at the top (after existing imports):

```typescript
import { RecommendedActionPanel } from "@/components/recommended-action-panel";
import { SeverityBadge } from "@/components/severity-badge";
import { TriageBadge } from "@/components/triage-badge";
```

Then update the JSX in the `return` block. After the existing `<div className="grid grid-cols-1 gap-6 lg:grid-cols-4">` block opens but before `<aside>`, the layout needs the panel above the grid. Replace the current grid-and-content structure (the block from `<div className="grid grid-cols-1 gap-6 lg:grid-cols-4">` to its closing `</div>` near the end) with:

```tsx
{selectedDate && (() => {
  const selected = reports.find((r) => r.reportDate === selectedDate);
  if (!selected) return null;
  return (
    <RecommendedActionPanel
      projectId={projectId}
      reportDate={selectedDate}
      severity={selected.severity}
      triageState={selected.triageState}
    />
  );
})()}

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
        <div className="flex items-center justify-between gap-2">
          <span>{r.reportDate}</span>
          <SeverityBadge severity={r.severity} />
        </div>
        <div className="mt-1 flex items-center gap-1 text-[10px] text-zinc-500">
          <TriageBadge state={r.triageState} />
          <span>· {r.ideasCount} ideas</span>
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
```

(The IIFE pattern is needed because `reports` is in scope but the panel needs the matching summary; alternatively, define `const selectedReport = reports.find(...)` above the return statement and reference it directly — pick whichever fits the surrounding code style. The version above keeps everything inline.)

For cleanliness, prefer the non-IIFE version. Add this above the `return (`:

```typescript
const selectedReport = selectedDate
  ? reports.find((r) => r.reportDate === selectedDate)
  : undefined;
```

Then in JSX, replace the IIFE with:

```tsx
{selectedReport && (
  <RecommendedActionPanel
    projectId={projectId}
    reportDate={selectedReport.reportDate}
    severity={selectedReport.severity}
    triageState={selectedReport.triageState}
  />
)}
```

- [ ] **Step 2: Verify dashboard compiles**

Run: `cd apps/dashboard && npx tsc --noEmit`
Expected: clean exit.

- [ ] **Step 3: Browser smoke test**

Start `apps/dashboard` dev server. Navigate to `/reviews/<projectId>` for a project with at least one report. Verify:
- Above the history sidebar + report content, the `Recommended action` panel renders with severity badge, triage badge, recommendation text, and 1-3 action buttons.
- Clicking an action button updates the triage state (badge changes; the page refreshes via revalidation).
- The history sidebar items show severity badge per row and triage badge under the date.

If no browser is available, document this as unverified.

- [ ] **Step 4: Commit**

```bash
git add apps/dashboard/src/app/reviews/[projectId]/page.tsx
git commit -m "feat(dashboard): show recommended action and triage on review detail"
```

---

## Task 15: Build InboxTable client component

**Files:**
- Create: `apps/dashboard/src/components/inbox-table.tsx`

- [ ] **Step 1: Write the component**

Create `apps/dashboard/src/components/inbox-table.tsx`:

```typescript
"use client";
import Link from "next/link";
import { useState, useTransition } from "react";
import type {
  ReviewInboxItem,
  ReviewTriageState,
} from "@openclaw-manager/types";
import { setTriageAction } from "@/app/reviews/actions";
import { SeverityBadge } from "./severity-badge";
import { TriageBadge } from "./triage-badge";

const TRIAGE_FILTERS: { value: ReviewTriageState; label: string }[] = [
  { value: "new", label: "New" },
  { value: "needs_attention", label: "Needs attention" },
  { value: "actionable", label: "Actionable" },
  { value: "dismissed", label: "Dismissed" },
  { value: "resolved", label: "Resolved" },
];

export function InboxTable({ items }: { items: ReviewInboxItem[] }) {
  const [pending, startTransition] = useTransition();
  const [activeFilters, setActiveFilters] = useState<Set<ReviewTriageState>>(
    new Set(["new", "needs_attention", "actionable"])
  );
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const visible = items.filter((i) => activeFilters.has(i.triageState));
  const itemKey = (i: ReviewInboxItem) => `${i.projectId}::${i.reportDate}`;

  function toggleFilter(state: ReviewTriageState) {
    setActiveFilters((prev) => {
      const next = new Set(prev);
      if (next.has(state)) next.delete(state);
      else next.add(state);
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === visible.length) setSelected(new Set());
    else setSelected(new Set(visible.map(itemKey)));
  }

  function bulkSet(triageState: ReviewTriageState) {
    const targets = visible.filter((i) => selected.has(itemKey(i)));
    startTransition(async () => {
      for (const t of targets) {
        await setTriageAction(t.projectId, t.reportDate, triageState);
      }
      setSelected(new Set());
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-zinc-500">Filter:</span>
        {TRIAGE_FILTERS.map((f) => {
          const on = activeFilters.has(f.value);
          return (
            <button
              key={f.value}
              onClick={() => toggleFilter(f.value)}
              className={`rounded px-2 py-1 ${
                on
                  ? "bg-primary/20 text-primary"
                  : "bg-zinc-800 text-zinc-400 hover:text-zinc-200"
              }`}
            >
              {f.label}
            </button>
          );
        })}
        {selected.size > 0 && (
          <div className="ml-auto flex items-center gap-2">
            <span className="text-zinc-400">{selected.size} selected</span>
            <button
              disabled={pending}
              onClick={() => bulkSet("actionable")}
              className="rounded bg-emerald-500/20 px-2 py-1 text-emerald-300 hover:bg-emerald-500/30 disabled:opacity-50"
            >
              Bulk: actionable
            </button>
            <button
              disabled={pending}
              onClick={() => bulkSet("dismissed")}
              className="rounded bg-zinc-700/40 px-2 py-1 text-zinc-300 hover:bg-zinc-700/60 disabled:opacity-50"
            >
              Bulk: dismiss
            </button>
            <button
              disabled={pending}
              onClick={() => bulkSet("resolved")}
              className="rounded bg-zinc-500/20 px-2 py-1 text-zinc-300 hover:bg-zinc-500/30 disabled:opacity-50"
            >
              Bulk: resolved
            </button>
          </div>
        )}
      </div>

      {visible.length === 0 ? (
        <p className="rounded border border-dashed border-zinc-800 px-4 py-8 text-center text-sm text-zinc-500">
          No reviews match the current filter.
        </p>
      ) : (
        <div className="overflow-hidden rounded border border-zinc-800">
          <table className="w-full text-sm">
            <thead className="bg-zinc-900/60 text-left text-xs uppercase tracking-wide text-zinc-400">
              <tr>
                <th className="px-3 py-2 w-8">
                  <input
                    type="checkbox"
                    checked={selected.size === visible.length && visible.length > 0}
                    onChange={toggleAll}
                  />
                </th>
                <th className="px-3 py-2">Project</th>
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">Severity</th>
                <th className="px-3 py-2">Triage</th>
                <th className="px-3 py-2">Ideas</th>
                <th className="px-3 py-2 text-right">Open</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((i) => {
                const key = itemKey(i);
                const isSelected = selected.has(key);
                return (
                  <tr key={key} className="border-t border-zinc-800">
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={(e) => {
                          setSelected((prev) => {
                            const next = new Set(prev);
                            if (e.target.checked) next.add(key);
                            else next.delete(key);
                            return next;
                          });
                        }}
                      />
                    </td>
                    <td className="px-3 py-2 text-zinc-200">{i.projectName}</td>
                    <td className="px-3 py-2 text-zinc-400">{i.reportDate}</td>
                    <td className="px-3 py-2"><SeverityBadge severity={i.severity} /></td>
                    <td className="px-3 py-2"><TriageBadge state={i.triageState} /></td>
                    <td className="px-3 py-2 text-zinc-400">{i.ideasCount}</td>
                    <td className="px-3 py-2 text-right">
                      <Link
                        href={`/reviews/${i.projectId}?date=${i.reportDate}`}
                        className="text-sky-300 hover:text-sky-200"
                      >
                        Open →
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify dashboard compiles**

Run: `cd apps/dashboard && npx tsc --noEmit`
Expected: clean exit.

- [ ] **Step 3: Commit**

```bash
git add apps/dashboard/src/components/inbox-table.tsx
git commit -m "feat(dashboard): add InboxTable with filters and bulk actions"
```

---

## Task 16: Add /reviews/inbox page

**Files:**
- Create: `apps/dashboard/src/app/reviews/inbox/page.tsx`

- [ ] **Step 1: Write the page**

Create `apps/dashboard/src/app/reviews/inbox/page.tsx`:

```typescript
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { InboxTable } from "@/components/inbox-table";
import { getReviewInbox } from "@/lib/bridge-client";

export const dynamic = "force-dynamic";

export default async function ReviewInboxPage() {
  let items: Awaited<ReturnType<typeof getReviewInbox>>["items"] = [];
  let error: string | null = null;
  try {
    const result = await getReviewInbox();
    items = result.items;
  } catch (err: any) {
    error = err?.message || "failed to load inbox";
  }

  return (
    <AppShell title="Review Inbox">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex items-start justify-between">
          <div>
            <Link href="/reviews" className="text-xs text-zinc-400 hover:text-zinc-200">
              ← Projects view
            </Link>
            <h1 className="mt-1 text-2xl font-semibold text-zinc-100">Review Inbox</h1>
            <p className="mt-1 text-sm text-zinc-500">
              All review reports across projects, ranked by triage state and severity.
            </p>
          </div>
        </div>

        {error ? (
          <p className="rounded border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {error}
          </p>
        ) : items.length === 0 ? (
          <p className="rounded border border-dashed border-zinc-800 px-4 py-12 text-center text-sm text-zinc-500">
            No reviews yet. Once projects start producing reports, they will appear here.
          </p>
        ) : (
          <InboxTable items={items} />
        )}
      </div>
    </AppShell>
  );
}
```

- [ ] **Step 2: Verify dashboard compiles**

Run: `cd apps/dashboard && npx tsc --noEmit`
Expected: clean exit.

- [ ] **Step 3: Browser smoke test**

Navigate to `/reviews/inbox`. Verify:
- Filter chips (default: New + Needs attention + Actionable selected) toggle visible rows.
- Each row shows project, date, severity badge, triage badge, ideas count, and an "Open →" link to the project detail page with the date pre-selected.
- Selecting rows reveals bulk action buttons; clicking one updates triage on all selected and refreshes the page.

If no browser available, document as unverified.

- [ ] **Step 4: Commit**

```bash
git add apps/dashboard/src/app/reviews/inbox/page.tsx
git commit -m "feat(dashboard): add /reviews/inbox cross-project triage page"
```

---

## Task 17: Add Inbox link to sidebar

**Files:**
- Modify: `apps/dashboard/src/components/sidebar.tsx:18-26` (the "Manage" section)

- [ ] **Step 1: Add Inbox link before Reviews**

In `apps/dashboard/src/components/sidebar.tsx`, locate the "Manage" section. The Reviews item is at line 24:

```typescript
      { href: "/reviews", label: "Reviews", icon: "M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" },
```

Insert directly before that line:

```typescript
      { href: "/reviews/inbox", label: "Review Inbox", icon: "M3 7l9 6 9-6M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" },
```

- [ ] **Step 2: Verify dashboard compiles**

Run: `cd apps/dashboard && npx tsc --noEmit`
Expected: clean exit.

- [ ] **Step 3: Browser smoke test**

Verify the sidebar now shows "Review Inbox" above "Reviews" in the Manage section. Note: the current sidebar uses `pathname.startsWith(item.href)` for active state matching — this means visiting `/reviews/inbox` will match BOTH `/reviews/inbox` and `/reviews` as active. To prevent that, the Reviews link must be checked first and then the inbox link's `startsWith` semantics handled. Check the rendered active state in the browser; if both highlight, leave a NOTE in the commit message and accept it for this iteration (a separate IA cleanup is out of scope).

- [ ] **Step 4: Commit**

```bash
git add apps/dashboard/src/components/sidebar.tsx
git commit -m "feat(dashboard): add Review Inbox link to sidebar"
```

---

## Task 18: Improve reviews-table with severity, lifecycle, and empty state

**Files:**
- Modify: `apps/dashboard/src/components/reviews-table.tsx`
- Modify: `apps/dashboard/src/app/reviews/page.tsx`
- Create: `apps/dashboard/src/components/reviews-empty-state.tsx`

- [ ] **Step 1: Create the empty state component**

Create `apps/dashboard/src/components/reviews-empty-state.tsx`:

```typescript
"use client";
import { useTransition } from "react";
import { scanAction } from "@/app/reviews/actions";

export function ReviewsEmptyState() {
  const [pending, startTransition] = useTransition();
  return (
    <div className="rounded-lg border border-dashed border-zinc-800 bg-zinc-900/30 px-6 py-10 text-center">
      <h2 className="text-lg font-semibold text-zinc-200">No projects yet</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-zinc-400">
        The reviewer scans your configured project root for repos and creates a review job
        per project. Click below to discover projects now, then enable the ones you want
        scanned on a schedule.
      </p>
      <ul className="mx-auto mt-4 max-w-md space-y-1 text-left text-xs text-zinc-500">
        <li>• Reviewer scan root is set via the <code>REVIEWER_SCAN_ROOT</code> env var.</li>
        <li>• Each project must contain a <code>.openclaw-review/</code> directory or will get one on first run.</li>
        <li>• Manual runs from this page do not require a schedule.</li>
      </ul>
      <button
        disabled={pending}
        onClick={() => startTransition(() => scanAction())}
        className="mt-6 rounded bg-primary/20 px-4 py-2 text-sm font-medium text-primary hover:bg-primary/30 disabled:opacity-50"
      >
        {pending ? "Scanning…" : "Scan for projects"}
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Update the reviews-table with severity column and improved lifecycle**

Replace `apps/dashboard/src/components/reviews-table.tsx` with:

```typescript
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
              <th className="px-4 py-2">Last error</th>
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
                <td className="px-4 py-2 text-zinc-400">
                  <div>{relative(p.lastRunAt)}</div>
                  {p.lastReportDate && (
                    <div className="text-[10px] text-zinc-500">report {p.lastReportDate}</div>
                  )}
                </td>
                <td className="px-4 py-2 text-xs text-red-300/80 max-w-[260px] truncate" title={p.lastError ?? undefined}>
                  {p.status === "failed" && p.lastError ? p.lastError : "—"}
                </td>
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

(This adds a "Last error" column showing `lastError` when status is `failed`, and adds the report date under "Last run". The existing component already had the lifecycle data — this just surfaces it.)

- [ ] **Step 3: Wire empty state into reviews list page**

Read `apps/dashboard/src/app/reviews/page.tsx` to understand the current structure, then modify it to render `<ReviewsEmptyState />` when `projects.length === 0` instead of the empty `<ReviewsTable>`. Add the import:

```typescript
import { ReviewsEmptyState } from "@/components/reviews-empty-state";
```

Replace the `<ReviewsTable projects={projects} worker={worker} />` line with:

```tsx
{projects.length === 0 ? (
  <ReviewsEmptyState />
) : (
  <ReviewsTable projects={projects} worker={worker} />
)}
```

- [ ] **Step 4: Verify dashboard compiles**

Run: `cd apps/dashboard && npx tsc --noEmit`
Expected: clean exit.

- [ ] **Step 5: Browser smoke test**

Navigate to `/reviews`. Verify:
- The reviews table now shows a "Last error" column populated only for failed projects.
- A "report YYYY-MM-DD" line appears under each "Last run" cell when there's a report.
- If no projects are configured, the empty state appears with the "Scan for projects" CTA. (To test, you can temporarily rename the reviewer state file or create a fresh state.)

- [ ] **Step 6: Commit**

```bash
git add apps/dashboard/src/components/reviews-table.tsx apps/dashboard/src/app/reviews/page.tsx apps/dashboard/src/components/reviews-empty-state.tsx
git commit -m "feat(dashboard): surface lifecycle errors and add empty state for reviews"
```

---

## Task 19: Final verification across the whole stack

**Files:** none modified

- [ ] **Step 1: Type-check all modified packages**

```bash
cd packages/types && npx tsc --noEmit
cd ../../apps/bridge && npx tsc --noEmit
cd ../dashboard && npx tsc --noEmit
```

Expected: all three exit cleanly.

- [ ] **Step 2: Confirm no test runner is in place**

Verify there's still no test runner configured (we did not introduce one):

```bash
grep -E '"(test|vitest|jest)"' apps/dashboard/package.json apps/bridge/package.json packages/types/package.json
```

Expected: no test scripts. (If a previous task added one accidentally, remove it.)

- [ ] **Step 3: Manual end-to-end smoke (if dev servers available)**

With bridge and dashboard dev servers running:
1. Visit `/reviews/inbox` — verify rows appear sorted with new+critical at top.
2. Filter to "Dismissed" only — only dismissed rows visible.
3. Select two rows, click "Bulk: actionable" — both update; selection clears.
4. Open one row's "Open →" link — lands on project detail page with the date selected.
5. On detail page, verify recommended action panel appears above the report; click an action; badge updates.
6. Visit `/reviews` — verify severity in detail page persists; verify "Last error" column.

If unable to run dev servers, document this as a manual verification step the user must perform before deploying.

- [ ] **Step 4: Final commit (if any clean-up needed)**

```bash
git status
```

If clean, no commit needed. Otherwise commit any small follow-ups discovered during smoke testing.

---

## Self-Review Checklist (executed by plan author, not subagents)

**Spec coverage** — mapping PM ideas → tasks:
- ✅ "Review Inbox with Triage States" → Tasks 1, 4, 6, 7, 8, 15, 16
- ✅ "Add a Review Severity Ladder and Color Semantics" → Tasks 1, 3, 5, 9
- ✅ "Make Reviews the System's Next Best Action Layer" → Tasks 11, 13, 14
- ✅ "No Explicit Lifecycle for Review Runs" → Task 18 (lastError column + lastReportDate under lastRunAt). The full lifecycle (queued/running/complete/stale/failed) was already modeled in `ReviewProject.status`; this surfaces the missing failure detail in the list.
- ✅ "Add Empty-State Guidance for New or Quiet Projects" → Task 18 (`ReviewsEmptyState`)
- ❌ "Auto-Generated Review Digest" — out of scope for this plan
- ❌ "Review-to-Issue Handoff" — out of scope
- ❌ "Strengthen Agent Session Continuity" — out of scope (different feature area)
- ❌ "Clarify Operational State in the Bridge/Dashboard" — out of scope (whole-app IA)
- ❌ "Turn Detail Pages into Action + Evidence Layouts" — partially addressed via RecommendedActionPanel above report (Task 14), full split layout deferred
- ❌ "Review Flooding and Alert Fatigue" — out of scope (dedup logic)
- ❌ "Fragmented Navigation Across Operational Domains" — out of scope (whole-app IA)

**Placeholder scan** — none. All code blocks contain real implementations.

**Type consistency:**
- `ReviewSeverity` literals match across types, severity.ts, badges, panel. ✅
- `ReviewTriageState` literals match across types, report-meta, route validation, badges, actions. ✅
- `setTriageAction(projectId, reportDate, triageState)` signature consistent across actions, panel, table, triage-actions. ✅
- `ReviewReportSummary` extension consistent: bridge writes `severity` + `triageState` + `triageChangedAt`; dashboard reads them in detail page sidebar. ✅
- `ReviewInboxItem` shape matches between bridge endpoint and InboxTable. ✅
