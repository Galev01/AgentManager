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
      <div className="page-h">
        <div>
          <div className="page-title">Tools &amp; Skills</div>
          <div className="page-sub">
            Browse the tool catalog, see what is active, and install new skills to extend your agents.
          </div>
        </div>
      </div>
      <ToolsPanel catalog={catalog} effective={effective} skills={skills} />
    </AppShell>
  );
}
