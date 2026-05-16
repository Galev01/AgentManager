import { Sidebar } from "./sidebar";
import { Header } from "./header";
import { PermissionProvider } from "./permission-gate";
import { getClaudeCodeEscalationCount } from "@/lib/bridge-client";
import { getCurrentUser, getEffectivePermissions } from "@/lib/auth/current-user";
import { CopilotLauncher } from "@/components/copilot/launcher";

export async function AppShell({ title, children }: { title: string; children: React.ReactNode }) {
  const [decisionCount, currentUser, permissions] = await Promise.all([
    getClaudeCodeEscalationCount().catch(() => 0),
    getCurrentUser().catch(() => null),
    getEffectivePermissions().catch(() => []),
  ]);
  const badges: Record<string, number> =
    decisionCount > 0 ? { claude_code: decisionCount } : {};
  return (
    <PermissionProvider permissions={permissions}>
      <div className="v2-app">
        <Sidebar badges={badges} currentUser={currentUser} permissions={permissions} />
        <div className="v2-main">
          <Header title={title} />
          <main className="v2-content">{children}</main>
        </div>
        <CopilotLauncher defaultBackend={currentUser?.preferences?.copilot?.defaultBackend ?? "openclaw"} />
      </div>
    </PermissionProvider>
  );
}
