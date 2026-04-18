# YouTube Summarizer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `/youtube` dashboard page where the admin pastes YouTube URLs, the bridge fetches captions and asks an OpenClaw session to summarize each video, and the resulting `.md` files are listed and rendered in a two-pane Obsidian-style view.

**Architecture:** Bridge owns all I/O — captions fetch (`youtube-transcript` npm + YouTube oEmbed), file writes (`<MANAGEMENT_DIR>/youtube/summaries/<videoId>.md`), and an in-process FIFO worker that mirrors the existing `services/codebase-reviewer/worker.ts` pattern. OpenClaw is invoked only via `sessions.create`/`sessions.send`/`sessions.list` (mirroring `services/codebase-reviewer/runner.ts`) for the LLM summarization step. Dashboard polls bridge every 3s while any job is non-terminal.

**Tech Stack:** TypeScript (strict, ESM with `.js` import suffixes), Express 5, Next.js 15 + React 19, Tailwind 4, `youtube-transcript` (new npm dep on bridge), `react-markdown` + `remark-gfm` + `@tailwindcss/typography` (new deps on dashboard), `node:test` (Node 22 built-in) for unit tests on pure modules.

**Spec:** [`docs/superpowers/specs/2026-04-18-youtube-summarizer-design.md`](../specs/2026-04-18-youtube-summarizer-design.md)

---

## File Map

**Create:**
- `packages/types/src/index.ts` (modify — append YouTube types)
- `apps/bridge/src/config.ts` (modify — add `youtubeDir` + path getters)
- `apps/bridge/src/services/youtube-url.ts` (pure URL parsing)
- `apps/bridge/src/services/youtube-captions.ts` (caption + metadata fetch)
- `apps/bridge/src/services/youtube-store.ts` (file I/O + JSONL fold)
- `apps/bridge/src/services/youtube-summarize.ts` (OpenClaw session call)
- `apps/bridge/src/services/youtube-worker.ts` (FIFO queue + startup repair)
- `apps/bridge/src/routes/youtube.ts` (HTTP handlers)
- `apps/bridge/src/server.ts` (modify — mount route + run startup repair)
- `apps/bridge/test/youtube-url.test.ts` (unit tests)
- `apps/bridge/test/youtube-store.test.ts` (unit tests)
- `apps/bridge/package.json` (modify — add `youtube-transcript`, add `test` script)
- `apps/bridge/tsconfig.json` (verify; no change expected)
- `apps/dashboard/package.json` (modify — add `react-markdown`, `remark-gfm`, `@tailwindcss/typography`)
- `apps/dashboard/src/app/globals.css` (modify — register typography plugin if Tailwind 4 needs explicit `@plugin`)
- `apps/dashboard/src/lib/bridge-client.ts` (modify — add 6 youtube methods)
- `apps/dashboard/src/app/api/youtube/submit/route.ts`
- `apps/dashboard/src/app/api/youtube/jobs/route.ts`
- `apps/dashboard/src/app/api/youtube/summaries/route.ts`
- `apps/dashboard/src/app/api/youtube/summaries/[videoId]/route.ts`
- `apps/dashboard/src/app/api/youtube/summaries/[videoId]/rerun/route.ts`
- `apps/dashboard/src/app/youtube/page.tsx` (server component)
- `apps/dashboard/src/components/youtube/SummaryListPane.tsx` (client component)
- `apps/dashboard/src/components/youtube/SummaryViewPane.tsx` (client component)
- `apps/dashboard/src/components/sidebar.tsx` (modify — add nav entry)

---

## Conventions reminder for the executor

- Project is **ESM with `.js` import suffixes** even though source is `.ts`. Always write `import { foo } from "./bar.js"` — never `"./bar"` or `"./bar.ts"`. Match existing files exactly.
- Use **`node:` prefix** for Node built-ins (`node:fs/promises`, `node:crypto`).
- Use `pnpm` always — never `npm` or `yarn`.
- Atomic file writes: write to `<path>.tmp`, then `fs.rename` to target. Mirrors `apps/bridge/src/services/runtime-settings.ts:32-34` and `services/codebase-reviewer/worker.ts:82-84`.
- After every task: run `pnpm build` from repo root and confirm zero errors before committing.
- Commit messages follow Conventional Commits (`feat(youtube): ...`, `fix(youtube): ...`, `chore(youtube): ...`).

---

## Task 1: Add YouTube types

**Files:**
- Modify: `packages/types/src/index.ts` (append at end of file, after the existing `// --- Codebase Reviewer ---` block)

- [ ] **Step 1: Append the YouTube type block**

Open `packages/types/src/index.ts` and append at the end:

```ts
// --- YouTube Summarizer ---

export type YoutubeJobStatus = "queued" | "processing" | "done" | "failed";

export type YoutubeJob = {
  jobId: string;
  videoId: string;
  url: string;
  status: YoutubeJobStatus;
  createdAt: string;
  updatedAt: string;
  errorMessage?: string;
};

export type YoutubeSummaryMeta = {
  videoId: string;
  title: string;
  channel: string;
  url: string;
  durationSeconds: number;
  captionLanguage: string;
  fetchedAt: string;
  updatedAt: string;
};

export type YoutubeSummaryListItem = YoutubeSummaryMeta & {
  status: YoutubeJobStatus;
  errorMessage?: string;
};

export type YoutubeIndexEvent = {
  videoId: string;
  status: YoutubeJobStatus;
  meta?: Partial<YoutubeSummaryMeta>;
  errorMessage?: string;
  at: string;
};

export type YoutubeRejectedUrl = {
  url: string;
  reason: string;
};

export type YoutubeSubmitResponse = {
  jobs: YoutubeJob[];
  rejected: YoutubeRejectedUrl[];
};
```

- [ ] **Step 2: Build to verify types compile**

Run: `pnpm build`
Expected: PASS (no TypeScript errors anywhere in the workspace).

- [ ] **Step 3: Commit**

```bash
git add packages/types/src/index.ts
git commit -m "feat(youtube): add shared types for summarizer"
```

---

## Task 2: Add bridge config paths

**Files:**
- Modify: `apps/bridge/src/config.ts` (add path getters at the bottom of the `config` object)

- [ ] **Step 1: Add `youtubeDir` and the three path getters**

Open `apps/bridge/src/config.ts`. Inside the `config` object literal, after the existing `get commandsPath()` getter and before the closing `} as const;`, append:

```ts
  get youtubeDir() {
    return path.join(this.managementDir, "youtube");
  },
  get youtubeJobsPath() {
    return path.join(this.managementDir, "youtube", "jobs.jsonl");
  },
  get youtubeIndexPath() {
    return path.join(this.managementDir, "youtube", "summaries-index.jsonl");
  },
  get youtubeSummariesDir() {
    return path.join(this.managementDir, "youtube", "summaries");
  },
```

- [ ] **Step 2: Build to verify**

Run: `pnpm build`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/bridge/src/config.ts
git commit -m "feat(youtube): add bridge config paths for jobs/index/summaries"
```

---

## Task 3: Set up `node --test` runner for the bridge

The repo currently has zero test infrastructure. We add Node's built-in test runner (no new dependency) so we can TDD the pure modules in tasks 4 and 5.

**Files:**
- Modify: `apps/bridge/package.json` (add a `test` script)
- Create: `apps/bridge/test/.gitkeep`

- [ ] **Step 1: Add the `test` script**

Open `apps/bridge/package.json`. Inside `"scripts"` add a `"test"` line so it reads:

```json
  "scripts": {
    "dev": "tsx watch --env-file=.env src/server.ts",
    "build": "tsc",
    "start": "node --env-file=.env dist/server.js",
    "test": "tsx --test test/**/*.test.ts"
  },
