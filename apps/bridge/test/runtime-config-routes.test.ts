import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import http from "node:http";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRuntimeConfigService } from "../src/services/runtime-config.js";
import { createRuntimeConfigRouter } from "../src/routes/runtime-config.js";

async function bootApp(opts: { perms: string[] }) {
  const dir = await mkdtemp(path.join(tmpdir(), "rc-rt-"));
  const cfg = path.join(dir, "runtimes.json");
  await writeFile(cfg, JSON.stringify({
    configuredPrimaryRuntimeId: "oc-main",
    runtimes: [
      { id: "oc-main", kind: "openclaw", displayName: "OC", endpoint: "x", transport: "sdk", authMode: "token-env", enabled: true },
      { id: "hermes-remote", kind: "hermes", displayName: "H", endpoint: "y", transport: "http", authMode: "bearer", enabled: false },
    ],
  }), "utf8");
  const svc = createRuntimeConfigService({
    configPath: cfg,
    probeStatus: async () => ({ state: "healthy" }),
  });
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).auth = { user: { id: "u1" }, permissions: opts.perms };
    next();
  });
  app.use(createRuntimeConfigRouter({ service: svc }));
  const server = http.createServer(app).listen(0);
  const addr = server.address() as { port: number };
  return { url: `http://127.0.0.1:${addr.port}`, close: () => server.close() };
}

test("GET /runtime-config returns snapshot when permitted", async () => {
  const a = await bootApp({ perms: ["runtimes.view"] });
  const r = await fetch(`${a.url}/runtime-config`);
  const body = await r.json();
  assert.equal(r.status, 200);
  assert.equal(body.configuredPrimaryRuntimeId, "oc-main");
  a.close();
});

test("GET /runtime-config 403 without runtimes.view", async () => {
  const a = await bootApp({ perms: [] });
  const r = await fetch(`${a.url}/runtime-config`);
  assert.equal(r.status, 403);
  a.close();
});

test("PATCH /runtime-config applies changes", async () => {
  const a = await bootApp({ perms: ["runtimes.view", "runtimes.config"] });
  const r = await fetch(`${a.url}/runtime-config`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ enabled: { "hermes-remote": true } }),
  });
  const body = await r.json();
  assert.equal(r.status, 200);
  assert.equal(body.runtimes.find((x: any) => x.id === "hermes-remote").enabled, true);
  a.close();
});

test("PATCH /runtime-config 409 when disabling all", async () => {
  const a = await bootApp({ perms: ["runtimes.view", "runtimes.config"] });
  const r = await fetch(`${a.url}/runtime-config`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ enabled: { "oc-main": false, "hermes-remote": false } }),
  });
  const body = await r.json();
  assert.equal(r.status, 409);
  assert.equal(body.error, "cannot_disable_all");
  a.close();
});

test("PATCH /runtime-config 400 unknown id", async () => {
  const a = await bootApp({ perms: ["runtimes.view", "runtimes.config"] });
  const r = await fetch(`${a.url}/runtime-config`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ enabled: { "ghost": true } }),
  });
  assert.equal(r.status, 400);
  a.close();
});

test("PATCH /runtime-config upserts runtime descriptor", async () => {
  const a = await bootApp({ perms: ["runtimes.view", "runtimes.config"] });
  const r = await fetch(`${a.url}/runtime-config`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      upsertRuntime: {
        id: "hermes-lan",
        kind: "hermes",
        displayName: "Hermes LAN",
        endpoint: "http://192.168.0.10:9119",
        transport: "http",
        authMode: "bearer",
        enabled: true,
      },
    }),
  });
  const body = await r.json();
  assert.equal(r.status, 200);
  assert.equal(body.runtimes.find((x: any) => x.id === "hermes-lan").displayName, "Hermes LAN");
  a.close();
});

test("PATCH /runtime-config rejects removing configured primary", async () => {
  const a = await bootApp({ perms: ["runtimes.view", "runtimes.config"] });
  const r = await fetch(`${a.url}/runtime-config`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ removeRuntimeId: "oc-main" }),
  });
  const body = await r.json();
  assert.equal(r.status, 409);
  assert.equal(body.error, "cannot_remove_primary");
  a.close();
});
