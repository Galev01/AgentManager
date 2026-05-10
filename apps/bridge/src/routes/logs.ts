import { Router, type Router as ExpressRouter, type Request, type Response } from "express";
import fs from "node:fs/promises";
import path from "node:path";
import { config } from "../config.js";
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

export type LogsRouterDeps = {
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

export function createLogsRouter(deps: LogsRouterDeps): ExpressRouter {
  const router: ExpressRouter = Router();
  const { callGateway, registry, runtimeConfig } = deps;

  // GET /logs/tail — runtime-agnostic activity tail through adapter.listActivity.
  router.get("/logs/tail", async (req: Request, res: Response) => {
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
      const out = await requireCapability(adapter, "logs.tail", resolved.runtimeId);
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
      const limit = Number(req.query.lines) || 100;
      const sinceMs = req.query.sinceMs ? Number(req.query.sinceMs) : undefined;
      const events = await adapter.listActivity(sinceMs, limit);
      const body: Record<string, unknown> = {
        events,
        runtimeId: resolved.runtimeId,
        source: resolved.source,
      };
      if (partialMeta) body.partial = partialMeta;
      res.json(body);
    } catch (err: any) {
      res.status(502).json({ error: err.message || "Failed to tail logs" });
    }
  });

  // GET /sessions — list sessions from gateway (legacy raw passthrough).
  // Phase B intentionally leaves this on direct callGateway because the
  // dashboard's getSessions() consumer treats this as opaque transcript-list
  // metadata, not the agent-sessions catalog. Phase C may unify.
  router.get("/sessions", async (_req: Request, res: Response) => {
    try {
      const result = await callGateway("sessions.list", {});
      res.json(result);
    } catch (err: any) {
      res.status(502).json({ error: err.message || "Failed to list sessions" });
    }
  });

  // GET /sessions/:sessionId/transcript — read session JSONL transcript file
  router.get("/sessions/:sessionId/transcript", async (req: Request, res: Response) => {
    try {
      if (!config.sessionsDir) {
        res.status(400).json({ error: "OPENCLAW_SESSIONS_DIR not configured" });
        return;
      }
      const sessionId = String(req.params.sessionId);
      // Sanitize to prevent path traversal
      if (!/^[a-f0-9-]+$/i.test(sessionId)) {
        res.status(400).json({ error: "Invalid session ID format" });
        return;
      }
      const filePath = path.join(config.sessionsDir, `${sessionId}.jsonl`);
      let raw: string;
      try {
        raw = await fs.readFile(filePath, "utf8");
      } catch {
        res.status(404).json({ error: "Session transcript not found" });
        return;
      }
      const lines = raw.trim().split("\n").filter(Boolean);
      const events = [];
      for (const line of lines) {
        try {
          events.push(JSON.parse(line));
        } catch {
          // skip malformed
        }
      }
      res.json(events);
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Failed to read transcript" });
    }
  });

  return router;
}
