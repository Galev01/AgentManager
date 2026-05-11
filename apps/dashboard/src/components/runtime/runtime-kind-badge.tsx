import type { RuntimeKind } from "@openclaw-manager/types";

const KIND_STYLES: Record<RuntimeKind, { bg: string; border: string; text: string; label: string }> = {
  openclaw: {
    bg: "rgba(16, 185, 129, 0.10)",
    border: "rgba(16, 185, 129, 0.40)",
    text: "rgb(110, 231, 183)",
    label: "OpenClaw",
  },
  hermes: {
    bg: "rgba(99, 102, 241, 0.10)",
    border: "rgba(99, 102, 241, 0.40)",
    text: "rgb(165, 180, 252)",
    label: "Hermes",
  },
  zeroclaw: {
    bg: "rgba(245, 158, 11, 0.10)",
    border: "rgba(245, 158, 11, 0.40)",
    text: "rgb(252, 211, 77)",
    label: "ZeroClaw",
  },
  nanobot: {
    bg: "rgba(139, 92, 246, 0.10)",
    border: "rgba(139, 92, 246, 0.40)",
    text: "rgb(196, 181, 253)",
    label: "Nanobot",
  },
};

export function RuntimeKindBadge({
  kind,
  title,
  className,
}: {
  kind: RuntimeKind;
  title?: string;
  className?: string;
}) {
  const style = KIND_STYLES[kind];
  return (
    <span
      className={className}
      title={title ?? `Runtime kind: ${style.label}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "1px 8px",
        borderRadius: 999,
        border: `1px solid ${style.border}`,
        background: style.bg,
        color: style.text,
        fontSize: 10,
        fontWeight: 500,
        letterSpacing: 0.4,
        textTransform: "uppercase",
        fontFamily: "var(--font-mono, JetBrains Mono), monospace",
        lineHeight: 1.6,
      }}
    >
      {style.label}
    </span>
  );
}
