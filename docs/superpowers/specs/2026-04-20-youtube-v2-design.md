# YouTube Summarizer v2 — Design Spec

**Date:** 2026-04-20
**Status:** Approved for planning (OpenClaw co-designed)
**Supersedes:** `2026-04-18-youtube-summarizer-design.md` (v1 — already implemented and deployed)

## Goal

Turn the v1 "paste URL → read summary" tool into a **YouTube relay** with persistent, per-video interaction. Given a video:
- Render a canonical summary (v1 feature, preserved).
- **Chat with the video** — ask follow-up questions grounded in the transcript.
- Pick from **prompt presets** (TL;DR, study notes, tutorial steps, critique, action items, notable quotes) when generating summaries.
- Extract **highlights** — 3–5 quotable moments with timestamp links.
- Show **chapters** when available (parsed from video description; fall back to transcript-inferred sections).

Align the UI with the `apps/dashboard/src/new_ui/` design prototype — but *only* via the primitives needed for this page. Rest of the dashboard stays on the current Tailwind-only shell and migrates later, page-by-page, as separate projects.

## Non-Goals (explicit YAGNI)

Cut from v2 by OpenClaw's scope filter:
- Compare mode (two videos side-by-side)
- Playlist / channel ingestion
- Auto-follow creator (cron + "seen videos" tracking)
- Agent-picks-prompt (unpredictable, skip)
- Custom one-shot prompts (deferred to v3)
- Embeddings / semantic search
- Streaming chat responses (non-streaming poll-based rendering for v2)

Full-text search across the summary corpus and Obsidian export are **nice-to-have**, not must-have. They're noted in an appendix but aren't first-pass targets.

## Architecture

### Process layout (unchanged from v1)

- **Bridge** (`apps/bridge/`) — Express on Windows. Owns all I/O: captions fetch, storage, chunking, retrieval, chat orchestration, OpenClaw session calls. Runs as NSSM service under LocalSystem in prod.
- **Dashboard** (`apps/dashboard/`) — Next.js on CentOS. UI only. Proxies everything to the bridge via bearer token.
- **Shared types** — `packages/types/src/index.ts` (workspace package `@openclaw-manager/types`).

### Two worker queues (new in v2)

- **Summary worker** (exists from v1 — `services/youtube-worker.ts`) — single-consumer FIFO. One job at a time: captions fetch → summarize → write `.md`.
- **Chat worker** (new) — second queue, independent of summary. Per-video/session lock so only one assistant turn streams at a time *per chat session*, but different videos' chats can run in parallel. Summary jobs never block chat replies.

Keeping them separate is load-bearing: chat latency matters; summary work is heavier and bursty.

### Happy-path: chat with a video

```
User asks question in chat pane
       ↓ POST /api/youtube/chat/:videoId (server-side proxy)
Bridge POST /youtube/chat/:videoId
  1. Validate videoId, resolve the chat session (create if none)
  2. Append user message to videos/<videoId>/chat.jsonl (status=complete)
  3. Create job row in jobs.jsonl (kind="chat", status=queued)
  4. Enqueue to chat-worker
  5. Return 202 { sessionId, turnId, jobId, status:"queued" }
       ↓
Chat worker picks up the job
  1. Update job → running; write assistant placeholder row to chat.jsonl (status=streaming)
  2. Retrieve top-k=6 relevant chunks via MiniSearch over videos/<videoId>/chunks.json
  3. Build context: system prompt + summary + retrieved chunks + condensed chat history
  4. If openclawSessionKey exists for this chat session, sessions.send({key, message})
     If not (first turn or GC'd), sessions.create + sessions.send
  5. Poll sessions.get until terminal; tail session JSONL for assistant message
  6. Update the placeholder row with the final content (status=complete) + retrievedChunkIds
  7. Update job → succeeded
       ↓
Dashboard polls GET /api/youtube/chat/:videoId every 3s while any chat job non-terminal
  When the row status flips to complete, the answer renders.
```

