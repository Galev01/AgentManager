// apps/bridge/test/atomic-file.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { writeJsonAtomic, readJsonOrDefault, appendJsonl } from "../src/services/atomic-file.js";

async function tmpDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "atomic-file-"));
}

test("writeJsonAtomic creates parents and writes pretty JSON", async () => {
  const dir = await tmpDir();
  const file = path.join(dir, "nested", "data.json");
  await writeJsonAtomic(file, { a: 1 });
  const raw = await fs.readFile(file, "utf8");
  assert.equal(raw, JSON.stringify({ a: 1 }, null, 2) + "\n");
});

test("writeJsonAtomic replaces existing file", async () => {
  const dir = await tmpDir();
  const file = path.join(dir, "data.json");
  await writeJsonAtomic(file, { v: 1 });
  await writeJsonAtomic(file, { v: 2 });
  assert.deepEqual(JSON.parse(await fs.readFile(file, "utf8")), { v: 2 });
});

test("readJsonOrDefault returns default on missing", async () => {
  const dir = await tmpDir();
  assert.deepEqual(await readJsonOrDefault(path.join(dir, "missing.json"), { n: 42 }), { n: 42 });
});

test("readJsonOrDefault returns default on parse error", async () => {
  const dir = await tmpDir();
  const file = path.join(dir, "bad.json");
  await fs.writeFile(file, "{bad", "utf8");
  assert.deepEqual(await readJsonOrDefault(file, { n: 7 }), { n: 7 });
});

test("appendJsonl serializes concurrent appends", async () => {
  const dir = await tmpDir();
  const file = path.join(dir, "log.jsonl");
  await Promise.all(Array.from({ length: 20 }, (_, i) => appendJsonl(file, { i })));
  const raw = await fs.readFile(file, "utf8");
  const lines = raw.trim().split("\n");
  assert.equal(lines.length, 20);
  for (const l of lines) JSON.parse(l);
});
