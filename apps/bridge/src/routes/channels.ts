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

export type ChannelsRouterDeps = {
  callGateway: CallGateway;
  registry: RuntimeRegistry;
  runtimeConfig: RuntimeConfigService;
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

export function createChannelsRouter(deps: ChannelsRouterDeps): ExpressRouter {
  const router: ExpressRouter = Router();
  const { callGateway, registry, runtimeConfig } = deps;

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

  router.post("/channels/:name/logout", async (req: Request, res: Response) => {
    try { res.json(await callGateway("channels.logout", { channel: req.params.name as string })); }
    catch (err: any) { res.status(502).json({ error: err.message || "Failed to logout channel" }); }
  });

  return router;
}

export { adaptGatewayPayload };
