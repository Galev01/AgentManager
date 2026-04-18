# YouTube Summarizer — Design Spec

**Date:** 2026-04-18
**Status:** Approved for planning
**Scope:** Single sub-project. Buildable in one implementation plan.

## Goal

Let the admin paste a YouTube URL (or several) into the dashboard and get back a rendered Markdown summary of each video. Summaries are stored as plain `.md` files on disk, listed in a left pane, and rendered as Markdown in a right pane.

This is a **video summarizer**, not the creator-ideation pipeline from `awesome-openclaw-usecases/youtube-content-pipeline.md`. That pipeline (cron + Telegram + Slack + Asana + X/Twitter + embedding-based dedup) was considered and rejected for v1 — see "Out of scope" below.

## Architecture

Three processes:

- **Dashboard** (Next.js 15, port 3000) — UI only. Never touches files. Calls bridge server-side via `lib/bridge-client.ts` (existing pattern).
- **Bridge** (Express 5, port 3100) — owns all files, runs the worker, talks to OpenClaw via the existing `services/gateway.ts` SDK wrapper.
- **OpenClaw** — invoked only for the summarization LLM call via a single-shot session.

### Flow for one URL

```
User pastes URL → Dashboard form
       ↓ POST /api/youtube/submit (bearer token, server-side proxy)
Bridge POST /youtube/jobs
  1. Parse + validate videoId (reject non-YouTube → 400)
  2. Append job row to youtube/jobs.jsonl    (status: queued)
  3. Append index row to summaries-index.jsonl (status: queued)
  4. Emit "job-queued" event to in-process worker
  5. Return 202 { jobId }
       ↓
Bridge worker (single consumer, FIFO, serial)
  1. Update job → processing (append rows to both jsonl files)
  2. Fetch metadata + captions via youtube-transcript npm
  3. Open OpenClaw session, send transcript + system prompt, await completion
  4. Prepend YAML front-matter to model output, atomic write summaries/<videoId>.md
  5. Update job → done (append rows with title/channel filled in)
     OR on failure → failed with errorMessage
       ↓
Dashboard polls /api/youtube/jobs every 3s while any job non-terminal,
refetches /api/youtube/summaries on each tick, status badges flip live.
User clicks a row → /api/youtube/summaries/:videoId → markdown rendered via react-markdown.
```

### Concurrency

Worker processes jobs serially in FIFO order. Captions + LLM are I/O-bound and this is a single-admin tool — parallelism adds complexity for no perceptible gain. A `maxConcurrent` knob can be added later if needed.

## File Layout on Disk

All under `${MANAGEMENT_DIR}/youtube/` (the existing env var that points to `openclaw-plugin/management/`):

```
youtube/
├── jobs.jsonl                 # append-only job queue + status history
├── summaries-index.jsonl      # append-only index events (one row per state change)
└── summaries/
    └── <videoId>.md           # final rendered summary, one per video, overwrite on re-run
```

JSONL semantics match existing `commands.jsonl` / `events.jsonl`: append-only, one JSON object per line, consumers fold rows left-to-right keyed by ID to derive current state.

## Data Model (add to `packages/types/src/index.ts`)

```ts
export type YoutubeJobStatus = "queued" | "processing" | "done" | "failed";

export interface YoutubeJob {
  jobId: string;            // uuid v4
  videoId: string;          // 11-char YouTube id
  url: string;              // the submitted URL
  status: YoutubeJobStatus;
  createdAt: string;        // ISO
  updatedAt: string;        // ISO
  errorMessage?: string;    // set iff status === "failed"
}

export interface YoutubeSummaryMeta {
  videoId: string;
  title: string;
  channel: string;
  url: string;
  durationSeconds: number;
  captionLanguage: string;  // "en", "he", etc.
  fetchedAt: string;        // ISO — when captions were fetched
  updatedAt: string;        // ISO — last time .md was written
}

export interface YoutubeSummaryListItem extends YoutubeSummaryMeta {
  status: YoutubeJobStatus; // current status (derived from latest job for this videoId)
  errorMessage?: string;
}
```

The `.md` file has YAML front-matter matching `YoutubeSummaryMeta` plus the summary body.

## Bridge API

All endpoints require `Authorization: Bearer <token>` (existing convention).

| Method | Path | Purpose | Response |
|---|---|---|---|
| POST | `/youtube/jobs` | Submit one or more URLs. Body: `{ urls: string[] }`. Per-URL validation: invalid URLs are skipped, valid URLs are queued. Returns both lists so the UI can show per-URL errors without losing the valid submissions. If `urls` is empty or all invalid, responds 400. | `202 { jobs: YoutubeJob[], rejected: { url: string, reason: string }[] }` |
| GET | `/youtube/jobs` | Active (non-terminal) jobs. Used to decide whether dashboard should keep polling. | `{ jobs: YoutubeJob[] }` |
| GET | `/youtube/summaries` | Full list for the left pane. Folded from index JSONL. | `{ summaries: YoutubeSummaryListItem[] }` |
| GET | `/youtube/summaries/:videoId` | Raw markdown body + meta. | `{ meta: YoutubeSummaryMeta, markdown: string }` |
| POST | `/youtube/summaries/:videoId/rerun` | Enqueue a new job for an existing videoId. Overwrites on completion. | `202 { job: YoutubeJob }` |
| DELETE | `/youtube/summaries/:videoId` | Delete `.md` and append a `deleted` row to the index. | `204` |

