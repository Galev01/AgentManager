import { Router, type Router as ExpressRouter, type Request, type Response, type NextFunction, type RequestHandler } from "express";
import type { RuntimeConfigService } from "../services/runtime-config.js";
import { RuntimeConfigError } from "../services/runtime-config.js";
import type { PermissionId, RuntimeConfigPatch } from "@openclaw-manager/types";

export type RuntimeConfigRouterDeps = { service: RuntimeConfigService };

function requirePerm(...perms: PermissionId[]): RequestHandler<any> {
  return (req: Request, res: Response, next: NextFunction): void => {
    const eff = (req as any).auth?.permissions ?? [];
    for (const p of perms) {
      if (!eff.includes(p)) { res.status(403).json({ error: "forbidden", missing: p }); return; }
    }
    next();
  };
}

export function createRuntimeConfigRouter(deps: RuntimeConfigRouterDeps): ExpressRouter {
  const r: ExpressRouter = Router();

  r.get("/runtime-config", requirePerm("runtimes.view"), async (_req, res) => {
    res.json(await deps.service.read());
  });

  r.patch("/runtime-config", requirePerm("runtimes.config"), async (req, res) => {
    const body = (req.body ?? {}) as RuntimeConfigPatch;
    try {
      const before = await deps.service.read();
      const after = await deps.service.patch(body);
      console.log("runtime.config.changed", JSON.stringify({
        user: (req as any).auth?.user?.id ?? null,
        oldConfiguredPrimary: before.configuredPrimaryRuntimeId,
        newConfiguredPrimary: after.configuredPrimaryRuntimeId,
        enabledChanges: body.enabled ?? {},
        effectivePrimaryAfter: after.effectivePrimaryRuntimeId,
        fallbackReasonAfter: after.fallbackReason,
      }));
      res.json(after);
    } catch (e) {
      if (e instanceof RuntimeConfigError) {
        const status = e.code === "cannot_disable_all" ? 409 : 400;
        res.status(status).json({ error: e.code, detail: e.message });
        return;
      }
      console.warn("runtime.config.write_failed", (e as Error).message);
      res.status(500).json({ error: "write_failed", detail: (e as Error).message });
    }
  });

  return r;
}
