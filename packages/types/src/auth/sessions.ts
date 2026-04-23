import type { PermissionId } from "./permissions.js";
import type { AuthUserPublic } from "./users.js";

export type AuthSession = {
  id: string;
  userId: string;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  revokedAt?: string;
  userAgent?: string;
  ip?: string;
  origin: "local" | "oidc";
};

export type AuthSessionResolveRequest = { sid: string; userAgent?: string; ip?: string };
export type AuthSessionResolveResponse = {
  user: AuthUserPublic;
  permissions: PermissionId[];
  session: { id: string; expiresAt: string };
};

export type AuthLoginRequest = { username: string; password: string; userAgent?: string; ip?: string };
export type AuthLoginResponse = {
  sessionId: string;
  expiresAt: string;
  user: AuthUserPublic;
  permissions: PermissionId[];
};

export type WsTicketResponse = { ticket: string; expiresAt: string };
