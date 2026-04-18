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
