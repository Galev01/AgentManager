# Codebase Reviewer — Design Spec

**Date:** 2026-04-17
**Status:** Approved for planning
**Owner:** Gal Lev

## Goal

Let OpenClaw act as a professional product manager for every codebase under `C:\Users\GalLe\Cursor projects`. Once per day per project, the system generates a structured review (new feature ideas, improvements, UI/UX suggestions, tech-debt risks, recommended next step) and saves it as a markdown file inside the project. The OpenClaw Manager dashboard surfaces the reports, lets the user acknowledge each one, and accumulates accepted ideas into a cross-project backlog.

Acknowledgement gates progress: a project only becomes eligible for its next daily review after the previous report is acknowledged. An unacknowledged project is simply skipped indefinitely (no queue buildup, no retries).

## Non-goals

- No multi-user support. Single-admin dashboard (existing pattern).
- No idea implementation workflow (we collect accepted ideas into a backlog, but implementing them is out of scope).
- No automatic git commits of reports. Reports are written to disk and added to `.gitignore`; never staged or committed by the reviewer.
- No cross-project analysis or dependency-graph reasoning. Each project is reviewed in isolation.

## Architecture

Approach: **Bridge-owned feature.** The new logic lives in the existing Express bridge, using the existing OpenClaw SDK wrapper and file-based state patterns. No new plugin runtime, no dashboard-side state.

```
Browser (admin)
   |
   v
Dashboard /reviews (Next.js, CentOS)
   |  server-side, bearer token
   v
Bridge /reviews/* (Express, Windows)
   |
   +---> extensions/codebase-reviewer/state.json      (registry + schedule)
   +---> extensions/codebase-reviewer/runs.jsonl      (append-only run log)
   +---> extensions/codebase-reviewer/ideas.json      (cross-project backlog)
   +---> <project>/.openclaw-review/YYYY-MM-DD.md     (per-project reports)
   +---> OpenClaw SDK: sessions.create/send/status    (agent execution)
OpenClaw cron (daily 08:00) ---> POST /reviews/tick
```

### Component layout

```
apps/bridge/src/
  services/codebase-reviewer/
    index.ts            # public API (enqueueEligible, runNow, ack, listProjects, ...)
    state.ts            # state.json read/write (atomic)
    runs.ts             # runs.jsonl append + tail read
    ideas.ts            # ideas.json read/write, status updates
    discovery.ts        # filesystem scan for projects
    scheduler.ts        # eligibility rules, eligibleAt computation
    worker.ts           # serial in-process queue
    runner.ts           # launch OpenClaw session, poll, capture output
    parser.ts           # parse review markdown into structured ideas
    prompt.ts           # the PM review prompt template
    gitignore.ts        # idempotent `.openclaw-review/` gitignore insert
  routes/
    reviews.ts          # all /reviews/* endpoints

apps/dashboard/src/app/reviews/
  page.tsx              # project list
  [projectId]/page.tsx  # project detail + report viewer + history
  ideas/page.tsx        # cross-project idea backlog

packages/types/src/index.ts
  # + ReviewProject, ReviewProjectStatus, ReviewIdea, ReviewIdeaStatus, ReviewRun, ReviewReportSummary
```

## Data model

### `extensions/codebase-reviewer/state.json`

```ts
type ReviewProjectStatus =
  | "idle"          // eligible or waiting for eligibility window
  | "queued"        // in the worker queue but not yet started
  | "running"       // worker is executing the review
  | "awaiting_ack"  // report produced, waiting for user to acknowledge
  | "skipped"       // manually disabled
  | "failed"        // last run errored or timed out

interface ReviewProject {
  id: string;               // slugified folder name, stable key
  name: string;             // original folder name
  path: string;             // absolute folder path
  enabled: boolean;
  status: ReviewProjectStatus;
  discoveredAt: string;     // ISO timestamp of first scan
  lastRunAt: string | null;
  lastReportPath: string | null;
  lastReportDate: string | null;   // YYYY-MM-DD
  lastAckedAt: string | null;
  eligibleAt: string | null;       // ISO; null = eligible now
  lastError: string | null;
  missing?: boolean;               // set true if folder no longer exists
}

interface ReviewerState {
  scanRoot: string;
  projects: Record<string, ReviewProject>;
  updatedAt: string;
}
```

### `extensions/codebase-reviewer/runs.jsonl`

One JSON object per line, append-only:

```ts
interface ReviewRun {
  runId: string;             // uuid
  projectId: string;
  trigger: "cron" | "manual";
  phase: "start" | "end" | "error";
  timestamp: string;
  sessionId?: string;        // OpenClaw session id (from phase=start onward)
  reportPath?: string;       // on phase=end
  ideasCount?: number;       // on phase=end
  error?: string;            // on phase=error
  durationMs?: number;       // on phase=end|error
}
```

