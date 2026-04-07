"use client";

import { useEffect, useState } from "react";

type Status = "checking" | "online" | "offline";

export function GatewayStatus() {
  const [status, setStatus] = useState<Status>("checking");

  useEffect(() => {
    let mounted = true;

    async function check() {
      try {
        const res = await fetch("/api/gateway-status");
        if (!mounted) return;
        if (res.ok) {
          const data = await res.json();
          setStatus(data.status === "online" ? "online" : "offline");
        } else {
          setStatus("offline");
        }
      } catch {
        if (mounted) setStatus("offline");
      }
    }

    check();
    const interval = setInterval(check, 30_000);
    return () => { mounted = false; clearInterval(interval); };
  }, []);

  const dot =
    status === "online"
      ? "bg-green-500"
      : status === "offline"
        ? "bg-red-500"
        : "bg-yellow-500 animate-pulse";

  const label =
    status === "online"
      ? "OpenClaw Online"
      : status === "offline"
        ? "OpenClaw Offline"
        : "Checking...";

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-dark-border px-2.5 py-1 text-xs text-text-muted">
      <span className={`h-2 w-2 rounded-full ${dot}`} />
      {label}
    </span>
  );
}
