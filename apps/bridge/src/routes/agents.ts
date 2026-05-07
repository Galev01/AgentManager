import { Router, type Router as ExpressRouter, type Request, type Response } from "express";
import { requirePerm } from "../auth-middleware.js";
import { createAgentModelsService, type CallGateway } from "../services/agent-models.js";

export type AgentsRouterDeps = { callGateway: CallGateway };

export function createAgentsRouter(deps: AgentsRouterDeps): ExpressRouter {
  const router: ExpressRouter = Router();
  const { callGateway } = deps;
  const modelsService = createAgentModelsService({ callGateway });

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
      const requestedModel = typeof model === "string" ? model.trim() : "";
      if (requestedModel) {
        const validation = await modelsService.validateModelAgainstCatalog(requestedModel);
        if (!validation.ok) {
          if (validation.status === 503) {
            res.status(503).json({ error: validation.reason, detail: "gateway models.list unavailable; cannot validate model id" });
          } else {
            res.status(400).json({ error: validation.reason, detail: `model "${requestedModel}" not in current allowed catalog` });
          }
          return;
        }
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
      if (requestedModel && created?.agentId) {
        try {
          await callGateway("agents.update", {
            agentId: created.agentId,
            model: requestedModel,
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

  router.patch("/agents/:name", requirePerm("agents.manage"), async (req: Request, res: Response) => {
    try {
      const name = req.params.name as string;
      const updates = (req.body ?? {}) as Record<string, unknown>;
      if ("model" in updates) {
        const m = updates.model;
        if (typeof m !== "string" || !m.trim()) {
          res.status(400).json({ error: "invalid_model_id", detail: "model must be a non-empty string" });
          return;
        }
        const validation = await modelsService.validateModelAgainstCatalog(m.trim());
        if (!validation.ok) {
          if (validation.status === 503) {
            res.status(503).json({ error: validation.reason, detail: "gateway models.list unavailable; cannot validate model id" });
          } else {
            res.status(400).json({ error: validation.reason, detail: `model "${m}" not in current allowed catalog` });
          }
          return;
        }
        updates.model = m.trim();
      }
      const result = await callGateway("agents.update", { name, ...updates });
      res.json(result);
    } catch (err: any) {
      res.status(502).json({ error: err.message || "Failed to update agent" });
    }
  });

  router.delete("/agents/:name", requirePerm("agents.manage"), async (req: Request, res: Response) => {
    try {
      const name = req.params.name as string;
      const result = await callGateway("agents.delete", { name });
      res.json(result);
    } catch (err: any) {
      res.status(502).json({ error: err.message || "Failed to delete agent" });
    }
  });

  return router;
}
