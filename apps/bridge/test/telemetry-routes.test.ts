import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import type { Server } from "node:http";
import { createTelemetryRouter } from "../src/routes/telemetry.js";

function makeApp(dir: string) {
  const app = express();
  app.use(express.json());
  app.use(createTelemetryRouter({ dir, retentionDays: 30, maxDiskMB: 200 }));
  return app;
}

async function withServer(dir: string, fn: (url: string) => Promise<void>): Promise<void> {
  const app = makeApp(dir);
  const srv: Server = await new Promise((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  const addr = srv.address();
  const url = typeof addr === "object" && addr ? `http://127.0.0.1:${addr.port}` : "";
  try { await fn(url); } finally { await new Promise((r) => srv.close(() => r(null))); }
}

async function tmp(): Promise<string> {
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const os = await import("node:os");
  return fs.mkdtemp(path.join(os.tmpdir(), "telemetry-routes-"));
}

function baseInput() {
  return {
    schemaVersion: 1,
    eventId: `ev-${Math.random().toString(36).slice(2, 10)}`,
    source: "dashboard",
    actor: { type: "user", id: "admin" },
    feature: "conversations",
    action: "opened",
    route: "/conversations",
    context: { conversationKey: "wa:1" },
  };
}

test("POST /telemetry/actions ingests valid event", async () => {
  const dir = await tmp();
  await withServer(dir, async (url) => {
    const res = await fetch(`${url}/telemetry/actions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(baseInput()),
    });
    assert.equal(res.status, 201);
    const body = await res.json();
    assert.ok(body.ts);
    assert.equal(body.source, "dashboard");
  });
});

test("POST rejects missing required field", async () => {
  const dir = await tmp();
  await withServer(dir, async (url) => {
    const bad = { ...baseInput(), feature: undefined };
    const res = await fetch(`${url}/telemetry/actions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(bad),
    });
    assert.equal(res.status, 400);
  });
});

test("POST drops oversized context value, accepts event", async () => {
  const dir = await tmp();
  await withServer(dir, async (url) => {
    const big = { ...baseInput(), context: { conversationKey: "x".repeat(520) } };
    const res = await fetch(`${url}/telemetry/actions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(big),
    });
    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.context?.conversationKey, undefined); // dropped
  });
});

test("GET /telemetry/actions returns newest-first", async () => {
  const dir = await tmp();
  await withServer(dir, async (url) => {
    for (let i = 0; i < 3; i++) {
      await fetch(`${url}/telemetry/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...baseInput(), eventId: `ev-${i}` }),
      });
      await new Promise((r) => setTimeout(r, 2));
    }
    const res = await fetch(`${url}/telemetry/actions?limit=10`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.events.length, 3);
    assert.equal(body.events[0].eventId, "ev-2");
  });
});

test("GET filters by feature", async () => {
  const dir = await tmp();
  await withServer(dir, async (url) => {
    await fetch(`${url}/telemetry/actions`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...baseInput(), feature: "agents", action: "opened" }),
    });
    await fetch(`${url}/telemetry/actions`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...baseInput(), feature: "conversations", action: "opened" }),
    });
    const res = await fetch(`${url}/telemetry/actions?feature=agents`);
    const body = await res.json();
    assert.equal(body.events.length, 1);
    assert.equal(body.events[0].feature, "agents");
  });
});
