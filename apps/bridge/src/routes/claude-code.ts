import { Router, type Router as ExpressRouter } from "express";
import { config } from "../config.js";
import { callGateway } from "../services/gateway.js";
import { broadcast } from "../ws.js";
import {
  listSessions,
  renameSession,
  setSessionMode,
  endSession,
  resurrectSession,
} from "../services/claude-code-sessions.js";
import {
  readTranscript,
  readLatestEnvelope,
  transcriptPathFor,
} from "../services/claude-code-transcript.js";
import {
  listPending,
  resolvePending,
} from "../services/claude-code-pending.js";
import { createAskOrchestrator } from "../services/claude-code-ask.js";
import { summarizeSession } from "../services/claude-code-summarize.js";
import type {
  ClaudeCodeAskRequest,
  ClaudeCodeConnectConfig,
} from "@openclaw-manager/types";

const router: ExpressRouter = Router();

const orchestrator = createAskOrchestrator({
  sessionsPath: config.claudeCodeSessionsPath,
  pendingPath: config.claudeCodePendingPath,
  transcriptsDir: config.claudeCodeDir,
  pendingTimeoutMs: config.claudeCodePendingTimeoutMs,
  openclawAgentId: config.claudeCodeOpenclawAgentId,
  callGateway,
  broadcast,
});

function validId(id: string): boolean {
  return /^[a-f0-9]{12}$/.test(id);
}

router.post("/claude-code/ask", async (req, res) => {
  const body = req.body as ClaudeCodeAskRequest;
  if (
    !body?.ide ||
    !body?.workspace ||
    !body?.msgId ||
    typeof body.question !== "string"
  ) {
    return res.status(400).json({ error: "ide, workspace, msgId, question are required" });
  }
  try {
    const result = await orchestrator.ask(body);
    res.json(result);
  } catch (err) {
    const message = (err as Error).message;
    if (/message required/i.test(message)) {
      return res.status(400).json({ error: "message required" });
    }
    if (/discarded/i.test(message)) return res.status(409).json({ error: "operator discarded reply" });
    if (/timeout/i.test(message)) return res.status(504).json({ error: "operator timeout" });
    if (/gateway/i.test(message)) return res.status(503).json({ error: message });
    res.status(500).json({ error: message });
  }
});

router.get("/claude-code/sessions", async (_req, res) => {
  res.json(await listSessions(config.claudeCodeSessionsPath));
});

router.get("/claude-code/sessions-with-envelope", async (_req, res) => {
  const sessions = await listSessions(config.claudeCodeSessionsPath);
  const rows = await Promise.all(
    sessions.map(async (s) => {
      const latestEnvelope = await readLatestEnvelope(
        transcriptPathFor(config.claudeCodeDir, s.id)
      );
      return { ...s, latestEnvelope };
    })
  );
  res.json(rows);
});

router.get("/claude-code/escalations", async (_req, res) => {
  const sessions = await listSessions(config.claudeCodeSessionsPath);
  let count = 0;
  for (const s of sessions) {
    if (s.state !== "active") continue;
    const env = await readLatestEnvelope(
      transcriptPathFor(config.claudeCodeDir, s.id)
    );
    if (env && env.intent === "decide" && env.state === "blocked") count++;
  }
  res.json({ count });
});

router.patch("/claude-code/sessions/:id", async (req, res) => {
  const id = req.params.id;
  if (!validId(id)) return res.status(400).json({ error: "invalid id" });
  const { mode, state, displayName } = req.body ?? {};
  try {
    let out;
    if (displayName && typeof displayName === "string") {
      out = await renameSession(config.claudeCodeSessionsPath, id, displayName);
    }
    if (mode === "agent" || mode === "manual") {
      out = await setSessionMode(config.claudeCodeSessionsPath, id, mode);
    }
    if (state === "ended") out = await endSession(config.claudeCodeSessionsPath, id);
    if (state === "active") out = await resurrectSession(config.claudeCodeSessionsPath, id);
    broadcast("claude_code_session_upserted", { id });
    res.json(out ?? (await listSessions(config.claudeCodeSessionsPath)).find((s) => s.id === id));
  } catch (err) {
    res.status(404).json({ error: (err as Error).message });
  }
});

