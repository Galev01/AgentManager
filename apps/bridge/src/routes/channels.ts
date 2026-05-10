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
import {
  runtimeActionSchemas,
  InvalidActionPayloadError,
} from "../services/runtime-action-schemas.js";
import type { ActorAssertionRef, RuntimeActionContext } from "@openclaw-manager/types";

export type CallGateway = (method: string, params?: Record<string, unknown>) => Promise<unknown>;

export type ChannelsRouterDeps = {
  callGateway: CallGateway;
  registry: RuntimeRegistry;
  runtimeConfig: RuntimeConfigService;
  managerServiceId?: string;
};

type GatewayChannelEntry = {
  configured?: boolean;
  linked?: boolean;
  running?: boolean;
  connected?: boolean;
  self?: Record<string, unknown>;
  lastEventAt?: number | null;
  lastConnectedAt?: number | null;
  lastInboundAt?: number | null;
  lastMessageAt?: number | null;
  lastError?: string | null;
  healthState?: string;
  reconnectAttempts?: number;
};

type GatewayStatusPayload = {
  channelOrder?: string[];
  channels?: Record<string, GatewayChannelEntry>;
  channelMeta?: Array<{ id: string; label?: string }>;
};

type Channel = {
  name: string;
  type: string;
  status: "connected" | "disconnected" | "error";
  lastActivityAt?: number;
  accountInfo?: Record<string, unknown>;
};

