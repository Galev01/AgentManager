"use client";

import { useEffect, useState } from "react";

interface LogEntry {
  time: string;
  lvl: "i" | "o" | "w" | "e";
  msg: string;
}

function inferLevel(raw: unknown): "i" | "o" | "w" | "e" {
  if (typeof raw !== "object" || raw === null) return "i";
  const entry = raw as Record<string, unknown>;
  const level = String(entry.level ?? entry.lvl ?? entry.severity ?? "").toLowerCase();
  if (level.startsWith("err") || level === "e") return "e";
  if (level.startsWith("warn") || level === "w") return "w";
  if (level === "ok" || level === "o") return "o";
  return "i";
}

function formatTime(raw: unknown): string {
  let ts: number | null = null;
  if (typeof raw === "number") ts = raw;
  else if (typeof raw === "string") {
    const n = Number(raw);
    ts = isNaN(n) ? null : n;
  }
  if (ts !== null) {
    const d = new Date(ts > 1e12 ? ts : ts * 1000);
    return d.toTimeString().slice(0, 8);
  }
  if (typeof raw === "string" && raw.length >= 8) return raw.slice(0, 8);
  return "--:--:--";
}

function parseLog(raw: unknown): LogEntry {
  if (typeof raw === "object" && raw !== null) {
    const entry = raw as Record<string, unknown>;
    const msg =
      String(entry.message ?? entry.msg ?? entry.text ?? JSON.stringify(raw));
    return {
      time: formatTime(entry.time ?? entry.at ?? entry.ts ?? entry.timestamp),
      lvl: inferLevel(raw),
      msg,
    };
  }
  return { time: "--:--:--", lvl: "i", msg: String(raw) };
}

const LVL_LABEL: Record<string, string> = { i: "INFO", o: "OK", w: "WARN", e: "ERR" };

export function ActivityFeed() {
  const [entries, setEntries] = useState<LogEntry[]>([]);

  async function fetchLogs() {
    try {
      const res = await fetch("/api/logs?lines=50", {
        cache: "no-store",
      });
      if (!res.ok) return;
      const data: unknown[] = await res.json();
      setEntries(Array.isArray(data) ? data.map(parseLog) : []);
    } catch {
      // bridge may be offline — keep previous entries
    }
  }

  useEffect(() => {
    fetchLogs();
    const id = setInterval(fetchLogs, 5000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="mini">
      <div className="mini-h">
        <span className="dot-lamp ok" style={{ margin: 0 }} />
        Live activity
        <span
          style={{
            marginLeft: "auto",
            fontFamily: "JetBrains Mono, monospace",
            fontSize: 10,
            color: "var(--text-faint)",
            textTransform: "none",
            letterSpacing: 0,
          }}
        >
          tail -f
        </span>
      </div>
      <div style={{ maxHeight: 260, overflowY: "auto", marginTop: -2 }}>
        {entries.length === 0 ? (
          <div
            style={{
              color: "var(--text-faint)",
              fontFamily: "JetBrains Mono, monospace",
              fontSize: 11,
              padding: "8px 0",
            }}
          >
            no log entries yet
          </div>
        ) : (
          entries.map((l, i) => (
            <div className="log-line" key={i}>
              <span className="t">{l.time}</span>
              <span className={`lv ${l.lvl}`}>{LVL_LABEL[l.lvl]}</span>
              <span className="m">{l.msg}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
