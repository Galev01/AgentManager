import { test } from "node:test";
import assert from "node:assert/strict";
import { createNanobotAdapter } from "../src/services/runtimes/nanobot.js";
import type { RuntimeDescriptor } from "@openclaw-manager/types";

const desc: RuntimeDescriptor = {
  id: "nanobot-local", kind: "nanobot", displayName: "Nanobot",
  endpoint: "mcp:stdio:nanobot-mcp", transport: "mcp-stdio", authMode: "mcp-none",
};

test("nanobot adapter advertises tools.list as supported", async () => {
  const fakeClient = {
    connect: async () => {},
    listTools: async () => ({ tools: [{ name: "echo", description: "echo input" }] }),
    close: async () => {},
  };
  const a = createNanobotAdapter({ descriptor: desc }, { mcpClient: fakeClient });
  const caps = await a.getCapabilities();
  assert.ok(caps.supported.includes("tools.list"));
  const tools = await a.listEntities("tool");
  assert.equal(tools.length, 1);
  assert.equal(tools[0].entityId, "echo");
  assert.equal(tools[0].runtimeKind, "nanobot");
});

test("nanobot health surfaces MCP transport error", async () => {
  const fakeClient = {
    connect: async () => { throw new Error("stdio spawn failed"); },
    listTools: async () => ({ tools: [] }),
    close: async () => {},
  };
  const a = createNanobotAdapter({ descriptor: desc }, { mcpClient: fakeClient });
  const h = await a.health();
  assert.equal(h.ok, false);
  assert.match(h.detail ?? "", /spawn/);
});

test("nanobot adapter connects only once across repeated calls (pooled)", async () => {
  let connects = 0;
  let closed = false;
  const fakeClient = {
    connect: async () => { connects++; },
    listTools: async () => ({ tools: [{ name: "a" }, { name: "b" }] }),
    close: async () => { closed = true; },
  };
  const a = createNanobotAdapter({ descriptor: desc }, { mcpClient: fakeClient });
  await a.health();
  await a.listEntities("tool");
  await a.listEntities("tool");
  assert.equal(connects, 1, "connect() must be called at most once for a non-disposed adapter");
  await a.dispose!();
  assert.equal(closed, true, "dispose() must close the MCP transport");
});

test("nanobot adapter retries connect after a failed attempt", async () => {
  let attempts = 0;
  const fakeClient = {
    connect: async () => { attempts++; if (attempts === 1) throw new Error("transient"); },
    listTools: async () => ({ tools: [] }),
    close: async () => {},
  };
  const a = createNanobotAdapter({ descriptor: desc }, { mcpClient: fakeClient });
  assert.equal((await a.health()).ok, false);
  assert.equal((await a.health()).ok, true);
  assert.equal(attempts, 2);
});
