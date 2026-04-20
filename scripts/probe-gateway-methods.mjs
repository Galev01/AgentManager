#!/usr/bin/env node
// Probe the OpenClaw gateway via the SDK to discover which methods read messages.
// Run with: node scripts/probe-gateway-methods.mjs
// Requires: OpenClaw gateway online (GalLe logged in on Windows).

import { pathToFileURL } from "node:url";
import path from "node:path";

const SDK_PATH =
  process.env.OPENCLAW_SDK_PATH ||
  path.join(
    process.env.APPDATA || "",
    "npm/node_modules/openclaw/dist/call-CQ0eH9Ew.js"
  );
const SESSION_KEY =
  process.env.OPENCLAW_SESSION_KEY || "oc-shared-claude-code";

const mod = await import(pathToFileURL(SDK_PATH).href);
const call = mod.r;
if (!call) {
  console.error("SDK did not expose a callable `r` export");
  process.exit(2);
}

async function probe(method, params = {}) {
  try {
    const res = await call({ method, params });
    const serialized = JSON.stringify(res);
    console.log(
      `✓ ${method}(${JSON.stringify(params)}) →`,
      serialized.length > 400 ? serialized.slice(0, 400) + "…[truncated]" : serialized
    );
    return res;
  } catch (e) {
    console.log(`✗ ${method}(${JSON.stringify(params)}) → ERROR: ${e.message}`);
    return null;
  }
}

console.log(`SDK: ${SDK_PATH}`);
console.log(`Probing session: ${SESSION_KEY}\n`);

// 1. Confirm we can list sessions
await probe("sessions.list", {});

// 2. Various ways to fetch a single session or its messages
await probe("sessions.get", { key: SESSION_KEY });
await probe("sessions.get", { id: SESSION_KEY });
await probe("sessions.get", { sessionKey: SESSION_KEY });
await probe("sessions.messages", { key: SESSION_KEY });
await probe("sessions.messages", { key: SESSION_KEY, since: 0 });
await probe("sessions.messages", { key: SESSION_KEY, after: 0 });
await probe("sessions.history", { key: SESSION_KEY });
await probe("sessions.transcript", { key: SESSION_KEY });
await probe("sessions.read", { key: SESSION_KEY });

// 3. Run-status style calls (we have a runId from sessions.send — just try the format)
await probe("runs.list", {});
await probe("runs.get", { id: "m-f7ab3ed61e38" });
await probe("runs.status", { runId: "m-f7ab3ed61e38" });

// 4. Introspection
await probe("rpc.discover", {});
await probe("$.methods", {});
await probe("help", {});

// 5. Send a fresh message and capture the full send response shape
const ts = Date.now();
const probeMsg = `probe-${ts}`;
console.log(`\nSending a probe message (idempotencyKey=${probeMsg}) to inspect the exact reply shape…`);
await probe("sessions.send", {
  key: SESSION_KEY,
  idempotencyKey: probeMsg,
  message: "probe ping — please reply with 'pong'",
});

// Wait a moment for the gateway to process, then try reads again
console.log("\nWaiting 4s for the reply to land, then re-reading…");
await new Promise((r) => setTimeout(r, 4000));
await probe("sessions.list", {});
await probe("sessions.get", { key: SESSION_KEY });
await probe("sessions.messages", { key: SESSION_KEY });

process.exit(0);
