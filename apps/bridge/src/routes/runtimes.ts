import { Router, type Router as ExpressRouter, type Request, type Response, type NextFunction, type RequestHandler } from "express";
import type { RuntimeRegistry } from "../services/runtimes/registry.js";
import type {
  RuntimeEntityKind, InvokeActionHttpRequest, ActorAssertionRef, CapabilityId,
  InvokeActionRequest, PermissionId,
} from "@openclaw-manager/types";

export type RuntimesRouterDeps = {
  registry: RuntimeRegistry;
  managerServiceId: string;   // stable id for this bridge instance, stamped on every actor
};

// Local permission guard. The bridge's real requirePerm lives in
// auth-middleware; this function has the identical shape so tests can
// substitute a minimal req.auth without pulling the full auth stack.
function requirePerm(...perms: PermissionId[]): RequestHandler<any> {
  return (req: Request, res: Response, next: NextFunction): void => {
    const eff = req.auth?.permissions ?? [];
    for (const p of perms) {
      if (!eff.includes(p)) { res.status(403).json({ error: "forbidden", missing: p }); return; }
    }
    next();
  };
}

export function createRuntimesRouter(deps: RuntimesRouterDeps): ExpressRouter {
  const r: ExpressRouter = Router();
  const { registry, managerServiceId } = deps;

  r.get("/runtimes", requirePerm("runtimes.view"), async (_req, res) => {
    res.json({ runtimes: await registry.list() });
  });

  r.get("/runtimes/:id", requirePerm("runtimes.view"), async (req, res) => {
    const d = await registry.get(req.params.id);
    if (!d) { res.status(404).json({ error: "runtime_not_found" }); return; }
    const a = await registry.adapter(req.params.id);
    if (!a) { res.status(500).json({ error: "adapter_unavailable" }); return; }
    res.json({ descriptor: d, health: await a.health() });
  });

  r.get("/runtimes/:id/capabilities", requirePerm("runtimes.view"), async (req, res) => {
    const a = await registry.adapter(req.params.id);
    if (!a) { res.status(404).json({ error: "runtime_not_found" }); return; }
    res.json(await a.getCapabilities());
  });

  r.get("/runtimes/:id/entities/:kind", requirePerm("runtimes.view"), async (req, res) => {
    const a = await registry.adapter(req.params.id);
    if (!a) { res.status(404).json({ error: "runtime_not_found" }); return; }
    const kind = req.params.kind as RuntimeEntityKind;
    try { res.json({ entities: await a.listEntities(kind) }); }
    catch (e) { res.status(502).json({ error: "adapter_error", detail: (e as Error).message }); }
  });

  r.get("/runtimes/:id/activity", requirePerm("runtimes.view"), async (req, res) => {
    const a = await registry.adapter(req.params.id);
    if (!a) { res.status(404).json({ error: "runtime_not_found" }); return; }
    const sinceMs = req.query.sinceMs ? Number(req.query.sinceMs) : undefined;
    const limit = req.query.limit ? Number(req.query.limit) : undefined;
    try { res.json({ events: await a.listActivity(sinceMs, limit) }); }
    catch (e) { res.status(502).json({ error: "adapter_error", detail: (e as Error).message }); }
  });

  r.post("/runtimes/:id/actions", requirePerm("runtimes.view", "runtimes.invoke"), async (req, res) => {
    if (!req.auth) { res.status(401).json({ error: "unauthorized" }); return; }
    const a = await registry.adapter(req.params.id);
    if (!a) { res.status(404).json({ error: "runtime_not_found" }); return; }

    const body = (req.body ?? {}) as Partial<InvokeActionHttpRequest>;
    if (typeof body.action !== "string" || body.action.length === 0) {
      res.status(400).json({ error: "action required" });
      return;
    }

    // Capability gate: refuse calls to actions the adapter has not declared
    // supported (or partial). Supported + partial both pass. Anything else —
    // explicitly listed as unsupported, or simply absent from the snapshot —
    // fails fast with a clear error so the dashboard can explain "the adapter
    // cannot do this" without waiting for a runtime round-trip.
    const caps = await a.getCapabilities();
    const asCap = body.action as CapabilityId;
    const isSupported = caps.supported.includes(asCap);
    const isPartial = caps.partial.some((p) => p.id === asCap);
    if (!isSupported && !isPartial) {
      res.status(400).json({ error: "capability_unsupported", capability: asCap });
      return;
    }

    // CRITICAL: actor is bridge-stamped, never body-supplied. humanActorUserId
    // comes from req.auth (populated upstream by actorAssertionAuth middleware);
    // managerServiceId is a deployment constant; basis is the Phase 1 default.
    // Phase 2 will allow body.runtimeActorId to select a delegated runtime
    // identity, but Phase 1 stays on service-principal only.
    const actor: ActorAssertionRef = {
      humanActorUserId: req.auth.user.id,
      managerServiceId,
      runtimeActorId: typeof body.runtimeActorId === "string" ? body.runtimeActorId : undefined,
      basis: "service-principal",
    };
    const adapterReq: InvokeActionRequest = {
      action: body.action,
      targetEntityId: body.targetEntityId,
      payload: body.payload ?? {},
      runtimeActorId: actor.runtimeActorId,
      actor,
    };
    res.json(await a.invokeAction(adapterReq));
  });

  return r;
}
