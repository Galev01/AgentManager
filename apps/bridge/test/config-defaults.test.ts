import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { computeDefaults } from "../src/config.js";

test("defaults derive from os.homedir() when env unset", () => {
  const home = "/fake/home";
  const d = computeDefaults({ env: {}, homedir: () => home });
  assert.equal(d.openclawHome, path.join(home, ".openclaw"));
  assert.equal(
    d.managementDir,
    path.join(home, ".openclaw/workspace/.openclaw/extensions/whatsapp-auto-reply/management"),
  );
  assert.equal(
    d.brainVaultPath,
    path.join(home, "Documents/Brainclaw/OpenClaw Brain"),
  );
});

test("OPENCLAW_HOME override propagates to derived paths", () => {
  const customHome = path.join(path.sep, "custom", "oc");
  const d = computeDefaults({
    env: { OPENCLAW_HOME: customHome },
    homedir: () => "/fake/home",
  });
  assert.equal(d.openclawHome, customHome);
  assert.ok(d.managementDir.startsWith(customHome + path.sep));
});

test("Hermes disabled when HERMES_BASE_URL absent", () => {
  const d = computeDefaults({ env: {}, homedir: () => "/h" });
  assert.equal(d.hermesEnabled, false);
});

test("Hermes enabled when HERMES_BASE_URL present", () => {
  const d = computeDefaults({
    env: { HERMES_BASE_URL: "http://hermes:9119", HERMES_TOKEN: "tk" },
    homedir: () => "/h",
  });
  assert.equal(d.hermesEnabled, true);
});

test("BRIDGE_HOST defaults to 127.0.0.1", () => {
  const d = computeDefaults({ env: {}, homedir: () => "/h" });
  assert.equal(d.bridgeHost, "127.0.0.1");
});
