import { test } from "node:test";
import assert from "node:assert/strict";
import { createHermesChatBackend } from "../src/services/copilot/backends/hermes.js";

test("createHermesChatBackend(null) yields disabled backend", () => {
  const backend = createHermesChatBackend(null);
  assert.equal(backend.available, false);
  assert.match(backend.reason ?? "", /HERMES_BASE_URL/);
});

test("createHermesChatBackend(config) yields enabled backend", () => {
  const backend = createHermesChatBackend({
    baseUrl: "http://h:9119",
    token: "t",
  });
  assert.equal(backend.available, true);
});
