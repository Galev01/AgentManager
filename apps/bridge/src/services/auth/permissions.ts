import type { AuthUser, AuthRole, PermissionId } from "@openclaw-manager/types";

export function evaluateEffective(user: AuthUser, allRoles: AuthRole[]): PermissionId[] {
  if (user.status === "disabled") return [];
  const roleById = new Map(allRoles.map((r) => [r.id, r]));
  const allows = new Set<PermissionId>();
  for (const rid of user.roleIds) {
    const role = roleById.get(rid);
    if (!role) continue;
    for (const g of role.grants) if (g.kind === "allow") allows.add(g.permissionId);
  }
  for (const g of user.grants) if (g.kind === "allow") allows.add(g.permissionId);
  for (const g of user.grants) if (g.kind === "deny") allows.delete(g.permissionId);
  return Array.from(allows).sort();
}

export function hasPermission(effective: PermissionId[], perm: PermissionId): boolean {
  return effective.includes(perm);
}
