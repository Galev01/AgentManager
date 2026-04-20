#!/usr/bin/env node
// End-to-end smoke test for the YouTube v2 bridge endpoints.
// Exercises: enqueue summary -> poll -> list -> read -> rebuild chunks ->
//            read chunks -> chat (POST + poll) and prints a per-step summary.
//
// Requires:
//   BRIDGE_URL    (default: http://localhost:3030)
//   BRIDGE_TOKEN  (REQUIRED — bearer token for the bridge)
//   SMOKE_VIDEO_URL (optional — defaults to a stable, short, public YouTube video)
//
// Run by hand against a live bridge:
//   BRIDGE_TOKEN=xxx node scripts/smoke-youtube-v2.mjs

const BRIDGE_URL = (process.env.BRIDGE_URL || "http://localhost:3030").replace(/\/+$/, "");
const BRIDGE_TOKEN = process.env.BRIDGE_TOKEN;
// "Me at the zoo" — first YouTube video, 19s, public, captioned.
const DEFAULT_VIDEO_URL = "https://www.youtube.com/watch?v=jNQXAC9IVRw";
const VIDEO_URL = process.env.SMOKE_VIDEO_URL || DEFAULT_VIDEO_URL;

const SUMMARY_TIMEOUT_MS = 180_000;
const CHAT_TIMEOUT_MS = 120_000;
const POLL_INTERVAL_MS = 2_000;

if (!BRIDGE_TOKEN) {
  console.error("ERROR: BRIDGE_TOKEN is required");
  process.exit(1);
}

const startedAt = Date.now();
const results = []; // { step, ok, ms, info?, error? }

function step(name) {
  const t0 = Date.now();
  return {
    pass(info) {
      const ms = Date.now() - t0;
      results.push({ step: name, ok: true, ms, info });
      console.log(`  PASS  ${name}  (${ms}ms)${info ? `  ${info}` : ""}`);
    },
    fail(err) {
      const ms = Date.now() - t0;
      const msg = err instanceof Error ? err.message : String(err);
      results.push({ step: name, ok: false, ms, error: msg });
      console.error(`  FAIL  ${name}  (${ms}ms)  ${msg}`);
      finishAndExit(1);
    },
  };
}

function finishAndExit(code) {
  const total = Date.now() - startedAt;
  console.log("");
  console.log("===== smoke-youtube-v2 summary =====");
  for (const r of results) {
    const tag = r.ok ? "PASS" : "FAIL";
    const extra = r.ok ? r.info || "" : r.error || "";
    console.log(`  ${tag}  ${r.step}  (${r.ms}ms)  ${extra}`);
  }
  console.log(`  total: ${total}ms`);
  console.log(`  exit:  ${code}`);
  process.exit(code);
}

async function http(method, path, body) {
  const headers = { Authorization: `Bearer ${BRIDGE_TOKEN}` };
  const init = { method, headers };
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(body);
  }
  const url = `${BRIDGE_URL}${path}`;
  const res = await fetch(url, init);
  const text = await res.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  return { status: res.status, ok: res.ok, data };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function pollUntil(fn, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs;
  let last;
  while (Date.now() < deadline) {
    try {
      const result = await fn();
      if (result.done) return result.value;
      last = result.value;
    } catch (e) {
      last = e;
    }
    await sleep(POLL_INTERVAL_MS);
  }
  throw new Error(
    `timeout after ${timeoutMs}ms waiting for ${label}; last=${
      typeof last === "string" ? last : JSON.stringify(last)
    }`,
  );
}

console.log(`smoke-youtube-v2  bridge=${BRIDGE_URL}  video=${VIDEO_URL}`);

// --- a) enqueue v1 summary job ---
let videoId;
{
  const s = step("a) POST /youtube/jobs");
  const r = await http("POST", "/youtube/jobs", { urls: [VIDEO_URL] });
  if (r.status !== 202 || !r.data || !Array.isArray(r.data.jobs) || r.data.jobs.length === 0) {
    s.fail(`status=${r.status} body=${JSON.stringify(r.data)}`);
  }
  videoId = r.data.jobs[0].videoId;
  if (!videoId) s.fail(`no videoId in response: ${JSON.stringify(r.data)}`);
  s.pass(`videoId=${videoId} jobId=${r.data.jobs[0].jobId}`);
}