### `extensions/codebase-reviewer/ideas.json`

```ts
type ReviewIdeaStatus = "pending" | "accepted" | "rejected" | "deferred";
type ReviewIdeaImpact = "low" | "medium" | "high";
type ReviewIdeaEffort = "S" | "M" | "L";
type ReviewIdeaCategory =
  | "new_feature"
  | "improvement"
  | "ui_ux"
  | "tech_debt";

interface ReviewIdea {
  id: string;                // `${projectId}-${reportDate}-${slug(title)}`
  projectId: string;
  projectName: string;
  reportDate: string;        // YYYY-MM-DD
  category: ReviewIdeaCategory;
  title: string;
  problem: string;
  solution: string;
  impact: ReviewIdeaImpact;
  effort: ReviewIdeaEffort;
  status: ReviewIdeaStatus;
  createdAt: string;
  statusChangedAt: string | null;
}

interface IdeasFile {
  ideas: ReviewIdea[];       // flat; dashboard does filtering
  updatedAt: string;
}
```

### Per-project report file

Location: `<project>/.openclaw-review/YYYY-MM-DD.md`. Overwritten if a report for the same date already exists (manual re-runs).

Template the agent is instructed to follow exactly:

```markdown
# Codebase Review — <Project Name> — YYYY-MM-DD

## Executive Summary
<prose>

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
- ...

## Technical Debt / Risks
### <Title>
- ...

## Recommended Next Step
<prose>
```

Parser rules: `##` → category, `###` → idea title, bullet lines parsed as labelled fields. `Executive Summary` and `Recommended Next Step` are prose-only sections, not parsed into ideas. Parser is lenient: missing `Impact` or `Effort` defaults to `medium` / `M` and the idea still ingests.

Heading → category map (case-insensitive, trimmed):

| Heading text | `ReviewIdeaCategory` |
|---|---|
| `New Feature Ideas` | `new_feature` |
| `Improvements to Existing Features` | `improvement` |
| `UI/UX Suggestions` | `ui_ux` |
| `Technical Debt / Risks` | `tech_debt` |

Unknown `##` headings are logged to `runs.jsonl` as a warning and their `###` items are ingested with `category: improvement` as a safe fallback.

## Project discovery

`scanRoot` defaults to `C:\Users\GalLe\Cursor projects` (configurable via env `REVIEWER_SCAN_ROOT`). Discovery walks direct children of the scan root only (one level deep). A child qualifies if any of these exist inside it:

- `.git/` directory
- `package.json`
- `pyproject.toml`
- `pubspec.yaml`
- `Cargo.toml`
- `go.mod`

On each scan:
- New qualifying folders are added with `enabled: true`, `status: idle`.
- Existing records keep their state; if the folder is gone, `missing: true` is set and `enabled` stays as-is (history preserved).
- A returned folder (was missing, now present) clears `missing`.

Discovery runs:
- On bridge startup (once; non-blocking).
- On demand via `POST /reviews/projects/scan`.
- Implicitly at the start of `/reviews/tick` (cron) so new folders enter rotation without manual action.

## Scheduling & eligibility

Single rule for eligibility:

```
eligible = enabled
        && !missing
        && status ∈ { idle, failed }
        && (eligibleAt === null || eligibleAt <= now)
        && (lastReportPath === null || lastAckedAt !== null)
```

`eligibleAt` recomputed on ack:

```
eligibleAt = lastAckedAt + 24h
```

Implications:
- `awaiting_ack` projects are never eligible — they block themselves until acked. No skip counter, no timeout.
- `failed` projects are eligible immediately next tick (auto-retry on next cron or manual click).
- Manual "Run now" bypasses eligibility entirely but still respects the serial worker.

Cron: one OpenClaw cron entry (created by the install/docs, not by the bridge itself) hits `POST /reviews/tick` once a day at 08:00 local time. `/tick` calls discovery, then enqueues every eligible project. Multiple `/tick` calls on the same day are harmless (already-queued/running projects are skipped).

## Worker (serial queue)

Single in-process worker, FIFO. One project at a time.

```
loop:
  project = dequeue()  // blocks until item available
  setStatus(project.id, "running")
  appendRun({ phase: "start", trigger, ... })
  try:
    result = runner.runReview(project)   // ~minutes, has timeout
    writeReport(project, result.markdown)
    ensureGitignore(project)
    ideas = parser.parse(result.markdown, project)
    appendIdeas(ideas)
    setStatus(project.id, "awaiting_ack", { lastRunAt, lastReportPath, lastReportDate })
    appendRun({ phase: "end", reportPath, ideasCount, durationMs })
  catch err:
    setStatus(project.id, "failed", { lastError: err.message })
    appendRun({ phase: "error", error, durationMs })
```