`videoId` is validated against `/^[A-Za-z0-9_-]{11}$/` before any file access (matches the existing `^[a-f0-9-]+$` session-id validation pattern).

## Bridge Services (one file each, in `apps/bridge/src/services/`)

- **`youtube-url.ts`** — pure functions: `parseVideoId(url)`, `isValidVideoId(id)`. Handles `youtube.com/watch?v=`, `youtu.be/<id>`, `youtube.com/shorts/<id>`. Strips `?t=42s` and other query params. Rejects playlist URLs.
- **`youtube-captions.ts`** — thin wrapper around the `youtube-transcript` npm library: `fetchCaptions(videoId) → { title, channel, durationSeconds, language, transcript }`. Throws typed errors for "captions unavailable" and "video not found" so the worker can map them to user messages.
- **`youtube-store.ts`** — all file I/O: `appendJob`, `appendIndexRow`, `foldSummaries()`, `foldActiveJobs()`, `readMarkdown(videoId)`, `writeMarkdown(videoId, meta, body)` (atomic: tmp + rename, matching the existing `runtime-settings.ts` pattern), `deleteMarkdown(videoId)`. On startup: scan `jobs.jsonl`, mark any `processing` job older than 5 minutes as `failed` with `errorMessage: "interrupted by bridge restart"`.
- **`youtube-worker.ts`** — single-consumer loop. Subscribes to a Node `EventEmitter` for "job-queued" events. Processes FIFO, calls `youtube-captions` + `youtube-summarize` + `youtube-store`. Started in `server.ts` after services are wired.
- **`youtube-summarize.ts`** — the OpenClaw session call. Creates an ephemeral session via the existing `gateway.ts` wrapper, sends transcript + system prompt, awaits completion (120s timeout), extracts the markdown body from the assistant's final message, deletes the session. Returns the raw markdown string.

## Bridge Route

- **`routes/youtube.ts`** — HTTP handlers, mounted at `/youtube` in `server.ts`. Pure request → service delegation, matches the existing route file convention (default-exported `Router`).

## Summarization System Prompt

Hardcoded in `youtube-summarize.ts`, sent as the system message of the ephemeral session:

```
You are a video summarizer. The user will give you the metadata and full transcript of a YouTube video. Produce a Markdown summary with this exact structure and nothing else:

# {title}

**Channel:** {channel}  **Duration:** {mm:ss}  **URL:** {url}

## TL;DR
A 2-3 sentence summary of what the video is about and its core claim.

## Key points
- 5-10 bullet points capturing the most important ideas, in the order they appear in the video.

## Notable quotes
- Up to 3 short verbatim quotes that are particularly insightful or memorable. Skip this section if there are none worth quoting.

## Takeaways
- 2-4 bullets on what the viewer should remember or do.

Write in the same language as the transcript. Do not invent facts not present in the transcript. Do not include any preamble, apology, or post-script — output only the markdown above.
```

The bridge fills the `{title}` / `{channel}` / `{duration}` / `{url}` placeholders before sending. The summary body comes entirely from the model. The bridge then prepends YAML front-matter (the `YoutubeSummaryMeta` fields) before writing the file.

## Dashboard

### Pages

- **`apps/dashboard/src/app/youtube/page.tsx`** — server component. Initial-fetches `/youtube/summaries` and `/youtube/jobs` server-side via `bridge-client`, passes both to a client wrapper for hydration. Reads `?v=<videoId>` from `searchParams` to know which summary to load on first paint.

### Components

Two-pane layout (Q6/A — Obsidian-style):

- **`apps/dashboard/src/components/youtube/SummaryListPane.tsx`** (`"use client"`) — left pane.
  - Top: `<textarea>` for URLs (one per line) + Submit button.
  - Below: scrollable list of summaries. Each row: title (or "Loading metadata…" while queued), channel (or "—"), status badge, created-at relative time.
  - Polling: when `activeJobs.length > 0`, re-fetch `/api/youtube/jobs` and `/api/youtube/summaries` every 3 seconds. Stop polling when all jobs terminal.
  - Selecting a row updates `?v=<videoId>` via `router.replace` (no scroll jump).
  - Status badges: queued = gray, processing = blue with spinner, done = green, failed = red.