```

- [ ] **Step 2: Create the test dir placeholder**

Create the empty file `apps/bridge/test/.gitkeep` (touch). It exists only so the directory survives in git.

- [ ] **Step 3: Sanity-check the runner with no tests**

Run: `pnpm --filter bridge test`
Expected: command exits successfully with "no test files found" (or similar empty-matches message). If `tsx --test` errors instead of warning on no files, that is fine — the next task creates real tests and we confirm again then.

- [ ] **Step 4: Commit**

```bash
git add apps/bridge/package.json apps/bridge/test/.gitkeep
git commit -m "chore(bridge): wire up node:test runner via tsx"
```

---

## Task 4: `youtube-url.ts` pure URL parser (TDD)

**Files:**
- Create: `apps/bridge/test/youtube-url.test.ts`
- Create: `apps/bridge/src/services/youtube-url.ts`

- [ ] **Step 1: Write the failing tests**

Create `apps/bridge/test/youtube-url.test.ts` with the full contents:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseVideoId, isValidVideoId } from "../src/services/youtube-url.js";

test("parseVideoId — standard watch URL", () => {
  assert.equal(parseVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ"), "dQw4w9WgXcQ");
});

test("parseVideoId — watch URL with extra params", () => {
  assert.equal(parseVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s&list=foo"), "dQw4w9WgXcQ");
});

test("parseVideoId — short youtu.be URL", () => {
  assert.equal(parseVideoId("https://youtu.be/dQw4w9WgXcQ"), "dQw4w9WgXcQ");
});

test("parseVideoId — youtu.be with timestamp", () => {
  assert.equal(parseVideoId("https://youtu.be/dQw4w9WgXcQ?t=42"), "dQw4w9WgXcQ");
});

test("parseVideoId — shorts URL", () => {
  assert.equal(parseVideoId("https://www.youtube.com/shorts/dQw4w9WgXcQ"), "dQw4w9WgXcQ");
});

test("parseVideoId — embed URL", () => {
  assert.equal(parseVideoId("https://www.youtube.com/embed/dQw4w9WgXcQ"), "dQw4w9WgXcQ");
});

test("parseVideoId — bare 11-char id", () => {
  assert.equal(parseVideoId("dQw4w9WgXcQ"), "dQw4w9WgXcQ");
});

test("parseVideoId — m.youtube.com mobile URL", () => {
  assert.equal(parseVideoId("https://m.youtube.com/watch?v=dQw4w9WgXcQ"), "dQw4w9WgXcQ");
});

test("parseVideoId — playlist URL is rejected", () => {
  assert.throws(() => parseVideoId("https://www.youtube.com/playlist?list=PLfoo"), /playlist/i);
});

test("parseVideoId — channel URL is rejected", () => {
  assert.throws(() => parseVideoId("https://www.youtube.com/@somechannel"), /not a youtube video/i);
});

test("parseVideoId — non-youtube URL is rejected", () => {
  assert.throws(() => parseVideoId("https://vimeo.com/12345"), /not a youtube/i);
});

test("parseVideoId — garbage is rejected", () => {
  assert.throws(() => parseVideoId("not a url at all"), /not a youtube/i);
});

test("parseVideoId — empty string is rejected", () => {
  assert.throws(() => parseVideoId(""), /empty/i);
});

test("isValidVideoId — accepts real id", () => {
  assert.equal(isValidVideoId("dQw4w9WgXcQ"), true);
});

test("isValidVideoId — accepts dashes/underscores", () => {
  assert.equal(isValidVideoId("a-b_c1234XY"), true);
});

test("isValidVideoId — rejects 10-char id", () => {
  assert.equal(isValidVideoId("dQw4w9WgXc"), false);
});

test("isValidVideoId — rejects 12-char id", () => {
  assert.equal(isValidVideoId("dQw4w9WgXcQ1"), false);
});

test("isValidVideoId — rejects symbols", () => {
  assert.equal(isValidVideoId("dQw4w9WgXc!"), false);
});

test("isValidVideoId — rejects path traversal attempt", () => {
  assert.equal(isValidVideoId("../../../etc"), false);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter bridge test`
