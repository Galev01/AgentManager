import type { HTMLAttributes, ReactNode } from "react";

/**
 * Internal class keys — match the CSS classes in globals.css:
 *   .badge.ok .badge.warn .badge.err .badge.info .badge.acc .badge.mute
 */
export type BadgeKind = "ok" | "warn" | "err" | "info" | "acc" | "mute";

/**
 * Spec-facing tone keys. `error` maps to `err`, `neutral` maps to `mute`.
 */
export type BadgeTone = "neutral" | "ok" | "warn" | "error" | "info";

const TONE_TO_KIND: Record<BadgeTone, BadgeKind> = {
  neutral: "mute",
  ok: "ok",
  warn: "warn",
  error: "err",
  info: "info",
};

interface BadgeProps extends Omit<HTMLAttributes<HTMLSpanElement>, "children"> {
  /** Existing prop — direct CSS class key. */
  kind?: BadgeKind;
  /** Spec alias — tone takes precedence if set. */
  tone?: BadgeTone;
  dot?: boolean;
  children: ReactNode;
}

export function Badge({
  kind = "mute",
  tone,
  dot,
  className,
  children,
  ...rest
}: BadgeProps) {
  const resolvedKind: BadgeKind = tone ? TONE_TO_KIND[tone] : kind;
  const cls = ["badge", resolvedKind, className].filter(Boolean).join(" ");
  return (
    <span className={cls} {...rest}>
      {dot && <span className="dot" style={{ background: "currentColor" }} />}
      {children}
    </span>
  );
}
