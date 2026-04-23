import crypto from "node:crypto";
import type {
  AuthUser, AuthUserPublic, AuthUserCreateInput, AuthUserUpdateInput,
  AuthRoleCreateInput, AuthRoleUpdateInput, AuthRole, AuthSession,
  PermissionId, WsTicketResponse,
} from "@openclaw-manager/types";
import { ALL_PERMISSION_IDS } from "@openclaw-manager/types";
import { createAuthStore } from "./store.js";
import { createSessionStore, type SessionStore } from "./session-store.js";
import { createAuditLog } from "./audit.js";
import { createWsTicketStore } from "./ws-ticket.js";
import { hashPassword, verifyPassword } from "./hash.js";
import { evaluateEffective } from "./permissions.js";

export type AuthServiceConfig = {
  usersPath: string; rolesPath: string; linksPath: string; bootstrapPath: string;
  sessionsDir: string; auditPath: string;
  sessionTtlMs: number; lastSeenThrottleMs: number; wsTicketTtlMs: number;
};

export type LoginInput = { username: string; password: string; userAgent?: string; ip?: string };
export type LoginResult =
  | { ok: true; sessionId: string; expiresAt: string; user: AuthUserPublic; permissions: PermissionId[] }
  | { ok: false; reason: "invalid_credentials" | "disabled" | "unknown" };

export type ResolveResult = {
  user: AuthUserPublic; permissions: PermissionId[];
  session: { id: string; expiresAt: string };
};

export type BootstrapResult =
  | { ok: true; user: AuthUserPublic }
  | { ok: false; reason: "already_completed" | "invalid_token" | "invalid_input" };

export const SYSTEM_ROLES = {
  admin: { name: "Admin", description: "Full access", grants: ALL_PERMISSION_IDS },
  "auth-admin": {
    name: "Auth Admin", description: "Manage users/roles/providers/audit/sessions",
    grants: [
      "auth.users.read","auth.users.write",
      "auth.roles.read","auth.roles.write",
      "auth.providers.read","auth.providers.write",
      "auth.sessions.read","auth.sessions.revoke",
      "auth.audit.read",
    ] as PermissionId[],
  },
  operator: {
    name: "Operator", description: "Day-to-day operations",
    grants: [
      "overview.view",
      "conversations.view","conversations.takeover","conversations.release",
      "conversations.wake","conversations.send",
      "claude_code.view","claude_code.resolve_pending","claude_code.change_mode",
      "claude_code.summarize","claude_code.rename",
      "reviews.view","reviews.triage","reviews.run_now",
      "agents.view",
      "agent_sessions.view","agent_sessions.create","agent_sessions.send",
      "agent_sessions.reset","agent_sessions.abort","agent_sessions.compact",
      "youtube.view","youtube.submit","youtube.chat","youtube.rebuild","youtube.rerun",
      "cron.view","cron.run",
      "channels.view",
      "tools.view",
      "routing.view","relay.view",
      "brain.people.read","brain.people.write",
      "brain.global.read",
      "capabilities.view",
      "settings.read",
      "logs.read","telemetry.read",
    ] as PermissionId[],
  },
  viewer: {
    name: "Viewer", description: "Read-only",
    grants: [
      "overview.view","conversations.view","claude_code.view","reviews.view",
      "agents.view","agent_sessions.view","youtube.view","cron.view","channels.view",
      "tools.view","routing.view","relay.view",
      "brain.people.read","brain.global.read",
      "capabilities.view","settings.read","logs.read","telemetry.read",
    ] as PermissionId[],
  },
};

function toPublic(u: AuthUser): AuthUserPublic {
  const { local, usernameKey: _k, ...rest } = u;
  return { ...rest, hasLocalPassword: !!local?.passwordHash };
}

