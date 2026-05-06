import type { AgentModelsSnapshot, ModelDescriptor, AgentModelSummary } from "@openclaw-manager/types";

export type CallGateway = (method: string, params?: Record<string, unknown>) => Promise<unknown>;

export type AgentModelsService = {
  readSnapshot(): Promise<AgentModelsSnapshot>;
  readCatalog(): Promise<{ models: ModelDescriptor[]; status: "ok" | "unavailable" }>;
  validateModelAgainstCatalog(modelId: string): Promise<{ ok: true } | { ok: false; status: 400 | 503; reason: string }>;
};

type GatewayModelEntry = {
  // gateway returns provider-qualified id at top level; cost/contextWindow optionally
  id?: string;
  key?: string;
  provider?: string;
  name?: string;
  displayName?: string;
  contextWindow?: number;
  maxTokens?: number;
  reasoning?: boolean;
  cost?: { input?: number; output?: number; cacheRead?: number; cacheWrite?: number };
};

type GatewayAgentSummary = {
  id: string;
  name?: string;
  model?: string;
  isDefault?: boolean;
};

function projectModel(raw: GatewayModelEntry): ModelDescriptor | null {
  const id = raw.id ?? raw.key;
  if (typeof id !== "string" || !id.trim()) return null;
  const provider = raw.provider ?? id.split("/")[0] ?? "unknown";
  return {
    id,
    displayName: raw.displayName ?? raw.name ?? id,
    provider,
    contextWindow: raw.contextWindow,
    maxTokens: raw.maxTokens,
    reasoning: raw.reasoning,
    costInput: raw.cost?.input,
    costOutput: raw.cost?.output,
    cacheRead: raw.cost?.cacheRead,
    cacheWrite: raw.cost?.cacheWrite,
  };
}

export function createAgentModelsService(deps: { callGateway: CallGateway }): AgentModelsService {
  const { callGateway } = deps;

  async function readCatalog(): Promise<{ models: ModelDescriptor[]; status: "ok" | "unavailable" }> {
    try {
      const res = (await callGateway("models.list", {})) as { models?: GatewayModelEntry[] };
      const models = Array.isArray(res?.models)
        ? res.models.map(projectModel).filter((m): m is ModelDescriptor => m !== null)
        : [];
      return { models, status: "ok" };
    } catch {
      return { models: [], status: "unavailable" };
    }
  }

  async function readSnapshot(): Promise<AgentModelsSnapshot> {
    const [catalogResult, agentsRaw] = await Promise.all([
      readCatalog(),
      callGateway("agents.list", {}).catch(() => ({ agents: [] as GatewayAgentSummary[] })),
    ]);
    const agents = Array.isArray((agentsRaw as { agents?: GatewayAgentSummary[] })?.agents)
      ? (agentsRaw as { agents: GatewayAgentSummary[] }).agents
      : [];
    const summaries: AgentModelSummary[] = agents.map((a) => ({
      agentId: a.id,
      agentName: a.name,
      effectiveModelId: typeof a.model === "string" && a.model.trim() ? a.model : null,
    }));
    const defaultEntry = agents.find((a) => a.isDefault) ?? agents.find((a) => a.id === "main");
    const globalDefaultModelId = defaultEntry?.model ?? null;
    return {
      catalog: catalogResult.models,
      agents: summaries,
      globalDefaultModelId,
      catalogStatus: catalogResult.status,
    };
  }

  async function validateModelAgainstCatalog(modelId: string) {
    const cat = await readCatalog();
    if (cat.status === "unavailable") {
      return { ok: false, status: 503 as const, reason: "model_catalog_unavailable" };
    }
    if (!cat.models.some((m) => m.id === modelId)) {
      return { ok: false, status: 400 as const, reason: "invalid_model_id" };
    }
    return { ok: true as const };
  }

  return { readSnapshot, readCatalog, validateModelAgainstCatalog };
}
