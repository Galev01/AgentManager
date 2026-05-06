import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import http from "node:http";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createCopilotStore } from "../src/services/copilot/store.js";
import { createCopilotOrchestrator } from "../src/services/copilot/orchestrator.js";
import { createCopilotRouter } from "../src/routes/copilot.js";
import type { ChatBackendAdapter } from "../src/services/copilot/backend.js";

const okBackend: ChatBackendAdapter = {
  async createSession() { return { openclawSessionKey: "k1" }; },
  async sendTurn() { return { ok: true, assistantText: "pong" }; },
};

async function bootApp(perms: string[], userId = "u1") {
  const root = await mkdtemp(path.join(tmpdir(), "copilot-rt-"));
  const store = createCopilotStore({ rootDir: root });
  const orch = createCopilotOrchestrator({ store, backendFor: () => okBackend });
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).auth = { user: { id: userId }, permissions: perms };
    next();
  });
  app.use(createCopilotRouter({ store, orchestrator: orch }));
  const server = http.createServer(app).listen(0);
  const addr = server.address() as { port: number };
  return { url: `http://127.0.0.1:${addr.port}`, close: () => server.close() };
}

test("POST /copilot/sessions creates with backend openclaw", async () => {
  const a = await bootApp(["copilot.chat"]);
  const r = await fetch(`${a.url}/copilot/sessions`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ backend: "openclaw", title: "t" }),
  });
  const body = await r.json();
  assert.equal(r.status, 200);
  assert.equal(body.backend, "openclaw");
  assert.equal(body.ownerUserId, "u1");
  a.close();
});

test("POST /copilot/sessions accepts backend hermes (Phase A2)", async () => {
  const a = await bootApp(["copilot.chat"]);
  const r = await fetch(`${a.url}/copilot/sessions`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ backend: "hermes" }),
  });
  const body = await r.json();
  assert.equal(r.status, 200);
  assert.equal(body.backend, "hermes");
  a.close();
});

test("POST /copilot/sessions rejects unknown backend with 400", async () => {
  const a = await bootApp(["copilot.chat"]);
  const r = await fetch(`${a.url}/copilot/sessions`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ backend: "ghost" }),
  });
  const body = await r.json();
  assert.equal(r.status, 400);
  assert.equal(body.error, "invalid_backend");
  a.close();
});

test("GET /copilot/sessions/:id 404 when not owner (no leakage)", async () => {
  const a = await bootApp(["copilot.chat"], "u1");
  const created = await fetch(`${a.url}/copilot/sessions`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ backend: "openclaw" }),
  }).then((x) => x.json());
  a.close();

  const b = await bootApp(["copilot.chat"], "u2");
  const r = await fetch(`${b.url}/copilot/sessions/${created.id}`);
  assert.equal(r.status, 404);
  b.close();
});

test("403 without copilot.chat permission", async () => {
  const a = await bootApp([]);
  const r = await fetch(`${a.url}/copilot/sessions`);
  assert.equal(r.status, 403);
  a.close();
});

test("POST turn + GET turn poll returns done with assistantMessage", async () => {
  const a = await bootApp(["copilot.chat"]);
  const created = await fetch(`${a.url}/copilot/sessions`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ backend: "openclaw" }),
  }).then((x) => x.json());

  const submit = await fetch(`${a.url}/copilot/sessions/${created.id}/turn`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ message: "ping" }),
  }).then((x) => x.json());
  assert.equal(submit.state, "pending");

  let body: any;
  for (let i = 0; i < 50; i++) {
    const res = await fetch(`${a.url}/copilot/sessions/${created.id}/turn/${submit.msg_id}`);
    body = await res.json();
    if (body.pending.state === "done") break;
    await new Promise((r) => setTimeout(r, 20));
  }
  assert.equal(body.pending.state, "done");
  assert.ok(body.assistantMessage);
  assert.equal(body.assistantMessage.role, "assistant");
  a.close();
});

test("DELETE removes session", async () => {
  const a = await bootApp(["copilot.chat"]);
  const created = await fetch(`${a.url}/copilot/sessions`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ backend: "openclaw" }),
  }).then((x) => x.json());
  const r = await fetch(`${a.url}/copilot/sessions/${created.id}`, { method: "DELETE" });
  assert.equal(r.status, 204);
  const get = await fetch(`${a.url}/copilot/sessions/${created.id}`);
  assert.equal(get.status, 404);
  a.close();
});
