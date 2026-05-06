import { Router, type Router as ExpressRouter } from "express";
import { createAgentModelsService, type CallGateway } from "../services/agent-models.js";

export type AgentModelsRouterDeps = { callGateway: CallGateway };

export function createAgentModelsRouter(deps: AgentModelsRouterDeps): ExpressRouter {
  const r: ExpressRouter = Router();
  const service = createAgentModelsService({ callGateway: deps.callGateway });

  r.get("/agent-models", async (_req, res) => {
    res.json(await service.readSnapshot());
  });

  return r;
}
