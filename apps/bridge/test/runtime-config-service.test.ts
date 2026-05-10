import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRuntimeConfigService } from "../src/services/runtime-config.js";

async function tempConfig(json: unknown) {
  const dir = await mkdtemp(path.join(tmpdir(), "rc-"));
  const p = path.join(dir, "runtimes.json");
  await writeFile(p, JSON.stringify(json), "utf8");
  return p;
}

const probe = async () => ({ state: "healthy" as const });

test("reads snapshot with all enabled, configured primary healthy", async () => {
  const p = await tempConfig({
    configuredPrimaryRuntimeId: "oc-main",
    runtimes: [
      { id: "oc-main", kind: "openclaw", displayName: "OC", endpoint: "x", transport: "sdk", authMode: "token-env", enabled: true },
      { id: "hermes-remote", kind: "hermes", displayName: "H", endpoint: "y", transport: "http", authMode: "bearer", enabled: true },
    ],
  });
  const svc = createRuntimeConfigService({ configPath: p, probeStatus: probe });
  const s = await svc.read();
  assert.equal(s.configuredPrimaryRuntimeId, "oc-main");
  assert.equal(s.effectivePrimaryRuntimeId, "oc-main");
  assert.equal(s.fallbackReason, null);
  assert.equal(s.runtimes.length, 2);
});

test("falls back when configured primary is disabled", async () => {
  const p = await tempConfig({
    configuredPrimaryRuntimeId: "hermes-remote",
    runtimes: [
      { id: "oc-main", kind: "openclaw", displayName: "OC", endpoint: "x", transport: "sdk", authMode: "token-env", enabled: true },
      { id: "hermes-remote", kind: "hermes", displayName: "H", endpoint: "y", transport: "http", authMode: "bearer", enabled: false },
    ],
  });
  const svc = createRuntimeConfigService({ configPath: p, probeStatus: probe });
  const s = await svc.read();
  assert.equal(s.effectivePrimaryRuntimeId, "oc-main");
  assert.equal(s.fallbackReason, "configured_primary_disabled");
});

test("falls back when configured primary is missing", async () => {
  const p = await tempConfig({
    configuredPrimaryRuntimeId: "nonexistent",
    runtimes: [
      { id: "oc-main", kind: "openclaw", displayName: "OC", endpoint: "x", transport: "sdk", authMode: "token-env", enabled: true },
    ],
  });
  const svc = createRuntimeConfigService({ configPath: p, probeStatus: probe });
  const s = await svc.read();
  assert.equal(s.effectivePrimaryRuntimeId, "oc-main");
  assert.equal(s.fallbackReason, "configured_primary_missing");
});

test("disabled runtime has status disabled, probe NOT called", async () => {
  const p = await tempConfig({
    runtimes: [
      { id: "oc-main", kind: "openclaw", displayName: "OC", endpoint: "x", transport: "sdk", authMode: "token-env", enabled: true },
      { id: "hermes-remote", kind: "hermes", displayName: "H", endpoint: "y", transport: "http", authMode: "bearer", enabled: false },
    ],
  });
  let probeCalls = 0;
  const probeCounting = async (_id: string) => {
    probeCalls++;
    return { state: "healthy" as const };
  };
  const svc = createRuntimeConfigService({ configPath: p, probeStatus: probeCounting });
  const s = await svc.read();
  assert.equal(s.runtimes.find((r) => r.id === "hermes-remote")!.status.state, "disabled");
  assert.equal(probeCalls, 1); // only oc-main
});

test("PATCH toggles enabled; idempotent", async () => {
  const p = await tempConfig({
    runtimes: [
      { id: "oc-main", kind: "openclaw", displayName: "OC", endpoint: "x", transport: "sdk", authMode: "token-env", enabled: true },
      { id: "hermes-remote", kind: "hermes", displayName: "H", endpoint: "y", transport: "http", authMode: "bearer", enabled: false },
    ],
  });
  const svc = createRuntimeConfigService({ configPath: p, probeStatus: probe });
  const after = await svc.patch({ enabled: { "hermes-remote": true } });
  assert.equal(after.runtimes.find((r) => r.id === "hermes-remote")!.enabled, true);
  const again = await svc.patch({ enabled: { "hermes-remote": true } });
  assert.equal(again.runtimes.find((r) => r.id === "hermes-remote")!.enabled, true);
});

test("PATCH rejects unknown id with code unknown_runtime_id", async () => {
  const p = await tempConfig({
    runtimes: [{ id: "oc-main", kind: "openclaw", displayName: "OC", endpoint: "x", transport: "sdk", authMode: "token-env", enabled: true }],
  });
  const svc = createRuntimeConfigService({ configPath: p, probeStatus: probe });
  await assert.rejects(
    svc.patch({ enabled: { "ghost": true } }),
    (e: any) => e.code === "unknown_runtime_id",
  );
});

test("PATCH rejects disabling all runtimes with code cannot_disable_all", async () => {
  const p = await tempConfig({
    runtimes: [{ id: "oc-main", kind: "openclaw", displayName: "OC", endpoint: "x", transport: "sdk", authMode: "token-env", enabled: true }],
  });
  const svc = createRuntimeConfigService({ configPath: p, probeStatus: probe });
  await assert.rejects(
    svc.patch({ enabled: { "oc-main": false } }),
    (e: any) => e.code === "cannot_disable_all",
  );
});

