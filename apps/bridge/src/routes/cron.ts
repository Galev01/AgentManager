import { Router, type Router as ExpressRouter, type Request, type Response } from "express";
import type { RuntimeRegistry } from "../services/runtimes/registry.js";
import type { RuntimeConfigService } from "../services/runtime-config.js";
import {
  resolveRuntimeForCatalog,
  requireCapability,
  UnsupportedCapabilityError,
  UnknownRuntimeError,
  NoRuntimeAvailableError,
} from "../services/runtime-resolver.js";

export type CallGateway = (method: string, params?: Record<string, unknown>) => Promise<unknown>;

export type CronRouterDeps = {
  callGateway: CallGateway;
  registry: RuntimeRegistry;
  runtimeConfig: RuntimeConfigService;
};

function unsupportedCapabilityResponse(res: Response, e: UnsupportedCapabilityError): void {
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
}

export function createCronRouter(deps: CronRouterDeps): ExpressRouter {
  const router: ExpressRouter = Router();
  const { callGateway, registry, runtimeConfig } = deps;

  router.get("/cron", async (req: Request, res: Response) => {
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
      await requireCapability(adapter, "cron.list", resolved.runtimeId);
    } catch (e) {
      if (e instanceof UnsupportedCapabilityError) {
        unsupportedCapabilityResponse(res, e);
        return;
      }
      res.status(502).json({ error: (e as Error).message });
      return;
    }

    try {
      const entities = await adapter.listEntities("cron");
      const items = entities.map((e) =>
        e.nativeRef && typeof e.nativeRef === "object" && !Array.isArray(e.nativeRef)
          ? (e.nativeRef as Record<string, unknown>)
          : { id: e.entityId, name: e.displayName },
      );
      // Dashboard's listCronJobs expects bare array; preserve.
      res.json(items);
    } catch (err: any) {
      res.status(502).json({ error: err.message || "Failed to list cron jobs" });
    }
  });

  router.post("/cron", async (req: Request, res: Response) => {
    try {
      const { schedule, command, agentName, name } = req.body;
      if (typeof schedule !== "string" || !schedule.trim()) {
        res.status(400).json({ error: "schedule is required" }); return;
      }
      const params: Record<string, unknown> = { schedule: schedule.trim() };
      if (typeof command === "string") params.command = command;
      if (typeof agentName === "string") params.agent = agentName;
      if (typeof name === "string") params.name = name;
      res.status(201).json(await callGateway("cron.add", params));
    } catch (err: any) { res.status(502).json({ error: err.message || "Failed to add cron job" }); }
  });

  router.get("/cron/:id/status", async (req: Request, res: Response) => {
    try { res.json(await callGateway("cron.status", { id: req.params.id as string })); }
    catch (err: any) { res.status(502).json({ error: err.message || "Failed to get status" }); }
  });

  router.post("/cron/:id/run", async (req: Request, res: Response) => {
    try { res.json(await callGateway("cron.run", { id: req.params.id as string })); }
    catch (err: any) { res.status(502).json({ error: err.message || "Failed to run job" }); }
  });

  router.delete("/cron/:id", async (req: Request, res: Response) => {
    try { res.json(await callGateway("cron.remove", { id: req.params.id as string })); }
    catch (err: any) { res.status(502).json({ error: err.message || "Failed to remove job" }); }
  });

  return router;
}
