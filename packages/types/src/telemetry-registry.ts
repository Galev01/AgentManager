// packages/types/src/telemetry-registry.ts
import type { ContextSchema } from "./telemetry.js";

// Key format: `${feature}::${action}`. feature may contain dots.
export const TELEMETRY_REGISTRY: Record<string, ContextSchema> = {
  // Conversations
  "conversations::opened":                { conversationKey: "string" },
  "conversations::list_filtered":         { status: "string", q: "string" },
  "conversations::reply_sent":            { conversationKey: "string", length: "number" },
  "conversations::conversation_archived": { conversationKey: "string" },

  // Review Inbox
  "reviews.inbox::item_opened":           { projectId: "string", itemId: "string" },
  "reviews.inbox::item_triaged":          { projectId: "string", itemId: "string", decision: "string" },
  "reviews.inbox::bulk_triaged":          { projectId: "string", count: "number", decision: "string" },
  "reviews.inbox::filter_applied":        { status: "string", severity: "string" },

  // Agents
  "agents::opened":                       { name: "string" },
  "agents::run_requested":                { name: "string" },
  "agents::run_cancelled":                { name: "string", sessionId: "string" },
  "agents::prompt_edited":                { name: "string", length: "number" },

  // Routing
  "routing::rule_created":                { ruleId: "string" },
  "routing::rule_saved":                  { ruleId: "string" },
  "routing::rule_deleted":                { ruleId: "string" },
  "routing::rules_reordered":             { count: "number" },
};

export function registryKey(feature: string, action: string): string {
  return `${feature}::${action}`;
}

export function getContextSchema(feature: string, action: string): ContextSchema | null {
  return TELEMETRY_REGISTRY[registryKey(feature, action)] ?? null;
}
