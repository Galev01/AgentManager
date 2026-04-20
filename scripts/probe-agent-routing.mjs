#!/usr/bin/env node
// Probe how sessions.send routes to a non-default agent.
// Uses 'reviewer' (an existing agent with gpt-5.4) as the known-good target.

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

// 1. List all sessions to see key formats
console.log("=== 1. sessions.list — what key prefixes exist? ===");
const list = await probe("list-all", "sessions.list", {});
if (list?.sessions) {
  const keysByAgent = {};
  for (const s of list.sessions) {
    const parts = (s.key || "").split(":");
    const agentPart = parts.length >= 3 && parts[0] === "agent" ? parts[1] : "(other)";
    keysByAgent[agentPart] = (keysByAgent[agentPart] || 0) + 1;
  }
  console.log("  session counts by agent prefix:", keysByAgent);
  const reviewerSample = list.sessions.find((s) => s.key?.includes(":reviewer:"));
  if (reviewerSample) console.log("  example reviewer key:", reviewerSample.key);
}

console.log("\n=== 2. Try sessions.send variants targeting 'reviewer' agent ===");
const TEST_KEY = `probe-routing-${Date.now()}`;

// Variant 1: include 'agent' param
await probe("agent-param", "sessions.send", {
  key: TEST_KEY,
  message: "probe a",
  idempotencyKey: "pa1",
  agent: "reviewer",
});

// Variant 2: include 'agentId' param
await probe("agentId-param", "sessions.send", {
  key: `${TEST_KEY}-b`,
  message: "probe b",
  idempotencyKey: "pa2",
  agentId: "reviewer",
});

// Variant 3: pre-formatted agent:name:key
await probe("prefixed-key", "sessions.send", {
  key: `agent:reviewer:${TEST_KEY}-c`,
  message: "probe c",
  idempotencyKey: "pa3",
});

// Variant 4: use scope/namespace
await probe("scope-param", "sessions.send", {
  key: `${TEST_KEY}-d`,
  message: "probe d",
  idempotencyKey: "pa4",
  scope: "reviewer",
});

// 3. Check what sessions exist after — this tells us which variant ACTUALLY routed to reviewer
console.log("\n=== 3. After sending, check which sessions were created and under which agent ===");
await new Promise((r) => setTimeout(r, 1500));
const after = await probe("list-after", "sessions.list", {});
if (after?.sessions) {
  const probeSessions = after.sessions.filter((s) => s.key?.includes(TEST_KEY));
  console.log(`  found ${probeSessions.length} probe session(s):`);
  for (const s of probeSessions) {
    console.log(`    key=${s.key}  updatedAt=${s.updatedAt}`);
  }
}

// 4. Try sessions.create with agent param (if it exists as a method)
console.log("\n=== 4. sessions.create probes ===");
await probe("create-agent-param", "sessions.create", {
  key: `create-probe-${Date.now()}`,
  agent: "reviewer",
});

console.log("\nDone.");
process.exit(0);
