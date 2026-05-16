"use client";
import { useState } from "react";
import { useTheme, type Theme } from "./theme-provider";

const SWATCHES: { id: Theme; label: string; style: React.CSSProperties }[] = [
  {
    id: "a",
    label: "Terminal",
    style: { background: "oklch(0.09 0.010 285)", color: "oklch(0.72 0.24 295)" },
  },
  {
    id: "b",
    label: "Studio",
    style: { background: "oklch(0.965 0.004 70)", color: "oklch(0.52 0.27 295)" },
  },
  {
    id: "c",
    label: "Nebula",
    style: {
      background: "linear-gradient(135deg, oklch(0.18 0.05 300) 0%, oklch(0.09 0.022 290) 100%)",
      color: "oklch(0.78 0.24 295)",
    },
  },
];

export function ThemeSwitcher() {
  const { theme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        className="hd-btn"
        onClick={() => setOpen((v) => !v)}
        title="Switch theme"
        aria-label="Switch visual theme"
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="5" />
          <line x1="12" y1="1" x2="12" y2="3" />
          <line x1="12" y1="21" x2="12" y2="23" />
          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
          <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
          <line x1="1" y1="12" x2="3" y2="12" />
          <line x1="21" y1="12" x2="23" y2="12" />
          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
          <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
        </svg>
        <span>Theme</span>
      </button>

      {open && (
        <>
          {/* Backdrop */}
          <div
            style={{ position: "fixed", inset: 0, zIndex: 199 }}
            onClick={() => setOpen(false)}
          />

          {/* Panel */}
          <div
            style={{
              position: "fixed",
              bottom: 20,
              right: 20,
              zIndex: 200,
              background: "var(--panel)",
              border: "1px solid var(--border-strong)",
              borderRadius: "var(--radius-lg)",
              width: 260,
              boxShadow: "0 12px 40px oklch(0 0 0 / 0.5)",
              overflow: "hidden",
            }}
          >
            {/* Header */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "11px 14px",
                borderBottom: "1px solid var(--border)",
                fontSize: 11.5,
                fontWeight: 600,
                color: "var(--text)",
              }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <line x1="4" y1="21" x2="4" y2="14" /><line x1="4" y1="10" x2="4" y2="3" />
                <line x1="12" y1="21" x2="12" y2="12" /><line x1="12" y1="8" x2="12" y2="3" />
                <line x1="20" y1="21" x2="20" y2="16" /><line x1="20" y1="12" x2="20" y2="3" />
                <line x1="1" y1="14" x2="7" y2="14" /><line x1="9" y1="8" x2="15" y2="8" /><line x1="17" y1="16" x2="23" y2="16" />
              </svg>
              <span style={{ flex: 1 }}>Visual Theme</span>
              <button
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  padding: "2px 5px",
                  borderRadius: "var(--radius)",
                  fontSize: 11,
                  color: "var(--text-muted)",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                }}
                onClick={() => setOpen(false)}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            {/* Swatches */}
            <div style={{ padding: 14 }}>
              <div
                style={{
                  fontSize: 9.5,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                  color: "var(--text-faint)",
                  marginBottom: 10,
                }}
              >
                Select Theme
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                {SWATCHES.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => { setTheme(s.id); setOpen(false); }}
                    style={{
                      flex: 1,
                      height: 52,
                      borderRadius: "var(--radius)",
                      border: theme === s.id
                        ? "2px solid var(--accent)"
                        : "2px solid var(--border)",
                      cursor: "pointer",
                      display: "grid",
                      placeItems: "center",
                      fontSize: 9,
                      fontWeight: 800,
                      letterSpacing: "0.04em",
                      transition: "border-color 0.12s, transform 0.1s",
                      transform: theme === s.id ? "translateY(-1px)" : undefined,
                      ...s.style,
                    }}
                    title={s.label}
                  >
                    {s.label}
                  </button>
                ))}
              </div>

              <div
                style={{
                  marginTop: 14,
                  paddingTop: 12,
                  borderTop: "1px solid var(--border)",
                  fontSize: 10.5,
                  color: "var(--text-faint)",
                  fontFamily: "var(--font-mono)",
                  textAlign: "center",
                }}
              >
                current: theme-{theme}
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}