Enqueue is guarded by a mutex; duplicate enqueues of the same project are coalesced (if already queued or running, ignore).

## Runner (agent execution)

```
runReview(project):
  session = openclaw.sessions.create({ cwd: project.path, agent: "main" })
  openclaw.sessions.send(session.id, PROMPT_TEMPLATE)
  start = now()
  loop:
    if now() - start > REVIEWER_TIMEOUT_MS (default 10 min):
      openclaw.sessions.abort(session.id)
      throw TimeoutError
    status = openclaw.sessions.status(session.id)
    if status.state === "done": break
    if status.state === "error": throw RunnerError(status.error)
    sleep(3s)
  transcript = openclaw.sessions.transcript(session.id)
  markdown = extractFinalAssistantMessage(transcript)
  if !markdown.startsWith("# Codebase Review"): throw ParseError
  return { sessionId: session.id, markdown }
```

SDK method names follow what's already wired in `gateway.ts` (`sessions.create`, `sessions.send`, `sessions.status`, `sessions.abort`). If a method doesn't match, we adapt at implementation time — the shape is: create-scoped-session → send prompt → poll → read final message. Session is not deleted after the run (so the user can inspect transcripts via the existing Sessions page).

## Prompt

Single static template (no per-project variation beyond `cwd`). Instructs the agent to:

- Act as a senior product manager who is also a fluent engineer.
- Walk the codebase using Read/Grep/Glob. Look at entry points, routes, UI, tests, recent git log.
- Focus on **features, improvements, and UI ideas** — not refactors for their own sake.
- Produce output matching the exact template (headings, bullet fields, impact/effort enums).
- Never include code patches. Ideas only.
- Return only the markdown; no preamble, no closing remarks.

The prompt is stored in `prompt.ts` as a single string export so it can be iterated on in one place.

## Report writing

