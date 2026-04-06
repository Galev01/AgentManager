import type {
  OverviewData,
  ConversationRow,
  ConversationEvent,
  RuntimeSettings,
  ManagementCommand,
  RelayRecipient,
  RoutingRule,
  RuntimeSettingsV2,
} from "@openclaw-manager/types";

const BRIDGE_URL = process.env.OPENCLAW_BRIDGE_URL || "http://localhost:3100";
const BRIDGE_TOKEN = process.env.OPENCLAW_BRIDGE_TOKEN || "";

async function bridgeFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const url = `${BRIDGE_URL}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${BRIDGE_TOKEN}`, ...options?.headers },
    next: { revalidate: 0 },
  });
  if (!res.ok) throw new Error(`Bridge ${res.status}: ${await res.text()}`);
  return res.json();
}

export async function getOverview(): Promise<OverviewData> { return bridgeFetch<OverviewData>("/overview"); }
export async function getConversations(): Promise<ConversationRow[]> { return bridgeFetch<ConversationRow[]>("/conversations"); }
export async function getConversation(key: string): Promise<ConversationRow | null> {
  try { return await bridgeFetch<ConversationRow>(`/conversations/${encodeURIComponent(key)}`); } catch { return null; }
}
export async function getMessages(conversationKey: string, limit = 50, before?: number): Promise<ConversationEvent[]> {
  const params = new URLSearchParams({ conversationKey, limit: String(limit) });
  if (before) params.set("before", String(before));
  return bridgeFetch<ConversationEvent[]>(`/messages?${params}`);
}
export async function getSettings(): Promise<RuntimeSettingsV2> { return bridgeFetch<RuntimeSettingsV2>("/settings"); }
export async function updateSettings(updates: Partial<RuntimeSettings>): Promise<RuntimeSettings> {
  return bridgeFetch<RuntimeSettings>("/settings", { method: "PATCH", body: JSON.stringify(updates) });
}
export async function sendTakeover(key: string): Promise<ManagementCommand> {
  return bridgeFetch<ManagementCommand>(`/conversations/${encodeURIComponent(key)}/takeover`, { method: "POST" });
}
export async function sendRelease(key: string): Promise<ManagementCommand> {
  return bridgeFetch<ManagementCommand>(`/conversations/${encodeURIComponent(key)}/release`, { method: "POST" });
}
export async function sendWakeNow(key: string): Promise<ManagementCommand> {
  return bridgeFetch<ManagementCommand>(`/conversations/${encodeURIComponent(key)}/wake-now`, { method: "POST" });
}

export async function getLogs(lines = 100): Promise<any[]> {
  return bridgeFetch<any[]>("/logs/tail", {
    method: "POST",
    body: JSON.stringify({ lines }),
  });
}

export async function getSessions(): Promise<any[]> {
  return bridgeFetch<any[]>("/sessions");
}

export async function getSessionTranscript(sessionId: string): Promise<any[]> {
  return bridgeFetch<any[]>(`/sessions/${encodeURIComponent(sessionId)}/transcript`);
}

export async function callGatewayMethod(method: string, params?: Record<string, unknown>): Promise<unknown> {
  const [ns, action] = method.split(".");
  if (!action) {
    return bridgeFetch<unknown>(`/gateway/${encodeURIComponent(ns)}`, {
      method: "POST",
      body: JSON.stringify(params || {}),
    });
  }
  return bridgeFetch<unknown>(`/gateway/${encodeURIComponent(ns)}/${encodeURIComponent(action)}`, {
    method: "POST",
    body: JSON.stringify(params || {}),
  });
}

// --- Compose ---
export async function sendMessage(payload: {
  conversationKey?: string;
  phone: string;
  text: string;
}): Promise<{ ok: boolean; result: unknown }> {
  return bridgeFetch("/compose", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

// --- Relay Recipients ---
export async function getRelayRecipients(): Promise<RelayRecipient[]> {
  return bridgeFetch<RelayRecipient[]>("/relay-recipients");
}

export async function addRelayRecipient(input: {
  phone: string;
  label: string;
  enabled?: boolean;
}): Promise<RelayRecipient> {
  return bridgeFetch<RelayRecipient>("/relay-recipients", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function removeRelayRecipient(id: string): Promise<{ ok: boolean }> {
  return bridgeFetch(`/relay-recipients/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export async function toggleRelayRecipient(
  id: string,
  enabled: boolean
): Promise<RelayRecipient> {
  return bridgeFetch<RelayRecipient>(
    `/relay-recipients/${encodeURIComponent(id)}`,
    { method: "PATCH", body: JSON.stringify({ enabled }) }
  );
}

// --- Routing Rules ---
export async function getRoutingRules(): Promise<RoutingRule[]> {
  return bridgeFetch<RoutingRule[]>("/routing-rules");
}

export async function createRoutingRule(
  input: Omit<RoutingRule, "id">
): Promise<RoutingRule> {
  return bridgeFetch<RoutingRule>("/routing-rules", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateRoutingRule(
  id: string,
  input: Omit<RoutingRule, "id">
): Promise<RoutingRule> {
  return bridgeFetch<RoutingRule>(
    `/routing-rules/${encodeURIComponent(id)}`,
    { method: "PUT", body: JSON.stringify(input) }
  );
}

export async function deleteRoutingRule(id: string): Promise<{ ok: boolean }> {
  return bridgeFetch(`/routing-rules/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

// --- Settings V2 ---
export async function getSettingsV2(): Promise<RuntimeSettingsV2> {
  return bridgeFetch<RuntimeSettingsV2>("/settings");
}
