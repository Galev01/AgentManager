import { cache } from "react";
import { redirect } from "next/navigation";
import type { AuthUserPublic, PermissionId } from "@openclaw-manager/types";
import { getSid } from "./session";
import { bridgeResolveSession } from "./bridge-auth-client";

export type ResolvedSession = {
  user: AuthUserPublic;
  permissions: PermissionId[];
  sid: string;
} | null;

export const resolveCurrentSession = cache(async (): Promise<ResolvedSession> => {
  const sid = await getSid();
  if (!sid) return null;
  try {
    const r = await bridgeResolveSession(sid);
    if (!r) return null;
    return { user: r.user, permissions: r.permissions, sid };
  } catch {
    return null;
  }
});

export async function getCurrentUser(): Promise<AuthUserPublic | null> {
  const s = await resolveCurrentSession();
  return s?.user ?? null;
}

export async function getEffectivePermissions(): Promise<PermissionId[]> {
  const s = await resolveCurrentSession();
  return s?.permissions ?? [];
}

export async function hasPermission(perm: PermissionId): Promise<boolean> {
  return (await getEffectivePermissions()).includes(perm);
}

export async function requireAuth(): Promise<NonNullable<ResolvedSession>> {
  const s = await resolveCurrentSession();
  if (!s) redirect("/login");
  return s;
}

export async function requirePermission(perm: PermissionId): Promise<NonNullable<ResolvedSession>> {
  const s = await requireAuth();
  if (!s.permissions.includes(perm)) redirect("/403");
  return s;
}

export class AuthFailure extends Error {
  readonly status: number;
  readonly missing?: PermissionId;
  constructor(status: number, message: string, missing?: PermissionId) {
    super(message);
    this.status = status;
    this.missing = missing;
  }
}

export async function requirePermissionApi(perm: PermissionId): Promise<NonNullable<ResolvedSession>> {
  const s = await resolveCurrentSession();
  if (!s) throw new AuthFailure(401, "unauthorized");
  if (!s.permissions.includes(perm)) throw new AuthFailure(403, "forbidden", perm);
  return s;
}

export async function requireAuthApi(): Promise<NonNullable<ResolvedSession>> {
  const s = await resolveCurrentSession();
  if (!s) throw new AuthFailure(401, "unauthorized");
  return s;
}
