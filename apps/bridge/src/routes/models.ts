import { Router, type Router as ExpressRouter, type Request, type Response } from "express";
import { createAgentModelsService, type CallGateway } from "../services/agent-models.js";
import type { RuntimeRegistry } from "../services/runtimes/registry.js";
import type { RuntimeConfigService } from "../services/runtime-config.js";
import {
  resolveRuntimeForCatalog,
  requireCapability,
  UnsupportedCapabilityError,
  UnknownRuntimeError,
  NoRuntimeAvailableError,
} from "../services/runtime-resolver.js";

export type ModelsRouterDeps = {
  callGateway: CallGateway;
  registry: RuntimeRegistry;
  runtimeConfig: RuntimeConfigService;
};

export function createModelsRouter(deps: ModelsRouterDeps): ExpressRouter {
  const r: ExpressRouter = Router();
  const { callGateway, registry, runtimeConfig } = deps;
  const service = createAgentModelsService({ callGateway, registry, runtimeConfig });

  r.get("/models", async (req: Request, res: Response) => {
    let resolved;
    try {
      resolved = await resolveRuntimeForCatalog(req, registry, runtimeConfig);
    } catch (e) {
      if (e instanceof UnknownRuntimeError) {
        res.status(404).json({ error: "runtime_not_found", runtimeId: e.runtimeId });
        return;
      }
      if (e instanceof NoRuntimeAvailableError) {
        res.status(503).json({ error: "no_runtime_available" });
        return;
      }
      res.status(500).json({ error: (e as Error).message });
      return;
    }

    const adapter = await registry.adapter(resolved.runtimeId);
    if (!adapter) {
      res.status(404).json({ error: "runtime_not_found", runtimeId: resolved.runtimeId });
      return;
    }

    try {
      await requireCapability(adapter, "models.list", resolved.runtimeId);
    } catch (e) {
      if (e instanceof UnsupportedCapabilityError) {
        res.status(409).json({
          ok: false,
          error: {
            code: "UNSUPPORTED_CAPABILITY",
            runtimeId: e.runtimeId,
            capabilityId: e.capabilityId,
            reason: e.reason,
            message: e.message,
          },
        });
        return;
      }
      res.status(502).json({ error: (e as Error).message });
      return;
    }

    // The service already projects entities through the adapter when registry is
    // wired. Preserve historical wire shape: { models, status, runtimeId, source }.
    const result = await service.readCatalog({ runtimeId: resolved.runtimeId });
    res.json({ ...result, runtimeId: resolved.runtimeId, source: resolved.source });
  });

  return r;
}
