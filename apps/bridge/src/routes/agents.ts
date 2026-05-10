import { Router, type Router as ExpressRouter, type Request, type Response } from "express";
import { requirePerm } from "../auth-middleware.js";
import { createAgentModelsService, type CallGateway } from "../services/agent-models.js";
import type { RuntimeRegistry } from "../services/runtimes/registry.js";
import type { RuntimeConfigService } from "../services/runtime-config.js";
import {
  resolveRuntimeForCatalog,
  resolveRuntimeForCreate,
  requireCapability,
  UnsupportedCapabilityError,
  UnknownRuntimeError,
  NoRuntimeAvailableError,
} from "../services/runtime-resolver.js";
import {
  runtimeActionSchemas,
  InvalidActionPayloadError,
} from "../services/runtime-action-schemas.js";
import type { ActorAssertionRef, RuntimeActionContext } from "@openclaw-manager/types";

export type AgentsRouterDeps = {
  callGateway: CallGateway;
  registry: RuntimeRegistry;
  runtimeConfig: RuntimeConfigService;
  managerServiceId?: string;
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

function invalidPayloadResponse(res: Response, e: InvalidActionPayloadError): void {
  res.status(422).json({
    ok: false,
    error: {
      code: "INVALID_PAYLOAD",
      action: e.action,
      fieldErrors: e.fieldErrors,
      message: e.message,
    },
  });
}

function buildActor(req: Request, managerServiceId: string): ActorAssertionRef {
  return {
    humanActorUserId: ((req as any).auth?.user?.id as string) ?? "unknown",
    managerServiceId,
    basis: "service-principal",
  };
}

export function createAgentsRouter(deps: AgentsRouterDeps): ExpressRouter {
  const router: ExpressRouter = Router();
  const { callGateway, registry, runtimeConfig, managerServiceId = "bridge-primary" } = deps;
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
    // 1. Resolve runtime (body.runtimeId > query.runtimeId > primary).
    let resolved;
    try {
      resolved = await resolveRuntimeForCreate(req, registry, runtimeConfig);
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

    // 2. Capability gate.
    try {
      await requireCapability(adapter, "agents.create", resolved.runtimeId);
    } catch (e) {
      if (e instanceof UnsupportedCapabilityError) {
        unsupportedCapabilityResponse(res, e);
        return;
      }
      res.status(502).json({ error: (e as Error).message });
      return;
    }

    // 3. Validate the typed payload via the runtime-action schema.
    // The wire shape sends `name` + `workspace` + optional `emoji`/`avatar`/`model`.
    // We intentionally drop `runtimeId` from the body before validation since
    // the schema does not declare it (it has already been consumed by the
    // resolver above).
    const { name, workspace, emoji, avatar, model } = req.body ?? {};
    let validated: import("@openclaw-manager/types").RuntimeActionPayload["agents.create"];
    try {
      validated = runtimeActionSchemas["agents.create"]({ name, workspace, emoji, avatar, model });
    } catch (e) {
      if (e instanceof InvalidActionPayloadError) {
        invalidPayloadResponse(res, e);
        return;
      }
      throw e;
    }

    // 4. Bridge-side model validation (kept here because it queries the runtime
    //    catalog and reuses validateModelAgainstCatalog's response shape — not a
    //    runtime adapter concern).
    const requestedModel = validated.model?.trim() ?? "";
    if (requestedModel) {
      const validation = await modelsService.validateModelAgainstCatalog(
        requestedModel,
        { runtimeId: resolved.runtimeId },
      );
      if (!validation.ok) {
        if (validation.status === 503) {
          res.status(503).json({ error: validation.reason, detail: "gateway models.list unavailable; cannot validate model id" });
        } else {
          res.status(400).json({ error: validation.reason, detail: `model "${requestedModel}" not in current allowed catalog` });
        }
        return;
      }
    }

    // 5. Dispatch through the adapter. Strip the `model` field — the adapter's
    //    agents.create maps to gateway `agents.create` which historically does
    //    NOT accept `model`. Model is set via a follow-up `agents.update`.
    const context: RuntimeActionContext = { actor: buildActor(req, managerServiceId) };
    const createPayload: import("@openclaw-manager/types").RuntimeActionPayload["agents.create"] = {
      name: validated.name,
      workspace: validated.workspace,
    };
    if (validated.emoji) createPayload.emoji = validated.emoji;
    if (validated.avatar) createPayload.avatar = validated.avatar;

    let createResult;
    try {
      createResult = await adapter.invokeAction("agents.create", createPayload, context);
    } catch (err: any) {
      res.status(502).json({ error: err.message || "Failed to create agent" });
      return;
    }
    if (!createResult.ok) {
      res.status(502).json({ error: createResult.error });
      return;
    }
    const created = createResult.nativeResult as
      | { ok?: boolean; agentId?: string; name?: string; workspace?: string }
      | null;

    // 6. If model was requested, fire follow-up agents.update via the same adapter.
    if (requestedModel && created?.agentId) {
      const updateContext: RuntimeActionContext = {
        actor: buildActor(req, managerServiceId),
        resourceRuntimeId: resolved.runtimeId,
      };
      try {
        const updateResult = await adapter.invokeAction(
          "agents.update",
          { name: created.agentId, updates: { model: requestedModel } },
          updateContext,
        );
        if (!updateResult.ok) {
          res.status(201).json({
            ...created,
            warning: `created but failed to set model: ${updateResult.error}`,
          });
          return;
        }
      } catch (updateErr: any) {
        res.status(201).json({
          ...created,
          warning: `created but failed to set model: ${updateErr?.message || "update failed"}`,
        });
        return;
      }
    }
    res.status(201).json(created);
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
    // Agents are runtime-owned (no local bridge index of their runtimeId), so
    // we resolve via catalog rules: ?runtimeId=foo wins, else primary. The
    // resource-runtime-override mismatch case (400 INVALID_RUNTIME_OVERRIDE)
    // does not apply here because the resource has no bridge-stored
    // runtimeId — see plan Phase C.1 "treat as catalog mutation with override".
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
      await requireCapability(adapter, "agents.update", resolved.runtimeId);
    } catch (e) {
      if (e instanceof UnsupportedCapabilityError) {
        unsupportedCapabilityResponse(res, e);
        return;
      }
      res.status(502).json({ error: (e as Error).message });
      return;
    }

    const name = req.params.name as string;
    const updates = { ...(req.body ?? {}) } as Record<string, unknown>;
    // Strip routing fields that the dashboard may include in the body.
    delete updates.runtimeId;
    if ("model" in updates) {
      const m = updates.model;
      if (typeof m !== "string" || !m.trim()) {
        res.status(400).json({ error: "invalid_model_id", detail: "model must be a non-empty string" });
        return;
      }
      const validation = await modelsService.validateModelAgainstCatalog(
        m.trim(),
        { runtimeId: resolved.runtimeId },
      );
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

    let validated: import("@openclaw-manager/types").RuntimeActionPayload["agents.update"];
    try {
      validated = runtimeActionSchemas["agents.update"]({ name, updates });
    } catch (e) {
      if (e instanceof InvalidActionPayloadError) {
        invalidPayloadResponse(res, e);
        return;
      }
      throw e;
    }

    const context: RuntimeActionContext = {
      actor: buildActor(req, managerServiceId),
      resourceRuntimeId: resolved.runtimeId,
    };
    try {
      const result = await adapter.invokeAction("agents.update", validated, context);
      if (!result.ok) {
        res.status(502).json({ error: result.error });
        return;
      }
      res.json(result.nativeResult ?? {});
    } catch (err: any) {
      res.status(502).json({ error: err.message || "Failed to update agent" });
    }
  });

  router.delete("/agents/:name", requirePerm("agents.manage"), async (req: Request, res: Response) => {
    // See PATCH note above on resolver choice.
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
      await requireCapability(adapter, "agents.delete", resolved.runtimeId);
    } catch (e) {
      if (e instanceof UnsupportedCapabilityError) {
        unsupportedCapabilityResponse(res, e);
        return;
      }
      res.status(502).json({ error: (e as Error).message });
      return;
    }

    const name = req.params.name as string;
    let validated: import("@openclaw-manager/types").RuntimeActionPayload["agents.delete"];
    try {
      validated = runtimeActionSchemas["agents.delete"]({ name });
    } catch (e) {
      if (e instanceof InvalidActionPayloadError) {
        invalidPayloadResponse(res, e);
        return;
      }
      throw e;
    }

    const context: RuntimeActionContext = {
      actor: buildActor(req, managerServiceId),
      resourceRuntimeId: resolved.runtimeId,
    };
    try {
      const result = await adapter.invokeAction("agents.delete", validated, context);
      if (!result.ok) {
        res.status(502).json({ error: result.error });
        return;
      }
      res.json(result.nativeResult ?? {});
    } catch (err: any) {
      res.status(502).json({ error: err.message || "Failed to delete agent" });
    }
  });

  // callGateway is retained in deps for the agent-models service. After this
  // migration, agents.ts itself no longer calls it directly. Suppress unused.
  void callGateway;

  return router;
}
