import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRuntimeRegistry } from "../src/services/runtimes/registry.js";

test("registry loads config + lists descriptors", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "reg-"));
  const cfg = path.join(dir, "runtimes.json");
  await writeFile(cfg, JSON.stringify({
    runtimes: [
      { id: "oc-main", kind: "openclaw", displayName: "OC Main", endpoint: "http://127.0.0.1:18789", transport: "sdk", authMode: "token-env" },
      { id: "hermes-dev", kind: "hermes", displayName: "Hermes Dev", endpoint: "http://127.0.0.1:18800", transport: "http", authMode: "bearer" },
    ],
  }));

  const reg = await createRuntimeRegistry({ configPath: cfg });
  const all = await reg.list();
  assert.equal(all.length, 2);
  assert.equal(all[0].id, "oc-main");
  const one = await reg.get("hermes-dev");
  assert.ok(one);
  assert.equal(one!.kind, "hermes");
  assert.equal(await reg.get("missing"), null);
});

async function tempJsonFile(data: unknown): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "reg-"));
  const file = path.join(dir, "runtimes.json");
  await writeFile(file, JSON.stringify(data));
  return file;
}

test("registry treats missing enabled as true", async () => {
  const p = await tempJsonFile({
    runtimes: [{ id: "oc-main", kind: "openclaw", displayName: "OC", endpoint: "x", transport: "sdk", authMode: "token-env" }],
  });
  const r = await createRuntimeRegistry({ configPath: p });
  const list = await r.list();
  assert.equal(list[0].enabled, true);
});

test("registry rejects malformed config", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "reg-"));
  const cfg = path.join(dir, "runtimes.json");
  await writeFile(cfg, "not-json");
  await assert.rejects(() => createRuntimeRegistry({ configPath: cfg }), /invalid runtime config/i);
});
