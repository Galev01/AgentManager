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
import type { AgentSessionsIndex } from "../services/agent-sessions-index.js";

export type CallGateway = (method: string, params?: Record<string, unknown>) => Promise<unknown>;

/**
 * No-op in-memory agent-sessions-index used as default when no persistent
 * index is wired by the coordinator. Maintains back-compat with existing
 * server.ts callers until the coordinator passes a real index.
 */
const noopAgentSessionsIndex: AgentSessionsIndex = {
  async remember() { /* no-op */ },
  async lookup() { return null; },
  async forget() { /* no-op */ },
  async list() { return []; },
};

export type AgentSessionsRouterDeps = {
  callGateway: CallGateway;
  registry: RuntimeRegistry;
  runtimeConfig: RuntimeConfigService;
  /**
   * Persistent index mapping session id → runtimeId. Required for correct
   * runtime-aware dispatch on existing-resource operations. Defaults to an
   * in-memory no-op so existing server.ts wiring continues to compile until
   * the coordinator passes a real index.
   */
  agentSessionsIndex?: AgentSessionsIndex;
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

function buildActor(req: Request): ActorAssertionRef {
  return {
    humanActorUserId: ((req as any).auth?.user?.id as string) ?? "unknown",
    managerServiceId: "bridge",
    basis: "service-principal",
  };
}

export function createAgentSessionsRouter(deps: AgentSessionsRouterDeps): ExpressRouter {
  const router: ExpressRouter = Router();
  const {
    registry,
    runtimeConfig,
    agentSessionsIndex = noopAgentSessionsIndex,
  } = deps;

  // ---------------------------------------------------------------------------
  // Resource resolution helper for existing-resource endpoints.
  // If the session is in the index its stored runtimeId wins. If not (sessions
  // created before the index existed), falls back to primary for back-compat.
  // ---------------------------------------------------------------------------

  async function resolveAgentSessionResource(
    req: Request,
    id: string,
  ): Promise<{ runtimeId: string } | { error: { status: number; body: unknown } }> {
    const stored = await agentSessionsIndex.lookup(id);

    if (!stored) {
      // Back-compat: pre-existing sessions without index entry. Fall back to primary.
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
  // GET /agent-sessions — list sessions
  // ---------------------------------------------------------------------------

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

  // ---------------------------------------------------------------------------
  // GET /agent-sessions/:id — read a single session
  // ---------------------------------------------------------------------------

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

  // ---------------------------------------------------------------------------
  // POST /agent-sessions — create a new session
  // ---------------------------------------------------------------------------

  router.post("/agent-sessions", async (req: Request, res: Response) => {
    let resolved;
    try {
      resolved = await resolveRuntimeForCreate(req, registry, runtimeConfig);
    } catch (e) {
      if (e instanceof UnknownRuntimeError) {
        res.status(404).json({ error: "runtime_not_found", runtimeId: (e as UnknownRuntimeError).runtimeId });
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
      await requireCapability(adapter, "sessions.create", resolved.runtimeId);
    } catch (e) {
      if (e instanceof UnsupportedCapabilityError) {
        unsupportedCapabilityResponse(res, e);
        return;
      }
      res.status(502).json({ error: (e as Error).message });
      return;
    }

    const agentName = typeof req.body?.agentName === "string" ? req.body.agentName.trim() : undefined;
    const context: RuntimeActionContext = { actor: buildActor(req) };

    try {
      const result = await adapter.invokeAction(
        "sessions.create",
        { agentName },
        context,
      );
      if (!result.ok) {
        res.status(502).json({ error: result.error });
        return;
      }
      const native = (result.nativeResult ?? {}) as Record<string, unknown>;
      // Normalize id from common gateway shapes (id | sessionId | key | sessionKey).
      const id =
        (typeof native.id === "string" && native.id) ||
        (typeof (native as any).sessionId === "string" && (native as any).sessionId) ||
        (typeof (native as any).key === "string" && (native as any).key) ||
        (typeof (native as any).sessionKey === "string" && (native as any).sessionKey) ||
        null;
      if (!id) {
        res.status(502).json({ error: "Adapter did not return a session id", raw: native });
        return;
      }
      await agentSessionsIndex.remember({ id, runtimeId: resolved.runtimeId, agentName });
      // Preserve historical wire shape: send the normalized session object back.
      const normalized = normalizeSession(native);
      res.status(201).json(normalized ?? { id });
    } catch (err: any) {
      res.status(502).json({ error: err.message || "Failed to create session" });
    }
  });

  // ---------------------------------------------------------------------------
  // POST /agent-sessions/:id/send — send a message
  // ---------------------------------------------------------------------------

  router.post("/agent-sessions/:id/send", async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const r = await resolveAgentSessionResource(req, id);
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
      await requireCapability(adapter, "sessions.send", r.runtimeId);
    } catch (e) {
      if (e instanceof UnsupportedCapabilityError) {
        unsupportedCapabilityResponse(res, e);
        return;
      }
      res.status(502).json({ error: (e as Error).message });
      return;
    }

    const message = req.body?.message;
    if (typeof message !== "string" || !message.trim()) {
      res.status(400).json({ error: "message is required" });
      return;
    }

    const context: RuntimeActionContext = { actor: buildActor(req) };

    try {
      const result = await adapter.invokeAction(
        "sessions.send",
        { sessionKey: id, message: message.trim() },
        context,
      );
      if (!result.ok) {
        res.status(502).json({ error: result.error });
        return;
      }
      res.json(result.nativeResult);
    } catch (err: any) {
      res.status(502).json({ error: err.message || "Failed to send message" });
    }
  });

  // ---------------------------------------------------------------------------
  // GET /agent-sessions/:id/usage — get token usage
  // ---------------------------------------------------------------------------

  router.get("/agent-sessions/:id/usage", async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const r = await resolveAgentSessionResource(req, id);
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
      await requireCapability(adapter, "sessions.usage", r.runtimeId);
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
          capabilityId: "sessions.usage",
          reason: "adapter does not implement read",
          message: `Runtime '${r.runtimeId}' does not expose sessions.usage`,
        },
      });
      return;
    }

    try {
      const result = await adapter.read("sessions.usage", { sessionKey: id });
      res.json(result);
    } catch (err: any) {
      res.status(502).json({ error: err.message || "Failed to get usage" });
    }
  });

  // ---------------------------------------------------------------------------
  // POST /agent-sessions/:id/reset — reset session
  // ---------------------------------------------------------------------------

  router.post("/agent-sessions/:id/reset", async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const r = await resolveAgentSessionResource(req, id);
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
      await requireCapability(adapter, "sessions.reset", r.runtimeId);
    } catch (e) {
      if (e instanceof UnsupportedCapabilityError) {
        unsupportedCapabilityResponse(res, e);
        return;
      }
      res.status(502).json({ error: (e as Error).message });
      return;
    }

    const context: RuntimeActionContext = { actor: buildActor(req) };

    try {
      const result = await adapter.invokeAction("sessions.reset", { sessionKey: id }, context);
      if (!result.ok) {
        res.status(502).json({ error: result.error });
        return;
      }
      res.json(result.nativeResult ?? {});
    } catch (err: any) {
      res.status(502).json({ error: err.message || "Failed to reset session" });
    }
  });

  // ---------------------------------------------------------------------------
  // POST /agent-sessions/:id/abort — abort session
  // ---------------------------------------------------------------------------

  router.post("/agent-sessions/:id/abort", async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const r = await resolveAgentSessionResource(req, id);
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
      await requireCapability(adapter, "sessions.abort", r.runtimeId);
    } catch (e) {
      if (e instanceof UnsupportedCapabilityError) {
        unsupportedCapabilityResponse(res, e);
        return;
      }
      res.status(502).json({ error: (e as Error).message });
      return;
    }

    const context: RuntimeActionContext = { actor: buildActor(req) };

    try {
      const result = await adapter.invokeAction("sessions.abort", { sessionKey: id }, context);
      if (!result.ok) {
        res.status(502).json({ error: result.error });
        return;
      }
      res.json(result.nativeResult ?? {});
    } catch (err: any) {
      res.status(502).json({ error: err.message || "Failed to abort session" });
    }
  });

  // ---------------------------------------------------------------------------
  // POST /agent-sessions/:id/compact — compact session
  // ---------------------------------------------------------------------------

  router.post("/agent-sessions/:id/compact", async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const r = await resolveAgentSessionResource(req, id);
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
      await requireCapability(adapter, "sessions.compact", r.runtimeId);
    } catch (e) {
      if (e instanceof UnsupportedCapabilityError) {
        unsupportedCapabilityResponse(res, e);
        return;
      }
      res.status(502).json({ error: (e as Error).message });
      return;
    }

    const context: RuntimeActionContext = { actor: buildActor(req) };

    try {
      const result = await adapter.invokeAction("sessions.compact", { sessionKey: id }, context);
      if (!result.ok) {
        res.status(502).json({ error: result.error });
        return;
      }
      res.json(result.nativeResult ?? {});
    } catch (err: any) {
      res.status(502).json({ error: err.message || "Failed to compact session" });
    }
  });

  // ---------------------------------------------------------------------------
  // DELETE /agent-sessions/:id — delete session
  // ---------------------------------------------------------------------------

  router.delete("/agent-sessions/:id", async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const r = await resolveAgentSessionResource(req, id);
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
      await requireCapability(adapter, "sessions.delete", r.runtimeId);
    } catch (e) {
      if (e instanceof UnsupportedCapabilityError) {
        unsupportedCapabilityResponse(res, e);
        return;
      }
      res.status(502).json({ error: (e as Error).message });
      return;
    }

    const context: RuntimeActionContext = { actor: buildActor(req) };

    try {
      const result = await adapter.invokeAction("sessions.delete", { sessionKey: id }, context);
      if (!result.ok) {
        res.status(502).json({ error: result.error });
        return;
      }
      // Remove from index on successful delete
      await agentSessionsIndex.forget(id);
      res.json(result.nativeResult ?? {});
    } catch (err: any) {
      res.status(502).json({ error: err.message || "Failed to delete session" });
    }
  });

  return router;
}
