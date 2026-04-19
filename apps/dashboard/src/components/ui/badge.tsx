import type { ReactNode } from "react";

export type BadgeKind = "ok" | "warn" | "err" | "info" | "acc" | "mute";

interface BadgeProps {
  kind?: BadgeKind;
  dot?: boolean;
  children: ReactNode;
}

export function Badge({ kind = "mute", dot, children }: BadgeProps) {
  return (
    <span className={`badge ${kind}`}>
      {dot && <span className="dot" style={{ background: "currentColor" }} />}
      {children}
    </span>
  );
}
