import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createAuditLog } from "../src/services/auth/audit.js";

async function mk() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "audit-"));
  return createAuditLog({ path: path.join(dir, "audit.jsonl") });
}

test("append + tail", async () => {
  const log = await mk();
  await log.append({ kind: "login.success", actorUsername: "alice" });
  const e = await log.tail(10);
  assert.equal(e[0].kind, "login.success");
  assert.ok(e[0].at);
});
test("tail newest first with limit", async () => {
  const log = await mk();
  for (let i = 0; i < 5; i++) {
    await log.append({ kind: "login.success", meta: { i } });
    await new Promise((r) => setTimeout(r, 1));
  }
  const t = await log.tail(3);
  assert.equal(t.length, 3);
  assert.equal(t[0].meta!.i, 4);
});
