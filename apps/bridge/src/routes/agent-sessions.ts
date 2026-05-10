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

export type AgentSessionsRouterDeps = {
  callGateway: CallGateway;
  registry: RuntimeRegistry;
  runtimeConfig: RuntimeConfigService;
};

function normalizeSession(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const id =
    (typeof r.id === "string" && r.id) ||
    (typeof r.key === "string" && r.key) ||
    (typeof r.sessionId === "string" && r.sessionId) ||
    (typeof r.sessionKey === "string" && r.sessionKey) ||
    null;
  if (!id) return null;
  const agentName =
    (typeof r.agentName === "string" && r.agentName) ||
    (typeof r.agentId === "string" && r.agentId) ||
    undefined;
  return { ...r, id, ...(agentName ? { agentName } : {}) };
}

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

export function createAgentSessionsRouter(deps: AgentSessionsRouterDeps): ExpressRouter {
  const router: ExpressRouter = Router();
  const { callGateway, registry, runtimeConfig } = deps;

  router.get("/agent-sessions", async (req: Request, res: Response) => {
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
      await requireCapability(adapter, "sessions.list", resolved.runtimeId);
    } catch (e) {
      if (e instanceof UnsupportedCapabilityError) {
        unsupportedCapabilityResponse(res, e);
        return;
      }
      res.status(502).json({ error: (e as Error).message });
      return;
    }

    try {
      const entities = await adapter.listEntities("session");
      const items = entities
        .map((e) => {
          // Prefer the verbatim runtime payload when present so legacy fields
          // (agentName, status, lastActivityAt, etc.) survive end-to-end.
          if (e.nativeRef && typeof e.nativeRef === "object" && !Array.isArray(e.nativeRef)) {
            return normalizeSession(e.nativeRef);
          }
          return normalizeSession({ id: e.entityId, agentName: e.nativeType, lastActivityAt: e.lastActivityAt });
        })
        .filter((s): s is Record<string, unknown> => s !== null);
      // Preserve historical bare-array wire shape for dashboard compatibility.
      res.json(items);
    } catch (err: any) {
      res.status(502).json({ error: err.message || "Failed to list sessions" });
    }
  });

  router.get("/agent-sessions/:id", async (req: Request, res: Response) => {
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
      await requireCapability(adapter, "sessions.read", resolved.runtimeId);
    } catch (e) {
      if (e instanceof UnsupportedCapabilityError) {
        unsupportedCapabilityResponse(res, e);
        return;
      }
      res.status(502).json({ error: (e as Error).message });
      return;
    }

    try {
      const id = req.params.id as string;
      const entity = await adapter.getEntity("session", id);
      if (!entity) {
        res.status(404).json({ error: "session_not_found", id });
        return;
      }
      const item = entity.nativeRef && typeof entity.nativeRef === "object" && !Array.isArray(entity.nativeRef)
        ? (entity.nativeRef as Record<string, unknown>)
        : { id: entity.entityId };
      res.json({ ...item, runtimeId: resolved.runtimeId, source: resolved.source });
    } catch (err: any) {
      res.status(502).json({ error: err.message || "Failed to read session" });
    }
  });

  router.post("/agent-sessions", async (req: Request, res: Response) => {
    try {
      const { agentName } = req.body;
      const params: Record<string, unknown> = {};
      if (typeof agentName === "string") params.agent = agentName.trim();
      const raw = await callGateway("sessions.create", params);
      const normalized = normalizeSession(raw);
      if (!normalized) {
        console.warn(
          "[agent-sessions] sessions.create returned no usable id:",
          JSON.stringify(raw),
        );
        res
          .status(502)
          .json({ error: "Gateway did not return a session id", raw });
        return;
      }
      res.status(201).json(normalized);
    } catch (err: any) {
      res.status(502).json({ error: err.message || "Failed to create session" });
    }
  });

  router.post("/agent-sessions/:id/send", async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      const { message } = req.body;
      if (typeof message !== "string" || !message.trim()) {
        res.status(400).json({ error: "message is required" });
        return;
      }
      const result = await callGateway("sessions.send", { session: id, message: message.trim() });
      res.json(result);
    } catch (err: any) {
      res.status(502).json({ error: err.message || "Failed to send message" });
    }
  });

  router.get("/agent-sessions/:id/usage", async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      const result = await callGateway("sessions.usage", { session: id });
      res.json(result);
    } catch (err: any) {
      res.status(502).json({ error: err.message || "Failed to get usage" });
    }
  });

  router.post("/agent-sessions/:id/reset", async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      const result = await callGateway("sessions.reset", { session: id });
      res.json(result);
    } catch (err: any) {
      res.status(502).json({ error: err.message || "Failed to reset session" });
    }
  });

  router.post("/agent-sessions/:id/abort", async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      const result = await callGateway("sessions.abort", { session: id });
      res.json(result);
    } catch (err: any) {
      res.status(502).json({ error: err.message || "Failed to abort session" });
    }
  });

  router.post("/agent-sessions/:id/compact", async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      const result = await callGateway("sessions.compact", { session: id });
      res.json(result);
    } catch (err: any) {
      res.status(502).json({ error: err.message || "Failed to compact session" });
    }
  });

  router.delete("/agent-sessions/:id", async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      const result = await callGateway("sessions.delete", { session: id });
      res.json(result);
    } catch (err: any) {
      res.status(502).json({ error: err.message || "Failed to delete session" });
    }
  });

  return router;
}