Expected: FAIL with module-not-found error for `youtube-url.js` (file doesn't exist yet).

- [ ] **Step 3: Implement `youtube-url.ts`**

Create `apps/bridge/src/services/youtube-url.ts` with the full contents:

```ts
const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;

export function isValidVideoId(id: string): boolean {
  return VIDEO_ID_RE.test(id);
}

/**
 * Extracts the 11-character YouTube video id from any common URL form.
 * Throws with a user-readable message on invalid input — the route layer
 * surfaces this verbatim.
 */
export function parseVideoId(input: string): string {
  const raw = (input ?? "").trim();
  if (!raw) throw new Error("empty url");

  if (isValidVideoId(raw)) return raw;

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("not a youtube video url");
  }

  const host = url.hostname.toLowerCase().replace(/^www\.|^m\./, "");

  if (host === "youtu.be") {
    const id = url.pathname.replace(/^\//, "").split("/")[0];
    if (id && isValidVideoId(id)) return id;
    throw new Error("not a youtube video url");
  }

  if (host !== "youtube.com" && host !== "youtube-nocookie.com") {
    throw new Error("not a youtube video url");
  }

  if (url.pathname === "/playlist") {
    throw new Error("playlist urls are not supported — submit individual videos");
  }

  if (url.pathname === "/watch") {
    const id = url.searchParams.get("v");
    if (id && isValidVideoId(id)) return id;
    throw new Error("not a youtube video url");
  }

  const shortsMatch = url.pathname.match(/^\/shorts\/([^/?#]+)/);
  if (shortsMatch && isValidVideoId(shortsMatch[1]!)) return shortsMatch[1]!;

  const embedMatch = url.pathname.match(/^\/embed\/([^/?#]+)/);
  if (embedMatch && isValidVideoId(embedMatch[1]!)) return embedMatch[1]!;

  throw new Error("not a youtube video url");
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter bridge test`
Expected: PASS — all 19 tests green.

- [ ] **Step 5: Build to verify**

Run: `pnpm build`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/bridge/src/services/youtube-url.ts apps/bridge/test/youtube-url.test.ts
git commit -m "feat(youtube): pure URL parser with full test coverage"
```

---

## Task 5: `youtube-store.ts` file I/O + JSONL fold (TDD for the fold)

**Files:**
- Create: `apps/bridge/test/youtube-store.test.ts` (covers the fold logic only — file I/O is integration-tested manually)
- Create: `apps/bridge/src/services/youtube-store.ts`

- [ ] **Step 1: Write the failing fold tests**

Create `apps/bridge/test/youtube-store.test.ts` with the full contents:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { foldIndexEvents } from "../src/services/youtube-store.js";
import type { YoutubeIndexEvent, YoutubeSummaryListItem } from "@openclaw-manager/types";

const META_BASE = {
  title: "",
  channel: "",
  url: "",
  durationSeconds: 0,
  captionLanguage: "",
  fetchedAt: "",
  updatedAt: "",
};

test("foldIndexEvents — empty input → empty list", () => {
  assert.deepEqual(foldIndexEvents([]), []);
});

test("foldIndexEvents — single queued event", () => {
  const events: YoutubeIndexEvent[] = [
    { videoId: "abc12345678", status: "queued", at: "2026-04-18T10:00:00Z" },
  ];
  const out = foldIndexEvents(events);
  assert.equal(out.length, 1);
  assert.equal(out[0]!.videoId, "abc12345678");
  assert.equal(out[0]!.status, "queued");
});

test("foldIndexEvents — multiple statuses for same video collapse to latest", () => {
  const events: YoutubeIndexEvent[] = [
    { videoId: "abc12345678", status: "queued", at: "2026-04-18T10:00:00Z" },
    { videoId: "abc12345678", status: "processing", at: "2026-04-18T10:00:30Z" },
    { videoId: "abc12345678", status: "done", at: "2026-04-18T10:01:00Z",
      meta: { title: "T", channel: "C", url: "U", durationSeconds: 60, captionLanguage: "en", fetchedAt: "2026-04-18T10:00:30Z", updatedAt: "2026-04-18T10:01:00Z" } },
  ];
  const out = foldIndexEvents(events);
  assert.equal(out.length, 1);
  assert.equal(out[0]!.status, "done");
  assert.equal(out[0]!.title, "T");
  assert.equal(out[0]!.channel, "C");
});

test("foldIndexEvents — meta accumulates across events", () => {
  const events: YoutubeIndexEvent[] = [
    { videoId: "abc12345678", status: "queued", at: "2026-04-18T10:00:00Z",
      meta: { url: "https://youtu.be/abc12345678" } },
    { videoId: "abc12345678", status: "processing", at: "2026-04-18T10:00:30Z",
      meta: { title: "Title", channel: "Channel" } },
  ];
  const out = foldIndexEvents(events);
  assert.equal(out.length, 1);
  assert.equal(out[0]!.url, "https://youtu.be/abc12345678");
  assert.equal(out[0]!.title, "Title");
  assert.equal(out[0]!.channel, "Channel");
});

test("foldIndexEvents — failure carries errorMessage", () => {
  const events: YoutubeIndexEvent[] = [
    { videoId: "abc12345678", status: "processing", at: "2026-04-18T10:00:00Z" },
    { videoId: "abc12345678", status: "failed", at: "2026-04-18T10:00:30Z", errorMessage: "captions unavailable" },
  ];
  const out = foldIndexEvents(events);
  assert.equal(out[0]!.status, "failed");
  assert.equal(out[0]!.errorMessage, "captions unavailable");
});

test("foldIndexEvents — re-run after failure clears errorMessage", () => {
  const events: YoutubeIndexEvent[] = [
    { videoId: "abc12345678", status: "failed", at: "2026-04-18T10:00:00Z", errorMessage: "captions unavailable" },
    { videoId: "abc12345678", status: "queued", at: "2026-04-18T11:00:00Z" },
  ];
  const out = foldIndexEvents(events);
  assert.equal(out[0]!.status, "queued");
  assert.equal(out[0]!.errorMessage, undefined);
});

test("foldIndexEvents — multiple videos sort by latest activity desc", () => {
  const events: YoutubeIndexEvent[] = [
    { videoId: "aaaaaaaaaaa", status: "queued", at: "2026-04-18T10:00:00Z" },
    { videoId: "bbbbbbbbbbb", status: "queued", at: "2026-04-18T11:00:00Z" },
    { videoId: "ccccccccccc", status: "queued", at: "2026-04-18T09:00:00Z" },
  ];
  const out = foldIndexEvents(events);
  assert.deepEqual(out.map((s: YoutubeSummaryListItem) => s.videoId), ["bbbbbbbbbbb", "aaaaaaaaaaa", "ccccccccccc"]);
});

test("foldIndexEvents — delete event removes the entry", () => {
  // The store appends a private "deleted" sentinel event when the user deletes
  // a summary. The fold honors it by dropping the videoId from the output.
  // We cast through any because "deleted" isn't part of the public union.
  const events: any[] = [
    { videoId: "abc12345678", status: "done", at: "2026-04-18T10:00:00Z" },
    { videoId: "abc12345678", status: "deleted", at: "2026-04-18T11:00:00Z" },
  ];
  const out = foldIndexEvents(events);
  assert.equal(out.length, 0);
});

test("foldIndexEvents — re-submit after delete restores the entry", () => {
  const events: any[] = [
    { videoId: "abc12345678", status: "done", at: "2026-04-18T10:00:00Z" },
    { videoId: "abc12345678", status: "deleted", at: "2026-04-18T11:00:00Z" },
    { videoId: "abc12345678", status: "queued", at: "2026-04-18T12:00:00Z" },
  ];
  const out = foldIndexEvents(events);
  assert.equal(out.length, 1);
  assert.equal(out[0]!.status, "queued");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter bridge test`
Expected: FAIL — module-not-found for `youtube-store.js`.

- [ ] **Step 3: Implement `youtube-store.ts`**

Create `apps/bridge/src/services/youtube-store.ts` with the full contents:

```ts
import fs from "node:fs/promises";
import path from "node:path";
import { config } from "../config.js";
import type {
  YoutubeJob,
  YoutubeJobStatus,
  YoutubeIndexEvent,
  YoutubeSummaryListItem,
  YoutubeSummaryMeta,
} from "@openclaw-manager/types";

// Internal event type — extends the public one with a "deleted" sentinel
// used by deleteSummary(). Kept private so the public surface stays clean.
type StoredIndexEvent = YoutubeIndexEvent | {
  videoId: string;
  status: "deleted";
  at: string;
};

async function ensureDir(): Promise<void> {
  await fs.mkdir(config.youtubeSummariesDir, { recursive: true });
}

async function readJsonl<T>(filepath: string): Promise<T[]> {
  let raw: string;
  try {
    raw = await fs.readFile(filepath, "utf8");
  } catch {
    return [];
  }
  const out: T[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      out.push(JSON.parse(trimmed));
    } catch {
      // skip malformed lines — surfaced in console for diagnosis
      console.warn(`youtube-store: skipping malformed line in ${filepath}`);
    }
  }
  return out;
}

async function appendJsonl(filepath: string, obj: unknown): Promise<void> {
  await ensureDir();
  await fs.appendFile(filepath, JSON.stringify(obj) + "\n", "utf8");
}

// ---------- Jobs ----------

export async function readJobs(): Promise<YoutubeJob[]> {
  return readJsonl<YoutubeJob>(config.youtubeJobsPath);
}

/** Returns current state of every job by jobId — folded from the append-only log. */
export async function foldJobs(): Promise<YoutubeJob[]> {
  const events = await readJobs();
  const byId = new Map<string, YoutubeJob>();
  for (const ev of events) {
    const prev = byId.get(ev.jobId);
    byId.set(ev.jobId, prev ? { ...prev, ...ev } : ev);
  }
  return [...byId.values()].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export async function activeJobs(): Promise<YoutubeJob[]> {
  const all = await foldJobs();
  return all.filter((j) => j.status === "queued" || j.status === "processing");
}

export async function appendJobEvent(job: YoutubeJob): Promise<void> {
  await appendJsonl(config.youtubeJobsPath, job);
}

// ---------- Index ----------

export async function readIndex(): Promise<StoredIndexEvent[]> {
  return readJsonl<StoredIndexEvent>(config.youtubeIndexPath);
}

export async function appendIndexEvent(ev: StoredIndexEvent): Promise<void> {
  await appendJsonl(config.youtubeIndexPath, ev);
}

/**
 * Pure: collapses an event log into one row per videoId. Sorted by latest
 * activity descending. A "deleted" event removes the entry entirely.
 * Re-runs after a failure clear errorMessage when a newer non-failed event arrives.
 */
export function foldIndexEvents(events: StoredIndexEvent[]): YoutubeSummaryListItem[] {
  const byId = new Map<string, { item: YoutubeSummaryListItem; lastAt: string }>();
  for (const ev of events) {
    if (ev.status === "deleted") {
      byId.delete(ev.videoId);
      continue;
    }
    const prev = byId.get(ev.videoId);
    const baseMeta: YoutubeSummaryMeta = prev?.item ?? {
      videoId: ev.videoId,
      title: "",
      channel: "",
      url: "",
      durationSeconds: 0,
      captionLanguage: "",
      fetchedAt: "",
      updatedAt: "",
    };
    const nextMeta: YoutubeSummaryMeta = { ...baseMeta, ...(ev.meta || {}), videoId: ev.videoId };
    const next: YoutubeSummaryListItem = {
      ...nextMeta,
      status: ev.status,
      errorMessage: ev.status === "failed" ? ev.errorMessage : undefined,
    };
    byId.set(ev.videoId, { item: next, lastAt: ev.at });
  }
  return [...byId.values()]
    .sort((a, b) => (a.lastAt < b.lastAt ? 1 : -1))
    .map((e) => e.item);
}

export async function listSummaries(): Promise<YoutubeSummaryListItem[]> {
  const events = await readIndex();
  return foldIndexEvents(events);
}

// ---------- Markdown files ----------

function summaryFilePath(videoId: string): string {
  return path.join(config.youtubeSummariesDir, `${videoId}.md`);
}

export async function readMarkdown(videoId: string): Promise<string | null> {
  try {
    return await fs.readFile(summaryFilePath(videoId), "utf8");
  } catch {
    return null;
  }
}

export async function writeMarkdown(videoId: string, body: string): Promise<void> {
  await ensureDir();
  const file = summaryFilePath(videoId);
  const tmp = file + ".tmp";
  await fs.writeFile(tmp, body, "utf8");
  await fs.rename(tmp, file);
}

export async function deleteMarkdown(videoId: string): Promise<void> {
  try {
    await fs.unlink(summaryFilePath(videoId));
  } catch {
    // already gone — fine
  }
}

export async function appendDeleteEvent(videoId: string): Promise<void> {
  await appendJsonl(config.youtubeIndexPath, {
    videoId,
    status: "deleted",
    at: new Date().toISOString(),
  });
}

// ---------- YAML front-matter ----------

export function buildFrontMatter(meta: YoutubeSummaryMeta): string {
  const lines = [
    "---",
    `videoId: ${meta.videoId}`,
    `title: ${JSON.stringify(meta.title)}`,
    `channel: ${JSON.stringify(meta.channel)}`,
    `url: ${meta.url}`,
    `durationSeconds: ${meta.durationSeconds}`,
    `captionLanguage: ${meta.captionLanguage}`,
    `fetchedAt: ${meta.fetchedAt}`,
    `updatedAt: ${meta.updatedAt}`,
    "---",
    "",
  ];
  return lines.join("\n");
}

export function stripFrontMatter(markdown: string): { body: string; rawFront: string | null } {
  const match = markdown.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!match) return { body: markdown, rawFront: null };
  return { body: markdown.slice(match[0].length), rawFront: match[1]! };
}

// ---------- Startup repair ----------

/** Marks any job stuck in "processing" (older than 5min) as failed. */
export async function repairOnStartup(now: number = Date.now()): Promise<void> {
  const jobs = await foldJobs();
  const STALE_MS = 5 * 60 * 1000;
  for (const j of jobs) {
    if (j.status !== "processing") continue;
    const updatedAt = Date.parse(j.updatedAt);
    if (Number.isFinite(updatedAt) && now - updatedAt < STALE_MS) continue;
    const failed: YoutubeJob = {
      ...j,
      status: "failed",
      updatedAt: new Date(now).toISOString(),
      errorMessage: "interrupted by bridge restart",
    };
    await appendJobEvent(failed);
    await appendIndexEvent({
      videoId: j.videoId,
      status: "failed",
      errorMessage: "interrupted by bridge restart",
      at: failed.updatedAt,
    });
  }
}

// ---------- helper for routes ----------

export type JobStateUpdate = {
  status: YoutubeJobStatus;
  errorMessage?: string;
  meta?: Partial<YoutubeSummaryMeta>;
};

export async function updateJob(job: YoutubeJob, update: JobStateUpdate): Promise<YoutubeJob> {
  const next: YoutubeJob = {
    ...job,
    status: update.status,
    updatedAt: new Date().toISOString(),
    errorMessage: update.errorMessage,
  };
  await appendJobEvent(next);
  await appendIndexEvent({
    videoId: job.videoId,
    status: update.status,
    meta: update.meta,
    errorMessage: update.errorMessage,
    at: next.updatedAt,
  });
  return next;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter bridge test`
Expected: PASS — all `youtube-url` tests still green, plus all 9 `youtube-store` fold tests green.

- [ ] **Step 5: Build to verify**

Run: `pnpm build`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/bridge/src/services/youtube-store.ts apps/bridge/test/youtube-store.test.ts
git commit -m "feat(youtube): jsonl-backed store with fold + atomic markdown writes"
```

---

## Task 6: Add `youtube-transcript` dependency

**Files:**
- Modify: `apps/bridge/package.json`

- [ ] **Step 1: Install the package**

Run from repo root: `pnpm --filter bridge add youtube-transcript`
Expected: package added to `apps/bridge/package.json` and lockfile updated.

- [ ] **Step 2: Verify the dep landed**

Run: `cat apps/bridge/package.json`
Expected: `"youtube-transcript": "..."` appears in `"dependencies"`.

- [ ] **Step 3: Commit**

```bash
git add apps/bridge/package.json pnpm-lock.yaml
git commit -m "chore(youtube): add youtube-transcript dep on bridge"
```

---

## Task 7: `youtube-captions.ts` — captions + metadata fetch

**Files:**
- Create: `apps/bridge/src/services/youtube-captions.ts`

This module wraps two HTTP calls:
1. `youtube-transcript` for the transcript text + language.
2. YouTube oEmbed (`https://www.youtube.com/oembed?url=…&format=json`) for title + channel. No API key required.

Duration is best-effort — the `youtube-transcript` library returns per-segment offsets and durations; we sum them.

The error mapping is what the worker will use to set `errorMessage` user-facing strings.

- [ ] **Step 1: Create the file**

Create `apps/bridge/src/services/youtube-captions.ts`:

```ts
import { YoutubeTranscript } from "youtube-transcript";

export type CaptionsResult = {
  title: string;
  channel: string;
  durationSeconds: number;
  language: string;
  transcript: string;
};

export class CaptionsUnavailableError extends Error {
  constructor(message = "captions unavailable for this video") {
    super(message);
    this.name = "CaptionsUnavailableError";
  }
}

export class VideoNotFoundError extends Error {
  constructor(message = "youtube video not found") {
    super(message);
    this.name = "VideoNotFoundError";
  }
}

export class TranscriptTooShortError extends Error {
  constructor(message = "transcript too short to summarize") {
    super(message);
    this.name = "TranscriptTooShortError";
  }
}

const MIN_TRANSCRIPT_CHARS = 200;

async function fetchOEmbed(videoId: string): Promise<{ title: string; channel: string }> {
  const url = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}&format=json`;
  const res = await fetch(url);
  if (res.status === 401 || res.status === 404) throw new VideoNotFoundError();
  if (!res.ok) throw new Error(`oembed failed: ${res.status}`);
  const data = (await res.json()) as { title?: unknown; author_name?: unknown };
  return {
    title: typeof data.title === "string" ? data.title : "(untitled)",
    channel: typeof data.author_name === "string" ? data.author_name : "(unknown)",
  };
}

