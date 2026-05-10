import { Router, type Router as ExpressRouter, type Request, type Response } from "express";
import { requirePerm } from "../auth-middleware.js";
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

export type AgentsRouterDeps = {
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

export function createAgentsRouter(deps: AgentsRouterDeps): ExpressRouter {
  const router: ExpressRouter = Router();
  const { callGateway, registry, runtimeConfig } = deps;
  const modelsService = createAgentModelsService({ callGateway, registry, runtimeConfig });

  router.get("/agents", async (req: Request, res: Response) => {
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

    let partialMeta: Awaited<ReturnType<typeof requireCapability>>["partial"];
    try {
      const out = await requireCapability(adapter, "agents.list", resolved.runtimeId);
      partialMeta = out.partial;
    } catch (e) {
      if (e instanceof UnsupportedCapabilityError) {
        unsupportedCapabilityResponse(res, e);
        return;
      }
      res.status(502).json({ error: (e as Error).message });
      return;
    }

    try {
      const entities = await adapter.listEntities("agent");
      // Preserve historical wire shape: { agents: [...] } from gateway-style response.
      // Project entity.nativeRef when present (raw runtime shape), else fall back
      // to a minimal projection.
      const agents = entities.map((e) =>
        e.nativeRef && typeof e.nativeRef === "object" && !Array.isArray(e.nativeRef)
          ? (e.nativeRef as Record<string, unknown>)
          : { id: e.entityId, name: e.displayName },
      );
      const body: Record<string, unknown> = {
        agents,
        runtimeId: resolved.runtimeId,
        source: resolved.source,
      };
      if (partialMeta) body.partial = partialMeta;
      res.json(body);
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

    let partialMeta: Awaited<ReturnType<typeof requireCapability>>["partial"];
    try {
      const out = await requireCapability(adapter, "agents.read", resolved.runtimeId);
      partialMeta = out.partial;
    } catch (e) {
      if (e instanceof UnsupportedCapabilityError) {
        unsupportedCapabilityResponse(res, e);
        return;
      }
      res.status(502).json({ error: (e as Error).message });
      return;
    }

    try {
      const name = req.params.name as string;
      const entity = await adapter.getEntity("agent", name);
      if (!entity) {
        res.status(404).json({ error: "agent_not_found", name });
        return;
      }
      const item = entity.nativeRef && typeof entity.nativeRef === "object" && !Array.isArray(entity.nativeRef)
        ? (entity.nativeRef as Record<string, unknown>)
        : { id: entity.entityId, name: entity.displayName };
      const body: Record<string, unknown> = {
        ...item,
        runtimeId: resolved.runtimeId,
        source: resolved.source,
      };
      if (partialMeta) body.partial = partialMeta;
      res.json(body);
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