- **`apps/dashboard/src/components/youtube/SummaryViewPane.tsx`** (`"use client"`) — right pane.
  - Header: title (h1), channel + duration + external-link icon to YouTube, Re-run button, Delete button.
  - Body rendering depends on the selected summary's status:
    - `done` → `<ReactMarkdown remarkPlugins={[remarkGfm]}>` rendering the markdown body inside a `prose prose-invert` Tailwind container.
    - `queued` or `processing` → "Summarizing…" placeholder with a spinner. Re-run/Delete disabled.
    - `failed` → red callout showing `errorMessage`. Re-run enabled, Delete enabled, no markdown body.
  - Empty state when no `?v=` param: prompt to pick a summary or submit a URL.
  - Re-run: POST to `/api/youtube/summaries/:videoId/rerun`, refetches summaries list, status flips to queued.
  - Delete: confirm dialog, DELETE to `/api/youtube/summaries/:videoId`, refetches list, clears `?v=` param.

### Dashboard API routes (server-side proxies)

All under `apps/dashboard/src/app/api/youtube/`:

- `submit/route.ts` — POST → bridge `POST /youtube/jobs`
- `jobs/route.ts` — GET → bridge `GET /youtube/jobs`
- `summaries/route.ts` — GET → bridge `GET /youtube/summaries`
- `summaries/[videoId]/route.ts` — GET, DELETE → bridge same path
- `summaries/[videoId]/rerun/route.ts` — POST → bridge same path

### Bridge client (add methods to `apps/dashboard/src/lib/bridge-client.ts`)

`submitYoutubeJobs(urls)`, `listYoutubeJobs()`, `listYoutubeSummaries()`, `getYoutubeSummary(videoId)`, `rerunYoutubeSummary(videoId)`, `deleteYoutubeSummary(videoId)`.

### Navigation

Add a "YouTube" link to the existing dashboard nav (wherever the current section links live).

## Dependencies to Add

**Bridge** (`apps/bridge/package.json`):
- `youtube-transcript` — caption fetching
- `uuid` — job ids (verify if already present from another package; if so, just import)

**Dashboard** (`apps/dashboard/package.json`):
- `react-markdown`
- `remark-gfm`
- `@tailwindcss/typography`

Verify exact package names and current major versions during implementation.

## Error Handling

| Failure | Caught in | Job status | User sees |
|---|---|---|---|
| URL not parseable as YouTube | `routes/youtube.ts` (pre-job) | n/a — 400 | Inline form error per URL |
| Captions unavailable | `youtube-captions.ts` | `failed` | Red badge + "captions unavailable for this video" |
| Captions empty / too short | `youtube-worker.ts` | `failed` | Red badge + "transcript too short to summarize" |
| Session timeout (>120s) or error | `youtube-summarize.ts` | `failed` | Red badge + raw error message |
| Bridge crashes mid-job | startup recovery in `youtube-store.ts` | `failed` ("interrupted by bridge restart") | Red badge after restart |
| Disk write fails | `youtube-store.ts` | `failed` | Red badge + IO error |

No automatic retries. The user clicks Re-run if they want another attempt. Failed jobs stay in the index so the user can see what happened.

## Edge Cases

- **Same URL pasted twice while first job is still in flight** — second submit short-circuits and returns the existing in-flight job (no duplicate jobs for same `videoId`).
- **URL with timestamp** (`?t=42s`) — stripped during `parseVideoId`.
- **Playlist URLs** — rejected with 400 ("submit individual videos, not playlists"). Playlist expansion is YAGNI for v1.
- **Non-Latin titles / RTL transcripts** — pass through unchanged. The markdown viewer uses `prose-invert` and applies `dir="auto"` to the rendered container so RTL renders correctly.
- **Concurrent submit of many URLs** — bridge accepts all, queues all, worker processes serially. Dashboard shows them all in queued state.

## Testing

Follows whatever convention exists in this repo (verify during implementation — the plan adapts if there's no test runner already wired up):

- **Unit:** `youtube-url.ts` (URL parsing edge cases — youtu.be, watch?v=, shorts, with timestamps, playlists, garbage), `youtube-store.ts` (index folding correctness — out-of-order rows, deleted entries).
- **Integration / manual:** worker + summarization end-to-end verified against a known-good 2-3 minute video during implementation, with logs at each step.
- **Type check:** `pnpm build` across the monorepo as the gate before each commit, matching the existing `AGENTS.md` convention.

## Out of Scope (explicit YAGNI)

These were considered and intentionally rejected for v1:

- Vector embeddings or semantic deduplication.
- Cron / hourly scanning of any source.
- Telegram, Slack, Asana, X/Twitter integrations.
- YouTube Analytics API or `gog` CLI.
- Playlist or channel ingestion.
- Multiple summarization templates (single hardcoded prompt for v1).
- Multi-user or per-user summaries (this manager is single-admin).
- Local Whisper transcription fallback for captions-disabled videos.
- Obsidian vault sync (could be added later by symlinking `summaries/` into the BrainClaw vault — flagged but not built).

## Open Questions for Implementation

These can be resolved during planning without re-opening the design:

- Exact npm package and version for the captions library — `youtube-transcript` is the leading candidate but verify its current state and license.
- Whether `uuid` is already in the workspace; if not, choose v4-only import.
- Confirm the existing test runner (if any) before deciding what test files to create.