async function fetchTranscriptSafe(
  videoId: string
): Promise<{ text: string; language: string; durationSeconds: number }> {
  type Segment = { text: string; duration?: number; offset?: number; lang?: string };
  let segments: Segment[];
  try {
    segments = (await YoutubeTranscript.fetchTranscript(videoId)) as Segment[];
  } catch (err: any) {
    const msg = String(err?.message || err || "");
    if (/disabled|unavailable|no transcript/i.test(msg)) {
      throw new CaptionsUnavailableError();
    }
    if (/not found|invalid/i.test(msg)) {
      throw new VideoNotFoundError();
    }
    throw new CaptionsUnavailableError(msg);
  }
  if (!Array.isArray(segments) || segments.length === 0) {
    throw new CaptionsUnavailableError();
  }
  const text = segments.map((s) => s.text).join(" ").replace(/\s+/g, " ").trim();
  if (text.length < MIN_TRANSCRIPT_CHARS) throw new TranscriptTooShortError();

  const language = segments.find((s) => typeof s.lang === "string")?.lang || "unknown";
  const durationSeconds = Math.round(
    segments.reduce((acc, s) => acc + (typeof s.duration === "number" ? s.duration : 0), 0)
  );
  return { text, language, durationSeconds };
}

export async function fetchCaptions(videoId: string): Promise<CaptionsResult> {
  const [meta, tr] = await Promise.all([fetchOEmbed(videoId), fetchTranscriptSafe(videoId)]);
  return {
    title: meta.title,
    channel: meta.channel,
    durationSeconds: tr.durationSeconds,
    language: tr.language,
    transcript: tr.text,
  };
}
```

- [ ] **Step 2: Build to verify it type-checks against the npm package's actual exports**

Run: `pnpm build`
Expected: PASS. If TypeScript complains that `YoutubeTranscript` doesn't have a `fetchTranscript` static method, open `node_modules/youtube-transcript/dist/youtube-transcript.d.ts` and adjust the import / call site to match the library's actual public API. Do not silence with `as any` — fix the call to match the real shape.

- [ ] **Step 3: Smoke-test against a known video (manual)**

Run a one-off script via tsx to confirm captions actually fetch:

```bash
cd apps/bridge
node --import tsx -e "import('./src/services/youtube-captions.js').then(m => m.fetchCaptions('jNQXAC9IVRw').then(r => console.log({title: r.title, channel: r.channel, lang: r.language, dur: r.durationSeconds, snippet: r.transcript.slice(0, 80)})))"
```

(The video id `jNQXAC9IVRw` is "Me at the zoo", the very first YouTube video — captioned, very short. If that's too short and trips `TranscriptTooShortError`, swap to `dQw4w9WgXcQ`.)

Expected: prints an object with non-empty `title`, `channel`, `lang`, `dur > 0`, and a transcript snippet.

If this fails because the npm library is out of date or YouTube changed its caption response, this is the right time to discover that. Either pin a known-working version or switch to `@danielxceron/youtube-transcript` / `youtube-caption-extractor` — pick whichever currently works and update the import in the file.

- [ ] **Step 4: Commit**

```bash
git add apps/bridge/src/services/youtube-captions.ts
git commit -m "feat(youtube): captions + oembed metadata fetch with typed errors"
```

---

## Task 8: `youtube-summarize.ts` — OpenClaw session call

This mirrors `apps/bridge/src/services/codebase-reviewer/runner.ts` (which already proved the SDK session call pattern works). The differences: shorter timeout (120s), different prompt, simpler output extraction.

**Files:**
- Create: `apps/bridge/src/services/youtube-summarize.ts`

- [ ] **Step 1: Create the file**

```ts
import fs from "node:fs/promises";
import path from "node:path";
import { callGateway } from "./gateway.js";
import { config } from "../config.js";
import type { CaptionsResult } from "./youtube-captions.js";

type CreatedSession = {
  ok?: boolean;
  key?: string;
  sessionId?: string;
  id?: string;
  entry?: { sessionFile?: string };
};

type SessionsListEntry = {
  sessionId?: string;
  id?: string;
  status?: string;
  abortedLastRun?: boolean;
};

const TIMEOUT_MS = 120_000;
const POLL_INTERVAL_MS = 3_000;

const SYSTEM_PROMPT = `You are a video summarizer. The user will give you the metadata and full transcript of a YouTube video. Produce a Markdown summary with this exact structure and nothing else:

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

Write in the same language as the transcript. Do not invent facts not present in the transcript. Do not include any preamble, apology, or post-script — output only the markdown above.`;

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "??:??";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

function sessionFilePath(created: CreatedSession, sessionId: string): string {
  if (created.entry?.sessionFile) return created.entry.sessionFile;
  if (config.sessionsDir) return path.join(config.sessionsDir, `${sessionId}.jsonl`);
  throw new Error("cannot locate session file: SDK did not return it and OPENCLAW_SESSIONS_DIR is not set");
}

async function pollSessionStatus(sessionId: string): Promise<SessionsListEntry | undefined> {
  const raw = (await callGateway("sessions.list", {})) as unknown;
  const list = Array.isArray(raw)
    ? (raw as SessionsListEntry[])
    : ((raw as { sessions?: SessionsListEntry[] })?.sessions ?? []);
  return list.find((s) => s?.sessionId === sessionId || s?.id === sessionId);
}

async function readLastAssistantMessage(sessionFile: string): Promise<string | undefined> {
  let raw: string;
  try {
    raw = await fs.readFile(sessionFile, "utf8");
  } catch {
    return undefined;
  }
  const lines = raw.split(/\r?\n/).filter((l) => l.trim());
  for (let i = lines.length - 1; i >= 0; i--) {
    let entry: any;
    try {
      entry = JSON.parse(lines[i]!);
    } catch {
      continue;
    }
    if (entry?.type !== "message") continue;
    const msg = entry.message;
    if (!msg || msg.role !== "assistant") continue;
    const content = msg.content;
    if (typeof content === "string") return content;
    if (Array.isArray(content)) {
      const parts = content
        .filter((c: any) => c && c.type === "text" && typeof c.text === "string")
        .map((c: any) => c.text as string);
      if (parts.length) return parts.join("");
    }
  }
  return undefined;
}

function buildUserMessage(captions: CaptionsResult, url: string): string {
  return [
    `Title: ${captions.title}`,
    `Channel: ${captions.channel}`,
    `Duration: ${formatDuration(captions.durationSeconds)}`,
    `URL: ${url}`,
    `Language: ${captions.language}`,
    "",
    "Transcript:",
    captions.transcript,
  ].join("\n");
}

export type SummarizeResult = { sessionId: string; markdown: string };

