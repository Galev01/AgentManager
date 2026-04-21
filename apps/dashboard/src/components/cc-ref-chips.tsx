"use client";

import React, { useState } from "react";
import type { CCRef } from "@openclaw-manager/types";

function refLabel(ref: CCRef): string {
  switch (ref.kind) {
    case "file":
      return ref.range ? `${ref.path} ${ref.range}` : ref.path;
    case "commit":
      return ref.sha.slice(0, 8);
    case "spec":
      return ref.path;
    case "error":
      return ref.text.length > 60 ? ref.text.slice(0, 60) + "…" : ref.text;
    case "session":
      return ref.id;
  }
}

function refHref(ref: CCRef): string | null {
  if (ref.kind === "session") {
    const short = ref.id.split(":").pop();
    return short ? `/claude-code/${short}` : null;
  }
  return null;
}

const REF_KIND_GLYPH: Record<CCRef["kind"], string> = {
  file: "📄",
  commit: "⋄",
  spec: "§",
  error: "!",
  session: "⇄",
};

const chipStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  padding: "2px 6px",
  borderRadius: 4,
  border: "1px solid var(--border)",
  background: "var(--panel)",
  color: "var(--text)",
  fontFamily: "var(--font-mono, JetBrains Mono), monospace",
  fontSize: 11,
  lineHeight: 1.2,
  textDecoration: "none",
  cursor: "default",
};

const linkChipStyle: React.CSSProperties = { ...chipStyle, cursor: "pointer" };

export type CCRefChipsProps = {
  refs: CCRef[];
};

export function CCRefChips({ refs }: CCRefChipsProps) {
  const [expanded, setExpanded] = useState(false);
  if (!refs || refs.length === 0) return null;
  const visible = expanded ? refs : refs.slice(0, 3);
  const hiddenCount = refs.length - visible.length;

  return (
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6, marginTop: 6 }}>
      {visible.map((r, i) => {
        const href = refHref(r);
        const inner = (
          <>
            <span style={{ opacity: 0.7 }}>{REF_KIND_GLYPH[r.kind]}</span>
            <span
              style={{
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                maxWidth: "28ch",
              }}
            >
              {refLabel(r)}
            </span>
            {r.relation ? (
              <span
                style={{
                  opacity: 0.6,
                  fontSize: 10,
                  textTransform: "uppercase",
                  marginLeft: 4,
                }}
              >
                {r.relation}
              </span>
            ) : null}
          </>
        );
        return href ? (
          <a key={i} href={href} style={linkChipStyle}>
            {inner}
          </a>
        ) : (
          <span key={i} style={chipStyle}>
            {inner}
          </span>
        );
      })}
      {hiddenCount > 0 ? (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          style={{
            ...chipStyle,
            color: "var(--text-muted)",
            cursor: "pointer",
            background: "transparent",
          }}
        >
          +{hiddenCount} more
        </button>
      ) : null}
    </div>
  );
}