router.get("/claude-code/transcripts/:id", async (req, res) => {
  const id = req.params.id;
  if (!validId(id)) return res.status(400).json({ error: "invalid id" });
  const events = await readTranscript(transcriptPathFor(config.claudeCodeDir, id));
  res.json(events);
});

router.post("/claude-code/sessions/:id/summarize", async (req, res) => {
  const id = req.params.id;
  if (!validId(id)) return res.status(400).json({ error: "invalid id" });
  const events = await readTranscript(transcriptPathFor(config.claudeCodeDir, id));
  if (events.length === 0) {
    return res.json({ summary: null });
  }
  try {
    const summary = await summarizeSession(events, {
      callGateway,
      agentId: config.claudeCodeOpenclawAgentId,
    });
    res.json({ summary });
  } catch (err) {
    console.warn(`[claude-code] summarize failed for ${id}: ${(err as Error).message}`);
    res.json({ summary: null });
  }
});

router.get("/claude-code/pending", async (_req, res) => {
  res.json(await listPending(config.claudeCodePendingPath));
});

router.post("/claude-code/pending/:id", async (req, res) => {
  const id = req.params.id;
  const { action, text } = req.body ?? {};
  if (!action) return res.status(400).json({ error: "action required" });
  const pending = (await listPending(config.claudeCodePendingPath)).find((p) => p.id === id);
  if (!pending) return res.status(404).json({ error: "pending not found" });
  try {
    if (action === "send-as-is") {
      await resolvePending(config.claudeCodePendingPath, id, {
        answer: pending.draft, source: "operator", action: "send-as-is",
      });
    } else if (action === "edit" || action === "replace") {
      if (typeof text !== "string" || !text.trim()) {
        return res.status(400).json({ error: "text required for edit/replace" });
      }
      await resolvePending(config.claudeCodePendingPath, id, {
        answer: text, source: "operator", action,
      });
    } else if (action === "discard") {
      await resolvePending(config.claudeCodePendingPath, id, {
        error: "operator discarded reply",
      });
    } else {
      return res.status(400).json({ error: "unknown action" });
    }
    broadcast("claude_code_pending_resolved", { id });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.get("/claude-code/connect-config", (req, res) => {
  const host = req.get("host")?.split(":")[0] ?? "127.0.0.1";
  const bridgeUrl = `http://${host}:${config.port}`;
  const token = config.token;
  const nodeServerPath = "<absolute path to mcp-openclaw>/dist/server.js";
  const config_: ClaudeCodeConnectConfig = {
    antigravity: `# Antigravity mcp.config.json snippet:\n{\n  "mcpServers": {\n    "openclaw": {\n      "command": "node",\n      "args": ["${nodeServerPath}"],\n      "env": {\n        "OPENCLAW_BRIDGE_URL": "${bridgeUrl}",\n        "OPENCLAW_BRIDGE_TOKEN": "${token}",\n        "OPENCLAW_IDE": "antigravity",\n        "OPENCLAW_WORKSPACE": "\${workspaceFolder}"\n      }\n    }\n  }\n}`,
    vscode: `# VSCode (Claude extension) mcp config snippet:\n{\n  "openclaw": {\n    "command": "node",\n    "args": ["${nodeServerPath}"],\n    "env": {\n      "OPENCLAW_BRIDGE_URL": "${bridgeUrl}",\n      "OPENCLAW_BRIDGE_TOKEN": "${token}",\n      "OPENCLAW_IDE": "vscode",\n      "OPENCLAW_WORKSPACE": "\${workspaceFolder}"\n    }\n  }\n}`,
    cli: `# Claude Code CLI:\nclaude mcp add openclaw \\\n  -e OPENCLAW_BRIDGE_URL=${bridgeUrl} \\\n  -e OPENCLAW_BRIDGE_TOKEN=${token} \\\n  -e OPENCLAW_IDE=cli \\\n  -e OPENCLAW_WORKSPACE="$PWD" \\\n  -- node ${nodeServerPath}`,
  };
  res.json(config_);
});

export default router;
