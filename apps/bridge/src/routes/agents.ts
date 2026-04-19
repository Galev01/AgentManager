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
    const { name, workspace, emoji, avatar, model } = req.body;
    if (typeof name !== "string" || !name.trim()) {
      res.status(400).json({ error: "name is required" });
      return;
    }
    if (typeof workspace !== "string" || !workspace.trim()) {
      res.status(400).json({ error: "workspace is required" });
      return;
    }
    const createParams: Record<string, unknown> = {
      name: name.trim(),
      workspace: workspace.trim(),
    };
    if (typeof emoji === "string" && emoji.trim()) createParams.emoji = emoji.trim();
    if (typeof avatar === "string" && avatar.trim()) createParams.avatar = avatar.trim();
    const created = (await callGateway("agents.create", createParams)) as {
      ok?: boolean;
      agentId?: string;
      name?: string;
      workspace?: string;
    };
    if (typeof model === "string" && model.trim() && created?.agentId) {
      try {
        await callGateway("agents.update", {
          agentId: created.agentId,
          model: model.trim(),
        });
      } catch (updateErr: any) {
        res.status(201).json({
          ...created,
          warning: `created but failed to set model: ${updateErr?.message || "update failed"}`,
        });
        return;
      }
    }
    res.status(201).json(created);
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