export async function summarize(captions: CaptionsResult, url: string): Promise<SummarizeResult> {
  const created = (await callGateway("sessions.create", {
    systemPrompt: SYSTEM_PROMPT,
  })) as CreatedSession;
  const sessionId = created.sessionId || created.id;
  const key = created.key;
  if (!sessionId) throw new Error("sessions.create did not return a session id");
  if (!key) throw new Error("sessions.create did not return a session key");
  const sessionFile = sessionFilePath(created, sessionId);

  await callGateway("sessions.send", { key, message: buildUserMessage(captions, url) });

  const started = Date.now();
  const terminal = new Set(["done", "completed", "finished", "stopped"]);
  const errored = new Set(["error", "failed", "aborted"]);

  while (true) {
    if (Date.now() - started > TIMEOUT_MS) {
      try { await callGateway("sessions.abort", { key }); } catch {}
      throw new Error(`session timeout after ${TIMEOUT_MS}ms`);
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    const s = await pollSessionStatus(sessionId);
    if (!s) continue;
    const state = typeof s.status === "string" ? s.status.toLowerCase() : "";
    if (s.abortedLastRun || errored.has(state)) {
      throw new Error(`session ended in ${state || "aborted"} state`);
    }
    if (terminal.has(state)) break;
  }

  const final = await readLastAssistantMessage(sessionFile);
  if (!final) throw new Error(`no assistant output found in session file: ${sessionFile}`);
  const trimmed = final.trim();
  const idx = trimmed.indexOf("# ");
  if (idx < 0) {
    throw new Error("agent output did not include a top-level '# ' heading");
  }
  return { sessionId, markdown: trimmed.slice(idx) };
}
```

Note: if `sessions.create` in the local OpenClaw SDK does not accept a `systemPrompt` parameter, the call here silently degrades — the prompt simply lives in the user message instead. To be safe, wrap the prompt into the user message if `systemPrompt` is unsupported:

If during the smoke test the agent ignores the system prompt and produces non-conforming output, change `buildUserMessage` to prepend `SYSTEM_PROMPT + "\n\n---\n\n"` and drop the `systemPrompt` from the `sessions.create` call.

- [ ] **Step 2: Build to verify**

Run: `pnpm build`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/bridge/src/services/youtube-summarize.ts
git commit -m "feat(youtube): openclaw session wrapper for summarization"
```

---

## Task 9: `youtube-worker.ts` — FIFO queue + processing loop

Mirrors `apps/bridge/src/services/codebase-reviewer/worker.ts` line-for-line in structure. The difference: jobs are keyed by `jobId`, not `projectId`, and dedup is per `videoId` (so resubmitting the same video while one is in flight returns the in-flight job instead of queueing a duplicate).

**Files:**
- Create: `apps/bridge/src/services/youtube-worker.ts`

- [ ] **Step 1: Create the file**

```ts
import crypto from "node:crypto";
import {
  appendJobEvent,
  appendIndexEvent,
  updateJob,
  foldJobs,
  repairOnStartup as storeRepairOnStartup,
} from "./youtube-store.js";
import { fetchCaptions, CaptionsUnavailableError, VideoNotFoundError, TranscriptTooShortError } from "./youtube-captions.js";
import { summarize } from "./youtube-summarize.js";
import { writeMarkdown, buildFrontMatter } from "./youtube-store.js";
import type { YoutubeJob } from "@openclaw-manager/types";

type QueueItem = { job: YoutubeJob };

const queue: QueueItem[] = [];
let current: YoutubeJob | null = null;
let running = false;

export function getWorkerState(): { current: string | null; queued: string[] } {
  return {
    current: current?.videoId ?? null,
    queued: queue.map((q) => q.job.videoId),
  };
}

/**
 * Enqueue a new job. If a non-terminal job already exists for this videoId,
 * returns that existing job and does NOT create a new one.
 */
export async function submit(url: string, videoId: string): Promise<YoutubeJob> {
  // Dedup against the in-memory queue + currently-processing job.
  if (current && current.videoId === videoId) return current;
  const queuedDup = queue.find((q) => q.job.videoId === videoId);
  if (queuedDup) return queuedDup.job;

  // Also dedup against any non-terminal job persisted but not yet picked up
  // (covers the race where the bridge restarted after enqueue but before drain).
  const existing = (await foldJobs()).find(
    (j) => j.videoId === videoId && (j.status === "queued" || j.status === "processing")
  );
  if (existing) return existing;

  const now = new Date().toISOString();
  const job: YoutubeJob = {
    jobId: crypto.randomUUID(),
    videoId,
    url,
    status: "queued",
    createdAt: now,
    updatedAt: now,
  };
  await appendJobEvent(job);
  await appendIndexEvent({ videoId, status: "queued", meta: { url }, at: now });
  queue.push({ job });
  void drain();
  return job;
}

async function drain(): Promise<void> {
  if (running) return;
  running = true;
  try {
    while (queue.length > 0) {
      const item = queue.shift()!;
      current = item.job;
      await process(item.job);
      current = null;
    }
  } finally {
    running = false;
  }
}

async function process(job: YoutubeJob): Promise<void> {
  let captions;
  try {
    const processing = await updateJob(job, { status: "processing" });
    job = processing;

    captions = await fetchCaptions(job.videoId);
    const summary = await summarize(captions, job.url);

    const fetchedAt = new Date().toISOString();
    const updatedAt = fetchedAt;
    const meta = {
      videoId: job.videoId,
      title: captions.title,
      channel: captions.channel,
      url: job.url,
      durationSeconds: captions.durationSeconds,
      captionLanguage: captions.language,
      fetchedAt,
      updatedAt,
    };
    const fileBody = buildFrontMatter(meta) + summary.markdown + "\n";
    await writeMarkdown(job.videoId, fileBody);

    await updateJob(job, { status: "done", meta });
  } catch (err: any) {
    const msg = mapError(err);
    await updateJob(job, { status: "failed", errorMessage: msg });
  }
}

function mapError(err: unknown): string {
  if (err instanceof CaptionsUnavailableError) return err.message;
  if (err instanceof VideoNotFoundError) return err.message;
  if (err instanceof TranscriptTooShortError) return err.message;
  if (err instanceof Error) return err.message;
  return "unknown error";
}

/** Called from server.ts on startup to fail any half-done jobs from a previous crash. */
export async function repairOnStartup(): Promise<void> {
  await storeRepairOnStartup();
}
```

- [ ] **Step 2: Build to verify**

Run: `pnpm build`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/bridge/src/services/youtube-worker.ts
git commit -m "feat(youtube): in-process FIFO worker mirroring reviewer pattern"
```

---

## Task 10: `routes/youtube.ts` — HTTP handlers

**Files:**
- Create: `apps/bridge/src/routes/youtube.ts`

- [ ] **Step 1: Create the route file**

```ts
import fs from "node:fs/promises";
import { Router, type Router as ExpressRouter, type Request, type Response } from "express";
import { parseVideoId, isValidVideoId } from "../services/youtube-url.js";
import {
  listSummaries,
  activeJobs,
  readMarkdown,
  deleteMarkdown,
  appendDeleteEvent,
  stripFrontMatter,
  foldJobs,
} from "../services/youtube-store.js";
import { submit } from "../services/youtube-worker.js";
import type {
  YoutubeJob,
  YoutubeRejectedUrl,
  YoutubeSubmitResponse,
  YoutubeSummaryMeta,
} from "@openclaw-manager/types";

const router: ExpressRouter = Router();

function badId(res: Response): void {
  res.status(400).json({ error: "invalid videoId" });
}

router.post("/youtube/jobs", async (req: Request, res: Response) => {
  const urls: unknown = req.body?.urls;
  if (!Array.isArray(urls) || urls.length === 0) {
    return void res.status(400).json({ error: "urls must be a non-empty array" });
  }
  const jobs: YoutubeJob[] = [];
  const rejected: YoutubeRejectedUrl[] = [];
  for (const raw of urls) {
    const url = typeof raw === "string" ? raw : "";
    try {
      const videoId = parseVideoId(url);
      const job = await submit(url, videoId);
      jobs.push(job);
    } catch (err: any) {
      rejected.push({ url, reason: err?.message || "invalid url" });
    }
  }
  if (jobs.length === 0) {
    return void res.status(400).json({ error: "no valid urls", rejected });
  }
  const payload: YoutubeSubmitResponse = { jobs, rejected };
  res.status(202).json(payload);
});

router.get("/youtube/jobs", async (_req: Request, res: Response) => {
  try {
    const jobs = await activeJobs();
    res.json({ jobs });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "failed" });
  }
});

router.get("/youtube/summaries", async (_req: Request, res: Response) => {
  try {
    const summaries = await listSummaries();
    res.json({ summaries });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "failed" });
  }
});

router.get("/youtube/summaries/:videoId", async (req: Request, res: Response) => {
  const videoId = req.params.videoId as string;
  if (!isValidVideoId(videoId)) return badId(res);
  try {
    const raw = await readMarkdown(videoId);
    if (raw === null) return void res.status(404).json({ error: "summary not found" });
    const { body, rawFront } = stripFrontMatter(raw);
    const meta = parseFrontMatter(rawFront, videoId);
    res.json({ meta, markdown: body });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "failed" });
  }
});

router.post("/youtube/summaries/:videoId/rerun", async (req: Request, res: Response) => {
  const videoId = req.params.videoId as string;
  if (!isValidVideoId(videoId)) return badId(res);
  try {
    // Find the existing summary's URL so we can resubmit with the same canonical url.
    const summaries = await listSummaries();
    const existing = summaries.find((s) => s.videoId === videoId);
    const url = existing?.url || `https://www.youtube.com/watch?v=${videoId}`;
    const job = await submit(url, videoId);
    res.status(202).json({ job });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "failed" });
  }
});

router.delete("/youtube/summaries/:videoId", async (req: Request, res: Response) => {
  const videoId = req.params.videoId as string;
  if (!isValidVideoId(videoId)) return badId(res);
  try {
    await deleteMarkdown(videoId);
    await appendDeleteEvent(videoId);
    res.status(204).end();
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "failed" });
  }
});

function parseFrontMatter(raw: string | null, videoId: string): YoutubeSummaryMeta {
  const empty: YoutubeSummaryMeta = {
    videoId,
    title: "",
    channel: "",
    url: "",
    durationSeconds: 0,
    captionLanguage: "",
    fetchedAt: "",
    updatedAt: "",
  };
  if (!raw) return empty;
  const out = { ...empty };
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (!m) continue;
    const [, key, valRaw] = m;
    const val = valRaw!.trim();
    switch (key) {
      case "videoId": out.videoId = unquote(val); break;
      case "title": out.title = unquote(val); break;
      case "channel": out.channel = unquote(val); break;
      case "url": out.url = unquote(val); break;
      case "durationSeconds": out.durationSeconds = Number(val) || 0; break;
      case "captionLanguage": out.captionLanguage = unquote(val); break;
      case "fetchedAt": out.fetchedAt = unquote(val); break;
      case "updatedAt": out.updatedAt = unquote(val); break;
    }
  }
  return out;
}

