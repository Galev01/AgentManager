import { Router, type Router as ExpressRouter, type Request, type Response } from "express";
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
import type { ActorAssertionRef, RuntimeActionContext } from "@openclaw-manager/types";

export type CallGateway = (method: string, params?: Record<string, unknown>) => Promise<unknown>;

export type ToolsRouterDeps = {
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

export function createToolsRouter(deps: ToolsRouterDeps): ExpressRouter {
  const router: ExpressRouter = Router();
  const { callGateway, registry, runtimeConfig, managerServiceId = "bridge-primary" } = deps;

  router.get("/tools/catalog", async (req: Request, res: Response) => {
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
      await requireCapability(adapter, "tools.list", resolved.runtimeId);
    } catch (e) {
      if (e instanceof UnsupportedCapabilityError) {
        unsupportedCapabilityResponse(res, e);
        return;
      }
      res.status(502).json({ error: (e as Error).message });
      return;
    }

    try {
      const entities = await adapter.listEntities("tool");
      const items = entities.map((e) =>
        e.nativeRef && typeof e.nativeRef === "object" && !Array.isArray(e.nativeRef)
          ? (e.nativeRef as Record<string, unknown>)
          : { id: e.entityId, label: e.displayName },
      );
      // Dashboard's getToolsCatalog uses Array.isArray check — keep bare array
      // shape to preserve existing contract.
      res.json(items);
    } catch (err: any) {
      res.status(502).json({ error: err.message || "Failed to get catalog" });
    }
  });

  router.get("/tools/effective", async (req: Request, res: Response) => {
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
      await requireCapability(adapter, "tools.effective", resolved.runtimeId);
    } catch (e) {
      if (e instanceof UnsupportedCapabilityError) {
        unsupportedCapabilityResponse(res, e);
        return;
      }
      res.status(502).json({ error: (e as Error).message });
      return;
    }

    if (!adapter.read) {
      res.status(409).json({
        ok: false,
        error: {
          code: "UNSUPPORTED_CAPABILITY",
          runtimeId: resolved.runtimeId,
          capabilityId: "tools.effective",
          reason: "adapter does not implement read",
          message: `Runtime '${resolved.runtimeId}' does not expose tools.effective`,
        },
      });
      return;
    }

    try {
      const result = await adapter.read("tools.effective", {});
      res.json(result);
    } catch (err: any) {
      res.status(502).json({ error: err.message || "Failed to get effective tools" });
    }
  });

  router.get("/skills", async (req: Request, res: Response) => {
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
      await requireCapability(adapter, "skills.list", resolved.runtimeId);
    } catch (e) {
      if (e instanceof UnsupportedCapabilityError) {
        unsupportedCapabilityResponse(res, e);
        return;
      }
      res.status(502).json({ error: (e as Error).message });
      return;
    }

    try {
      const entities = await adapter.listEntities("skill");
      // Dashboard's getSkills uses Array.isArray check — keep bare array shape.
      const items = entities.map((e) =>
        e.nativeRef && typeof e.nativeRef === "object" && !Array.isArray(e.nativeRef)
          ? (e.nativeRef as Record<string, unknown>)
          : { id: e.entityId, name: e.displayName },
      );
      res.json(items);
    } catch (err: any) {
      res.status(502).json({ error: err.message || "Failed to get skills" });
    }
  });

  router.post("/skills/install", async (req: Request, res: Response) => {
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

    try {
      await requireCapability(adapter, "skills.install", resolved.runtimeId);
    } catch (e) {
      if (e instanceof UnsupportedCapabilityError) {
        unsupportedCapabilityResponse(res, e);
        return;
      }
      res.status(502).json({ error: (e as Error).message });
      return;
    }

    const { name } = req.body;
    if (typeof name !== "string" || !name.trim()) {
      res.status(400).json({ error: "name is required" });
      return;
    }

    // Actor is bridge-stamped; humanActorUserId comes from req.auth, populated
    // upstream by actorAssertionAuth middleware. managerServiceId is a
    // deployment constant. Mirrors the pattern in runtimes.ts.
    const actor: ActorAssertionRef = {
      humanActorUserId: (req as any).auth?.user?.id ?? "unknown",
      managerServiceId,
      basis: "service-principal",
    };
    const context: RuntimeActionContext = { actor };

    try {
      const result = await adapter.invokeAction("skills.install", { ref: name.trim() }, context);
      if (!result.ok) {
        res.status(502).json({ error: result.error });
        return;
      }
      res.json(result.nativeResult);
    } catch (err: any) {
      res.status(502).json({ error: err.message || "Failed to install skill" });
    }
  });

  // callGateway is retained in deps for other routes that may still use it
  // during the migration. The variable is intentionally unused here after
  // migration of all three endpoints; suppress the lint-unused warning.
  void callGateway;

  return router;
}