test("PATCH allows configured primary pointing at disabled runtime; fallback applies", async () => {
  const p = await tempConfig({
    runtimes: [
      { id: "oc-main", kind: "openclaw", displayName: "OC", endpoint: "x", transport: "sdk", authMode: "token-env", enabled: true },
      { id: "hermes-remote", kind: "hermes", displayName: "H", endpoint: "y", transport: "http", authMode: "bearer", enabled: false },
    ],
  });
  const svc = createRuntimeConfigService({ configPath: p, probeStatus: probe });
  const after = await svc.patch({ configuredPrimaryRuntimeId: "hermes-remote" });
  assert.equal(after.configuredPrimaryRuntimeId, "hermes-remote");
  assert.equal(after.effectivePrimaryRuntimeId, "oc-main");
  assert.equal(after.fallbackReason, "configured_primary_disabled");
});

test("PATCH on legacy file (no enabled fields) — disabling last truly-enabled descriptor is rejected", async () => {
  const p = await tempConfig({
    runtimes: [
      { id: "oc-main", kind: "openclaw", displayName: "OC", endpoint: "x", transport: "sdk", authMode: "token-env" },
    ],
  });
  const svc = createRuntimeConfigService({ configPath: p, probeStatus: probe });
  await assert.rejects(
    svc.patch({ enabled: { "oc-main": false } }),
    (e: any) => e.code === "cannot_disable_all",
  );
});

test("PATCH atomic: change primary AND disable old primary in one call", async () => {
  const p = await tempConfig({
    configuredPrimaryRuntimeId: "oc-main",
    runtimes: [
      { id: "oc-main", kind: "openclaw", displayName: "OC", endpoint: "x", transport: "sdk", authMode: "token-env", enabled: true },
      { id: "hermes-remote", kind: "hermes", displayName: "H", endpoint: "y", transport: "http", authMode: "bearer", enabled: true },
    ],
  });
  const svc = createRuntimeConfigService({ configPath: p, probeStatus: probe });
  const after = await svc.patch({
    configuredPrimaryRuntimeId: "hermes-remote",
    enabled: { "oc-main": false },
  });
  assert.equal(after.configuredPrimaryRuntimeId, "hermes-remote");
  assert.equal(after.effectivePrimaryRuntimeId, "hermes-remote");
  assert.equal(after.runtimes.find((r) => r.id === "oc-main")!.enabled, false);
});

test("PATCH can add and edit a runtime descriptor", async () => {
  const p = await tempConfig({
    runtimes: [
      { id: "oc-main", kind: "openclaw", displayName: "OC", endpoint: "x", transport: "sdk", authMode: "token-env", enabled: true },
    ],
  });
  const svc = createRuntimeConfigService({ configPath: p, probeStatus: probe });
  const added = await svc.patch({
    upsertRuntime: {
      id: "hermes-remote",
      kind: "hermes",
      displayName: "Hermes",
      endpoint: "http://192.168.0.10:9119",
      transport: "http",
      authMode: "bearer",
      enabled: true,
    },
  });
  assert.equal(added.runtimes.find((r) => r.id === "hermes-remote")!.endpoint, "http://192.168.0.10:9119");

  const edited = await svc.patch({
    upsertRuntime: {
      id: "hermes-remote",
      kind: "hermes",
      displayName: "Hermes LAN",
      endpoint: "http://192.168.0.10:9119",
      transport: "http",
      authMode: "bearer",
      enabled: false,
    },
  });
  const target = edited.runtimes.find((r) => r.id === "hermes-remote")!;
  assert.equal(target.displayName, "Hermes LAN");
  assert.equal(target.enabled, false);
});

test("PATCH can remove a non-primary runtime descriptor", async () => {
  const p = await tempConfig({
    configuredPrimaryRuntimeId: "oc-main",
    runtimes: [
      { id: "oc-main", kind: "openclaw", displayName: "OC", endpoint: "x", transport: "sdk", authMode: "token-env", enabled: true },
      { id: "hermes-remote", kind: "hermes", displayName: "H", endpoint: "y", transport: "http", authMode: "bearer", enabled: true },
    ],
  });
  const svc = createRuntimeConfigService({ configPath: p, probeStatus: probe });
  const after = await svc.patch({ removeRuntimeId: "hermes-remote" });
  assert.equal(after.runtimes.some((r) => r.id === "hermes-remote"), false);
});

test("PATCH rejects removing configured primary", async () => {
  const p = await tempConfig({
    configuredPrimaryRuntimeId: "oc-main",
    runtimes: [
      { id: "oc-main", kind: "openclaw", displayName: "OC", endpoint: "x", transport: "sdk", authMode: "token-env", enabled: true },
      { id: "hermes-remote", kind: "hermes", displayName: "H", endpoint: "y", transport: "http", authMode: "bearer", enabled: true },
    ],
  });
  const svc = createRuntimeConfigService({ configPath: p, probeStatus: probe });
  await assert.rejects(
    svc.patch({ removeRuntimeId: "oc-main" }),
    (e: any) => e.code === "cannot_remove_primary",
  );
});
