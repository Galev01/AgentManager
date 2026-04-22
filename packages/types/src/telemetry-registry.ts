// packages/types/src/telemetry-registry.ts
import type { ContextSchema } from "./telemetry.js";

// Key format: `${feature}::${action}`. feature may contain dots.
//
// Entries marked [phase-2] have no UI callsite in phase 1 and are reserved
// for a later pass that adds the missing UI (filter controls, archive handler,
// agent run/cancel buttons in the agents area, routing edit/reorder UI). The
// registry accepts them now so phase-2 callers don't need a types bump; the
// bridge validator will simply return a `null` schema when queried and drop
// unknown context keys — harmless while the event is unused.
export const TELEMETRY_REGISTRY: Record<string, ContextSchema> = {
  // Conversations
  "conversations::opened":                { conversationKey: "string" },
  "conversations::list_filtered":         { status: "string", q: "string" },          // [phase-2]
  "conversations::reply_sent":            { conversationKey: "string", length: "number" },
  "conversations::conversation_archived": { conversationKey: "string" },               // [phase-2]

  // Review Inbox
  "reviews.inbox::item_opened":           { projectId: "string", itemId: "string" },
  "reviews.inbox::item_triaged":          { projectId: "string", itemId: "string", decision: "string" },
  "reviews.inbox::bulk_triaged":          { projectId: "string", count: "number", decision: "string" },
  "reviews.inbox::filter_applied":        { status: "string", severity: "string" },

  // Agents
  "agents::opened":                       { name: "string" },
  "agents::run_requested":                { name: "string" },                          // [phase-2]
  "agents::run_cancelled":                { name: "string", sessionId: "string" },     // [phase-2]
  "agents::prompt_edited":                { name: "string", length: "number" },

  // Routing
  "routing::rule_created":                { ruleId: "string" },
  "routing::rule_saved":                  { ruleId: "string" },                        // [phase-2]
  "routing::rule_deleted":                { ruleId: "string" },
  "routing::rules_reordered":             { count: "number" },                         // [phase-2]
};

export function registryKey(feature: string, action: string): string {
  return `${feature}::${action}`;
}

export function getContextSchema(feature: string, action: string): ContextSchema | null {
  return TELEMETRY_REGISTRY[registryKey(feature, action)] ?? null;
}
