import { Sidebar } from "./sidebar";
import { Header } from "./header";

export function AppShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      className="app"
      style={{
        display: "grid",
        gridTemplateColumns: "var(--sb-w) 1fr",
        minHeight: "100vh",
      }}
    >
      <Sidebar />
      <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
        <Header title={title} />
        <main style={{ flex: 1 }}>{children}</main>
      </div>
    </div>
  );
}
