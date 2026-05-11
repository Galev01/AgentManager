import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import http from "node:http";
import { createClaudeCodeRouter } from "../src/routes/claude-code.js";
import type { ChatBackendAdapter, ChatTurnRequest } from "../src/services/copilot/backend.js";

async function bootApp(backend: ChatBackendAdapter) {
  const app = express();
  app.use(express.json());
  app.use(createClaudeCodeRouter({ hermesChatBackend: backend }));
  const server = http.createServer(app).listen(0);
  const addr = server.address() as { port: number };
  return { url: `http://127.0.0.1:${addr.port}`, close: () => server.close() };
}

test("POST /claude-code/hermes-say sends a stable MCP session to Hermes", async () => {
  const turns: ChatTurnRequest[] = [];
  const backend: ChatBackendAdapter = {
    async createSession({ sessionId }) {
      return { openclawSessionKey: `copilot-${sessionId}` };
    },
    async sendTurn(req) {
      turns.push(req);
      return { ok: true, assistantText: "hermes pong" };
    },
  };
  const app = await bootApp(backend);

  const first = await fetch(`${app.url}/claude-code/hermes-say`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      ide: "cursor",
      workspace: "/tmp/project",
      clientId: "cc-test",
      message: "ping",
    }),
  });
  const body = await first.json();

  assert.equal(first.status, 200);
  assert.equal(body.answer, "hermes pong");
  assert.equal(body.source, "hermes");
  assert.equal(turns.length, 1);
  assert.equal(turns[0]!.session.id.length, 12);
  assert.equal(turns[0]!.session.openclawSessionKey, `copilot-${turns[0]!.session.id}`);
  assert.equal(turns[0]!.userMessageText, "ping");
  assert.match(turns[0]!.msgId, /^m-/);

  const second = await fetch(`${app.url}/claude-code/hermes-say`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      ide: "cursor",
      workspace: "/tmp/project",
      clientId: "cc-test",
      message: "again",
    }),
  });
  await second.json();
  assert.equal(turns[1]!.session.id, turns[0]!.session.id);
  assert.equal(turns[1]!.session.openclawSessionKey, turns[0]!.session.openclawSessionKey);

  app.close();
});

test("POST /claude-code/hermes-say validates required identity and message fields", async () => {
  const backend: ChatBackendAdapter = {
    async createSession() { return {}; },
    async sendTurn() { return { ok: true, assistantText: "unused" }; },
  };
  const app = await bootApp(backend);

  const res = await fetch(`${app.url}/claude-code/hermes-say`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ide: "cursor", workspace: "/tmp/project" }),
  });
  const body = await res.json();

  assert.equal(res.status, 400);
  assert.equal(body.error, "ide, workspace, message are required");
  app.close();
});

