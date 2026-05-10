import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRuntimeRegistry } from "../src/services/runtimes/registry.js";

test("registry reads first existing path", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ocm-rt-"));
  const a = path.join(dir, "a.json");
  const b = path.join(dir, "b.json");
  fs.writeFileSync(
    a,
    JSON.stringify({
      runtimes: [
        {
          id: "from-a",
          kind: "openclaw",
          displayName: "From A",
          endpoint: "x",
          transport: "sdk",
          authMode: "token-env",
        },
      ],
    }),
  );
  fs.writeFileSync(
    b,
    JSON.stringify({
      runtimes: [
        {
          id: "from-b",
          kind: "openclaw",
          displayName: "From B",
          endpoint: "x",
          transport: "sdk",
          authMode: "token-env",
        },
      ],
    }),
  );
  const reg = await createRuntimeRegistry({ configPaths: [a, b] });
  const list = await reg.list();
  assert.equal(list.length, 1);
  assert.equal(list[0].id, "from-a");
  assert.equal(reg.configPath(), a);
});

test("registry skips missing paths and falls through to next existing", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ocm-rt-"));
  const missing = path.join(dir, "does-not-exist.json");
  const real = path.join(dir, "real.json");
  fs.writeFileSync(
    real,
    JSON.stringify({
      runtimes: [
        {
          id: "from-real",
          kind: "openclaw",
          displayName: "Real",
          endpoint: "x",
          transport: "sdk",
          authMode: "token-env",
        },
      ],
    }),
  );
  const reg = await createRuntimeRegistry({ configPaths: [missing, real] });
  const list = await reg.list();
  assert.equal(list[0].id, "from-real");
  assert.equal(reg.configPath(), real);
});

test("registry rejects when no candidate path exists", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ocm-rt-"));
  const a = path.join(dir, "nope1.json");
  const b = path.join(dir, "nope2.json");
  await assert.rejects(
    () => createRuntimeRegistry({ configPaths: [a, b] }),
    /no readable file found/i,
  );
});
