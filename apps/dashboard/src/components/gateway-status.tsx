"use client";

import { useEffect, useState, useCallback } from "react";

type Status = "checking" | "online" | "offline";

export function GatewayStatus() {
  const [status, setStatus] = useState<Status>("checking");
  const [acting, setActing] = useState(false);

  const check = useCallback(async () => {
    try {
      const res = await fetch("/api/gateway-status");
      if (res.ok) {
        const data = await res.json();
        setStatus(data.status === "online" ? "online" : "offline");
      } else {
        setStatus("offline");
      }
    } catch {
      setStatus("offline");
    }
  }, []);

  useEffect(() => {
    check();
    const interval = setInterval(check, 30_000);
    return () => clearInterval(interval);
  }, [check]);

  async function handleToggle() {
    const action = status === "online" ? "stop" : "start";
    setActing(true);
    try {
      await fetch("/api/gateway-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      // Wait a moment for the gateway to start/stop, then re-check
      await new Promise((r) => setTimeout(r, 3000));
      await check();
    } catch {
      // ignore
    } finally {
      setActing(false);
    }
  }

  const dot =
    status === "online"
      ? "bg-green-500"
      : status === "offline"
        ? "bg-red-500"
        : "bg-yellow-500 animate-pulse";

  const label =
    status === "online"
      ? "Online"
      : status === "offline"
        ? "Offline"
        : "Checking...";

  const buttonLabel = acting
    ? (status === "online" ? "Stopping..." : "Starting...")
    : (status === "online" ? "Stop" : "Start");

  return (
    <div className="inline-flex items-center gap-1 rounded-full border border-dark-border text-xs text-text-muted">
      <span className="inline-flex items-center gap-1.5 pl-2.5 py-1">
        <span className={`h-2 w-2 rounded-full ${dot}`} />
        {label}
      </span>
      <button
        onClick={handleToggle}
        disabled={acting || status === "checking"}
        className={`rounded-full px-2 py-1 font-medium transition disabled:opacity-50 ${
          status === "online"
            ? "text-red-400 hover:bg-red-500/10"
            : "text-green-400 hover:bg-green-500/10"
        }`}
      >
        {buttonLabel}
      </button>
    </div>
  );
}
