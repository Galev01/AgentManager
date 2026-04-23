import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import type { Tool, EffectiveTool, Skill } from "@openclaw-manager/types";
import { ToolsPanel } from "./tools-panel";
import { TOOL_DOCS } from "@/lib/tool-docs";

describe("ToolsPanel — CTA label reflects available skill count", () => {
  const catalog: Tool[] = [];
  const effective: EffectiveTool[] = [];
  afterEach(() => cleanup());

  it("shows generic copy when zero skills are available", () => {
    const skills: Skill[] = [{ name: "x", status: "installed" }];
    render(<ToolsPanel catalog={catalog} effective={effective} skills={skills} />);
    expect(screen.getByRole("button", { name: /^Browse available skills →$/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Browse \d+ available skill/ })).toBeNull();
  });

  it("shows count + plural copy when two or more skills are available", () => {
    const skills: Skill[] = [
      { name: "a", status: "available" },
      { name: "b", status: "available" },
      { name: "c", status: "installed" },
    ];
    render(<ToolsPanel catalog={catalog} effective={effective} skills={skills} />);
    expect(
      screen.getByRole("button", { name: /^Browse 2 available skills →$/ })
    ).toBeInTheDocument();
  });

  it("shows count + singular copy when exactly one skill is available", () => {
    const skills: Skill[] = [{ name: "a", status: "available" }];
    render(<ToolsPanel catalog={catalog} effective={effective} skills={skills} />);
    expect(
      screen.getByRole("button", { name: /^Browse 1 available skill →$/ })
    ).toBeInTheDocument();
  });

  it("clicking the CTA switches to the Skills tab", () => {
    const skills: Skill[] = [{ name: "a", status: "available" }];
    render(<ToolsPanel catalog={catalog} effective={effective} skills={skills} />);
    // Sanity check: Install button should not be visible before clicking CTA.
    expect(screen.queryByRole("button", { name: /^Install$/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Browse 1 available skill →/ }));
    expect(screen.getByRole("button", { name: /^Install$/ })).toBeInTheDocument();
  });
});

describe("ToolsPanel — Catalog search indexes whenToUse", () => {
  const FIXTURE_NAME = "tmp.widget";
  afterEach(() => cleanup());
  beforeEach(() => {
    TOOL_DOCS[FIXTURE_NAME] = {
      summary: "Widget summary.",
      whenToUse: "Use this when you need to blorbify a quark.",
    };
  });
  afterAll(() => {
    delete TOOL_DOCS[FIXTURE_NAME];
  });

  it("matches tools by whenToUse text", () => {
    const catalog: Tool[] = [{ name: FIXTURE_NAME, description: "generic desc" }];
    render(<ToolsPanel catalog={catalog} effective={[]} skills={[]} />);
    const input = screen.getByRole("textbox", { name: /Search tools/ });
    fireEvent.change(input, { target: { value: "blorbify" } });
    expect(screen.getByText(FIXTURE_NAME)).toBeInTheDocument();
  });

  it("shows 'No tools match that search' when the query has zero hits", () => {
    const catalog: Tool[] = [{ name: FIXTURE_NAME, description: "generic desc" }];
    render(<ToolsPanel catalog={catalog} effective={[]} skills={[]} />);
    const input = screen.getByRole("textbox", { name: /Search tools/ });
    fireEvent.change(input, { target: { value: "absolutely-not-a-real-match" } });
    expect(screen.getByText(/No tools match that search/)).toBeInTheDocument();
  });
});
