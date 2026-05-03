import { actorHeaders } from "./auth/bridge-actor";
import type { RuntimeConfigSnapshot, RuntimeConfigPatch } from "@openclaw-manager/types";

const BRIDGE_URL = process.env.OPENCLAW_BRIDGE_URL || "http://localhost:3100";
const BRIDGE_TOKEN = process.env.OPENCLAW_BRIDGE_TOKEN || "";

async function bridgeFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const url = `${BRIDGE_URL}${path}`;
  const actor = await actorHeaders();
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${BRIDGE_TOKEN}`,
      ...actor,
      ...(options?.headers as Record<string, string> | undefined),
    },
    next: { revalidate: 0 },
  });
  if (!res.ok) throw new Error(`Bridge ${res.status}: ${await res.text()}`);
  return res.json();
}

export async function getRuntimeConfig(): Promise<RuntimeConfigSnapshot> {
  return bridgeFetch<RuntimeConfigSnapshot>("/runtime-config");
}

export async function patchRuntimeConfig(patch: RuntimeConfigPatch): Promise<RuntimeConfigSnapshot> {
  return bridgeFetch<RuntimeConfigSnapshot>("/runtime-config", {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}
