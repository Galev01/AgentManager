"use client";

import { useCallback, useState, type ReactNode } from "react";
import { ToastContext, type Toast, type ToastKind } from "./use-toast";

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback((kind: ToastKind, message: string) => {
    const id = `t_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    setToasts((prev) => [...prev, { id, kind, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3500);
  }, []);

  return (
    <ToastContext.Provider value={{ push }}>
      {children}
      <div
        style={{
          position: "fixed",
          right: 16,
          bottom: 16,
          display: "flex",
          flexDirection: "column",
          gap: 8,
          zIndex: 60,
          pointerEvents: "none",
        }}
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            style={{
              pointerEvents: "auto",
              padding: "8px 12px",
              borderRadius: "var(--radius)",
              border: `1px solid ${t.kind === "success" ? "var(--ok)" : "var(--err)"}`,
              background: t.kind === "success" ? "var(--ok-dim)" : "var(--err-dim)",
              color: t.kind === "success" ? "var(--ok)" : "var(--err)",
              fontSize: 12.5,
              minWidth: 220,
              maxWidth: 360,
              boxShadow: "0 8px 24px -8px rgba(0,0,0,0.35)",
            }}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