function unquote(v: string): string {
  if (v.startsWith('"') && v.endsWith('"')) {
    try { return JSON.parse(v); } catch { return v.slice(1, -1); }
  }
  return v;
}

export default router;
```

- [ ] **Step 2: Build to verify**

Run: `pnpm build`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/bridge/src/routes/youtube.ts
git commit -m "feat(youtube): bridge http routes for submit/list/get/rerun/delete"
```

---

## Task 11: Wire route + startup repair into `server.ts`

**Files:**
- Modify: `apps/bridge/src/server.ts`

- [ ] **Step 1: Add the import for the youtube router (alongside the other route imports)**

In `apps/bridge/src/server.ts`, add this line in the import block (e.g. after the `reviewsRouter` import on line 22):

```ts
import youtubeRouter from "./routes/youtube.js";
```

- [ ] **Step 2: Add the import for the youtube worker repair function**

In the same import block, add:

```ts
import { repairOnStartup as repairYoutubeOnStartup } from "./services/youtube-worker.js";
```

- [ ] **Step 3: Mount the router**

In `apps/bridge/src/server.ts`, after `app.use(reviewsRouter);` on line 53, add:

```ts
app.use(youtubeRouter);
```

- [ ] **Step 4: Run the youtube startup repair**

In the bottom `void (async () => { ... })();` block (currently lines 61-64), add a third `try` block after the existing two:

```ts
try { await repairYoutubeOnStartup(); } catch (e) { console.warn("youtube repair failed:", e); }
```

The full block should now look like:

```ts
void (async () => {
  try { await repairOnStartup(); } catch (e) { console.warn("reviewer repair failed:", e); }
  try { await scanProjects(); } catch (e) { console.warn("reviewer scan failed:", e); }
  try { await repairYoutubeOnStartup(); } catch (e) { console.warn("youtube repair failed:", e); }
})();
```

- [ ] **Step 5: Build to verify**

Run: `pnpm build`
Expected: PASS.

- [ ] **Step 6: Smoke-test the bridge**

Run from one terminal: `pnpm dev:bridge`
Expected: console prints `Bridge listening on 127.0.0.1:3100` and no `youtube repair failed:` warning.

In another terminal:

```bash
curl -s -H "Authorization: Bearer $BRIDGE_TOKEN" http://localhost:3100/youtube/summaries
```

Expected: `{"summaries":[]}` (file doesn't exist yet, fold returns empty).

```bash
curl -s -H "Authorization: Bearer $BRIDGE_TOKEN" -H "Content-Type: application/json" \
  -d '{"urls":["https://www.youtube.com/watch?v=jNQXAC9IVRw"]}' \
  http://localhost:3100/youtube/jobs
```

Expected: `{"jobs":[{"jobId":"...","videoId":"jNQXAC9IVRw","status":"queued",...}],"rejected":[]}`

Watch the bridge console — within ~30s the job should progress through `processing` and either land at `done` (success) or `failed` (with a clear error message). Verify the file appears at `<MANAGEMENT_DIR>/youtube/summaries/jNQXAC9IVRw.md` with YAML front-matter and a `# ` heading.

If the job fails at the `summarize` step because the agent ignores the system prompt or the SDK rejects the `systemPrompt` param to `sessions.create`, apply the workaround noted in Task 8 (move the prompt into the user message).

Stop the bridge (`Ctrl+C`).

- [ ] **Step 7: Commit**

```bash
git add apps/bridge/src/server.ts
git commit -m "feat(youtube): mount route + run startup repair on bridge boot"
```

---

## Task 12: Add dashboard markdown deps

**Files:**
- Modify: `apps/dashboard/package.json`

- [ ] **Step 1: Install the runtime deps**

Run from repo root:

```bash
pnpm --filter dashboard add react-markdown remark-gfm
pnpm --filter dashboard add -D @tailwindcss/typography
```

Expected: deps appear in `apps/dashboard/package.json` and lockfile updates.

- [ ] **Step 2: Register the typography plugin in `globals.css`**

Open `apps/dashboard/src/app/globals.css` and add at the very top (Tailwind 4 uses CSS-first config, so the plugin is registered via `@plugin`):

```css
@plugin "@tailwindcss/typography";
```

If the existing top of the file already has an `@import "tailwindcss"` or `@plugin` line, place the new `@plugin` line directly below those. Do not move or remove existing CSS.

- [ ] **Step 3: Build to verify**

Run: `pnpm build`
Expected: PASS — dashboard build succeeds and Tailwind doesn't warn about unknown `prose` classes (we'll use those next task).

- [ ] **Step 4: Commit**

```bash
git add apps/dashboard/package.json apps/dashboard/src/app/globals.css pnpm-lock.yaml
git commit -m "chore(dashboard): add react-markdown, remark-gfm, tailwind typography"
```

---

## Task 13: Add bridge-client methods

**Files:**
- Modify: `apps/dashboard/src/lib/bridge-client.ts`

- [ ] **Step 1: Extend the type imports**

At the top of `apps/dashboard/src/lib/bridge-client.ts`, add the YouTube types to the existing import block from `@openclaw-manager/types`:

```ts
  YoutubeJob,
  YoutubeSummaryListItem,
  YoutubeSummaryMeta,
  YoutubeSubmitResponse,
```