// --- b) poll job until done ---
{
  const s = step("b) GET /youtube/jobs (poll)");
  try {
    const finalStatus = await pollUntil(
      async () => {
        const r = await http("GET", "/youtube/jobs");
        if (!r.ok) return { done: false, value: `status=${r.status}` };
        const job = (r.data?.jobs || []).find((j) => j.videoId === videoId);
        // If the job is no longer in active list, treat as done (it transitioned out).
        if (!job) return { done: true, value: "absent (assumed complete)" };
        if (job.status === "done") return { done: true, value: "done" };
        if (job.status === "failed") {
          throw new Error(`job failed: ${job.errorMessage || "unknown"}`);
        }
        return { done: false, value: job.status };
      },
      SUMMARY_TIMEOUT_MS,
      "summary job to complete",
    );
    s.pass(finalStatus);
  } catch (e) {
    s.fail(e);
  }
}

// --- c) list summaries — confirm presence ---
{
  const s = step("c) GET /youtube/summaries");
  const r = await http("GET", "/youtube/summaries");
  if (!r.ok) s.fail(`status=${r.status} body=${JSON.stringify(r.data)}`);
  const list = r.data?.summaries || [];
  const found = list.find((x) => x.videoId === videoId);
  if (!found) s.fail(`videoId=${videoId} not in list of ${list.length} summaries`);
  s.pass(`found, total=${list.length}`);
}

// --- d) read single summary ---
{
  const s = step("d) GET /youtube/summaries/:videoId");
  const r = await http("GET", `/youtube/summaries/${videoId}`);
  if (!r.ok) s.fail(`status=${r.status} body=${JSON.stringify(r.data)}`);
  if (!r.data?.meta) s.fail("meta missing");
  if (typeof r.data?.markdown !== "string" || r.data.markdown.length === 0) {
    s.fail("markdown missing or empty");
  }
  s.pass(`markdownChars=${r.data.markdown.length} title="${r.data.meta.title || ""}"`);
}

// --- e) rebuild chunks ---
{
  const s = step("e) POST /youtube/rebuild/:videoId (chunks)");
  const r = await http("POST", `/youtube/rebuild/${videoId}`, {
    parts: ["chunks"],
    url: VIDEO_URL,
  });
  if (!r.ok || r.data?.ok !== true) s.fail(`status=${r.status} body=${JSON.stringify(r.data)}`);
  const arr = r.data?.results;
  if (!Array.isArray(arr) || arr.length === 0) s.fail(`results not an array: ${JSON.stringify(arr)}`);
  const chunksRes = arr.find((x) => x.part === "chunks");
  if (!chunksRes || chunksRes.ok !== true) {
    s.fail(`chunks rebuild not ok: ${JSON.stringify(chunksRes)}`);
  }
  s.pass(`results=${arr.map((x) => `${x.part}:${x.ok ? "ok" : "fail"}`).join(",")}`);
}

// --- f) read chunks ---
{
  const s = step("f) GET /youtube/chunks/:videoId");
  const r = await http("GET", `/youtube/chunks/${videoId}`);
  if (!r.ok || r.data?.ok !== true) s.fail(`status=${r.status} body=${JSON.stringify(r.data)}`);
  const chunks = r.data?.chunks?.chunks;
  if (!Array.isArray(chunks) || chunks.length === 0) {
    s.fail(`chunks.chunks not a non-empty array: ${typeof chunks} len=${chunks?.length}`);
  }
  s.pass(`chunks=${chunks.length}`);
}

// --- g) post a chat message ---
{
  const s = step("g) POST /youtube/chat/:videoId");
  const r = await http("POST", `/youtube/chat/${videoId}`, {
    message: "What is this video about? Answer in one sentence.",
  });
  if (r.status !== 202 || r.data?.ok !== true) {
    s.fail(`status=${r.status} body=${JSON.stringify(r.data)}`);
  }
  s.pass(`queued chatSessionId=${r.data.chatSessionId}`);
}

// --- h) poll chat until assistant replies ---
{
  const s = step("h) GET /youtube/chat/:videoId (poll)");
  try {
    const finalCount = await pollUntil(
      async () => {
        const r = await http("GET", `/youtube/chat/${videoId}`);
        if (!r.ok) return { done: false, value: `status=${r.status}` };
        const msgs = r.data?.messages || [];
        const errored = msgs.find((m) => m.status === "error");
        if (errored) {
          throw new Error(`assistant errored: ${errored.errorMessage || "unknown"}`);
        }
        const assistantComplete = msgs.some(
          (m) => m.role === "assistant" && m.status === "complete",
        );
        if (msgs.length >= 2 && assistantComplete) return { done: true, value: msgs.length };
        return { done: false, value: `messages=${msgs.length}` };
      },
      CHAT_TIMEOUT_MS,
      "assistant reply",
    );
    s.pass(`messages=${finalCount}`);
  } catch (e) {
    s.fail(e);
  }
}

finishAndExit(0);
