// Catalog entries surfaced to the dashboard UI.
export type ModelDescriptor = {
  id: string;            // provider-qualified, e.g. "openai-codex/gpt-5.4"
  displayName: string;
  provider: string;
  contextWindow?: number;
  maxTokens?: number;
  reasoning?: boolean;
  costInput?: number;
  costOutput?: number;
  cacheRead?: number;
  cacheWrite?: number;
};

export type AgentModelSummary = {
  agentId: string;
  agentName?: string;
  effectiveModelId: string | null;       // resolved by gateway (override else default)
  hasExplicitOverride?: boolean;         // reserved for future use; bridge does not populate in Phase 1
};

export type AgentModelsSnapshot = {
  catalog: ModelDescriptor[];
  agents: AgentModelSummary[];
  globalDefaultModelId: string | null;
  catalogStatus: "ok" | "unavailable";
};
