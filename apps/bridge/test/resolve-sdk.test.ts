import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { resolveSdkPath } from "../src/openclaw/resolve-sdk.js";

function tmp(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "ocm-sdk-test-"));
}

test("env override wins", () => {
  const dir = tmp();
  const file = path.join(dir, "call-OVERRIDE.js");
  fs.writeFileSync(file, "");
  const result = resolveSdkPath({ env: { OPENCLAW_SDK_PATH: file }, cwd: dir });
  assert.equal(result.path, file);
  assert.equal(result.source, "env-override");
});

test("local workspace node_modules glob picks newest call-*.js", () => {
  const dir = tmp();
  const sdkDir = path.join(dir, "node_modules", "openclaw", "dist");
  fs.mkdirSync(sdkDir, { recursive: true });
  const a = path.join(sdkDir, "call-AAA.js");
  const b = path.join(sdkDir, "call-BBB.js");
  fs.writeFileSync(a, "");
  fs.writeFileSync(b, "");
  const result = resolveSdkPath({ env: {}, cwd: dir });
  assert.match(result.path, /call-(AAA|BBB)\.js$/);
  assert.equal(result.source, "workspace-glob");
});

test("global fallback emits warning", () => {
  const dir = tmp();
  const globalRoot = tmp();
  const sdkDir = path.join(globalRoot, "openclaw", "dist");
  fs.mkdirSync(sdkDir, { recursive: true });
  const file = path.join(sdkDir, "call-GLOBAL.js");
  fs.writeFileSync(file, "");
  const warnings: string[] = [];
  const result = resolveSdkPath({
    env: {},
    cwd: dir,
    globalNpmRoot: () => globalRoot,
    warn: (m) => warnings.push(m),
  });
  assert.equal(result.source, "global-fallback");
  assert.equal(result.path, file);
  assert.ok(warnings[0].includes("global"));
});

test("throws with setup hint when nothing found", () => {
  const dir = tmp();
  assert.throws(
    () => resolveSdkPath({ env: {}, cwd: dir, globalNpmRoot: () => tmp() }),
    /Could not resolve OpenClaw SDK/
  );
});
