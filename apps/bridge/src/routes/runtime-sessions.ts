import { Router, type Router as ExpressRouter } from "express";
import type { RuntimeRegistry } from "../services/runtimes/registry.js";
import type { RuntimeConfigService } from "../services/runtime-config.js";

export type RuntimeSessionsRouterDeps = {
  registry: RuntimeRegistry;
  runtimeConfig: RuntimeConfigService;
};

/**
 * Runtime-agnostic session view used by the dashboard Claude Code page.
 * Federates reads through the runtime adapter so each runtime owns its
 * own transcript content. Adapters that don't implement the optional
 * listSessions / getSessionDetail methods are treated as having no
 * session view (empty list, 404 on detail).
 */
export function createRuntimeSessionsRouter(deps: RuntimeSessionsRouterDeps): ExpressRouter {
  const router: ExpressRouter = Router();

  async function resolveRuntimeId(qs: unknown): Promise<string | null> {
    if (typeof qs === "string" && qs) return qs;
    const snap = await deps.runtimeConfig.read();
    return snap.effectivePrimaryRuntimeId ?? snap.configuredPrimaryRuntimeId ?? null;
  }

  router.get("/runtime-sessions", async (req, res) => {
    const runtimeId = await resolveRuntimeId(req.query.runtimeId);
    if (!runtimeId) return res.json([]);
    const adapter = await deps.registry.adapter(runtimeId);
    if (!adapter || typeof adapter.listSessions !== "function") return res.json([]);
    try {
      const rows = await adapter.listSessions();
      res.json(rows);
    } catch (e) {
      res.status(502).json({ error: (e as Error).message });
    }
  });

  router.get("/runtime-sessions/:runtimeId/:sessionId", async (req, res) => {
    const { runtimeId, sessionId } = req.params;
    const adapter = await deps.registry.adapter(runtimeId);
    if (!adapter || typeof adapter.getSessionDetail !== "function") {
      return res.status(404).json({ error: "runtime has no session view" });
    }
    try {
      const detail = await adapter.getSessionDetail(sessionId);
      if (!detail) return res.status(404).json({ error: "session not found" });
      res.json(detail);
    } catch (e) {
      res.status(502).json({ error: (e as Error).message });
    }
  });

  return router;
}
