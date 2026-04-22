import { Router, type Request, type Response } from "express";
import { callGateway } from "../services/gateway.js";

const router: Router = Router();

function normalizeSession(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const id =
    (typeof r.id === "string" && r.id) ||
    (typeof r.key === "string" && r.key) ||
    (typeof r.sessionId === "string" && r.sessionId) ||
    (typeof r.sessionKey === "string" && r.sessionKey) ||
    null;
  if (!id) return null;
  const agentName =
    (typeof r.agentName === "string" && r.agentName) ||
    (typeof r.agentId === "string" && r.agentId) ||
    undefined;
  return { ...r, id, ...(agentName ? { agentName } : {}) };
}

function extractSessionArray(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === "object") {
    const r = raw as Record<string, unknown>;
    if (Array.isArray(r.sessions)) return r.sessions;
    if (Array.isArray(r.items)) return r.items;
    if (Array.isArray(r.data)) return r.data;
  }
  return [];
}

router.get("/agent-sessions", async (req: Request, res: Response) => {
  try {
    const params: Record<string, unknown> = {};
    if (req.query.agent) params.agent = String(req.query.agent);
    if (req.query.status) params.status = String(req.query.status);
    const result = await callGateway("sessions.list", params);
    const items = extractSessionArray(result)
      .map(normalizeSession)
      .filter((s): s is Record<string, unknown> => s !== null);
    res.json(items);
  } catch (err: any) {
    res.status(502).json({ error: err.message || "Failed to list sessions" });
  }
});

router.post("/agent-sessions", async (req: Request, res: Response) => {
  try {
    const { agentName } = req.body;
    const params: Record<string, unknown> = {};
    if (typeof agentName === "string") params.agent = agentName.trim();
    const raw = await callGateway("sessions.create", params);
    const normalized = normalizeSession(raw);
    if (!normalized) {
      console.warn(
        "[agent-sessions] sessions.create returned no usable id:",
        JSON.stringify(raw),
      );
      res
        .status(502)
        .json({ error: "Gateway did not return a session id", raw });
      return;
    }
    res.status(201).json(normalized);
  } catch (err: any) {
    res.status(502).json({ error: err.message || "Failed to create session" });
  }
});

router.post("/agent-sessions/:id/send", async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const { message } = req.body;
    if (typeof message !== "string" || !message.trim()) {
      res.status(400).json({ error: "message is required" });
      return;
    }
    const result = await callGateway("sessions.send", { session: id, message: message.trim() });
    res.json(result);
  } catch (err: any) {
    res.status(502).json({ error: err.message || "Failed to send message" });
  }
});

router.get("/agent-sessions/:id/usage", async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const result = await callGateway("sessions.usage", { session: id });
    res.json(result);
  } catch (err: any) {
    res.status(502).json({ error: err.message || "Failed to get usage" });
  }
});

router.post("/agent-sessions/:id/reset", async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const result = await callGateway("sessions.reset", { session: id });
    res.json(result);
  } catch (err: any) {
    res.status(502).json({ error: err.message || "Failed to reset session" });
  }
});

router.post("/agent-sessions/:id/abort", async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const result = await callGateway("sessions.abort", { session: id });
    res.json(result);
  } catch (err: any) {
    res.status(502).json({ error: err.message || "Failed to abort session" });
  }
});

router.post("/agent-sessions/:id/compact", async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const result = await callGateway("sessions.compact", { session: id });
    res.json(result);
  } catch (err: any) {
    res.status(502).json({ error: err.message || "Failed to compact session" });
  }
});

router.delete("/agent-sessions/:id", async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const result = await callGateway("sessions.delete", { session: id });
    res.json(result);
  } catch (err: any) {
    res.status(502).json({ error: err.message || "Failed to delete session" });
  }
});

export default router;
