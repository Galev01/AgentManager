import { Router, type Router as ExpressRouter } from "express";
import { createAgentModelsService, type CallGateway } from "../services/agent-models.js";
import type { RuntimeRegistry } from "../services/runtimes/registry.js";
import type { RuntimeConfigService } from "../services/runtime-config.js";

export type AgentModelsRouterDeps = {
  callGateway: CallGateway;
  registry: RuntimeRegistry;
  runtimeConfig: RuntimeConfigService;
};

export function createAgentModelsRouter(deps: AgentModelsRouterDeps): ExpressRouter {
  const r: ExpressRouter = Router();
  const service = createAgentModelsService({
    callGateway: deps.callGateway,
    registry: deps.registry,
    runtimeConfig: deps.runtimeConfig,
  });

  r.get("/agent-models", async (_req, res) => {
    res.json(await service.readSnapshot());
  });

  return r;
}