### Session composition

- **Summary worker sessions are disposable** — one per summary job, deleted after output extracted.
- **Chat sessions are long-lived per video** — one OpenClaw session per `(videoId, chatSessionId)`. Session key stored in `chat.jsonl` rows; the latest known key is cached in `videos/<videoId>/chat-meta.json`.
- **GC recovery:** when OpenClaw drops the session (returns session-not-found), recreate and replay **lazily** per OpenClaw's rule: summary + last 4 turns verbatim + earlier turns distilled to one paragraph. If distillation fails, fall back to summary + last 4 verbatim only — **don't block chat restore on distill**.

## On-Disk Layout

All under `${MANAGEMENT_DIR}/youtube/`:

```
youtube/
├── jobs.jsonl                      # v1 file, extended (not broken)
├── summaries-index.jsonl           # v1 file, extended (not broken)
├── summaries/
│   └── <videoId>.md                # v1 file location, LEGACY — read-only after v2
└── videos/
    └── <videoId>/
        ├── metadata.json           # title, channel, url, durationSeconds, captionLanguage, fetchedAt, updatedAt
        ├── transcript.json         # raw youtube-transcript segments (source of truth for chunking)
        ├── chunks.json             # chunker output, stable chunk ids
        ├── retrieval-index.json    # MiniSearch serialized index (or lazy-rebuilt on load)
        ├── summary.md              # canonical v2 summary (replaces summaries/<videoId>.md for new videos)
        ├── chat-meta.json          # { openclawSessionKey, chatSessionId, lastReplayedAt }
        ├── chat.jsonl              # append-only chat message log
        ├── chapters.json           # optional
        └── highlights.json         # optional
```

### Migration strategy — lazy on demand

Per OpenClaw's v1-transition call, **don't backfill**:
- v1 summaries at `summaries/<videoId>.md` keep working for **reading** via a compat shim.
- When a user opens a v1 video for **chat** or **rebuild**, the bridge re-fetches captions, writes `videos/<videoId>/transcript.json` + `chunks.json` + `retrieval-index.json`, and migrates the summary file to `videos/<videoId>/summary.md` (leaving the legacy file as a hard-delete target on success).
- Until migration, the UI shows "Chat available after one-time transcript rebuild" with an explicit button. Users who only want to re-read an old summary never trigger migration.

## Data Model (new types to add to `packages/types/src/index.ts`)

### Transcript + chunks

```ts
export type YoutubeTranscriptSegment = {
  start: number;        // seconds
  duration: number;     // seconds
  end: number;          // derived: start + duration
  text: string;
};

export type YoutubeTranscriptFile = {
  videoId: string;
  source: "youtube-transcript";
  language: string;
  fetchedAt: string;
  segments: YoutubeTranscriptSegment[];
};

export type YoutubeChunk = {
  id: string;           // stable hash: first 16 hex of sha256(videoId + startTimestamp)
  videoId: string;
  start: number;        // seconds — from first segment in chunk
  end: number;          // seconds — from last segment in chunk
  text: string;         // joined segment text, space-normalized
  segmentIndexes: number[];
  tokenEstimate: number;
  chapterId?: string;
};

export type YoutubeChunksFile = {
  videoId: string;
  createdAt: string;
  chunkerVersion: string;   // "v2" initially
  strategy: {
    maxChars: number;       // 1200
    overlapChars: number;   // 150
    maxSegmentsPerChunk: number;  // 40
  };
  chunks: YoutubeChunk[];
};
```

### Chat

