import { test } from "node:test";
import assert from "node:assert/strict";
import { createZeroclawAdapter } from "../src/services/runtimes/zeroclaw.js";
import type { RuntimeDescriptor, JsonValue } from "@openclaw-manager/types";
import type { HttpClient } from "../src/services/runtimes/adapter-base.js";

const desc: RuntimeDescriptor = {
  id: "zc-dev", kind: "zeroclaw", displayName: "ZeroClaw",
  endpoint: "http://fake:1", transport: "http", authMode: "bearer",
};

function http(handler: (url: string) => Promise<JsonValue>): HttpClient {
  return { json: (url) => handler(url) };
}

test("zeroclaw adapter reports partial channels.list with structured reason + unsupported write", async () => {
  const a = createZeroclawAdapter({ descriptor: desc, bearer: "tok" });
  const caps = await a.getCapabilities();
  const part = caps.partial.find((p) => p.id === "channels.list");
  assert.ok(part);
  assert.equal(part!.lossiness, "lossy");
  assert.ok(caps.unsupported.includes("memory.write"));
});

test("zeroclaw adapter health surfaces error detail on probe failure", async () => {
  const a = createZeroclawAdapter({
    descriptor: desc, bearer: "tok",
    http: http(async () => { throw new Error("ECONNREFUSED"); }),
  });
  const h = await a.health();
  assert.equal(h.ok, false);
  assert.match(h.detail ?? "", /ECONNREFUSED/);
});

test("zeroclaw adapter respects empty healthPath (probe disabled)", async () => {
  const a = createZeroclawAdapter({
    descriptor: { ...desc, healthPath: "" }, bearer: "tok",
    http: http(async () => { throw new Error("should not be called"); }),
  });
  const h = await a.health();
  assert.equal(h.ok, true);
});