(Insert these alphabetically near the `Y...` end of the import list — ESLint won't enforce but stay tidy.)

- [ ] **Step 2: Append the YouTube section at the end of the file**

Append at the end of `apps/dashboard/src/lib/bridge-client.ts`:

```ts
// --- YouTube Summarizer ---

export async function submitYoutubeJobs(urls: string[]): Promise<YoutubeSubmitResponse> {
  return bridgeFetch<YoutubeSubmitResponse>("/youtube/jobs", {
    method: "POST",
    body: JSON.stringify({ urls }),
  });
}

export async function listYoutubeJobs(): Promise<{ jobs: YoutubeJob[] }> {
  return bridgeFetch<{ jobs: YoutubeJob[] }>("/youtube/jobs");
}

export async function listYoutubeSummaries(): Promise<{ summaries: YoutubeSummaryListItem[] }> {
  return bridgeFetch<{ summaries: YoutubeSummaryListItem[] }>("/youtube/summaries");
}

export async function getYoutubeSummary(
  videoId: string
): Promise<{ meta: YoutubeSummaryMeta; markdown: string }> {
  return bridgeFetch<{ meta: YoutubeSummaryMeta; markdown: string }>(
    `/youtube/summaries/${encodeURIComponent(videoId)}`
  );
}

export async function rerunYoutubeSummary(videoId: string): Promise<{ job: YoutubeJob }> {
  return bridgeFetch<{ job: YoutubeJob }>(
    `/youtube/summaries/${encodeURIComponent(videoId)}/rerun`,
    { method: "POST" }
  );
}

export async function deleteYoutubeSummary(videoId: string): Promise<void> {
  await bridgeFetch<void>(`/youtube/summaries/${encodeURIComponent(videoId)}`, { method: "DELETE" });
}
```

Note: `bridgeFetch` calls `res.json()` which throws on a 204 No Content body. If the delete endpoint causes a runtime error in browser/dev, change the delete helper to call `fetch` directly instead of using `bridgeFetch`:

```ts
export async function deleteYoutubeSummary(videoId: string): Promise<void> {
  const res = await fetch(`${BRIDGE_URL}/youtube/summaries/${encodeURIComponent(videoId)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${BRIDGE_TOKEN}` },
  });
  if (!res.ok) throw new Error(`Bridge ${res.status}: ${await res.text()}`);
}
```

Use this variant from the start to avoid the bug.

- [ ] **Step 3: Build to verify**

Run: `pnpm build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/dashboard/src/lib/bridge-client.ts
git commit -m "feat(youtube): bridge-client methods for dashboard"
```

---

## Task 14: Dashboard API proxy routes

We need 5 server-side proxy routes so the client polling can hit them with cookie auth (it can't hit the bridge directly — bridge token is server-only). The auth pattern matches `apps/dashboard/src/app/api/agents/route.ts`: `import { isAuthenticated } from "@/lib/session"` then gate every handler with `if (!(await isAuthenticated())) return 401`.

**Files:**
- Create: `apps/dashboard/src/app/api/youtube/submit/route.ts`
- Create: `apps/dashboard/src/app/api/youtube/jobs/route.ts`
- Create: `apps/dashboard/src/app/api/youtube/summaries/route.ts`
- Create: `apps/dashboard/src/app/api/youtube/summaries/[videoId]/route.ts`
- Create: `apps/dashboard/src/app/api/youtube/summaries/[videoId]/rerun/route.ts`

- [ ] **Step 1: Create `submit/route.ts`**

Create `apps/dashboard/src/app/api/youtube/submit/route.ts`:

```ts
import { NextResponse } from "next/server";
import { submitYoutubeJobs } from "@/lib/bridge-client";
import { isAuthenticated } from "@/lib/session";

export async function POST(request: Request) {
  const authed = await isAuthenticated();
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await request.json().catch(() => ({}));
  const urls = Array.isArray(body?.urls) ? body.urls.map(String) : [];
  try {
    const result = await submitYoutubeJobs(urls);
    return NextResponse.json(result, { status: 202 });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Failed to submit youtube jobs" },
      { status: 502 }
    );
  }
}
```

- [ ] **Step 2: Create `jobs/route.ts`**

Create `apps/dashboard/src/app/api/youtube/jobs/route.ts`:

```ts
import { NextResponse } from "next/server";
import { listYoutubeJobs } from "@/lib/bridge-client";
import { isAuthenticated } from "@/lib/session";

export async function GET() {
  const authed = await isAuthenticated();
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await listYoutubeJobs();
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Failed to list youtube jobs" },
      { status: 502 }
    );
  }
}
```

- [ ] **Step 3: Create `summaries/route.ts`**

Create `apps/dashboard/src/app/api/youtube/summaries/route.ts`:

```ts
import { NextResponse } from "next/server";
import { listYoutubeSummaries } from "@/lib/bridge-client";
import { isAuthenticated } from "@/lib/session";

export async function GET() {
  const authed = await isAuthenticated();
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await listYoutubeSummaries();
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Failed to list youtube summaries" },
      { status: 502 }
    );
  }
}
```

- [ ] **Step 4: Create `summaries/[videoId]/route.ts`**

Create `apps/dashboard/src/app/api/youtube/summaries/[videoId]/route.ts`:

```ts
import { NextResponse } from "next/server";
import { getYoutubeSummary, deleteYoutubeSummary } from "@/lib/bridge-client";
import { isAuthenticated } from "@/lib/session";

const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ videoId: string }> }
) {
  const authed = await isAuthenticated();
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { videoId } = await params;
  if (!VIDEO_ID_RE.test(videoId)) {
    return NextResponse.json({ error: "invalid videoId" }, { status: 400 });
  }
  try {
    const result = await getYoutubeSummary(videoId);
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Summary not found" },
      { status: 404 }
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ videoId: string }> }
) {
  const authed = await isAuthenticated();
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { videoId } = await params;
  if (!VIDEO_ID_RE.test(videoId)) {
    return NextResponse.json({ error: "invalid videoId" }, { status: 400 });
  }
  try {
    await deleteYoutubeSummary(videoId);
    return new Response(null, { status: 204 });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Failed to delete summary" },
      { status: 502 }
    );
  }
}
```

If your version of Next.js complains that the `params` argument shape is `{ videoId: string }` instead of a Promise (this varies across Next 15.x patch versions), drop the `Promise<...>` wrapper and `await` and use `params.videoId` directly. Check how an existing dynamic route in this repo declares its `params` (e.g. `apps/dashboard/src/app/api/agents/[name]/route.ts`) and match it exactly.

- [ ] **Step 5: Create `summaries/[videoId]/rerun/route.ts`**

Create `apps/dashboard/src/app/api/youtube/summaries/[videoId]/rerun/route.ts`:

```ts
import { NextResponse } from "next/server";
import { rerunYoutubeSummary } from "@/lib/bridge-client";
import { isAuthenticated } from "@/lib/session";

const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ videoId: string }> }
) {
  const authed = await isAuthenticated();
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { videoId } = await params;
  if (!VIDEO_ID_RE.test(videoId)) {
    return NextResponse.json({ error: "invalid videoId" }, { status: 400 });
  }
  try {
    const result = await rerunYoutubeSummary(videoId);
    return NextResponse.json(result, { status: 202 });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Failed to re-run summary" },
      { status: 502 }
    );
  }
}
```

(Same `params` shape note as step 4 applies.)

- [ ] **Step 6: Build to verify**

Run: `pnpm build`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/dashboard/src/app/api/youtube
git commit -m "feat(youtube): dashboard api proxy routes with session auth"
```

---

## Task 15: Sidebar nav entry

**Files:**
- Modify: `apps/dashboard/src/components/sidebar.tsx`

- [ ] **Step 1: Add a "YouTube" item under the "Manage" section**

In `apps/dashboard/src/components/sidebar.tsx`, find the `Manage` section in `NAV_SECTIONS`. After the existing `{ href: "/sessions", label: "Sessions", icon: ... },` entry add:

```ts
      { href: "/youtube", label: "YouTube", icon: "M21 12.5c0-2.49 0-3.735-.487-4.685a4.467 4.467 0 00-1.952-1.952C17.61 5.376 16.366 5.376 13.876 5.376h-3.752c-2.49 0-3.735 0-4.685.487a4.467 4.467 0 00-1.952 1.952C3 8.765 3 10.01 3 12.5s0 3.735.487 4.685a4.467 4.467 0 001.952 1.952c.95.487 2.195.487 4.685.487h3.752c2.49 0 3.735 0 4.685-.487a4.467 4.467 0 001.952-1.952C21 16.235 21 14.99 21 12.5zM10 9l6 3.5L10 16V9z" },
```

(The icon path is a stylized YouTube play card. Match the existing icon-string convention exactly — no SVG attributes, just the `d` value.)

- [ ] **Step 2: Build to verify**

Run: `pnpm build`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/dashboard/src/components/sidebar.tsx
git commit -m "feat(youtube): add sidebar nav entry"
```

---

## Task 16: `/youtube` page (server component) + two-pane layout

**Files:**
- Create: `apps/dashboard/src/app/youtube/page.tsx`
- Create: `apps/dashboard/src/components/youtube/SummaryListPane.tsx`
- Create: `apps/dashboard/src/components/youtube/SummaryViewPane.tsx`

- [ ] **Step 1: Create the page (server component)**

Create `apps/dashboard/src/app/youtube/page.tsx`:

```tsx
import { listYoutubeSummaries, listYoutubeJobs } from "@/lib/bridge-client";
import { SummaryListPane } from "@/components/youtube/SummaryListPane";
import { SummaryViewPane } from "@/components/youtube/SummaryViewPane";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{ v?: string }>;
};

export default async function YoutubePage({ searchParams }: Props): Promise<JSX.Element> {
  const { v: selectedVideoId } = await searchParams;
  let initialSummaries: any[] = [];
  let initialJobs: any[] = [];
  try {
    const s = await listYoutubeSummaries();
    initialSummaries = s.summaries;
  } catch {
    initialSummaries = [];
  }
  try {
    const j = await listYoutubeJobs();
    initialJobs = j.jobs;
  } catch {
    initialJobs = [];
  }

  return (
    <div className="grid h-[calc(100vh-var(--header-height))] grid-cols-1 lg:grid-cols-[400px_1fr]">
      <SummaryListPane
        initialSummaries={initialSummaries}
        initialJobs={initialJobs}
        selectedVideoId={selectedVideoId ?? null}
      />
      <SummaryViewPane selectedVideoId={selectedVideoId ?? null} />
    </div>
  );
}
```

If JSX.Element typing complains, change the return type to `Promise<React.ReactElement>` or omit the return type entirely — match how other server pages in this repo do it (e.g. `apps/dashboard/src/app/reviews/page.tsx`).

- [ ] **Step 2: Create `SummaryListPane.tsx`**

Create `apps/dashboard/src/components/youtube/SummaryListPane.tsx`:

```tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { YoutubeJob, YoutubeSummaryListItem, YoutubeJobStatus } from "@openclaw-manager/types";

const POLL_INTERVAL_MS = 3000;

type Props = {
  initialSummaries: YoutubeSummaryListItem[];
  initialJobs: YoutubeJob[];
  selectedVideoId: string | null;
};

export function SummaryListPane({ initialSummaries, initialJobs, selectedVideoId }: Props) {
  const [summaries, setSummaries] = useState<YoutubeSummaryListItem[]>(initialSummaries);
  const [activeJobs, setActiveJobs] = useState<YoutubeJob[]>(initialJobs);
  const [urlsText, setUrlsText] = useState<string>("");
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [rejected, setRejected] = useState<{ url: string; reason: string }[]>([]);
  const router = useRouter();
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [sRes, jRes] = await Promise.all([
        fetch("/api/youtube/summaries", { cache: "no-store" }),
        fetch("/api/youtube/jobs", { cache: "no-store" }),
      ]);
      if (sRes.ok) setSummaries(((await sRes.json()) as { summaries: YoutubeSummaryListItem[] }).summaries);
      if (jRes.ok) setActiveJobs(((await jRes.json()) as { jobs: YoutubeJob[] }).jobs);
    } catch {
      // network blip — try again next tick
    }
  }, []);

  // Poll while there are non-terminal jobs.
  useEffect(() => {
    if (activeJobs.length === 0) return;
    pollTimer.current = setTimeout(() => {
      void refresh();
    }, POLL_INTERVAL_MS);
    return () => {
      if (pollTimer.current) clearTimeout(pollTimer.current);
    };
  }, [activeJobs, refresh]);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    const urls = urlsText.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    if (urls.length === 0) return;
    setSubmitting(true);
    setSubmitError(null);
    setRejected([]);
    try {
      const res = await fetch("/api/youtube/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urls }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string; rejected?: { url: string; reason: string }[] };
        setSubmitError(body.error || `submit failed (${res.status})`);
        if (body.rejected) setRejected(body.rejected);
        return;
      }
      const body = (await res.json()) as { jobs: YoutubeJob[]; rejected: { url: string; reason: string }[] };
      setRejected(body.rejected);
      setUrlsText("");
      await refresh();
    } catch (err: any) {
      setSubmitError(err?.message || "submit failed");
    } finally {
      setSubmitting(false);
    }
  }, [urlsText, refresh]);

  return (
    <div className="flex h-full flex-col border-r border-dark-border bg-dark-card">
      <form onSubmit={handleSubmit} className="border-b border-dark-border p-4">
        <textarea
          value={urlsText}
          onChange={(e) => setUrlsText(e.target.value)}
          placeholder="Paste YouTube URLs, one per line"
          rows={3}
          className="w-full rounded border border-dark-border bg-dark-lighter px-3 py-2 text-sm text-text-primary focus:border-primary focus:outline-none"
          disabled={submitting}
        />
        <div className="mt-2 flex items-center justify-between">
          <button
            type="submit"
            disabled={submitting || urlsText.trim().length === 0}
            className="rounded bg-primary px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {submitting ? "Submitting…" : "Summarize"}
          </button>
          {activeJobs.length > 0 ? (
            <span className="text-xs text-text-muted">{activeJobs.length} active</span>
          ) : null}
        </div>
        {submitError ? <p className="mt-2 text-xs text-red-400">{submitError}</p> : null}
        {rejected.length > 0 ? (
          <ul className="mt-2 space-y-1 text-xs text-red-400">
            {rejected.map((r, i) => (
              <li key={i}>
                <span className="font-mono">{r.url || "(empty)"}:</span> {r.reason}
              </li>
            ))}
          </ul>
        ) : null}
      </form>

      <div className="flex-1 overflow-y-auto">
        {summaries.length === 0 ? (
          <p className="p-4 text-sm text-text-muted">No summaries yet. Paste a URL above to get started.</p>
        ) : (
          <ul>
            {summaries.map((s) => (
              <li key={s.videoId}>
                <Link
                  href={`/youtube?v=${encodeURIComponent(s.videoId)}`}
                  scroll={false}
                  className={`block border-b border-dark-border px-4 py-3 text-sm transition hover:bg-dark-lighter ${
                    selectedVideoId === s.videoId ? "bg-primary/10" : ""
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium text-text-primary">
                        {s.title || s.videoId}
                      </div>
                      <div className="truncate text-xs text-text-muted">{s.channel || "—"}</div>
                    </div>
                    <StatusBadge status={s.status} />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: YoutubeJobStatus }) {
  const styles: Record<YoutubeJobStatus, string> = {
    queued: "bg-zinc-700/40 text-zinc-300",
    processing: "bg-blue-600/30 text-blue-200",
    done: "bg-emerald-600/30 text-emerald-200",
    failed: "bg-red-600/30 text-red-200",
  };
  return (
    <span className={`shrink-0 rounded px-2 py-0.5 text-[10px] uppercase ${styles[status]}`}>
      {status}
    </span>
  );
}
```

- [ ] **Step 3: Create `SummaryViewPane.tsx`**

Create `apps/dashboard/src/components/youtube/SummaryViewPane.tsx`:

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { YoutubeSummaryListItem, YoutubeSummaryMeta } from "@openclaw-manager/types";

type Props = {
  selectedVideoId: string | null;
};

type LoadedSummary = {
  meta: YoutubeSummaryMeta;
  markdown: string;
} | null;

export function SummaryViewPane({ selectedVideoId }: Props) {
  const [summary, setSummary] = useState<LoadedSummary>(null);
  const [listItem, setListItem] = useState<YoutubeSummaryListItem | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  const load = useCallback(async (videoId: string) => {
    setLoading(true);
    try {
      const [sRes, lRes] = await Promise.all([
        fetch(`/api/youtube/summaries/${encodeURIComponent(videoId)}`, { cache: "no-store" }),
        fetch(`/api/youtube/summaries`, { cache: "no-store" }),
      ]);
      if (sRes.ok) {
        setSummary((await sRes.json()) as LoadedSummary);
      } else {
        setSummary(null);
      }
      if (lRes.ok) {
        const all = ((await lRes.json()) as { summaries: YoutubeSummaryListItem[] }).summaries;
        setListItem(all.find((s) => s.videoId === videoId) ?? null);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!selectedVideoId) {
      setSummary(null);
      setListItem(null);
      return;
    }
    void load(selectedVideoId);
  }, [selectedVideoId, load]);

  // Re-poll while the selected item is non-terminal.
  useEffect(() => {
    if (!selectedVideoId || !listItem) return;
    if (listItem.status === "done" || listItem.status === "failed") return;
    const t = setTimeout(() => void load(selectedVideoId), 3000);
    return () => clearTimeout(t);
  }, [selectedVideoId, listItem, load]);

  const onRerun = useCallback(async () => {
    if (!selectedVideoId) return;
    setBusy(true);
    try {
      await fetch(`/api/youtube/summaries/${encodeURIComponent(selectedVideoId)}/rerun`, {
        method: "POST",
      });
      await load(selectedVideoId);
    } finally {
      setBusy(false);
    }
  }, [selectedVideoId, load]);

  const onDelete = useCallback(async () => {
    if (!selectedVideoId) return;
    if (!confirm("Delete this summary?")) return;
    setBusy(true);
    try {
      await fetch(`/api/youtube/summaries/${encodeURIComponent(selectedVideoId)}`, {
        method: "DELETE",
      });
      router.replace("/youtube");
    } finally {
      setBusy(false);
    }
  }, [selectedVideoId, router]);

  if (!selectedVideoId) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-center text-text-muted">
        Pick a summary on the left, or paste a URL to create a new one.
      </div>
    );
  }

  if (loading && !summary) {
    return <div className="p-6 text-sm text-text-muted">Loading…</div>;
  }

  const status = listItem?.status ?? "done";
  const title = listItem?.title || summary?.meta.title || selectedVideoId;
  const channel = listItem?.channel || summary?.meta.channel || "";
  const url = listItem?.url || summary?.meta.url || `https://www.youtube.com/watch?v=${selectedVideoId}`;
  const terminal = status === "done" || status === "failed";

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="border-b border-dark-border p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-xl font-semibold text-text-primary">{title}</h1>
            <p className="mt-1 text-sm text-text-muted">
              {channel}
              {channel ? " · " : ""}
              <a href={url} target="_blank" rel="noreferrer" className="underline hover:text-primary">
                Open on YouTube
              </a>
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <button
              onClick={onRerun}
              disabled={busy || !terminal}
              className="rounded border border-dark-border px-3 py-1.5 text-sm text-text-primary hover:bg-dark-lighter disabled:opacity-50"
            >
              Re-run
            </button>
            <button
              onClick={onDelete}
              disabled={busy}
              className="rounded border border-red-700/50 px-3 py-1.5 text-sm text-red-300 hover:bg-red-900/20 disabled:opacity-50"
            >
              Delete
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6" dir="auto">
        {status === "queued" || status === "processing" ? (
          <p className="text-sm text-blue-300">Summarizing… this usually takes 20–60 seconds.</p>
        ) : status === "failed" ? (
          <div className="rounded border border-red-700/50 bg-red-900/20 p-4 text-sm text-red-200">
            <strong>Failed:</strong> {listItem?.errorMessage || "unknown error"}
          </div>
        ) : summary ? (
          <article className="prose prose-invert max-w-none">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{summary.markdown}</ReactMarkdown>
          </article>
        ) : (
          <p className="text-sm text-text-muted">No content.</p>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Build to verify**

Run: `pnpm build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/dashboard/src/app/youtube apps/dashboard/src/components/youtube
git commit -m "feat(youtube): two-pane dashboard ui with live polling"
```

---

## Task 17: End-to-end smoke test

This is a manual verification step. No code changes — just confirm the whole feature works through the UI.

- [ ] **Step 1: Start both processes**

In two terminals from repo root:

```bash
pnpm dev:bridge
```

```bash
pnpm dev:dashboard
```

Expected: bridge logs `Bridge listening on 127.0.0.1:3100`; dashboard logs `Ready in ...`.

- [ ] **Step 2: Open the dashboard in a browser**

Navigate to `http://localhost:3000`, log in, and click the new "YouTube" sidebar entry.

Expected: empty list pane on the left, empty-state message on the right.

- [ ] **Step 3: Submit a single video**

Paste `https://www.youtube.com/watch?v=jNQXAC9IVRw` into the textarea (or whichever short captioned video you used in Task 7's smoke test) and click Summarize.

Expected within ~5 seconds: the URL clears, the list shows one entry with status `queued` → `processing` (badges live-updating). Within ~60s the badge flips to `done` and the title/channel populate.

- [ ] **Step 4: View the summary**

Click the row.

Expected: right pane shows the title as `<h1>`, channel + "Open on YouTube" link, and the rendered markdown summary with `## TL;DR`, `## Key points`, etc. The Tailwind `prose` styling should look like a clean article.

- [ ] **Step 5: Verify the file landed on disk**

In a third terminal:

```bash
ls "$MANAGEMENT_DIR/youtube/summaries/"
cat "$MANAGEMENT_DIR/youtube/summaries/jNQXAC9IVRw.md"
```

Expected: file exists with YAML front-matter at the top and the same markdown body the UI rendered.

- [ ] **Step 6: Submit multiple URLs at once**

Paste two URLs (one valid, one garbage like `not-a-url`) on separate lines and click Summarize.

Expected: the valid one gets queued, the garbage one shows up under a red "rejected" list with reason. The valid one processes; the original entry from step 3 is unaffected.

- [ ] **Step 7: Re-run an existing summary**

Open a `done` summary, click "Re-run".

Expected: status flips back to `queued`, the right pane shows "Summarizing…", and on completion the markdown updates (the file on disk is overwritten — same path).

- [ ] **Step 8: Delete a summary**

Click "Delete" on an existing summary, confirm.

Expected: row vanishes from the list, right pane returns to empty state, and the `.md` file no longer exists on disk.

- [ ] **Step 9: Test bridge restart recovery**

Submit a URL. While it's `processing`, kill the bridge with `Ctrl+C`. Restart `pnpm dev:bridge`.

Expected on bridge boot: no warnings. Refresh the dashboard — the previously-processing entry shows status `failed` with errorMessage `"interrupted by bridge restart"`.

- [ ] **Step 10: Final build check**

Run from repo root: `pnpm build`
Expected: PASS across the entire monorepo.

- [ ] **Step 11: Run the unit tests one more time**

Run: `pnpm --filter bridge test`
Expected: all tests PASS.

If all 11 steps pass, the feature is shippable.