1. `mkdir -p <project>/.openclaw-review`
2. Atomic write: temp file in same dir, rename to `YYYY-MM-DD.md`.
3. Ensure gitignore (idempotent):
   - If `<project>/.gitignore` exists: read it; if no line exactly equals `.openclaw-review/`, append it (with a leading newline if the file doesn't end in one).
   - If `.gitignore` doesn't exist: create it with `.openclaw-review/\n`.
   - Skip entirely if `<project>/.git/` doesn't exist (not a git repo).

## Dashboard

### `/reviews` — project list

Server-rendered table. Columns:

- Name
- Status (idle / queued / running / awaiting_ack / failed / disabled / missing)
- Last run (relative time)
- Eligible (relative time to `eligibleAt`, or "now")
- Ideas (pending / accepted counts)
- Actions

Actions per row:
- **Run now** — POST `/reviews/projects/:id/run`. Disabled while `queued` or `running`.
- **Acknowledge** — POST `/reviews/projects/:id/ack`. Visible only when `awaiting_ack`.
- **Open report** — link to `/reviews/:id?date=<lastReportDate>`.
- **Enable / Disable** — PATCH `/reviews/projects/:id` toggle.

Page header:
- **Rescan projects** button — POST `/reviews/projects/scan`.
- Live worker status: "Idle" or "Running: X — queued: Y, Z".

### `/reviews/[projectId]` — project detail

- Header: project name, path, status badge, Run-now button.
- Left: list of past reports (date, idea count, ack status) — most recent first.
- Right: selected report rendered as markdown, plus a table of ideas parsed from it with per-idea inline status buttons (Accept / Reject / Defer).
- Acknowledge button (when the latest report is unacked).

### `/reviews/ideas` — backlog

Flat table of all ideas. Filters (querystring-backed):
- Project (multi-select)
- Status: pending / accepted / rejected / deferred
- Impact: low / medium / high
- Effort: S / M / L
- Category: new_feature / improvement / ui_ux / tech_debt

Row: project · date · category · title · impact · effort · status · inline status buttons. Click title to expand problem/solution prose.

## Bridge API

All routes require `Authorization: Bearer <BRIDGE_TOKEN>` (existing middleware). JSON request/response bodies match the types above unless noted.

| Method | Path | Request | Response |
|--------|------|---------|----------|
| GET | `/reviews/projects` | — | `{ projects: ReviewProject[], worker: { current: string \| null, queue: string[] } }` |
| POST | `/reviews/projects/scan` | — | `{ added: string[], missing: string[], total: number }` |
| PATCH | `/reviews/projects/:id` | `{ enabled?: boolean }` | `{ project: ReviewProject }` |
| POST | `/reviews/projects/:id/run` | — | `{ enqueued: boolean, reason?: string }` |
| POST | `/reviews/projects/:id/ack` | — | `{ project: ReviewProject }` |
| GET | `/reviews/projects/:id/reports` | — | `{ reports: ReviewReportSummary[] }` |
| GET | `/reviews/projects/:id/reports/:date` | — | `{ markdown: string, ideas: ReviewIdea[] }` |
| GET | `/reviews/ideas` | query: `project`, `status`, `impact`, `effort`, `category` (repeatable) | `{ ideas: ReviewIdea[] }` |
| PATCH | `/reviews/ideas/:id` | `{ status: ReviewIdeaStatus }` | `{ idea: ReviewIdea }` |
| POST | `/reviews/tick` | — | `{ enqueued: string[], skipped: string[] }` |
| GET | `/reviews/runs` | query: `limit` (default 50) | `{ runs: ReviewRun[] }` |

Route validation:
- `:id` and `:date` validated against `^[a-z0-9-]+$` and `^\d{4}-\d{2}-\d{2}$` respectively before any fs access (mirrors existing session-id validation pattern).

## Environment variables

Added to the bridge:

| Variable | Required | Default | Purpose |
|----------|----------|---------|---------|
| `REVIEWER_SCAN_ROOT` | No | `C:\Users\GalLe\Cursor projects` | Folder scanned for projects |
| `REVIEWER_STATE_DIR` | No | `<OPENCLAW_WORKSPACE>/.openclaw/extensions/codebase-reviewer` | State dir (state.json, runs.jsonl, ideas.json) |
| `REVIEWER_TIMEOUT_MS` | No | `600000` (10 min) | Per-review agent timeout |
| `REVIEWER_ACK_COOLDOWN_MS` | No | `86400000` (24h) | Time after ack before a project is eligible again |

No new dashboard env vars.

## Error handling & edge cases

- **Agent timeout** → runner aborts the session, `status: failed`, `lastError: "timeout after Nms"`. Next tick retries.
- **Session create/send fails** → `status: failed`, `lastError: <sdk error>`. Next tick retries.
- **Agent returns non-template markdown** → `status: failed`, `lastError: "parse error"`. Report not written. Next tick retries (prompt usually self-corrects on second attempt; we do not retry within one tick).
- **Folder deleted mid-run** → runner returns IO error, caught as `failed`, `missing` recomputed on next scan.
- **Two cron ticks on same day** → second tick sees projects already queued/running/awaiting_ack and enqueues nothing.
- **`/reviews/tick` called while worker is mid-run** → enqueues eligible projects behind the current one.
- **Bridge restart with queue non-empty** → queue is in-memory only; restart loses it. On startup, any project with `status: queued` or `status: running` (stuck from a crash) is reset to `failed` with `lastError: "interrupted by restart"`.
- **Report date collision (manual re-run same day)** → overwrite markdown; delete existing ideas for `(projectId, reportDate)` from `ideas.json` before reparsing, so we don't duplicate.
- **Dashboard ↔ bridge unreachable** → existing `degraded-banner` component already handles this.

## Testing strategy

- **Unit (bridge):** parser (happy path, missing fields, unknown category heading, extra whitespace), eligibility (every state combination), gitignore writer (new file, existing without entry, existing with entry, missing `.git`), slug/id generation, state atomicity (crash between write+rename is survivable).
- **Integration (bridge):** fake OpenClaw SDK that returns a canned markdown; assert state transitions, report file written, ideas appended, runs logged, gitignore updated. Simulate timeout and error paths.
- **Manual (dashboard):** end-to-end click-through — scan, run now on one real project, see awaiting_ack, open report, set idea statuses, ack, confirm `eligibleAt` shifts 24h.

Tests follow existing bridge test patterns (if present). Dashboard pages are covered by manual smoke testing per project conventions.

## Rollout

1. Land bridge + types + routes behind no feature flag (dashboard pages just don't link to them until ready).
2. Add dashboard pages and nav entry.
3. Manually trigger one project end-to-end to validate the prompt and parser against a real codebase.
4. Add the OpenClaw cron entry (documented in the commit; not scripted).
5. Let it run overnight and review the first batch.

## Open questions deferred

- Whether to support nested scan roots (e.g. `flutter_projects/*`) — deferred until the flat scan proves insufficient.
- Whether to compare today's report to yesterday's and highlight deltas — deferred; the current design gives the raw history and idea statuses, which is enough to start.
- Whether accepted ideas should auto-generate implementation plans — explicit non-goal for v1.