export async function createAuthService(cfg: AuthServiceConfig) {
  const store = createAuthStore({
    usersPath: cfg.usersPath, rolesPath: cfg.rolesPath,
    linksPath: cfg.linksPath, bootstrapPath: cfg.bootstrapPath,
  });
  const sessions: SessionStore = createSessionStore({
    dir: cfg.sessionsDir, ttlMs: cfg.sessionTtlMs, lastSeenThrottleMs: cfg.lastSeenThrottleMs,
  });
  const audit = createAuditLog({ path: cfg.auditPath });
  const wsTickets = createWsTicketStore({ ttlMs: cfg.wsTicketTtlMs });

  async function effectivePermissions(user: AuthUser): Promise<PermissionId[]> {
    return evaluateEffective(user, await store.listRoles());
  }

  async function issueSession(user: AuthUser, origin: "local" | "oidc", ctx: { userAgent?: string; ip?: string }) {
    const session = await sessions.create({ userId: user.id, origin, userAgent: ctx.userAgent, ip: ctx.ip });
    await store.recordLogin(user.id);
    const permissions = await effectivePermissions(user);
    return { session, permissions };
  }

  return {
    store, sessions, audit, wsTickets,
    async ensureSystemRoles(): Promise<void> {
      for (const [id, def] of Object.entries(SYSTEM_ROLES)) {
        await store.upsertSystemRole(id, def);
      }
    },
    async isEmpty(): Promise<boolean> { return store.isEmpty(); },
    async listUsers(): Promise<AuthUserPublic[]> { return (await store.listUsers()).map(toPublic); },
    async getUserPublic(id: string): Promise<AuthUserPublic | null> {
      const u = await store.getUser(id);
      return u ? toPublic(u) : null;
    },
    async adminCreateUser(input: AuthUserCreateInput, actor: string): Promise<AuthUserPublic> {
      const { password, ...rest } = input;
      const u = await store.createUser(rest);
      if (password) await store.setLocalPassword(u.id, await hashPassword(password));
      await audit.append({ kind: "user.created", actorUsername: actor, targetUserId: u.id, targetUsername: u.username });
      return toPublic((await store.getUser(u.id))!);
    },
    async adminUpdateUser(id: string, patch: AuthUserUpdateInput, actor: string): Promise<AuthUserPublic> {
      const before = await store.getUser(id);
      const after = await store.updateUser(id, patch);
      if (before && before.status === "active" && after.status === "disabled") {
        const revoked = await sessions.revokeAllForUser(id);
        await audit.append({
          kind: "user.disabled", actorUsername: actor,
          targetUserId: id, targetUsername: after.username,
          meta: { revokedSessions: revoked },
        });
      } else if (before && before.status === "disabled" && after.status === "active") {
        await audit.append({ kind: "user.enabled", actorUsername: actor, targetUserId: id, targetUsername: after.username });
      } else {
        await audit.append({ kind: "user.updated", actorUsername: actor, targetUserId: id, targetUsername: after.username });
      }
      return toPublic(after);
    },
    async adminDeleteUser(id: string, actor: string): Promise<void> {
      const u = await store.getUser(id);
      if (!u) return;
      await sessions.revokeAllForUser(id);
      await store.deleteUser(id);
      await audit.append({ kind: "user.deleted", actorUsername: actor, targetUserId: id, targetUsername: u.username });
    },
    async adminResetPassword(userId: string, newPassword: string, actor: string): Promise<void> {
      if (newPassword.length < 8) throw new Error("password too short");
      await store.setLocalPassword(userId, await hashPassword(newPassword));
      await sessions.revokeAllForUser(userId);
      const u = await store.getUser(userId);
      await audit.append({ kind: "user.password_reset", actorUsername: actor, targetUserId: userId, targetUsername: u?.username });
    },
    async changePassword(userId: string, input: { oldPassword: string; newPassword: string }): Promise<void> {
      if (input.newPassword.length < 8) throw new Error("password too short");
      const u = await store.getUser(userId);
      if (!u?.local?.passwordHash) throw new Error("no local password set");
      if (!(await verifyPassword(input.oldPassword, u.local.passwordHash))) throw new Error("old password incorrect");
      await store.setLocalPassword(userId, await hashPassword(input.newPassword));
      await audit.append({
        kind: "user.password_changed", actorUserId: userId, actorUsername: u.username,
        targetUserId: userId, targetUsername: u.username,
      });
    },
    async login(input: LoginInput): Promise<LoginResult> {
      const user = await store.findByUsername(input.username);
      const fail = { ok: false as const, reason: "invalid_credentials" as const };
      if (!user || !user.local?.passwordHash) {
        await audit.append({ kind: "login.failure", actorUsername: input.username, ip: input.ip, userAgent: input.userAgent });
        return fail;
      }
      if (!(await verifyPassword(input.password, user.local.passwordHash))) {
        await audit.append({ kind: "login.failure", actorUsername: input.username, ip: input.ip, userAgent: input.userAgent });
        return fail;
      }
      if (user.status !== "active") {
        await audit.append({ kind: "login.disabled", actorUserId: user.id, actorUsername: user.username, ip: input.ip, userAgent: input.userAgent });
        return { ok: false, reason: "disabled" };
      }
      const { session, permissions } = await issueSession(user, "local", input);
      await audit.append({
        kind: "login.success", actorUserId: user.id, actorUsername: user.username,
        sessionId: session.id, ip: input.ip, userAgent: input.userAgent,
      });
      return { ok: true, sessionId: session.id, expiresAt: session.expiresAt, user: toPublic(user), permissions };
    },
    async loginLegacy(input: { password: string; ip?: string; userAgent?: string }, ctx: { legacyPassword: string }): Promise<LoginResult> {
      if (!ctx.legacyPassword) return { ok: false, reason: "unknown" };
      if (!(await store.isEmpty())) return { ok: false, reason: "unknown" };
      const a = Buffer.from(input.password), b = Buffer.from(ctx.legacyPassword);
      if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return { ok: false, reason: "invalid_credentials" };
      await this.ensureSystemRoles();
      const hash = await hashPassword(input.password);
      const created = await store.createUser({ username: "admin", displayName: "Admin (legacy)", roleIds: ["admin"] });
      await store.setLocalPassword(created.id, hash);
      await store.markBootstrapComplete(created.id);
      await audit.append({ kind: "bootstrap.legacy_migration", actorUsername: "admin", targetUserId: created.id, targetUsername: created.username });
      const user = (await store.getUser(created.id))!;
      const { session, permissions } = await issueSession(user, "local", input);
      return { ok: true, sessionId: session.id, expiresAt: session.expiresAt, user: toPublic(user), permissions };
    },
    async bootstrap(input: { token: string; username: string; password: string }, ctx: { token: string }): Promise<BootstrapResult> {
      if (!ctx.token) return { ok: false, reason: "invalid_token" };
      if ((await store.bootstrapCompletedAt()) || !(await store.isEmpty())) return { ok: false, reason: "already_completed" };
      const a = Buffer.from(input.token), b = Buffer.from(ctx.token);
      if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return { ok: false, reason: "invalid_token" };
      if (!input.username || input.password.length < 8) return { ok: false, reason: "invalid_input" };
      await this.ensureSystemRoles();
      const u = await this.adminCreateUser({ username: input.username, password: input.password, roleIds: ["admin"] }, "bootstrap");
      await store.markBootstrapComplete(u.id);
      await audit.append({ kind: "bootstrap.success", actorUsername: "bootstrap", targetUserId: u.id, targetUsername: u.username });
      return { ok: true, user: u };
    },
    async logout(sid: string): Promise<void> {
      const sess = await sessions.get(sid);
      await sessions.revoke(sid);
      if (sess) {
        const u = await store.getUser(sess.userId);
        await audit.append({ kind: "logout", actorUserId: sess.userId, actorUsername: u?.username, sessionId: sid });
      }
    },
    async resolveSession(input: { sid: string; ip?: string; userAgent?: string }): Promise<ResolveResult | null> {
      const sess = await sessions.touch(input.sid);
      if (!sess) return null;
      const user = await store.getUser(sess.userId);
      if (!user || user.status !== "active") return null;
      const permissions = await effectivePermissions(user);
      return { user: toPublic(user), permissions, session: { id: sess.id, expiresAt: sess.expiresAt } };
    },
    async issueWsTicket(userId: string, sessionId: string): Promise<WsTicketResponse> {
      return wsTickets.issue({ userId, sessionId });
    },
    async consumeWsTicket(ticket: string): Promise<{ userId: string; sessionId: string } | null> {
      return wsTickets.consume(ticket);
    },
    async listSessionsForUser(userId: string): Promise<AuthSession[]> { return sessions.listForUser(userId); },
    async revokeSession(sid: string, actor: string): Promise<void> {
      const sess = await sessions.get(sid);
      await sessions.revoke(sid);
      if (sess) {
        const u = await store.getUser(sess.userId);
        await audit.append({ kind: "session.revoked", actorUsername: actor, targetUserId: sess.userId, targetUsername: u?.username, sessionId: sid });
      }
    },
    async createRole(input: AuthRoleCreateInput, actor: string): Promise<AuthRole> {
      const r = await store.createRole(input);
      await audit.append({ kind: "role.created", actorUsername: actor, meta: { roleId: r.id, name: r.name } });
      return r;
    },
    async updateRole(id: string, patch: AuthRoleUpdateInput, actor: string): Promise<AuthRole> {
      const r = await store.updateRole(id, patch);
      await audit.append({ kind: "role.updated", actorUsername: actor, meta: { roleId: id } });
      return r;
    },
    async deleteRole(id: string, actor: string): Promise<void> {
      await store.deleteRole(id);
      await audit.append({ kind: "role.deleted", actorUsername: actor, meta: { roleId: id } });
    },
  };
}

export type AuthService = Awaited<ReturnType<typeof createAuthService>>;
