import { Router, type Request, type Response } from "express";
import { callGateway } from "../services/gateway.js";

const router: Router = Router();

router.get("/agents", async (_req: Request, res: Response) => {
  try {
    const result = await callGateway("agents.list", {});
    res.json(result);
  } catch (err: any) {
    res.status(502).json({ error: err.message || "Failed to list agents" });
  }
});

router.post("/agents", async (req: Request, res: Response) => {
  try {
    const { name, model, systemPrompt, tools } = req.body;
    if (typeof name !== "string" || !name.trim()) {
      res.status(400).json({ error: "name is required" });
      return;
    }
    const params: Record<string, unknown> = { name: name.trim() };
    if (typeof model === "string") params.model = model.trim();
    if (typeof systemPrompt === "string") params.systemPrompt = systemPrompt;
    if (Array.isArray(tools)) params.tools = tools;
    const result = await callGateway("agents.create", params);
    res.status(201).json(result);
  } catch (err: any) {
    res.status(502).json({ error: err.message || "Failed to create agent" });
  }
});

router.get("/agents/:name", async (req: Request, res: Response) => {
  try {
    const name = req.params.name as string;
    const result = await callGateway("agents.identity", { name });
    res.json(result);
  } catch (err: any) {
    res.status(502).json({ error: err.message || "Failed to get agent" });
  }
});

router.patch("/agents/:name", async (req: Request, res: Response) => {
  try {
    const name = req.params.name as string;
    const updates = req.body || {};
    const result = await callGateway("agents.update", { name, ...updates });
    res.json(result);
  } catch (err: any) {
    res.status(502).json({ error: err.message || "Failed to update agent" });
  }
});

router.delete("/agents/:name", async (req: Request, res: Response) => {
  try {
    const name = req.params.name as string;
    const result = await callGateway("agents.delete", { name });
    res.json(result);
  } catch (err: any) {
    res.status(502).json({ error: err.message || "Failed to delete agent" });
  }
});

export default router;
