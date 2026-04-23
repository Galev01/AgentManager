"use client";
import type { PermissionId } from "@openclaw-manager/types";
import { createContext, useContext, type ReactNode } from "react";

const Ctx = createContext<Set<PermissionId>>(new Set());

export function PermissionProvider({
  permissions,
  children,
}: {
  permissions: PermissionId[];
  children: ReactNode;
}) {
  return <Ctx.Provider value={new Set(permissions)}>{children}</Ctx.Provider>;
}

export function usePermissions(): Set<PermissionId> {
  return useContext(Ctx);
}

export function PermissionGate({
  perm,
  children,
  fallback = null,
}: {
  perm: PermissionId;
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const set = usePermissions();
  if (!set.has(perm)) return <>{fallback}</>;
  return <>{children}</>;
}
