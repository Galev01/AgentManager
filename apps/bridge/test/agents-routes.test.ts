import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import http from "node:http";
import { createAgentsRouter } from "../src/routes/agents.js";

type StubCalls = Array<{ method: string; params: unknown }>;

function bootApp(opts: {
  perms: string[];
  gatewayHandler?: (method: string, params: unknown) => unknown | Promise<unknown>;
}): { url: string; calls: StubCalls; close: () => void } {
  const calls: StubCalls = [];
  const callGateway = async (method: string, params?: unknown) => {
    calls.push({ method, params: params ?? {} });
    if (!opts.gatewayHandler) throw new Error(`unstubbed gateway call: ${method}`);
    return opts.gatewayHandler(method, params ?? {});
  };
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).auth = { user: { id: "u1" }, permissions: opts.perms };
    next();
  });
  app.use(createAgentsRouter({ callGateway }));
  const server = http.createServer(app).listen(0);
  const addr = server.address() as { port: number };
  return { url: `http://127.0.0.1:${addr.port}`, calls, close: () => server.close() };
}

test("PATCH /agents/:name returns 403 without agents.manage", async () => {
  const a = bootApp({ perms: [] });
  const r = await fetch(`${a.url}/agents/claude-code`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model: "openai-codex/gpt-5.4" }),
  });
  assert.equal(r.status, 403);
  a.close();
});
