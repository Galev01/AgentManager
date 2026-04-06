"use client";
import { useEffect, useRef, useState, useCallback } from "react";

interface LogEntry {
  timestamp?: string;
  time?: string;
  level?: string;
  type?: string;
  message?: string;
  msg?: string;
  [key: string]: unknown;
}

function classifyEntry(entry: LogEntry): "error" | "system" | "default" {
  const level = (entry.level || entry.type || "").toLowerCase();
  const msg = (entry.message || entry.msg || "").toLowerCase();
  if (level === "error" || level === "fatal" || level === "critical") return "error";
  if (
    level === "system" ||
    level === "event" ||
    msg.includes("started") ||
    msg.includes("connected") ||
    msg.includes("disconnected") ||
    msg.includes("initialized")
  ) {
    return "system";
  }
  return "default";
}

function formatTimestamp(entry: LogEntry): string {
  const raw = entry.timestamp || entry.time;
  if (!raw) return "";
  try {
    return new Date(raw as string).toLocaleTimeString();
  } catch {
    return String(raw);
  }
}

function formatMessage(entry: LogEntry): string {
  return entry.message || entry.msg || JSON.stringify(entry);
}

function formatLevel(entry: LogEntry): string {
  return (entry.level || entry.type || "INFO").toUpperCase();
}

export function LogViewer({ conversationKey }: { conversationKey: string }) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [paused, setPaused] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const pausedRef = useRef(paused);

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  const fetchLogs = useCallback(async () => {
    if (pausedRef.current) return;
    try {
      const res = await fetch(`/api/logs?conversationKey=${encodeURIComponent(conversationKey)}`);
      if (!res.ok) {
        setError("Failed to fetch logs");
        return;
      }
      const data = await res.json();
      setError(null);
      if (Array.isArray(data)) {
        setLogs(data);
      } else if (data && typeof data === "object" && Array.isArray(data.logs)) {
        setLogs(data.logs);
      } else {
        setLogs([]);
      }
    } catch {
      setError("Bridge unreachable");
    }
  }, [conversationKey]);

  // Auto-scroll on new entries
  useEffect(() => {
    if (!paused && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs, paused]);

  // Poll every 5 seconds
  useEffect(() => {
    fetchLogs();
    const id = setInterval(fetchLogs, 5000);
    return () => clearInterval(id);
  }, [fetchLogs]);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-xs text-text-muted">{logs.length} log entries</span>
        <div className="flex items-center gap-2">
          {error && <span className="text-xs text-danger">{error}</span>}
          <button
            onClick={() => setPaused((p) => !p)}
            className={`rounded px-3 py-1.5 text-xs font-medium transition ${
              paused
                ? "bg-primary text-white hover:bg-primary/80"
                : "bg-dark-border text-text-gray hover:bg-dark-lighter"
            }`}
          >
            {paused ? "Resume" : "Pause"}
          </button>
          <button
            onClick={fetchLogs}
            className="rounded bg-dark-border px-3 py-1.5 text-xs font-medium text-text-gray hover:bg-dark-lighter transition"
          >
            Refresh
          </button>
        </div>
      </div>

      <div
        ref={containerRef}
        className="max-h-96 overflow-y-auto rounded bg-dark font-mono text-xs shadow-card-dark"
        style={{ border: "1px solid var(--color-dark-border, #2B2B2B)" }}
      >
        {logs.length === 0 ? (
          <div className="p-4 text-text-muted italic">
            {error ? error : "No log entries available"}
          </div>
        ) : (
          <div className="p-2 space-y-0.5">
            {logs.map((entry, i) => {
              const kind = classifyEntry(entry);
              const ts = formatTimestamp(entry);
              const level = formatLevel(entry);
              const msg = formatMessage(entry);

              return (
                <div key={i} className="flex gap-2 py-0.5 leading-relaxed">
                  {ts && (
                    <span className="shrink-0 text-text-muted w-20 tabular-nums">{ts}</span>
                  )}
                  <span
                    className={`shrink-0 w-14 font-semibold ${
                      kind === "error"
                        ? "text-danger"
                        : kind === "system"
                        ? "text-primary"
                        : "text-text-muted"
                    }`}
                  >
                    {level}
                  </span>
                  <span
                    className={
                      kind === "error"
                        ? "text-danger"
                        : kind === "system"
                        ? "text-primary"
                        : "text-text-gray"
                    }
                  >
                    {msg}
                  </span>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>
        )}
      </div>
    </div>
  );
}
