#!/usr/bin/env node
// Smoke test: lists runtimes, capabilities, and health per runtime.
// Usage: BRIDGE_URL=http://127.0.0.1:3100 BRIDGE_TOKEN=... X_OCM_ACTOR=... node scripts/smoke-runtimes.mjs

const BRIDGE_URL = process.env.BRIDGE_URL || "http://127.0.0.1:3100";
const BRIDGE_TOKEN = process.env.BRIDGE_TOKEN;
const ACTOR = process.env.X_OCM_ACTOR;
if (!BRIDGE_TOKEN) { console.error("BRIDGE_TOKEN required"); process.exit(1); }
if (!ACTOR) { console.error("X_OCM_ACTOR (signed actor assertion) required — /runtimes is strict"); process.exit(1); }

const headers = { Authorization: `Bearer ${BRIDGE_TOKEN}`, "x-ocm-actor": ACTOR, "Content-Type": "application/json" };

async function j(path) {
  const r = await fetch(`${BRIDGE_URL}${path}`, { headers });
  if (!r.ok) throw new Error(`${path} ${r.status}: ${await r.text()}`);
  return r.json();
}

const { runtimes } = await j("/runtimes");
console.log(`${runtimes.length} runtimes configured`);
for (const d of runtimes) {
  try {
    const info = await j(`/runtimes/${encodeURIComponent(d.id)}`);
    const caps = await j(`/runtimes/${encodeURIComponent(d.id)}/capabilities`);
    console.log(`- ${d.id} (${d.kind}) health=${info.health.ok ? "OK" : "FAIL"} supported=${caps.supported.length} partial=${caps.partial.length} unsupported=${caps.unsupported.length}`);
  } catch (e) {
    console.log(`- ${d.id} (${d.kind}) ERROR: ${e.message}`);
  }
}
