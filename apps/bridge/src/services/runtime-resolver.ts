/**
 * Shared runtime-resolution helpers used by every route that touches an
 * adapter. Routes never hand-roll the "which runtime answers this?" logic —
 * they pick the appropriate resolver here and dispatch.
 *
 * Resolution rules (per spec 2026-05-10-runtime-agnostic-features-design):
 * - Catalog/list reads: query override or primary.
 * - Create-new-resource mutations: body override > query override > primary.
 * - Existing-resource mutations: stored runtimeId on the resource. Query
 *   override that mismatches stored is rejected with InvalidRuntimeOverrideError.
 *
 * Capability gating layers on top: every resolved adapter must declare the
 * capability supported (or partial). Unsupported throws UnsupportedCapabilityError.
 */
import type {
  CapabilityId, PartialCapability, RuntimeAdapter,
} from "@openclaw-manager/types";
import type { RuntimeRegistry } from "./runtimes/registry.js";
import type { RuntimeConfigService } from "./runtime-config.js";

export class UnsupportedCapabilityError extends Error {
  constructor(
    public runtimeId: string,
    public capabilityId: CapabilityId,
    public reason: string,
  ) {
    super(`Runtime '${runtimeId}' does not support ${capabilityId}: ${reason}`);
    this.name = "UnsupportedCapabilityError";
  }
}

export class InvalidRuntimeOverrideError extends Error {
  constructor(
    public resourceRuntimeId: string,
    public attempted: string,
  ) {
    super(`?runtimeId=${attempted} cannot override resource-stored runtimeId=${resourceRuntimeId}`);
    this.name = "InvalidRuntimeOverrideError";
  }
}

export class UnknownRuntimeError extends Error {
  constructor(public runtimeId: string) {
    super(`unknown runtime id: ${runtimeId}`);
    this.name = "UnknownRuntimeError";
  }
}

export class NoRuntimeAvailableError extends Error {
  constructor() {
    super("no runtime available: primary runtime is unset and no fallback configured");
    this.name = "NoRuntimeAvailableError";
  }
}

export type ResolvedRuntime = {
  runtimeId: string;
  source: "query" | "body" | "primary";
};

// Minimal request shape; we deliberately do not import express types here so
// this module stays trivially testable from node:test without spinning a
// server. Routes pass `{ query: req.query, body: req.body }`.
export type ResolverRequest = {
  query?: { runtimeId?: unknown };
  body?: { runtimeId?: unknown };
};

async function ensureKnown(
  runtimeId: string,
  registry: RuntimeRegistry,
): Promise<void> {
  const d = await registry.get(runtimeId);
  if (!d) throw new UnknownRuntimeError(runtimeId);
}

async function effectivePrimary(runtimeConfig: RuntimeConfigService): Promise<string> {
  const snap = await runtimeConfig.read();
  const id = snap.effectivePrimaryRuntimeId;
  if (!id) throw new NoRuntimeAvailableError();
  return id;
}

/**
 * Catalog/list reads: `?runtimeId=` query overrides primary. Both are
 * validated against the registry. Falls through to the runtime-config
 * service's effective primary (which already handles disabled-primary
 * fallback per `runtime-config.ts`).
 */
export async function resolveRuntimeForCatalog(
  req: ResolverRequest,
  registry: RuntimeRegistry,
  runtimeConfig: RuntimeConfigService,
): Promise<ResolvedRuntime> {
  const queryOverride = typeof req.query?.runtimeId === "string" ? req.query.runtimeId : undefined;
  if (queryOverride) {
    await ensureKnown(queryOverride, registry);
    return { runtimeId: queryOverride, source: "query" };
  }
  const primary = await effectivePrimary(runtimeConfig);
  return { runtimeId: primary, source: "primary" };
}

/**
 * Create-new-resource flows: `body.runtimeId` (preferred) overrides
 * `query.runtimeId`, both override primary. Used when the route is creating
 * a brand-new resource that does not yet have a stored runtimeId.
 */
export async function resolveRuntimeForCreate(
  req: ResolverRequest,
  registry: RuntimeRegistry,
  runtimeConfig: RuntimeConfigService,
): Promise<ResolvedRuntime> {
  const bodyOverride = typeof req.body?.runtimeId === "string" ? req.body.runtimeId : undefined;
  if (bodyOverride) {
    await ensureKnown(bodyOverride, registry);
    return { runtimeId: bodyOverride, source: "body" };
  }
  const queryOverride = typeof req.query?.runtimeId === "string" ? req.query.runtimeId : undefined;
  if (queryOverride) {
    await ensureKnown(queryOverride, registry);
    return { runtimeId: queryOverride, source: "query" };
  }
  const primary = await effectivePrimary(runtimeConfig);
  return { runtimeId: primary, source: "primary" };
}

/**
 * Existing-resource mutations: the resource's stored `runtimeId` wins.
 * If the request supplies `?runtimeId=` and it does not match the stored
 * value, throws InvalidRuntimeOverrideError so the route can return 400.
 *
 * The resource argument is required to carry `runtimeId`; missing means
 * the caller forgot to load the resource first.
 */
export function resolveRuntimeForResource(
  resource: { runtimeId?: string },
  query?: { runtimeId?: unknown },
): { runtimeId: string } {
  const stored = resource.runtimeId;
  if (!stored) {
    throw new Error("resource missing runtimeId — load the resource record before resolving");
  }
  const attempted = typeof query?.runtimeId === "string" ? query.runtimeId : undefined;
  if (attempted && attempted !== stored) {
    throw new InvalidRuntimeOverrideError(stored, attempted);
  }
  return { runtimeId: stored };
}

/**
 * Capability gate. Reads the adapter's capability snapshot and returns the
 * partial-capability metadata if applicable. Throws on unsupported.
 *
 * Routes call this immediately after resolving the adapter and before any
 * payload validation or dispatch.
 */
export async function requireCapability(
  adapter: RuntimeAdapter,
  capabilityId: CapabilityId,
  runtimeId?: string,
): Promise<{ partial?: PartialCapability }> {
  const caps = await adapter.getCapabilities();
  if (caps.unsupported.includes(capabilityId)) {
    const id = runtimeId ?? (await adapter.describeRuntime()).id;
    throw new UnsupportedCapabilityError(
      id,
      capabilityId,
      `capability declared unsupported by runtime '${id}'`,
    );
  }
  const partial = caps.partial.find((p) => p.id === capabilityId);
  if (partial) return { partial };
  if (caps.supported.includes(capabilityId)) return {};
  // Capability is neither supported nor partial nor explicitly unsupported —
  // treat absence as unsupported with a more specific reason so callers can
  // surface "snapshot incomplete" vs "explicitly declined".
  const id = runtimeId ?? (await adapter.describeRuntime()).id;
  throw new UnsupportedCapabilityError(
    id,
    capabilityId,
    `capability '${capabilityId}' not present in runtime '${id}' snapshot`,
  );
}
