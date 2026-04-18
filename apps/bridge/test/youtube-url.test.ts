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
