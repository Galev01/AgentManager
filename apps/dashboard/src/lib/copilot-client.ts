import { actorHeaders } from "./auth/bridge-actor";
import type {
  CopilotSessionMeta,
  CopilotSessionSnapshot,
  CopilotSessionCreateInput,
  CopilotTurnPollResponse,
  CopilotTurnSubmitInput,
} from "@openclaw-manager/types";

const BRIDGE_URL = process.env.OPENCLAW_BRIDGE_URL || "http://localhost:3100";
const BRIDGE_TOKEN = process.env.OPENCLAW_BRIDGE_TOKEN || "";

async function bridgeFetch(path: string, options?: RequestInit): Promise<Response> {
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
  return res;
}

export async function listSessions(): Promise<CopilotSessionMeta[]> {
  const res = await bridgeFetch("/copilot/sessions");
  const body = await res.json();
  return body.sessions as CopilotSessionMeta[];
}

export async function createSession(input: CopilotSessionCreateInput): Promise<CopilotSessionMeta> {
  const res = await bridgeFetch("/copilot/sessions", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return res.json();
}

export async function getSnapshot(sessionId: string): Promise<CopilotSessionSnapshot> {
  const res = await bridgeFetch(`/copilot/sessions/${encodeURIComponent(sessionId)}`);
  return res.json();
}

export async function deleteSession(sessionId: string): Promise<void> {
  const url = `${BRIDGE_URL}/copilot/sessions/${encodeURIComponent(sessionId)}`;
  const actor = await actorHeaders();
  const res = await fetch(url, {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${BRIDGE_TOKEN}`,
      ...actor,
    },
    next: { revalidate: 0 },
  });
  if (res.status !== 204 && !res.ok) {
    throw new Error(`Bridge ${res.status}: ${await res.text()}`);
  }
}

export async function submitTurn(
  sessionId: string,
  input: CopilotTurnSubmitInput,
): Promise<{ msg_id: string; state: string }> {
  const res = await bridgeFetch(`/copilot/sessions/${encodeURIComponent(sessionId)}/turn`, {
    method: "POST",
    body: JSON.stringify(input),
  });
  return res.json();
}

export async function pollTurn(sessionId: string, msgId: string): Promise<CopilotTurnPollResponse> {
  const res = await bridgeFetch(
    `/copilot/sessions/${encodeURIComponent(sessionId)}/turn/${encodeURIComponent(msgId)}`,
  );
  return res.json();
}
