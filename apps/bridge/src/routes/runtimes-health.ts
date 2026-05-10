/**
 * GET /runtimes/health — aggregate health + capability snapshot across every
 * configured runtime.
 *
 * Per spec 2026-05-10-runtime-agnostic-features-design §"/health aggregation":
 * `GET /health` stays boring (process liveness only). This endpoint is
 * runtime-aware: dashboard <CapabilityGate> consumes it; doctor command reads
 * it for capability detail.
 *
 * Resilience contract: a single misbehaving runtime does NOT take the
 * endpoint down. Adapter errors are caught per-runtime and surfaced as
 * `{ ok: false, status: "unhealthy", error: <message> }`. Aggregate `ok` is
 * true iff every enabled runtime returned `ok: true`. Disabled runtimes are
 * neutral — they neither make the aggregate fail nor fire adapter calls.
 */
import { Router, type Router as ExpressRouter, type Request, type Response, type NextFunction, type RequestHandler } from "express";
import type { RuntimeRegistry } from "../services/runtimes/registry.js";
import type { RuntimeConfigService } from "../services/runtime-config.js";
import type {
  CapabilitySnapshot, PermissionId, RuntimeConfigDescriptor,
} from "@openclaw-manager/types";

export type RuntimesHealthRouterDeps = {
  registry: RuntimeRegistry;
  runtimeConfig: RuntimeConfigService;
};

type PerRuntimeHealth =
  | {
      runtimeId: string;
      ok: true;
      status: "healthy";
      capabilities: CapabilitySnapshot;
    }
  | {
      runtimeId: string;
      ok: false;
      status: "unhealthy";
      error: string;
      capabilities?: CapabilitySnapshot;
    }
  | {
      runtimeId: string;
      ok: true;
      status: "disabled";
    };

export type RuntimesHealthResponse = {
  ok: boolean;
  primaryRuntimeId: string | null;
  runtimes: PerRuntimeHealth[];
};

// Local permission guard mirroring the pattern in routes/runtimes.ts so this
// router is testable without pulling the full auth stack.
function requirePerm(...perms: PermissionId[]): RequestHandler<any> {
  return (req: Request, res: Response, next: NextFunction): void => {
    const eff = (req as any).auth?.permissions ?? [];
    for (const p of perms) {
      if (!eff.includes(p)) {
        res.status(403).json({ error: "forbidden", missing: p });
        return;
      }
    }
    next();
  };
}

async function probeOne(
  registry: RuntimeRegistry,
  descriptor: RuntimeConfigDescriptor,
): Promise<PerRuntimeHealth> {
  if (descriptor.enabled === false) {
    return { runtimeId: descriptor.id, ok: true, status: "disabled" };
  }

  const adapter = await registry.adapter(descriptor.id);
  if (!adapter) {
    return {
      runtimeId: descriptor.id,
      ok: false,
      status: "unhealthy",
      error: "adapter_unavailable",
    };
  }

  // Health and capabilities are independent calls; running them in parallel
  // shaves a hop. Each is wrapped so a single rejection does not break the
  // aggregate.
  const [healthResult, capsResult] = await Promise.allSettled([
    adapter.health(),
    adapter.getCapabilities(),
  ]);

  const capabilities =
    capsResult.status === "fulfilled" ? capsResult.value : undefined;

  if (healthResult.status === "rejected") {
    return {
      runtimeId: descriptor.id,
      ok: false,
      status: "unhealthy",
      error: (healthResult.reason as Error)?.message ?? String(healthResult.reason),
      capabilities,
    };
  }

  if (!healthResult.value.ok) {
    return {
      runtimeId: descriptor.id,
      ok: false,
      status: "unhealthy",
      error: healthResult.value.detail ?? "unhealthy",
      capabilities,
    };
  }

  if (!capabilities) {
    // Health passed but capability snapshot threw. Surface as unhealthy with
    // the capability error so dashboards can render an actionable detail.
    return {
      runtimeId: descriptor.id,
      ok: false,
      status: "unhealthy",
      error:
        capsResult.status === "rejected"
          ? `capabilities: ${(capsResult.reason as Error)?.message ?? String(capsResult.reason)}`
          : "capabilities_unavailable",
    };
  }

  return {
    runtimeId: descriptor.id,
    ok: true,
    status: "healthy",
    capabilities,
  };
}

export function createRuntimesHealthRouter(
  deps: RuntimesHealthRouterDeps,
): ExpressRouter {
  const r: ExpressRouter = Router();
  const { registry, runtimeConfig } = deps;

  r.get("/runtimes/health", requirePerm("runtimes.view"), async (_req, res) => {
    let snapshot;
    try {
      snapshot = await runtimeConfig.read();
    } catch (e) {
      res.status(500).json({
        error: "runtime_config_unavailable",
        detail: (e as Error).message,
      });
      return;
    }

    const results = await Promise.all(
      snapshot.runtimes.map((d) => probeOne(registry, d).catch((e) => ({
        runtimeId: d.id,
        ok: false as const,
        status: "unhealthy" as const,
        error: (e as Error)?.message ?? String(e),
      }))),
    );

    // Aggregate ok: every ENABLED runtime must be ok. Disabled runtimes are
    // neutral. If there are no enabled runtimes, aggregate is still ok=true
    // — the dashboard surfaces "no runtimes enabled" via the runtimes array.
    const aggregateOk = results.every((r) => {
      if (r.status === "disabled") return true;
      return r.ok === true;
    });

    const body: RuntimesHealthResponse = {
      ok: aggregateOk,
      primaryRuntimeId: snapshot.effectivePrimaryRuntimeId,
      runtimes: results,
    };
    res.json(body);
  });

  return r;
}