```ts
export type YoutubeChatMessageRow = {
  id: string;                 // uuid v4
  videoId: string;
  chatSessionId: string;      // stable per-video chat thread (usually one per video; future: allow multiple threads)
  turnId: string;             // groups the user msg + its assistant reply
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: string;          // ISO
  presetId?: YoutubePromptPresetId;
  parentMessageId?: string;
  retrievedChunkIds?: string[];      // provenance
  openclawSessionKey?: string;       // present on assistant rows
  status: "streaming" | "complete" | "error";  // "streaming" is the placeholder state
  errorMessage?: string;
};

export type YoutubeChatMetaFile = {
  videoId: string;
  chatSessionId: string;
  openclawSessionKey?: string;
  lastReplayedAt?: string;
  distilledMemory?: string;   // cached distillation of older turns (lazy-filled)
};
```

### Presets

```ts
export type YoutubePromptPresetId =
  | "tldr"
  | "key-points"
  | "study-notes"
  | "tutorial-steps"
  | "critique"
  | "action-items"
  | "quotes";

export type YoutubePromptPreset = {
  id: YoutubePromptPresetId;
  title: string;              // UI label
  description: string;        // one-line hover/help
  summaryInstructions: string;
  chatInstructions: string;
};
```

### Jobs (extending v1 shape additively)

```ts
export type YoutubeJobKind = "summary" | "chat" | "rebuild" | "chapter-extract" | "highlight-extract";

export type YoutubeJobV2 = YoutubeJob & {   // YoutubeJob is v1 type
  kind: YoutubeJobKind;
  input?: {
    presetId?: YoutubePromptPresetId;
    message?: string;                 // chat user message
    chatSessionId?: string;
    rebuildParts?: YoutubeRebuildPart[];
  };
  output?: {
    summaryPath?: string;
    chatMessageId?: string;
    chunksPath?: string;
  };
};

export type YoutubeRebuildPart = "captions" | "chunks" | "summary" | "highlights" | "chat";
```

### Chapters + highlights

```ts
export type YoutubeChapter = {
  id: string;
  title: string;
  start: number;   // seconds
  end?: number;
};

export type YoutubeChaptersFile = {
  videoId: string;
  source: "description" | "inferred";
  createdAt: string;
  chapters: YoutubeChapter[];
};

export type YoutubeHighlight = {
  id: string;
  videoId: string;
  quote: string;
  start: number;
  end?: number;
  reason?: string;
  createdAt: string;
};

export type YoutubeHighlightsFile = {
  videoId: string;
  createdAt: string;
  highlights: YoutubeHighlight[];
};
```

## Bridge — services to add

All under `apps/bridge/src/services/`:

- **`youtube-paths.ts`** — pure: path builders for every artifact under `videos/<videoId>/`. Single source of truth.
- **`youtube-compat.ts`** — read-only fallback. When `videos/<videoId>/summary.md` missing but `summaries/<videoId>.md` exists, surface the legacy file transparently.
- **`youtube-store-v2.ts`** — atomic writers + readers for metadata.json, transcript.json, chunks.json, summary.md, chat.jsonl, chat-meta.json, chapters.json, highlights.json. Replaces v1 `youtube-store.ts` for new code paths; v1 file stays in place for the jobs/index/summaries-index JSONL it still owns.
- **`youtube-chunker.ts`** — pure: `chunkTranscript(transcript: YoutubeTranscriptFile): YoutubeChunksFile`. Segment-aware sliding window (`maxChars=1200`, `overlapChars=150`, `maxSegmentsPerChunk=40` hard ceiling). Deterministic. Stable chunk ids via sha256(videoId + startTimestamp) first 16 hex.
- **`youtube-chunk-id.ts`** — pure: id hasher, extracted so tests can pin it.
- **`youtube-retrieval-index.ts`** — wraps MiniSearch. `buildIndex(chunks) → SerializedIndex`, `loadIndex(serialized) → MiniSearch instance`. Persists/loads `retrieval-index.json`.
- **`youtube-retrieve.ts`** — `retrieve(videoId, query, k=6) → { id, start, end, text, score }[]`. Loads index from disk (cached in memory per videoId).
- **`youtube-prompt-presets.ts`** — typed record of `YoutubePromptPreset`. One export: `PROMPT_PRESETS: Record<YoutubePromptPresetId, YoutubePromptPreset>`.
- **`youtube-summary-context.ts`** — builds the user-message payload for the summary session (metadata + transcript + preset instructions).
- **`youtube-chat-session.ts`** — manages the `openclawSessionKey` per chat session. Create / get / invalidate.
- **`youtube-chat-replay.ts`** — rebuild context on GC: summary + last 4 verbatim turns + distilled earlier turns. Implements the OpenClaw fallback (if distillation fails, skip it — summary + 4 verbatim only).
- **`youtube-chat-distill.ts`** — async helper: takes N old turns → one paragraph distillation via a side OpenClaw session. Called lazily from `youtube-chat-replay.ts`.
- **`youtube-chat-worker.ts`** — second FIFO queue, per-video locking. Mirrors the existing summary worker pattern but operates on chat jobs.
- **`youtube-rebuild.ts`** — executes `parts[]` in dependency order (captions → chunks → summary/highlights/chat).
- **`youtube-chapters.ts`** — parses chapters from video description if present; otherwise synthesizes from transcript gaps / topic transitions (simple heuristic only, nothing fancy).
- **`youtube-highlights.ts`** — runs an OpenClaw session over the transcript + asks for 3–5 quotable moments with timestamps; persists as `highlights.json`.

