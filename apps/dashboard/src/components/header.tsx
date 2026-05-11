"use client";
import { Suspense } from "react";
import { useRouter, usePathname } from "next/navigation";
import { AutoRefresh } from "./auto-refresh";
import { GatewayStatus } from "./gateway-status";
import { Icons } from "./icons";
import { RuntimeSelector } from "./runtime/runtime-selector";

// Static health-strip items for Task 1 (real data wired in Task 2)
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
    <div className="health">
      {STATIC_HEALTH.map((item) => (
        <div key={item.label} className={`health-pill ${item.status}`} title={item.label}>
          <span className="dot" />
          <span>{item.label}</span>
        </div>
      ))}
    </div>
  );
}

// Single source of pathname truth — consolidates usePathname() calls
function useNavState() {
  const pathname = usePathname() ?? "/";
  const segments = pathname.split("/").filter(Boolean);
  const crumbs =
    segments.length === 0
      ? ["Overview"]
      : segments.map((p) => p.charAt(0).toUpperCase() + p.slice(1).replace(/-/g, " "));
  const isHome = segments.length === 0;
  const isRoot = segments.length <= 1;
  const parentPath = "/" + segments.slice(0, -1).join("/");
  return { crumbs, isHome, isRoot, parentPath };
}

export function Header({ title }: { title: string }) {
  const router = useRouter();
  const { crumbs, isHome, isRoot, parentPath } = useNavState();

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  };

  return (
    <header className="hd">
      {/* Back / Home nav buttons */}
      {!isHome && (
        <button className="hd-btn" onClick={() => router.push("/")} title="Go home">
          <Icons.home />
        </button>
      )}
      {!isHome && !isRoot && (
        <button className="hd-btn" onClick={() => router.push(parentPath)} title="Go back">
          <span className="rotate-180 inline-flex"><Icons.right /></span>
        </button>
      )}

      {/* Breadcrumbs */}
      <div className="hd-crumb">
        <img src="/ManageClaw-TB-DarkMode.png" alt="ManageClaw" className="hd-logo-img" />
        <span>OpenClaw</span>
        {crumbs.map((crumb, i) => (
          <span key={i} style={{ display: "contents" }}>
            <span className="sep">/</span>
            <span
              style={{
                color: i === crumbs.length - 1 ? "var(--text)" : undefined,
                fontWeight: i === crumbs.length - 1 ? 500 : undefined,
              }}
            >
              {crumb}
            </span>
          </span>
        ))}
      </div>

      <div className="hd-spacer" />

      {/* Health strip (static — Task 2 will wire real data) */}
      <HealthStrip />

      {/* Active-runtime selector (Phase F) */}
      <Suspense fallback={null}>
        <RuntimeSelector />
      </Suspense>

      {/* Gateway status (existing component kept) */}
      <GatewayStatus />

      {/* AutoRefresh (existing, preserved) */}
      <AutoRefresh />

      {/* Logout */}
      <button className="hd-btn" onClick={handleLogout} title="Logout">
        <Icons.x />
        <span>Logout</span>
      </button>
    </header>
  );
}