function adaptGatewayPayload(payload: unknown): Channel[] {
  if (!payload || typeof payload !== "object") return [];
  const p = payload as GatewayStatusPayload;
  const channels = p.channels ?? {};
  const names = Array.isArray(p.channelOrder) && p.channelOrder.length > 0
    ? p.channelOrder
    : Object.keys(channels);

  return names.map((name): Channel => {
    const entry: GatewayChannelEntry = channels[name] ?? {};
    const status: Channel["status"] = entry.lastError
      ? "error"
      : entry.connected === true
        ? "connected"
        : "disconnected";
    const lastActivityAt = entry.lastEventAt ?? entry.lastConnectedAt ?? undefined;
    const accountInfo: Record<string, unknown> = {
      ...(entry.self ?? {}),
      healthState: entry.healthState,
      linked: entry.linked,
      configured: entry.configured,
      connected: entry.connected,
      reconnectAttempts: entry.reconnectAttempts,
      lastError: entry.lastError,
    };
    return {
      name,
      type: name,
      status,
      lastActivityAt: typeof lastActivityAt === "number" ? lastActivityAt : undefined,
      accountInfo,
    };
  });
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

export function createChannelsRouter(deps: ChannelsRouterDeps): ExpressRouter {
  const router: ExpressRouter = Router();
  const { callGateway, registry, runtimeConfig, managerServiceId = "bridge-primary" } = deps;

  router.get("/channels", async (req: Request, res: Response) => {
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
      await requireCapability(adapter, "channels.status", resolved.runtimeId);
    } catch (e) {
      if (e instanceof UnsupportedCapabilityError) {
        unsupportedCapabilityResponse(res, e);
        return;
      }
      res.status(502).json({ error: (e as Error).message });
      return;
    }

    try {
      const entities = await adapter.listEntities("channel");
      const projected: Channel[] = entities.map((e) => {
        const entry = (e.nativeRef ?? {}) as Record<string, unknown>;
        const rawStatus = (entry.status as string | undefined) ?? e.nativeType;
        const status: Channel["status"] = rawStatus === "connected"
          ? "connected"
          : rawStatus === "error"
            ? "error"
            : "disconnected";
        const accountInfo: Record<string, unknown> = {
          ...((entry.self as Record<string, unknown> | undefined) ?? {}),
          healthState: entry.healthState,
          linked: entry.linked,
          configured: entry.configured,
          connected: entry.connected,
          reconnectAttempts: entry.reconnectAttempts,
          lastError: entry.lastError,
        };
        return {
          name: e.entityId,
          type: e.entityId,
          status,
          lastActivityAt: e.lastActivityAt,
          accountInfo,
        };
      });
      // Preserve bare-array wire shape — dashboard's getChannels() throws if not array.
      res.json(projected);
    } catch (err: any) {
      res.status(502).json({ error: err.message || "Failed to get channels" });
    }
  });

  // Helper: shared resolve+gate for channel write routes. Per plan Phase C.1,
  // channel mutations are catalog-style — the channel resource itself does not
  // carry a bridge-stored runtimeId, so ?runtimeId=foo on the request resolves
  // via catalog rules (query override > primary).
  async function resolveAndGate(
    req: Request,
    res: Response,
    capabilityId: "channels.connect" | "channels.disconnect",
  ): Promise<{ adapter: import("@openclaw-manager/types").RuntimeAdapter; runtimeId: string } | null> {
    let resolved;
    try {
      resolved = await resolveRuntimeForCatalog(req, registry, runtimeConfig);
    } catch (e) {
      if (e instanceof UnknownRuntimeError) {
        res.status(404).json({ error: "runtime_not_found", runtimeId: e.runtimeId });
        return null;
      }
      if (e instanceof NoRuntimeAvailableError) {
        res.status(503).json({ error: "no_runtime_available" });
        return null;
      }
      res.status(500).json({ error: (e as Error).message });
      return null;
    }
    const adapter = await registry.adapter(resolved.runtimeId);
    if (!adapter) {
      res.status(404).json({ error: "runtime_not_found", runtimeId: resolved.runtimeId });
      return null;
    }
    try {
      await requireCapability(adapter, capabilityId, resolved.runtimeId);
    } catch (e) {
      if (e instanceof UnsupportedCapabilityError) {
        unsupportedCapabilityResponse(res, e);
        return null;
      }
      res.status(502).json({ error: (e as Error).message });
      return null;
    }
    return { adapter, runtimeId: resolved.runtimeId };
  }

  router.post("/channels/:name/connect", async (req: Request, res: Response) => {
    const gated = await resolveAndGate(req, res, "channels.connect");
    if (!gated) return;
    const channelId = req.params.name as string;
    const config = (req.body && typeof req.body === "object" && "config" in req.body)
      ? (req.body as { config?: unknown }).config
      : undefined;
    let validated: import("@openclaw-manager/types").RuntimeActionPayload["channels.connect"];
    try {
      validated = runtimeActionSchemas["channels.connect"]({ channelId, config });
    } catch (e) {
      if (e instanceof InvalidActionPayloadError) {
        invalidPayloadResponse(res, e);
        return;
      }
      throw e;
    }
    const context: RuntimeActionContext = {
      actor: buildActor(req, managerServiceId),
      resourceRuntimeId: gated.runtimeId,
    };
    try {
      const result = await gated.adapter.invokeAction("channels.connect", validated, context);
      if (!result.ok) {
        res.status(502).json({ error: result.error });
        return;
      }
      res.json(result.nativeResult ?? {});
    } catch (err: any) {
      res.status(502).json({ error: err.message || "Failed to connect channel" });
    }
  });

  // Existing route: keeps the historical `/logout` URL the dashboard already
  // calls (`channels.logout` permission). Dispatched through the typed
  // `channels.disconnect` action; the OpenClaw adapter maps that to the real
  // `channels.logout` gateway method (see openclaw adapter invokeAction).
  router.post("/channels/:name/logout", async (req: Request, res: Response) => {
    const gated = await resolveAndGate(req, res, "channels.disconnect");
    if (!gated) return;
    const channelId = req.params.name as string;
    let validated: import("@openclaw-manager/types").RuntimeActionPayload["channels.disconnect"];
    try {
      validated = runtimeActionSchemas["channels.disconnect"]({ channelId });
    } catch (e) {
      if (e instanceof InvalidActionPayloadError) {
        invalidPayloadResponse(res, e);
        return;
      }
      throw e;
    }
    const context: RuntimeActionContext = {
      actor: buildActor(req, managerServiceId),
      resourceRuntimeId: gated.runtimeId,
    };
    try {
      const result = await gated.adapter.invokeAction("channels.disconnect", validated, context);
      if (!result.ok) {
        res.status(502).json({ error: result.error });
        return;
      }
      res.json(result.nativeResult ?? {});
    } catch (err: any) {
      res.status(502).json({ error: err.message || "Failed to logout channel" });
    }
  });

  // callGateway retained in deps for future routes during migration; suppress
  // unused-variable lint when this is the only consumer.
  void callGateway;

  return router;
}

export { adaptGatewayPayload };
