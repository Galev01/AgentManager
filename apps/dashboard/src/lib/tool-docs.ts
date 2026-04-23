import type { Tool } from "@openclaw-manager/types";

export type ToolDoc = {
  summary: string;
  whenToUse: string;
  examples?: string[];
  relatedSkills?: string[];
};

export type EnrichedTool = Tool & { doc?: ToolDoc };

/**
 * Dashboard-side documentation for tools exposed by the gateway.
 *
 * Policy: only seed entries for tool names verified to exist in this
 * product. Unknown tools fall back to the gateway `description` field.
 * Do not invent docs for speculative names.
 */
export const TOOL_DOCS: Record<string, ToolDoc> = {};

export function lookupToolDoc(name: string): ToolDoc | undefined {
  return TOOL_DOCS[name];
}

export function mergeToolDoc(tool: Tool): EnrichedTool {
  const doc = lookupToolDoc(tool.name);
  return { ...tool, doc };
}
