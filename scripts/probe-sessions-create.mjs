#!/usr/bin/env node
// Directly test sessions.create against the gateway to find the correct
// param shape. Tries a fresh key so we don't collide with anything real.

import { pathToFileURL } from "node:url";
import path from "node:path";

const SDK_PATH =
  process.env.OPENCLAW_SDK_PATH ||
  path.join(process.env.APPDATA || "", "npm/node_modules/openclaw/dist/call-CQ0eH9Ew.js");

const mod = await import(pathToFileURL(SDK_PATH).href);
const call = mod.r;

async function probe(label, method, params = {}) {
  try {
    const res = await call({ method, params });
    const s = JSON.stringify(res);
    console.log(`✓ [${label}] ${method}(${JSON.stringify(params)}) →`, s.length > 300 ? s.slice(0, 300) + "…" : s);
    return res;
  } catch (e) {
    console.log(`✗ [${label}] ${method}(${JSON.stringify(params)}) → ERROR: ${e.message}`);
    return null;
  }
}

const TEST_KEY = `agent:claude-code:cc-probe-${Date.now()}`;

console.log("=== 1. Direct sessions.create with just {key} ===");
await probe("create-key-only", "sessions.create", { key: TEST_KEY });

console.log("\n=== 2. sessions.get on the key we just tried to create ===");
await probe("get-after-create", "sessions.get", { key: TEST_KEY });

console.log("\n=== 3. sessions.send to that key ===");
await probe("send-after-create", "sessions.send", {
  key: TEST_KEY,
  idempotencyKey: `probe-send-${Date.now()}`,
  message: "probe ping",
});

console.log("\n=== 4. Alternative create param shapes (if #1 failed) ===");
const TEST_KEY_2 = `agent:claude-code:cc-probe2-${Date.now()}`;
await probe("create-with-agent-field", "sessions.create", {
  key: TEST_KEY_2,
  agent: "claude-code",
});
const TEST_KEY_3 = `agent:claude-code:cc-probe3-${Date.now()}`;
await probe("create-with-model", "sessions.create", {
  key: TEST_KEY_3,
  model: "openai-codex/gpt-5.4",
});
const TEST_KEY_4 = `agent:claude-code:cc-probe4-${Date.now()}`;
await probe("create-bare-session-key", "sessions.create", {
  key: `cc-probe4-${Date.now()}`,
});

console.log("\nDone. Look for the ✓ line — that's the right param shape.");
process.exit(0);
