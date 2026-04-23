import { actorHeaders } from "./auth/bridge-actor";
import type {
  RuntimeDescriptor,
  CapabilitySnapshot,
  RuntimeEntity,
  RuntimeEntityKind,
  RuntimeActivityEvent,
  InvokeActionResult,
  InvokeActionHttpRequest,
} from "@openclaw-manager/types";

const BRIDGE_URL = process.env.OPENCLAW_BRIDGE_URL || "http://localhost:3100";
const BRIDGE_TOKEN = process.env.OPENCLAW_BRIDGE_TOKEN || "";

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
