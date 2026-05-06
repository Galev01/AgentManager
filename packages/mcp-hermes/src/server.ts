#!/usr/bin/env node
import express from "express";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { bearerAuth } from "./auth.js";
import { SessionStore } from "./sessions.js";
import { ShimClient } from "./shim-client.js";
import {
  handleHermesSay,
  handleHermesSessionInfo,
  handleHermesConclude,
  type ToolTextResult,
} from "./tools.js";

const PORT = Number(process.env.MCP_HERMES_PORT ?? 9120);
const HOST = process.env.MCP_HERMES_HOST ?? "127.0.0.1";
const BIND_LAN = process.env.MCP_HERMES_BIND_LAN === "1";
const MCP_TOKEN = process.env.MCP_HERMES_TOKEN ?? "";
const SHIM_URL = process.env.HERMES_SHIM_URL ?? "http://127.0.0.1:9119";
const SHIM_TOKEN = process.env.HERMES_SHIM_TOKEN ?? "";

if (HOST !== "127.0.0.1" && !BIND_LAN) {
  console.error("refusing to bind non-loopback without MCP_HERMES_BIND_LAN=1");
  process.exit(2);
}
if (!MCP_TOKEN) {
  console.error("MCP_HERMES_TOKEN must be set");
  process.exit(2);
}
if (!SHIM_TOKEN) {
  console.error("HERMES_SHIM_TOKEN must be set");
  process.exit(2);
}

const store = new SessionStore();
const shim = new ShimClient({ baseUrl: SHIM_URL, shimToken: SHIM_TOKEN });

function buildServer(clientId: string): Server {
  const server = new Server(
    { name: "mcp-hermes", version: "0.1.0" },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: "hermes_say",
        description:
          "Send a turn in an ongoing collaborative conversation with Hermes. Hermes is a remote agent with NO knowledge of your project. Include full project context (file paths, code snippets, architecture overview, prior decisions) in every message.",
        inputSchema: {
          type: "object",
          properties: {
            message: { type: "string", description: "Your turn — include rich project context, not just the immediate question." },
            session_id: { type: "string", description: "Optional. Reuse to continue a thread. Omit to start a new one." },
            context: {
              type: "object",
              additionalProperties: true,
              description: "Optional structured context (file, snippet, stack). Hermes does not auto-load this — restate key parts in `message`.",
            },
          },
          required: ["message"],
        },
      },
      {
        name: "hermes_session_info",
        description: "Inspect the current Hermes session: id, message count, status, started_at.",
        inputSchema: {
          type: "object",
          properties: { session_id: { type: "string" } },
        },
      },
      {
        name: "hermes_conclude",
        description: "Mark the current Hermes collaborative thread as concluded. Phase 1: in-memory only, no archive.",
        inputSchema: {
          type: "object",
          properties: {
            session_id: { type: "string" },
            summary: { type: "string", description: "Optional one-line outcome summary." },
          },
        },
      },
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const name = req.params.name;
    const args = (req.params.arguments ?? {}) as Record<string, unknown>;
    let result: ToolTextResult;
    if (name === "hermes_say") {
      result = await handleHermesSay({ args, clientId, store, shim });
    } else if (name === "hermes_session_info") {
      result = await handleHermesSessionInfo({ args, clientId, store, shim });
    } else if (name === "hermes_conclude") {
      result = await handleHermesConclude({ args, clientId, store, shim });
    } else {
      throw new Error(`Unknown tool: ${name}`);
    }
    return { content: [{ type: "text", text: result.text }] };
  });

  return server;
}

const app = express();
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "mcp-hermes", version: "0.1.0" });
});

app.use("/mcp", bearerAuth(MCP_TOKEN));

// Phase-1: single-user deployment. All MCP requests share one session map.
// Claude Code's HTTP MCP client does not send a stable per-conversation
// header in stateless mode, so per-request randomization broke session
// continuity for hermes_session_info / hermes_conclude. See
// docs/superpowers/specs/2026-05-06-consult-hermes-design.md.
const PHASE1_CLIENT_ID = "default";

app.post("/mcp", async (req, res) => {
  const clientId = PHASE1_CLIENT_ID;
  const server = buildServer(clientId);
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on("close", () => { transport.close(); server.close(); });
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

app.listen(PORT, HOST, () => {
  console.log(`mcp-hermes listening on http://${HOST}:${PORT}/mcp (LAN bind: ${BIND_LAN})`);
});