## Bridge — HTTP routes

Keep every v1 route working. New + modified under `/youtube`:

| Method | Path | Purpose |
|---|---|---|
| POST   | `/youtube/chat/:videoId` | Send a chat turn. Body: `{ message, presetId?, chatSessionId? }`. Returns `202 { sessionId, turnId, jobId, status }`. |
| GET    | `/youtube/chat/:videoId` | Full chat log + active job if any. |
| GET    | `/youtube/chunks/:videoId` | Debug: returns chunks. Useful for retrieval inspection. |
| GET    | `/youtube/chapters/:videoId` | Parsed chapters if available. |
| GET    | `/youtube/highlights/:videoId` | Highlights. |
| POST   | `/youtube/highlights/:videoId` | Request fresh highlight generation. |
| POST   | `/youtube/rebuild/:videoId` | Body: `{ parts: YoutubeRebuildPart[] }`. Rebuilds subset in dep order. |
| POST   | `/youtube/jobs` (existing, extended) | Body adds optional `presetId`. |
| GET    | `/youtube/summaries/:videoId` (existing) | Transparent compat shim for v1 `summaries/<videoId>.md`. |

All bearer-token authed. `videoId` always validated against `/^[A-Za-z0-9_-]{11}$/` before filesystem access.

## Dashboard — UI primitives

New directory `apps/dashboard/src/components/ui/`. One file per primitive, named exports, no default exports, no `UI` prefix. Build in this dependency-respecting order:

1. **`Button.tsx`** — `variant: "default" | "primary" | "ghost" | "danger"`, `size: "sm" | "md"`. Leaf primitive.
2. **`Card.tsx`** — `variant: "default" | "muted" | "ghost"`. Leaf.
3. **`Badge.tsx`** — `kind: "ok" | "warn" | "err" | "acc" | "mute"`, `dot?: boolean`. Leaf.
4. **`EmptyState.tsx`** — uses Card + Button. `title`, `description`, `action?`.
5. **`LoadingRow.tsx`** — skeleton row(s) for tables.
6. **`PageHeader.tsx`** — uses Button + Badge. `title`, `sub?`, `actions?: ReactNode`.
7. **`KV.tsx`** — uses Card. `items: { label, value }[]`, `columns?: 2 | 3`.
8. **`Table.tsx`** — uses LoadingRow/Button/Badge as sub-patterns. Thin wrapper — not a heavy abstraction.

Barrel file: `apps/dashboard/src/components/ui/index.ts` re-exports all named exports.

## Dashboard — CSS migration

