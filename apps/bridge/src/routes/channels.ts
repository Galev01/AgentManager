import { Router, type Request, type Response } from "express";
import { callGateway } from "../services/gateway.js";

const router: Router = Router();

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

function adaptChannels(payload: unknown): Channel[] {
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

router.get("/channels", async (_req: Request, res: Response) => {
  try {
    const raw = await callGateway("channels.status", {});
    res.json(adaptChannels(raw));
  } catch (err: any) {
    res.status(502).json({ error: err.message || "Failed to get channels" });
  }
});

router.post("/channels/:name/logout", async (req: Request, res: Response) => {
  try { res.json(await callGateway("channels.logout", { channel: req.params.name as string })); }
  catch (err: any) { res.status(502).json({ error: err.message || "Failed to logout channel" }); }
});

export default router;
