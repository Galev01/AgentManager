import { Sidebar } from "./sidebar";
import { Header } from "./header";
import { getClaudeCodeEscalationCount } from "@/lib/bridge-client";

export async function AppShell({ title, children }: { title: string; children: React.ReactNode }) {
  const decisionCount = await getClaudeCodeEscalationCount().catch(() => 0);
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
      <Sidebar badges={badges} />
      <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
        <Header title={title} />
        <main style={{ flex: 1 }}>{children}</main>
      </div>
    </div>
  );
}
