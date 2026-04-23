export type AuthAuditKind =
  | "login.success" | "login.failure" | "login.disabled" | "logout"
  | "session.revoked" | "session.expired"
  | "user.created" | "user.updated" | "user.enabled" | "user.disabled" | "user.deleted"
  | "user.password_changed" | "user.password_reset"
  | "role.created" | "role.updated" | "role.deleted" | "role.assigned" | "role.unassigned"
  | "grant.set"
  | "oidc.login.success" | "oidc.login.unlinked"
  | "oidc.link.added" | "oidc.link.removed"
  | "bootstrap.success" | "bootstrap.legacy_migration";

export type AuthAuditEntry = {
  at: string;
  kind: AuthAuditKind;
  actorUserId?: string;
  actorUsername?: string;
  targetUserId?: string;
  targetUsername?: string;
  sessionId?: string;
  ip?: string;
  userAgent?: string;
  meta?: Record<string, string | number | boolean>;
};
