"use client";
import { useRouter } from "next/navigation";
import { AutoRefresh } from "./auto-refresh";
import { GatewayStatus } from "./gateway-status";

export function Header({ title }: { title: string }) {
  const router = useRouter();
  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  };
  return (
    <header className="sticky top-0 z-5 flex h-[var(--header-height)] items-center justify-between border-b border-dark-border bg-dark-card/80 px-8 backdrop-blur">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <div className="flex items-center gap-4">
        <GatewayStatus />
        <AutoRefresh />
        <button onClick={handleLogout} className="rounded px-4 py-2 text-sm text-text-muted transition hover:bg-dark-lighter hover:text-text-primary">Logout</button>
      </div>
    </header>
  );
}
