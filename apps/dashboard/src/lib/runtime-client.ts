import { actorHeaders } from "./auth/bridge-actor";
import type {
  RuntimeDescriptor,
  CapabilitySnapshot,
  RuntimeEntity,
  RuntimeEntityKind,
  RuntimeActivityEvent,
  InvokeActionResult,
  InvokeActionHttpRequest,
  RuntimeKind,
  PartialCapability,
  CapabilityId,
} from "@openclaw-manager/types";

const BRIDGE_URL = process.env.OPENCLAW_BRIDGE_URL || "http://localhost:3100";
const BRIDGE_TOKEN = process.env.OPENCLAW_BRIDGE_TOKEN || "";

// Aggregate /runtimes/health response shape — mirrors apps/bridge runtimes-health route.
export type RuntimeHealthEntry =
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

export type RuntimeHealthSnapshot = {
  ok: boolean;
  primaryRuntimeId: string | null;
  runtimes: RuntimeHealthEntry[];
};

// Helper kept here so all runtime-aware bridge calls reach for the same shape.
export type { CapabilityId, PartialCapability, RuntimeKind };

async function bridgeGet<T>(path: string): Promise<T> {
  const actor = await actorHeaders();
  const res = await fetch(`${BRIDGE_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${BRIDGE_TOKEN}`,
      ...actor,
    },
    next: { revalidate: 0 },
  });
  if (!res.ok) throw new Error(`bridge ${res.status}: ${await res.text()}`);
  return (await res.json()) as T;
}

async function bridgePost<T>(path: string, body: unknown): Promise<T> {
  const actor = await actorHeaders();
  const res = await fetch(`${BRIDGE_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${BRIDGE_TOKEN}`,
      ...actor,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`bridge ${res.status}: ${await res.text()}`);
  return (await res.json()) as T;
}

export async function listRuntimes(): Promise<RuntimeDescriptor[]> {
  const { runtimes } = await bridgeGet<{ runtimes: RuntimeDescriptor[] }>("/runtimes");
  return runtimes;
}

export async function getRuntime(
  id: string,
): Promise<{ descriptor: RuntimeDescriptor; health: { ok: boolean; detail?: string } }> {
  return bridgeGet(`/runtimes/${encodeURIComponent(id)}`);
}

export async function getCapabilities(id: string): Promise<CapabilitySnapshot> {
  return bridgeGet(`/runtimes/${encodeURIComponent(id)}/capabilities`);
}

export async function listEntities(
  id: string,
  kind: RuntimeEntityKind,
): Promise<RuntimeEntity[]> {
  const { entities } = await bridgeGet<{ entities: RuntimeEntity[] }>(
    `/runtimes/${encodeURIComponent(id)}/entities/${kind}`,
  );
  return entities;
}

export async function listActivity(
  id: string,
  limit = 50,
): Promise<RuntimeActivityEvent[]> {
  const { events } = await bridgeGet<{ events: RuntimeActivityEvent[] }>(
    `/runtimes/${encodeURIComponent(id)}/activity?limit=${limit}`,
  );
  return events;
}

// Dashboard sends the http-request shape (no actor — bridge stamps it from
// the authenticated session). This is enforced on both ends by the type
// system and by the route's ignore-body-actor behavior.
export async function invokeRuntimeAction(
  id: string,
  req: InvokeActionHttpRequest,
): Promise<InvokeActionResult> {
  return bridgePost(`/runtimes/${encodeURIComponent(id)}/actions`, req);
}

// Aggregate /runtimes/health — used by SSR pages and the API proxy that backs
// the client-side useRuntimeHealth hook.
export async function fetchRuntimeHealth(): Promise<RuntimeHealthSnapshot> {
  return bridgeGet<RuntimeHealthSnapshot>("/runtimes/health");
}

// Append a `?runtimeId=` selector to an existing path. Pages that have opted
// into runtime-aware fetching pass this through to bridge-client calls so the
// bridge knows which runtime to project the catalog against.
export function withRuntimeQuery(path: string, runtimeId?: string | null): string {
  if (!runtimeId) return path;
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}runtimeId=${encodeURIComponent(runtimeId)}`;
}
