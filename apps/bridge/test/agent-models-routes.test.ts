import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import http from "node:http";
import { createModelsRouter } from "../src/routes/models.js";
// TODO Task 4: uncomment when agent-models route is implemented
// import { createAgentModelsRouter } from "../src/routes/agent-models.js";

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
  app.use(createModelsRouter({ callGateway }));
  // TODO Task 4: uncomment when agent-models route is implemented
  // app.use(createAgentModelsRouter({ callGateway }));
  const server = http.createServer(app).listen(0);
  const addr = server.address() as { port: number };
  return { url: `http://127.0.0.1:${addr.port}`, calls, close: () => server.close() };
}

test("GET /models returns gateway-projected catalog", async () => {
  const a = bootApp({
    perms: [],
    gatewayHandler: (method) => {
      if (method === "models.list") {
        return {
          models: [
            { id: "openai-codex/gpt-5.4", provider: "openai-codex", name: "GPT-5.4", contextWindow: 200000, cost: { input: 1.5, output: 5 } },
            { id: "ollama/gemma4", provider: "ollama", name: "gemma4", contextWindow: 131072 },
          ],
        };
      }
      throw new Error("unexpected");
    },
  });
  const r = await fetch(`${a.url}/models`);
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.equal(body.status, "ok");
  assert.equal(body.models.length, 2);
  assert.equal(body.models[0].id, "openai-codex/gpt-5.4");
  assert.equal(body.models[0].costInput, 1.5);
  a.close();
});

test("GET /models returns status 'unavailable' on gateway error", async () => {
  const a = bootApp({
    perms: [],
    gatewayHandler: () => { throw new Error("gateway down"); },
  });
  const r = await fetch(`${a.url}/models`);
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.equal(body.status, "unavailable");
  assert.deepEqual(body.models, []);
  a.close();
});
