import { describe, it, expect } from "vitest";
import type { Tool } from "@openclaw-manager/types";
import { lookupToolDoc, mergeToolDoc, TOOL_DOCS } from "./tool-docs";

describe("tool-docs", () => {
  it("returns undefined for unknown tool names", () => {
    expect(lookupToolDoc("totally.unknown.tool")).toBeUndefined();
  });

  it("registry is an object keyed by tool name", () => {
    expect(typeof TOOL_DOCS).toBe("object");
    for (const [key, doc] of Object.entries(TOOL_DOCS)) {
      expect(typeof key).toBe("string");
      expect(typeof doc.summary).toBe("string");
      expect(typeof doc.whenToUse).toBe("string");
    }
  });

  it("mergeToolDoc keeps gateway description when no doc exists", () => {
    const tool: Tool = { name: "nope.nope", description: "gateway says this" };
    const merged = mergeToolDoc(tool);
    expect(merged.doc).toBeUndefined();
    expect(merged.description).toBe("gateway says this");
  });

  it("mergeToolDoc attaches the doc when one exists, leaving description untouched", () => {
    const name = "test.fixture.tool";
    TOOL_DOCS[name] = { summary: "summary text", whenToUse: "when-to-use text" };
    try {
      const tool: Tool = { name, description: "gateway description" };
      const merged = mergeToolDoc(tool);
      expect(merged.doc).toEqual({ summary: "summary text", whenToUse: "when-to-use text" });
      expect(merged.description).toBe("gateway description");
      expect(merged.name).toBe(name);
    } finally {
      delete TOOL_DOCS[name];
    }
  });
});
