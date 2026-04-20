#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import crypto from "node:crypto";

const BRIDGE_URL = process.env.OPENCLAW_BRIDGE_URL || "http://127.0.0.1:3100";
const BRIDGE_TOKEN = process.env.OPENCLAW_BRIDGE_TOKEN || "";
const IDE = process.env.OPENCLAW_IDE || "unknown";
const WORKSPACE = process.env.OPENCLAW_WORKSPACE || process.cwd();
// Unique per MCP process. Claude Code spawns one MCP subprocess per
// conversation, so clientId == conversation id. Shared across the lifetime
// of this process; different across concurrent Claude Code chats.
const CLIENT_ID =
  process.env.OPENCLAW_CLIENT_ID || `cc-${crypto.randomBytes(6).toString("hex")}`;

async function bridgeFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BRIDGE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${BRIDGE_TOKEN}`,
      ...init?.headers,
    },
  });
  const bodyText = await res.text();
  if (!res.ok) {
    let parsed: any = null;
    try { parsed = JSON.parse(bodyText); } catch {}
    throw new Error(parsed?.error ?? `bridge ${res.status}: ${bodyText}`);
  }
  return bodyText ? (JSON.parse(bodyText) as T) : (undefined as T);
}

const server = new Server(
  { name: "openclaw-mcp", version: "0.1.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "openclaw_say",
      description:
        "Send a turn in an ongoing collaborative conversation with OpenClaw. OpenClaw remembers the thread across calls. Use this to ask questions, brainstorm, or work through bugs together with OpenClaw.",
      inputSchema: {
        type: "object",
        properties: {
          message: { type: "string", description: "Your turn in the conversation." },
          context: {
            type: "object",
            description: "Optional context to include (e.g. selected code, stack trace, file path).",
            additionalProperties: true,
          },
        },
        required: ["message"],
      },
    },
    {
      name: "openclaw_conclude",
      description: "Signal that the current collaborative task is done and the session can end.",
      inputSchema: {
        type: "object",
        properties: {
          reason: { type: "string", description: "Optional one-line summary of the outcome." },
        },
      },
    },
    {
      name: "openclaw_session_info",
      description: "Inspect the current Claude-Code/OpenClaw session: id, display name, mode, message count.",
      inputSchema: { type: "object", properties: {} },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const name = req.params.name;
  const args = (req.params.arguments ?? {}) as Record<string, unknown>;

  if (name === "openclaw_say") {
    const message = String(args.message ?? "");
    const context = (args.context as Record<string, unknown>) ?? undefined;
    const msgId = `m-${crypto.randomBytes(6).toString("hex")}`;
    const result = await bridgeFetch<{ answer: string; source: string; action?: string }>(
      "/claude-code/ask",
      {
        method: "POST",
        body: JSON.stringify({ ide: IDE, workspace: WORKSPACE, clientId: CLIENT_ID, msgId, question: message, context }),
      }
    );
    return { content: [{ type: "text", text: result.answer }] };
  }

  if (name === "openclaw_conclude") {
    const sessions = await bridgeFetch<Array<{ id: string; ide: string; workspace: string; clientId?: string }>>("/claude-code/sessions");
    const norm = WORKSPACE.trim().replace(/\\/g, "/").toLowerCase();
    const match = sessions.find(
      (s) =>
        s.ide === IDE &&
        s.clientId === CLIENT_ID &&
        s.workspace.trim().replace(/\\/g, "/").toLowerCase() === norm
    );
    if (!match) return { content: [{ type: "text", text: "no session to conclude" }] };
    await bridgeFetch(`/claude-code/sessions/${match.id}`, {
      method: "PATCH",
      body: JSON.stringify({ state: "ended" }),
    });
    return { content: [{ type: "text", text: "session ended" }] };
  }

  if (name === "openclaw_session_info") {
    const sessions = await bridgeFetch<Array<{ id: string; displayName: string; mode: string; messageCount: number; ide: string; workspace: string; clientId?: string }>>("/claude-code/sessions");
    const norm = WORKSPACE.trim().replace(/\\/g, "/").toLowerCase();
    const match = sessions.find(
      (s) =>
        s.ide === IDE &&
        s.clientId === CLIENT_ID &&
        s.workspace.trim().replace(/\\/g, "/").toLowerCase() === norm
    );
    const text = match
      ? JSON.stringify({ id: match.id, displayName: match.displayName, mode: match.mode, messageCount: match.messageCount, clientId: match.clientId }, null, 2)
      : "no session yet";
    return { content: [{ type: "text", text }] };
  }

  throw new Error(`Unknown tool: ${name}`);
});

await server.connect(new StdioServerTransport());
