import { test } from "node:test";
import assert from "node:assert/strict";
import { randomHex, readablePassword } from "../lib/secrets.js";
import { discoverOpenClaw, toForwardSlash } from "../lib/openclaw-discover.js";
import { isPortFree, pickFreePort } from "../lib/ports.js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

test("randomHex generates 64 hex chars by default", () => {
  const h = randomHex();
  assert.equal(h.length, 64);
  assert.match(h, /^[0-9a-f]+$/);
});

test("randomHex two calls differ", () => {
  assert.notEqual(randomHex(), randomHex());
});

test("readablePassword has shape word-word-NN", () => {
  const p = readablePassword();
  assert.match(p, /^[a-z]+-[a-z]+-\d{2}$/);
});

test("toForwardSlash normalizes Windows paths", () => {
  assert.equal(toForwardSlash("C:\\Users\\x"), "C:/Users/x");
});

test("discoverOpenClaw returns nulls when no openclaw.json", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ocm-disc-"));
  const r = discoverOpenClaw(dir);
  assert.equal(r.gatewayToken, null);
});

test("discoverOpenClaw extracts token from openclaw.json", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ocm-disc-"));
  fs.writeFileSync(path.join(dir, "openclaw.json"), JSON.stringify({ gateway: { token: "T123" } }));
  const r = discoverOpenClaw(dir);
  assert.equal(r.gatewayToken, "T123");
});

test("pickFreePort returns a port", async () => {
  const p = await pickFreePort(40000);
  assert.ok(p >= 40000 && p < 40050);
});
