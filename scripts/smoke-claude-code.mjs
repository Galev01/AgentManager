#!/usr/bin/env node
// Sends one /claude-code/ask to the running bridge and prints the result.
// Requires: bridge running, BRIDGE_TOKEN in env.

const BRIDGE_URL = process.env.OPENCLAW_BRIDGE_URL || "http://127.0.0.1:3100";
const BRIDGE_TOKEN = process.env.OPENCLAW_BRIDGE_TOKEN || process.env.BRIDGE_TOKEN;

if (!BRIDGE_TOKEN) {
  console.error("Missing OPENCLAW_BRIDGE_TOKEN (or BRIDGE_TOKEN) in env");
  process.exit(1);
}

const body = {
  ide: "cli",
  workspace: process.cwd(),
  msgId: `m-${Date.now()}`,
  question: "Smoke test from scripts/smoke-claude-code.mjs — please reply with 'ack'.",
};

const res = await fetch(`${BRIDGE_URL}/claude-code/ask`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${BRIDGE_TOKEN}`,
  },
  body: JSON.stringify(body),
});

const text = await res.text();
console.log(`HTTP ${res.status}`);
console.log(text);
process.exit(res.ok ? 0 : 2);
