import { Sidebar } from "./sidebar";
import { Header } from "./header";
import { PermissionProvider } from "./permission-gate";
import { getClaudeCodeEscalationCount } from "@/lib/bridge-client";
import { getCurrentUser, getEffectivePermissions } from "@/lib/auth/current-user";

export async function AppShell({ title, children }: { title: string; children: React.ReactNode }) {
  const [decisionCount, currentUser, permissions] = await Promise.all([
    getClaudeCodeEscalationCount().catch(() => 0),
    getCurrentUser().catch(() => null),
    getEffectivePermissions().catch(() => []),
  ]);
  const badges: Record<string, number> =
    decisionCount > 0 ? { claude_code: decisionCount } : {};
  return (
    <div
      className="app"
      style={{
        display: "grid",
        gridTemplateColumns: "var(--sb-w) 1fr",
        minHeight: "100vh",
      }}
    >
      <Sidebar badges={badges} currentUser={currentUser} permissions={permissions} />
      <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
        <Header title={title} />
        <main style={{ flex: 1 }}>
          <PermissionProvider permissions={permissions}>{children}</PermissionProvider>
        </main>
      </div>
    </div>
  );
}
