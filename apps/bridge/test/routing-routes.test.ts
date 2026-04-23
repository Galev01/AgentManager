/**
 * Tests for the routing-rules HTTP router — specifically the body parsing
 * and validation surface (extracted as `parseRuleBody` inside
 * `routes/routing.ts`). The parser is intentionally not exported, so these
 * tests exercise it end-to-end through the POST and PUT routes.
 *
 * Settings persistence is redirected to a temp file so tests don't touch
 * real runtime settings (same trick as `routing-rules.test.ts`).
 */
import { describe, it, before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import express from "express";
import type { Server } from "node:http";
import { config } from "../src/config.js";

const SETTINGS_PATH = path.join(
  os.tmpdir(),
  `ocm-routing-routes-${crypto.randomUUID()}.json`
);

Object.defineProperty(config, "runtimeSettingsPath", {
  configurable: true,
  get: () => SETTINGS_PATH,
});

// Import AFTER the path override so the service captures the temp location.
const { default: routingRouter } = await import("../src/routes/routing.js");

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use(routingRouter);
  return app;
}

async function withServer(fn: (url: string) => Promise<void>): Promise<void> {
  const srv: Server = await new Promise((resolve) => {
    const s = makeApp().listen(0, "127.0.0.1", () => resolve(s));
  });
  const addr = srv.address();
  const url =
    typeof addr === "object" && addr ? `http://127.0.0.1:${addr.port}` : "";
  try {
    await fn(url);
  } finally {
    await new Promise((r) => srv.close(() => r(null)));
  }
}

async function wipe(): Promise<void> {
  await fs.rm(SETTINGS_PATH, { force: true }).catch(() => {});
  await fs.rm(SETTINGS_PATH + ".tmp", { force: true }).catch(() => {});
}

describe("routing-rules routes: parseRuleBody", { concurrency: 1 }, () => {
  before(async () => {
    await wipe();
  });
  beforeEach(async () => {
    await wipe();
  });
  after(async () => {
    await wipe();
  });

  it("POST accepts a valid specific rule", async () => {
    await withServer(async (url) => {
      const res = await fetch(`${url}/routing-rules`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationKey: "chat-42",
          phone: "+1555",
          displayName: "Alice",
          relayRecipientIds: ["r1"],
          suppressBot: true,
          note: "hi",
        }),
      });
      assert.equal(res.status, 201);
      const body = await res.json();
      assert.equal(body.conversationKey, "chat-42");
      assert.equal(body.phone, "+1555");
      assert.equal(body.displayName, "Alice");
      assert.equal(body.suppressBot, true);
      assert.equal(body.isDefault, false);
      assert.deepEqual(body.relayRecipientIds, ["r1"]);
    });
  });

  it("POST accepts a default rule with no conversationKey", async () => {
    await withServer(async (url) => {
      const res = await fetch(`${url}/routing-rules`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          isDefault: true,
          note: "catch-all",
          relayRecipientIds: [],
          suppressBot: false,
        }),
      });
      assert.equal(res.status, 201);
      const body = await res.json();
      assert.equal(body.isDefault, true);
      assert.equal(body.conversationKey, "");
      assert.equal(body.note, "catch-all");
    });
  });

  it("POST rejects a specific rule missing conversationKey with 400 + clarified message", async () => {
    await withServer(async (url) => {
      const res = await fetch(`${url}/routing-rules`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: "+1555" }),
      });
      assert.equal(res.status, 400);
      const body = await res.json();
      assert.equal(body.error, "conversationKey is required unless isDefault=true");
    });
  });

  it("POST coerces truthy-but-not-=== true isDefault to false (strict coercion)", async () => {
    await withServer(async (url) => {
      // isDefault = "yes" is NOT === true, so should be treated as a specific
      // rule — and hence rejected because conversationKey is also missing.
      const res = await fetch(`${url}/routing-rules`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isDefault: "yes" }),
      });
      assert.equal(res.status, 400);
      const body = await res.json();
      assert.equal(body.error, "conversationKey is required unless isDefault=true");
    });
  });
});
