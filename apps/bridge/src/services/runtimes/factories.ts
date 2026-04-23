import type { AdapterFactory } from "./adapter-base.js";
import type { RuntimeKind } from "@openclaw-manager/types";
import { createOpenclawAdapter } from "./openclaw.js";
import { createHermesAdapter } from "./hermes.js";
import { createZeroclawAdapter } from "./zeroclaw.js";
import { createNanobotAdapter } from "./nanobot.js";
import { callGateway } from "../gateway.js";
import { Client as McpClient } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { NanobotMcpClient } from "./nanobot.js";

function makeNanobotMcpClient(endpoint: string): NanobotMcpClient {
  // endpoint like "mcp:stdio:/path/to/binary --arg"
  const m = /^mcp:stdio:(.+)$/.exec(endpoint);
  if (!m) throw new Error(`unsupported nanobot endpoint: ${endpoint}`);
  const [cmd, ...args] = m[1].split(" ").filter(Boolean);
  const client = new McpClient({ name: "openclaw-manager", version: "0.1.0" }, { capabilities: {} });
  const transport = new StdioClientTransport({ command: cmd, args });
  return {
    async connect() { await client.connect(transport); },
    async listTools() { return (await client.listTools()) as { tools: Array<{ name: string; description?: string }> }; },
    async close() { await client.close(); },
  };
}

export const realFactories: Record<RuntimeKind, AdapterFactory> = {
  openclaw: (cfg) => createOpenclawAdapter(cfg, { callGateway }),
  hermes: (cfg) => createHermesAdapter({ ...cfg, bearer: process.env.HERMES_TOKEN ?? cfg.bearer }),
  zeroclaw: (cfg) => createZeroclawAdapter({ ...cfg, bearer: process.env.ZEROCLAW_TOKEN ?? cfg.bearer }),
  nanobot: (cfg) => createNanobotAdapter(cfg, { mcpClient: makeNanobotMcpClient(cfg.descriptor.endpoint) }),
};
