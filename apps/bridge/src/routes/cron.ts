import { Router, type Router as ExpressRouter, type Request, type Response } from "express";
import type { RuntimeRegistry } from "../services/runtimes/registry.js";
import type { RuntimeConfigService } from "../services/runtime-config.js";
import {
  resolveRuntimeForCatalog,
  resolveRuntimeForCreate,
  resolveRuntimeForResource,
  requireCapability,
  UnsupportedCapabilityError,
  UnknownRuntimeError,
  NoRuntimeAvailableError,
  InvalidRuntimeOverrideError,
} from "../services/runtime-resolver.js";
import type { ActorAssertionRef, RuntimeActionContext } from "@openclaw-manager/types";
import type { CronStore } from "../services/cron-store.js";

export type CallGateway = (method: string, params?: Record<string, unknown>) => Promise<unknown>;

/**
 * No-op in-memory cron-store used as default when no persistent store is
 * wired by the coordinator. Maintains back-compat with existing server.ts
 * callers until the coordinator passes a real store.
 */
const noopCronStore: CronStore = {
  async remember() { /* no-op */ },
  async lookup() { return null; },
  async forget() { /* no-op */ },
  async list() { return []; },
};

export type CronRouterDeps = {
  callGateway: CallGateway;
  registry: RuntimeRegistry;
  runtimeConfig: RuntimeConfigService;
  /**
   * Persistent store mapping cron job id → runtimeId. Required for correct
   * runtime-aware dispatch on existing-resource operations. Defaults to an
   * in-memory no-op so existing server.ts wiring continues to compile until
   * the coordinator passes a real store.
   */
  cronStore?: CronStore;
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

export function createCronRouter(deps: CronRouterDeps): ExpressRouter {
  const router: ExpressRouter = Router();
  const {
    registry,
    runtimeConfig,
    cronStore = noopCronStore,
    managerServiceId = "bridge-primary",
  } = deps;

  // ---------------------------------------------------------------------------
  // Resource resolution helper for existing-resource endpoints (status/run/delete).
  // If the job is in the cron-store its stored runtimeId wins. If not (pre-existing
  // jobs without a store entry), falls back to the primary runtime for back-compat.
  // ---------------------------------------------------------------------------

  async function resolveCronResource(
    req: Request,
    id: string,
  ): Promise<{ runtimeId: string } | { error: { status: number; body: unknown } }> {
    const stored = await cronStore.lookup(id);

    if (!stored) {
      // Back-compat: pre-existing jobs without store entry. Fall back to primary.
      try {
        const resolved = await resolveRuntimeForCatalog(req, registry, runtimeConfig);
        return { runtimeId: resolved.runtimeId };
      } catch (e) {
        if (e instanceof NoRuntimeAvailableError) {
          return { error: { status: 503, body: { error: "no_runtime_available" } } };
        }
        return { error: { status: 500, body: { error: (e as Error).message } } };
      }
    }

    // Stored runtimeId wins; query override that mismatches → 400.
    try {
      const { runtimeId } = resolveRuntimeForResource(
        { runtimeId: stored.runtimeId },
        req.query as { runtimeId?: unknown },
      );
      return { runtimeId };
    } catch (e) {
      if (e instanceof InvalidRuntimeOverrideError) {
        return {
          error: {
            status: 400,
            body: {
              error: "invalid_runtime_override",
              message: e.message,
              stored: e.resourceRuntimeId,
              attempted: e.attempted,
            },
          },
        };
      }
      return { error: { status: 500, body: { error: (e as Error).message } } };
    }
  }

  // ---------------------------------------------------------------------------
  // GET /cron — list cron jobs (already migrated in Task 5)
  // ---------------------------------------------------------------------------

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

  // ---------------------------------------------------------------------------
  // POST /cron — create a new cron job (migrated in Task 6)
  // ---------------------------------------------------------------------------

  router.post("/cron", async (req: Request, res: Response) => {
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
      await requireCapability(adapter, "cron.write", resolved.runtimeId);
    } catch (e) {
      if (e instanceof UnsupportedCapabilityError) {
        unsupportedCapabilityResponse(res, e);
        return;
      }
      res.status(502).json({ error: (e as Error).message });
      return;
    }

    const { schedule, command, agentName, name, enabled } = req.body;
    if (typeof schedule !== "string" || !schedule.trim()) {
      res.status(400).json({ error: "schedule is required" });
      return;
    }

    const actor: ActorAssertionRef = {
      humanActorUserId: (req as any).auth?.user?.id ?? "unknown",
      managerServiceId,
      basis: "service-principal",
    };
    const context: RuntimeActionContext = { actor };

    const cron = schedule.trim();
    // Build a JSON-safe payload object (no undefined values).
    const cronPayload: Record<string, string> = {};
    if (typeof command === "string") cronPayload.command = command;
    if (typeof agentName === "string") cronPayload.agent = agentName;
    if (typeof name === "string") cronPayload.name = name;
    const spec = { cron, payload: cronPayload as import("@openclaw-manager/types").JsonValue, enabled: enabled !== false };

    try {
      const result = await adapter.invokeAction("cron.write", { spec }, context);
      if (!result.ok) {
        res.status(502).json({ error: result.error });
        return;
      }
      const native = result.nativeResult as Record<string, unknown> | null;
      const id =
        (typeof native?.id === "string" && native.id) ||
        (typeof native?.jobId === "string" && native.jobId) ||
        null;
      if (id) {
        await cronStore.remember({
          id,
          runtimeId: resolved.runtimeId,
          agentName: typeof agentName === "string" ? agentName : undefined,
        });
      }
      res.status(201).json(native ?? {});
    } catch (err: any) {
      res.status(502).json({ error: err.message || "Failed to add cron job" });
    }
  });

  // ---------------------------------------------------------------------------
  // GET /cron/:id/status — get job status (migrated in Task 6)
  // ---------------------------------------------------------------------------

  router.get("/cron/:id/status", async (req: Request, res: Response) => {
    const jobId = String(req.params["id"]);
    const r = await resolveCronResource(req, jobId);
    if ("error" in r) {
      res.status(r.error.status).json(r.error.body);
      return;
    }

    const adapter = await registry.adapter(r.runtimeId);
    if (!adapter) {
      res.status(404).json({ error: "runtime_not_found", runtimeId: r.runtimeId });
      return;
    }

    try {
      await requireCapability(adapter, "cron.status", r.runtimeId);
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
          runtimeId: r.runtimeId,
          capabilityId: "cron.status",
          reason: "adapter does not implement read",
          message: `Runtime '${r.runtimeId}' does not expose cron.status`,
        },
      });
      return;
    }

    try {
      const result = await adapter.read("cron.status", { id: jobId });
      res.json(result);
    } catch (err: any) {
      res.status(502).json({ error: err.message || "Failed to get status" });
    }
  });

  // ---------------------------------------------------------------------------
  // POST /cron/:id/run — trigger a job (migrated in Task 6)
  // ---------------------------------------------------------------------------

  router.post("/cron/:id/run", async (req: Request, res: Response) => {
    const jobId = String(req.params["id"]);
    const r = await resolveCronResource(req, jobId);
    if ("error" in r) {
      res.status(r.error.status).json(r.error.body);
      return;
    }

    const adapter = await registry.adapter(r.runtimeId);
    if (!adapter) {
      res.status(404).json({ error: "runtime_not_found", runtimeId: r.runtimeId });
      return;
    }

    try {
      await requireCapability(adapter, "cron.run", r.runtimeId);
    } catch (e) {
      if (e instanceof UnsupportedCapabilityError) {
        unsupportedCapabilityResponse(res, e);
        return;
      }
      res.status(502).json({ error: (e as Error).message });
      return;
    }

    const actor: ActorAssertionRef = {
      humanActorUserId: (req as any).auth?.user?.id ?? "unknown",
      managerServiceId,
      basis: "service-principal",
    };
    const context: RuntimeActionContext = { actor };

    try {
      const result = await adapter.invokeAction("cron.run", { id: jobId }, context);
      if (!result.ok) {
        res.status(502).json({ error: result.error });
        return;
      }
      res.json(result.nativeResult ?? {});
    } catch (err: any) {
      res.status(502).json({ error: err.message || "Failed to run job" });
    }
  });

  // ---------------------------------------------------------------------------
  // DELETE /cron/:id — remove a job (migrated in Task 6)
  // ---------------------------------------------------------------------------

  router.delete("/cron/:id", async (req: Request, res: Response) => {
    const jobId = String(req.params["id"]);
    const r = await resolveCronResource(req, jobId);
    if ("error" in r) {
      res.status(r.error.status).json(r.error.body);
      return;
    }

    const adapter = await registry.adapter(r.runtimeId);
    if (!adapter) {
      res.status(404).json({ error: "runtime_not_found", runtimeId: r.runtimeId });
      return;
    }

    try {
      await requireCapability(adapter, "cron.delete", r.runtimeId);
    } catch (e) {
      if (e instanceof UnsupportedCapabilityError) {
        unsupportedCapabilityResponse(res, e);
        return;
      }
      res.status(502).json({ error: (e as Error).message });
      return;
    }

    const actor: ActorAssertionRef = {
      humanActorUserId: (req as any).auth?.user?.id ?? "unknown",
      managerServiceId,
      basis: "service-principal",
    };
    const context: RuntimeActionContext = { actor };

    try {
      const result = await adapter.invokeAction("cron.delete", { id: jobId }, context);
      if (!result.ok) {
        res.status(502).json({ error: result.error });
        return;
      }
      // Remove from cron-store on successful delete
      await cronStore.forget(jobId);
      res.json(result.nativeResult ?? {});
    } catch (err: any) {
      res.status(502).json({ error: err.message || "Failed to remove job" });
    }
  });

  return router;
}
