import type { PermissionId } from "./permissions.js";

export type AuthUserStatus = "active" | "disabled";
export type AuthGrantKind = "allow" | "deny";
export type AuthGrant = { permissionId: PermissionId; kind: AuthGrantKind };

export type AuthLinkedIdentity = {
  providerKey: string;
  issuer: string;
  sub: string;
  email?: string;
  displayName?: string;
  linkedAt: string;
};

export type AuthLocalCreds = { passwordHash: string; passwordUpdatedAt: string };

export type AuthUser = {
  id: string;
  username: string;
  usernameKey: string;
  displayName?: string;
  email?: string;
  status: AuthUserStatus;
  local?: AuthLocalCreds;
  roleIds: string[];
  grants: AuthGrant[];
  linkedIdentities: AuthLinkedIdentity[];
  createdAt: string;
  updatedAt: string;
  lastLoginAt?: string;
};

export type AuthUserPublic = Omit<AuthUser, "local" | "usernameKey"> & {
  hasLocalPassword: boolean;
};

export type AuthRole = {
  id: string;
  name: string;
  description?: string;
  system: boolean;
  grants: Array<{ permissionId: PermissionId; kind: "allow" }>;
  createdAt: string;
  updatedAt: string;
};

export type AuthUsersFile = { version: 1; users: Record<string, AuthUser> };
export type AuthRolesFile = { version: 1; roles: Record<string, AuthRole> };

export type AuthUserCreateInput = {
  username: string;
  displayName?: string;
  email?: string;
  password?: string;
  roleIds?: string[];
  grants?: AuthGrant[];
  status?: AuthUserStatus;
};

export type AuthUserUpdateInput = {
  displayName?: string;
  email?: string;
  status?: AuthUserStatus;
  roleIds?: string[];
  grants?: AuthGrant[];
};

export type AuthRoleCreateInput = { name: string; description?: string; grants?: PermissionId[] };
export type AuthRoleUpdateInput = { name?: string; description?: string; grants?: PermissionId[] };
