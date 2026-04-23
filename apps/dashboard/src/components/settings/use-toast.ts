"use client";

import { createContext, useContext } from "react";

export type ToastKind = "success" | "error";
export interface Toast {
  id: string;
  kind: ToastKind;
  message: string;
}

export interface ToastApi {
  push: (kind: ToastKind, message: string) => void;
}

export const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}
