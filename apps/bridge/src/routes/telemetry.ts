// apps/bridge/src/routes/telemetry.ts
import { Router, type Router as ExpressRouter } from "express";
import type { TelemetryEventInput } from "@openclaw-manager/types";
import { createTelemetryLog, type TelemetryLogConfig } from "../services/telemetry-log.js";

export function createTelemetryRouter(cfg: TelemetryLogConfig): ExpressRouter {
  const log = createTelemetryLog(cfg);
  const router: ExpressRouter = Router();

  router.post("/telemetry/actions", async (req, res) => {
    const body = req.body as TelemetryEventInput | undefined;
    if (
      !body ||
      typeof body.eventId !== "string" ||
      typeof body.feature !== "string" ||
      typeof body.action !== "string" ||
      typeof body.route !== "string" ||
      !body.actor?.id
    ) {
      return res.status(400).json({ error: "eventId, feature, action, route, actor.id required" });
    }
    try {
      const stored = await log.append(body);
      res.status(201).json(stored);
    } catch (err) {
      const msg = (err as Error).message;
      if (/event too large/.test(msg)) return res.status(413).json({ error: msg });
      if (/identity field too long/.test(msg)) return res.status(400).json({ error: msg });
      res.status(500).json({ error: msg });
    }
  });

  router.get("/telemetry/actions", async (req, res) => {
    try {
      const features = typeof req.query.feature === "string"
        ? [req.query.feature]
        : Array.isArray(req.query.feature)
          ? (req.query.feature as string[])
          : undefined;
      const result = await log.query({
        feature: features,
        action: typeof req.query.action === "string" ? req.query.action : undefined,
        outcome: typeof req.query.outcome === "string" ? req.query.outcome : undefined,
        actor: typeof req.query.actor === "string" ? req.query.actor : undefined,
        traceId: typeof req.query.traceId === "string" ? req.query.traceId : undefined,
        targetId: typeof req.query.targetId === "string" ? req.query.targetId : undefined,
        q: typeof req.query.q === "string" ? req.query.q : undefined,
        since: typeof req.query.since === "string" ? req.query.since : undefined,
        until: typeof req.query.until === "string" ? req.query.until : undefined,
        limit: req.query.limit ? Number(req.query.limit) : undefined,
      });
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  return router;
}