Pull from `apps/dashboard/src/new_ui/styles.css` into `apps/dashboard/src/app/globals.css` in OpenClaw's layer order:
1. Primitive classes (`.card`, `.btn*`, `.badge*`, `.dot-lamp`, `.mini`)
2. Table system (`.tbl*`)
3. Page chrome (`.page-h`, `.page-title`, `.stack`, `.split`, `.muted`)
4. Hero/stat patterns (`.sess-hero`, `.stat*`)
5. Supporting utilities (spacing, scrollbar, empty/loading styles)
6. Only then leftovers if genuinely reused

Design tokens (the `:root { --bg, --accent, --ok, ... }` block with oklch palette) lift into `globals.css` top. Tailwind keeps its role for layout utilities; the v2 primitives use these CSS classes + tokens.

## Dashboard — routes & screens

- **`apps/dashboard/src/app/youtube/page.tsx`** (existing) — refactored to use `PageHeader` + new list primitive. Video submission form stays; list uses the new `Table` with status `Badge`.
- **`apps/dashboard/src/app/youtube/[videoId]/page.tsx`** (new) — per-video page. Top-level `PageHeader` + **tabs**: Summary / Chat / Chapters / Highlights / Raw. No split-panel by default — tabs fit the new_ui language better and avoid forcing a desktop-only layout.
- Tab components under `apps/dashboard/src/components/youtube/`:
  - `SummaryTab.tsx` — renders `summary.md` via `react-markdown` + `remark-gfm` inside `prose prose-invert`.
  - `ChatTab.tsx` — message list + input. Non-streaming: POST, poll `/api/youtube/chat/:videoId` every 3s until the assistant row flips to `complete`. Preset picker dropdown.
  - `ChaptersTab.tsx` — chapter list with timestamp click-outs to YouTube.
  - `HighlightsTab.tsx` — 3–5 cards with quote + timestamp + "Generate highlights" button when absent.
  - `RawTab.tsx` — debug view: metadata, transcript snippet, chunks (uses `/api/youtube/chunks/:videoId`).
- **API proxy routes** (`apps/dashboard/src/app/api/youtube/*`): add `chat/[videoId]/route.ts`, `chunks/[videoId]/route.ts`, `chapters/[videoId]/route.ts`, `highlights/[videoId]/route.ts`, `rebuild/[videoId]/route.ts`. Same session-cookie auth pattern as v1 proxies.
- **`bridge-client.ts`** extensions: `submitYoutubeChat`, `listYoutubeChat`, `listYoutubeChunks`, `listYoutubeChapters`, `listYoutubeHighlights`, `generateYoutubeHighlights`, `rebuildYoutubeVideo`.

## Non-streaming rendering

Chat replies poll `/api/youtube/chat/:videoId` every 3s while any assistant row is `streaming`. When the row flips to `complete`, the full answer renders at once. No WebSocket, no SSE. This keeps v2 shippable without touching the bridge's existing websocket plumbing.

## Prompt presets

Seven named presets (locked for v2):
- `tldr` — "Short 3-sentence gist."
- `key-points` — default (matches current v1 output).
- `study-notes` — hierarchical notes ready to drop into Obsidian.
- `tutorial-steps` — numbered "how to" reconstruction.
- `critique` — contrarian read with caveats.
- `action-items` — bulleted "what to do next."
- `quotes` — only verbatim quotes with timestamps.

Each preset contains a `summaryInstructions` and `chatInstructions` string. User picks one at submit time (default: `key-points`, matches v1 behavior). Custom one-shot prompts are **not** supported in v2 — deferred to v3.

## Error handling

