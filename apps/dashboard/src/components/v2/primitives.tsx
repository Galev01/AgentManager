"use client";
import React, { useEffect, useRef, useState } from "react";

export type V2Status = "ok" | "warn" | "err" | "off";
export type V2BadgeKind = "ok" | "warn" | "err" | "info" | "acc" | "mute";

export function V2Dot({ status }: { status?: V2Status | string }) {
  const cls = ["ok", "warn", "err"].includes(String(status)) ? status : "off";
  return <span className={`v2-dot v2-dot-${cls}`} />;
}

export function V2Badge({
  kind = "mute",
  dot = false,
  children,
}: {
  kind?: V2BadgeKind;
  dot?: boolean;
  children: React.ReactNode;
}) {
  return (
    <span className={`v2-badge v2-badge-${kind}`}>
      {dot && <span className="v2-badge-dot" />}
      {children}
    </span>
  );
}

export function V2Switch({ on, onToggle }: { on: boolean; onToggle?: () => void }) {
  return (
    <button
      type="button"
      className={`v2-sw${on ? " on" : ""}`}
      onClick={onToggle}
      aria-pressed={on}
      aria-label="toggle"
    />
  );
}

export function V2KV({ entries }: { entries: Array<[string, React.ReactNode]> }) {
  return (
    <dl className="v2-kv">
      {entries.map(([k, v]) => (
        <React.Fragment key={k}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </React.Fragment>
      ))}
    </dl>
  );
}

export function V2UptimeBar({ pattern = "gggggggggggg" }: { pattern?: string }) {
  const cols: Record<string, string> = {
    g: "var(--ok)",
    w: "var(--warn)",
    e: "var(--err)",
    o: "var(--t4)",
  };
  return (
    <div className="v2-uptime-bar">
      {pattern.split("").map((c, i) => (
        <div
          key={i}
          className="v2-uptime-seg"
          style={{ background: cols[c] || cols.o, animationDelay: `${i * 12}ms` }}
        />
      ))}
    </div>
  );
}

export function useCount(target: number | string, duration = 700, delay = 0) {
  const num = parseFloat(String(target).replace(/[^0-9.]/g, "")) || 0;
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (num === 0) {
      setVal(0);
      return;
    }
    const timer = setTimeout(() => {
      const t0 = performance.now();
      const tick = (ts: number) => {
        const p = Math.min((ts - t0) / duration, 1);
        const e = 1 - Math.pow(1 - p, 3);
        setVal(num * e);
        if (p < 1) requestAnimationFrame(tick);
        else setVal(num);
      };
      requestAnimationFrame(tick);
    }, delay);
    return () => clearTimeout(timer);
  }, [num, duration, delay]);
  return val;
}

export function V2Spark({
  data,
  color = "var(--a)",
  height = 36,
}: {
  data: number[];
  color?: string;
  height?: number;
}) {
  const pathRef = useRef<SVGPathElement | null>(null);
  const [animated, setAnimated] = useState(false);
  const [pathLen, setPathLen] = useState(500);

  useEffect(() => {
    if (pathRef.current) {
      const len = pathRef.current.getTotalLength();
      setPathLen(len);
      requestAnimationFrame(() => requestAnimationFrame(() => setAnimated(true)));
    }
  }, [JSON.stringify(data)]);

  if (!data || data.length < 2) return null;
  const W = 200,
    H = height;
  const max = Math.max(...data),
    min = Math.min(...data),
    rng = max - min || 1;
  const pts = data.map((v, i) => ({
    x: (i / (data.length - 1)) * W,
    y: H - ((v - min) / rng) * (H - 6) - 3,
  }));
  const d = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
  const gradId = `sg-${color.replace(/[^a-z]/gi, "")}`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ display: "block", width: "100%", height }} preserveAspectRatio="none">
      <defs>
        <linearGradient id={gradId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.18" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${d} L${W} ${H} L0 ${H} Z`} fill={`url(#${gradId})`} />
      <path
        ref={pathRef}
        d={d}
        fill="none"
        stroke={color}
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{
          strokeDasharray: pathLen,
          strokeDashoffset: animated ? 0 : pathLen,
          transition: animated ? "stroke-dashoffset 0.9s cubic-bezier(0.16,1,0.3,1)" : "none",
        }}
      />
    </svg>
  );
}

export function V2Stat({
  label,
  value,
  sub,
  unit,
  spark,
  color,
  delay = 0,
}: {
  label: string;
  value: number | string;
  sub?: string;
  unit?: string | null;
  spark?: number[];
  color?: string;
  delay?: number;
}) {
  const num = parseFloat(String(value).replace(/[^0-9.]/g, "")) || 0;
  const counted = useCount(num, 700, delay);
  const hasDecimal = String(value).includes(".");
  const decimals = hasDecimal ? String(value).split(".")[1].length : 0;
  const display = hasDecimal
    ? counted.toFixed(decimals)
    : counted > 999
    ? Math.round(counted).toLocaleString()
    : Math.round(counted).toString();
  const barColor = color || "var(--a)";
  return (
    <div className="v2-stat" style={{ ["--accent-bar" as string]: barColor } as React.CSSProperties}>
      <div className="v2-stat-label">{label}</div>
      <div className="v2-stat-value">
        {display}
        {unit && <span className="v2-stat-unit">{unit}</span>}
      </div>
      {sub && <div className="v2-stat-sub">{sub}</div>}
      {spark && (
        <div className="v2-stat-spark">
          <V2Spark data={spark} color={barColor} height={36} />
        </div>
      )}
      <div className="v2-stat-bar" />
    </div>
  );
}

export function V2PageHeader({
  title,
  sub,
  actions,
}: {
  title: string;
  sub?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="v2-ph">
      <div className="v2-ph-left">
        <div className="v2-ph-title">{title}</div>
        {sub && <div className="v2-ph-sub">{sub}</div>}
      </div>
      {actions && <div className="v2-ph-actions">{actions}</div>}
    </div>
  );
}
