import { AppShell } from "@/components/app-shell";
import { ToolsPanel } from "@/components/tools-panel";
import {
  getToolsCatalog,
  getEffectiveTools,
  getSkills,
} from "@/lib/bridge-client";
import type { Tool, EffectiveTool, Skill } from "@openclaw-manager/types";

export const metadata = { title: "Tools & Skills" };

export default async function ToolsPage() {
  let catalog: Tool[] = [];
  let effective: EffectiveTool[] = [];
  let skills: Skill[] = [];

  try {
    [catalog, effective, skills] = await Promise.all([
      getToolsCatalog(),
      getEffectiveTools(),
      getSkills(),
    ]);
  } catch {
    // bridge unavailable — show empty lists
  }

  return (
    <AppShell title="Tools & Skills">
      <div className="mx-auto max-w-5xl space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-100">Tools &amp; Skills</h1>
          <p className="mt-1 text-sm text-zinc-400">
            Browse the tool catalog, view effective tool assignments, and manage installed skills.
          </p>
        </div>
        <ToolsPanel catalog={catalog} effective={effective} skills={skills} />
      </div>
    </AppShell>
  );
}
