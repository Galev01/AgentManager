import { Router, type Router as ExpressRouter } from "express";
import { createAgentModelsService, type CallGateway } from "../services/agent-models.js";

export type ModelsRouterDeps = { callGateway: CallGateway };

export function createModelsRouter(deps: ModelsRouterDeps): ExpressRouter {
  const r: ExpressRouter = Router();
  const service = createAgentModelsService({ callGateway: deps.callGateway });

  r.get("/models", async (_req, res) => {
    const result = await service.readCatalog();
    res.json(result);
  });

  return r;
}
