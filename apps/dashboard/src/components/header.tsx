"use client";
import { Suspense } from "react";
import { useRouter, usePathname } from "next/navigation";
import { AutoRefresh } from "./auto-refresh";
import { GatewayStatus } from "./gateway-status";
import { Icons } from "./icons";
import { RuntimeSelector } from "./runtime/runtime-selector";

type PillStatus = "ok" | "warn" | "err" | "checking";

interface HealthItem {
  label: string;
  status: PillStatus;
}

const STATIC_HEALTH: HealthItem[] = [
  { label: "gateway", status: "ok" },
  { label: "bridge",  status: "ok" },
];

function HealthStrip() {
  return (
    <div className="v2-health">
      {STATIC_HEALTH.map((item) => (
        <div key={item.label} className="v2-health-pill" title={item.label}>
          <span className={`v2-dot v2-dot-${item.status === "checking" ? "off" : item.status}`} />
          <span>{item.label}</span>
        </div>
      ))}
    </div>
  );
}

const SECTION_FOR: Record<string, string> = {
  "": "Monitor",
  "claude-code": "Monitor",
  reviews: "Monitor",
  runtimes: "Runtime",
  agents: "Runtime",
  sessions: "Runtime",
  youtube: "Runtime",
  cron: "Runtime",
  conversations: "OpenClaw",
  channels: "OpenClaw",
  relay: "OpenClaw",
  routing: "OpenClaw",
  tools: "Configure",
  brain: "Configure",
  capabilities: "Advanced",
  commands: "Advanced",
  config: "Advanced",
  settings: "Advanced",
  logs: "Advanced",
  admin: "Admin",
};

function useNavState() {
  const pathname = usePathname() ?? "/";
  const segments = pathname.split("/").filter(Boolean);
  const root = segments[0] ?? "";
  const section = SECTION_FOR[root] ?? "Monitor";
  const leaf =
    segments.length === 0
      ? "Overview"
      : segments
          .map((p) => p.charAt(0).toUpperCase() + p.slice(1).replace(/-/g, " "))
          .join(" / ");
  const crumbs = [section, leaf];
  const isHome = segments.length === 0;
  const isRoot = segments.length <= 1;
  const parentPath = "/" + segments.slice(0, -1).join("/");
  return { crumbs, isHome, isRoot, parentPath };
}

export function Header({ title: _title }: { title: string }) {
  const router = useRouter();
  const { crumbs, isHome, isRoot, parentPath } = useNavState();

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  };

  return (
    <header className="v2-hd">
      {!isHome && (
        <button className="v2-hd-btn" onClick={() => router.push("/")} title="Go home">
          <Icons.home />
        </button>
      )}
      {!isHome && !isRoot && (
        <button className="v2-hd-btn" onClick={() => router.push(parentPath)} title="Go back">
          <span style={{ display: "inline-flex", transform: "rotate(180deg)" }}><Icons.right /></span>
        </button>
      )}

      <div className="v2-hd-crumb">
        {crumbs.map((crumb, i) => (
          <span key={i} style={{ display: "contents" }}>
            {i > 0 && <span className="v2-hd-crumb-sep">/</span>}
            <span className={i === crumbs.length - 1 ? "v2-hd-crumb-cur" : undefined}>{crumb}</span>
          </span>
        ))}
      </div>

      <div className="v2-hd-spacer" />

      <HealthStrip />

      <Suspense fallback={null}>
        <RuntimeSelector />
      </Suspense>

      <GatewayStatus />
      <AutoRefresh />

      <button className="v2-hd-btn" onClick={handleLogout} title="Logout">
        <Icons.x />
        <span>Logout</span>
      </button>
    </header>
  );
}