| Failure | Caught in | Status → user |
|---|---|---|
| Captions unavailable | `youtube-captions.ts` (v1, unchanged) | Red badge + "captions unavailable" |
| Chunker produces zero chunks | `youtube-chunker.ts` | Failed job + "transcript too short after chunking" |
| Retrieval index corrupted | `youtube-retrieval-index.ts` | Rebuild index from `chunks.json` automatically; log warning; do not fail user-visible request |
| OpenClaw session GC'd mid-chat | `youtube-chat-session.ts` | Replay per lazy policy; append a system row: "Context restored after session timeout" |
| Distillation fails | `youtube-chat-distill.ts` | Fall back to summary + 4 verbatim. Never blocks chat restore. |
| Rebuild requests a part that fails | `youtube-rebuild.ts` | Dep order: stop at first failure, roll back nothing, report partial success in job |
| Bridge crash mid-chat | startup repair (extend v1 repairOnStartup) | Any chat job `running` > 5min → mark failed with "interrupted by bridge restart" |

## Testing

Follows the existing Node `node:test` runner via `tsx --test` wired up in v1:

- `apps/bridge/test/youtube-chunker.test.ts` — determinism (same input → same chunks + ids), size bounds, overlap correctness, segment-ceiling enforcement.
- `apps/bridge/test/youtube-chunk-id.test.ts` — stability across re-runs with same inputs.
- `apps/bridge/test/youtube-retrieve.test.ts` — smoke + a couple of known-good queries against a canned chunks fixture.
- `apps/bridge/test/youtube-chat-replay.test.ts` — 4 verbatim + distilled older replay, distillation-failure fallback.
- `apps/bridge/test/youtube-compat.test.ts` — legacy summary fallback, migration-on-demand.
- `apps/bridge/test/youtube-rebuild.test.ts` — `parts[]` dependency ordering, partial failure behavior.
- **No new dashboard unit tests.** UI primitives get built, `pnpm build` type-checks them; manual browser verification in Task 17-equivalent at the end.

## New npm dependencies

Bridge only (nothing new on dashboard):
- **`minisearch`** — pure JS BM25. No deps.
- **`gpt-tokenizer`** — approximate token budgeting for context construction.

OpenClaw explicitly declined pre-planning other deps. Add per-need only.

## Out of scope for v2 (deferred)

Written here so the implementer doesn't accidentally build them:
- Full-text / semantic search across the summary corpus
- Obsidian vault export (despite the existing `packages/brain/` Brainclaw integration)
- Compare mode (diff two videos' claims)
- Playlist / channel ingestion
- Auto-follow creator (cron + channel polling)
- Agent-auto-picks-prompt
- Custom one-shot prompts (`presetId: "custom"`)
- Chat streaming (WebSocket / SSE)
- Proactive rolling chat-history compaction (lazy on GC only)
- Embedding-based anything

## Open questions resolved during brainstorming

1. Chunker: `maxChars=1200`, `overlapChars=150`, `maxSegmentsPerChunk=40` hard ceiling. ✅ agreed.
2. Retrieval: `minisearch` BM25, `topK=6`. ✅ agreed.
3. Replay budget: summary + 4 verbatim + distilled earlier, fallback to 4 verbatim if distillation fails. ✅ agreed.
4. Chunk id: stable sha256 of `videoId + startTimestamp` (first 16 hex). ✅ agreed.
5. Per-video dir: consolidate into `videos/<videoId>/summary.md` with compat shim for v1. ✅ agreed.
6. Deps: `minisearch` + `gpt-tokenizer`, nothing else pre-planned. ✅ agreed.
7. Primitive order: Button → Card → Badge → EmptyState → LoadingRow → PageHeader → KV → Table. ✅ agreed.
8. Custom prompts: deferred to v3. ✅ agreed.
9. Rebuild route: one route + `parts[]` body. ✅ agreed.
10. Streaming: non-streaming (3s poll) default for v2. ✅ agreed.

Plus translation to this repo's monorepo layout (bridge/dashboard/packages) ✅ agreed, and lazy-on-replay distillation timing with fallback ✅ agreed.

## Deployment note

v1 ships to `192.168.0.240` (CentOS dashboard + Windows bridge via NSSM) **before** v2 work starts. Keeps Gal a working baseline while v2 churns routes and data shapes. v2 deploy happens once implementation plan's smoke test passes.
