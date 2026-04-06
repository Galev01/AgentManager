import { Router, type Request, type Response } from "express";
import fs from "node:fs/promises";
import path from "node:path";
import { config } from "../config.js";
import { callGateway } from "../services/gateway.js";

const router: Router = Router();

// GET /logs/tail — proxy gateway logs.tail
router.get("/logs/tail", async (req: Request, res: Response) => {
  try {
    const lines = Number(req.query.lines) || 100;
    const result = await callGateway("logs.tail", { lines });
    res.json(result);
  } catch (err: any) {
    res.status(502).json({ error: err.message || "Failed to tail logs" });
  }
});

// GET /sessions — list sessions from gateway
router.get("/sessions", async (_req: Request, res: Response) => {
  try {
    const result = await callGateway("sessions.list", {});
    res.json(result);
  } catch (err: any) {
    res.status(502).json({ error: err.message || "Failed to list sessions" });
  }
});

// GET /sessions/:sessionId/transcript — read session JSONL transcript file
router.get("/sessions/:sessionId/transcript", async (req: Request, res: Response) => {
  try {
    if (!config.sessionsDir) {
      res.status(400).json({ error: "OPENCLAW_SESSIONS_DIR not configured" });
      return;
    }
    const sessionId = String(req.params.sessionId);
    // Sanitize to prevent path traversal
    if (!/^[a-f0-9-]+$/i.test(sessionId)) {
      res.status(400).json({ error: "Invalid session ID format" });
      return;
    }
    const filePath = path.join(config.sessionsDir, `${sessionId}.jsonl`);
    let raw: string;
    try {
      raw = await fs.readFile(filePath, "utf8");
    } catch {
      res.status(404).json({ error: "Session transcript not found" });
      return;
    }
    const lines = raw.trim().split("\n").filter(Boolean);
    const events = [];
    for (const line of lines) {
      try {
        events.push(JSON.parse(line));
      } catch {
        // skip malformed
      }
    }
    res.json(events);
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to read transcript" });
  }
});

export default router;
