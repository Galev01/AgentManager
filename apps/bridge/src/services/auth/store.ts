import crypto from "node:crypto";
import type {
  AuthUser, AuthUsersFile, AuthRole, AuthRolesFile,
  AuthUserCreateInput, AuthUserUpdateInput,
  AuthRoleCreateInput, AuthRoleUpdateInput,
  AuthLinkedIdentity, PermissionId,
} from "@openclaw-manager/types";
import { writeJsonAtomic, readJsonOrDefault } from "../atomic-file.js";

export type AuthStoreConfig = {
  usersPath: string; rolesPath: string; linksPath: string; bootstrapPath: string;
};
type LinksFile = { version: 1; links: Record<string, string> };
type BootstrapFile = { version: 1; completedAt?: string; completedByUserId?: string };

function newId(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(9).toString("base64url")}`;
}
function normUsername(u: string): string { return u.trim().toLowerCase(); }
function lk(providerKey: string, issuer: string, sub: string): string {
  return `${providerKey}|${issuer}|${sub}`;
}

export type AuthStore = ReturnType<typeof createAuthStore>;

export function createAuthStore(cfg: AuthStoreConfig) {
  const locks = new Map<string, Promise<unknown>>();
  async function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const prev = locks.get(key) ?? Promise.resolve();
    const next = prev.then(fn, fn);
    locks.set(key, next.catch(() => undefined));
    return next;
  }
  async function rUsers(): Promise<AuthUsersFile> { return readJsonOrDefault(cfg.usersPath, { version: 1, users: {} }); }
  async function rRoles(): Promise<AuthRolesFile> { return readJsonOrDefault(cfg.rolesPath, { version: 1, roles: {} }); }
  async function rLinks(): Promise<LinksFile>     { return readJsonOrDefault(cfg.linksPath, { version: 1, links: {} }); }
  async function rBoot():  Promise<BootstrapFile> { return readJsonOrDefault(cfg.bootstrapPath, { version: 1 }); }

  return {
    async isEmpty(): Promise<boolean> {
      return Object.keys((await rUsers()).users).length === 0;
    },
    async listUsers(): Promise<AuthUser[]> { return Object.values((await rUsers()).users); },
    async getUser(id: string): Promise<AuthUser | null> { return (await rUsers()).users[id] ?? null; },
    async findByUsername(username: string): Promise<AuthUser | null> {
      const key = normUsername(username);
      for (const u of Object.values((await rUsers()).users)) if (u.usernameKey === key) return u;
      return null;
    },
    async createUser(input: AuthUserCreateInput): Promise<AuthUser> {
      return withLock("users", async () => {
        const f = await rUsers();
        const key = normUsername(input.username);
        for (const u of Object.values(f.users)) if (u.usernameKey === key) throw new Error("user already exists");
        const now = new Date().toISOString();
        const u: AuthUser = {
          id: newId("user"),
          username: input.username.trim(),
          usernameKey: key,
          status: input.status ?? "active",
          roleIds: input.roleIds ?? [],
          grants: input.grants ?? [],
          linkedIdentities: [],
          createdAt: now, updatedAt: now,
        };
        if (input.displayName !== undefined) u.displayName = input.displayName;
        if (input.email !== undefined) u.email = input.email;
        f.users[u.id] = u;
        await writeJsonAtomic(cfg.usersPath, f);
        return u;
      });
    },
    async updateUser(id: string, patch: AuthUserUpdateInput): Promise<AuthUser> {
      return withLock("users", async () => {
        const f = await rUsers();
        const u = f.users[id];
        if (!u) throw new Error("user not found");
        const next: AuthUser = {
          ...u,
          displayName: patch.displayName ?? u.displayName,
          email: patch.email ?? u.email,
          status: patch.status ?? u.status,
          roleIds: patch.roleIds ?? u.roleIds,
          grants: patch.grants ?? u.grants,
          updatedAt: new Date().toISOString(),
        };
        f.users[id] = next;
        await writeJsonAtomic(cfg.usersPath, f);
        return next;
      });
    },
    async setLocalPassword(id: string, hash: string): Promise<void> {
      return withLock("users", async () => {
        const f = await rUsers();
        const u = f.users[id];
        if (!u) throw new Error("user not found");
        u.local = { passwordHash: hash, passwordUpdatedAt: new Date().toISOString() };
        u.updatedAt = u.local.passwordUpdatedAt;
        await writeJsonAtomic(cfg.usersPath, f);
      });
    },
    async clearLocalPassword(id: string): Promise<void> {
      return withLock("users", async () => {
        const f = await rUsers();
        const u = f.users[id];
        if (!u) throw new Error("user not found");
        delete u.local;
        u.updatedAt = new Date().toISOString();
        await writeJsonAtomic(cfg.usersPath, f);
      });
    },
    async recordLogin(id: string): Promise<void> {
      return withLock("users", async () => {
        const f = await rUsers();
        const u = f.users[id];
        if (!u) return;
        u.lastLoginAt = new Date().toISOString();
        await writeJsonAtomic(cfg.usersPath, f);
      });
    },
    async deleteUser(id: string): Promise<void> {
      return withLock("users", async () => {
        const f = await rUsers();
        delete f.users[id];
        await writeJsonAtomic(cfg.usersPath, f);
      });
    },
    async listRoles(): Promise<AuthRole[]> { return Object.values((await rRoles()).roles); },
    async getRole(id: string): Promise<AuthRole | null> { return (await rRoles()).roles[id] ?? null; },
    async createRole(input: AuthRoleCreateInput): Promise<AuthRole> {
      return withLock("roles", async () => {
        const f = await rRoles();
        const now = new Date().toISOString();
        const r: AuthRole = {
          id: newId("role"),
          name: input.name,
          description: input.description,
          system: false,
          grants: (input.grants ?? []).map((permissionId) => ({ permissionId, kind: "allow" })),
          createdAt: now, updatedAt: now,
        };
        f.roles[r.id] = r;
        await writeJsonAtomic(cfg.rolesPath, f);
        return r;
      });
    },
    async upsertSystemRole(id: string, input: { name: string; description?: string; grants: PermissionId[] }): Promise<AuthRole> {
      return withLock("roles", async () => {
        const f = await rRoles();
        const now = new Date().toISOString();
        const existing = f.roles[id];
        const r: AuthRole = {
          id, name: input.name, description: input.description, system: true,
          grants: input.grants.map((permissionId) => ({ permissionId, kind: "allow" })),
          createdAt: existing?.createdAt ?? now, updatedAt: now,
        };
        f.roles[id] = r;
        await writeJsonAtomic(cfg.rolesPath, f);
        return r;
      });
    },
    async updateRole(id: string, patch: AuthRoleUpdateInput): Promise<AuthRole> {
      return withLock("roles", async () => {
        const f = await rRoles();
        const r = f.roles[id];
        if (!r) throw new Error("role not found");
        if (r.system && patch.grants) throw new Error("cannot modify grants of system role");
        const next: AuthRole = {
          ...r,
          name: patch.name ?? r.name,
          description: patch.description ?? r.description,
          grants: patch.grants ? patch.grants.map((permissionId) => ({ permissionId, kind: "allow" })) : r.grants,
          updatedAt: new Date().toISOString(),
        };
        f.roles[id] = next;
        await writeJsonAtomic(cfg.rolesPath, f);
        return next;
      });
    },
    async deleteRole(id: string): Promise<void> {
      return withLock("roles", async () => {
        const f = await rRoles();
        const r = f.roles[id];
        if (r?.system) throw new Error("cannot delete system role");
        delete f.roles[id];
        await writeJsonAtomic(cfg.rolesPath, f);
      });
    },
    async linkOidc(userId: string, input: Omit<AuthLinkedIdentity, "linkedAt">): Promise<void> {
      return withLock("links", async () => {
        const users = await rUsers();
        const u = users.users[userId];
        if (!u) throw new Error("user not found");
        const linked: AuthLinkedIdentity = { ...input, linkedAt: new Date().toISOString() };
        u.linkedIdentities = [
          ...u.linkedIdentities.filter(
            (x) => !(x.providerKey === input.providerKey && x.issuer === input.issuer && x.sub === input.sub),
          ),
          linked,
        ];
        u.updatedAt = linked.linkedAt;
        await writeJsonAtomic(cfg.usersPath, users);
        const links = await rLinks();
        links.links[lk(input.providerKey, input.issuer, input.sub)] = userId;
        await writeJsonAtomic(cfg.linksPath, links);
      });
    },
    async unlinkOidc(userId: string, providerKey: string, issuer: string, sub: string): Promise<void> {
      return withLock("links", async () => {
        const users = await rUsers();
        const u = users.users[userId];
        if (u) {
          u.linkedIdentities = u.linkedIdentities.filter(
            (x) => !(x.providerKey === providerKey && x.issuer === issuer && x.sub === sub),
          );
          u.updatedAt = new Date().toISOString();
          await writeJsonAtomic(cfg.usersPath, users);
        }
        const links = await rLinks();
        delete links.links[lk(providerKey, issuer, sub)];
        await writeJsonAtomic(cfg.linksPath, links);
      });
    },
    async findUserByOidc(providerKey: string, issuer: string, sub: string): Promise<AuthUser | null> {
      const links = await rLinks();
      const userId = links.links[lk(providerKey, issuer, sub)];
      if (!userId) return null;
      return this.getUser(userId);
    },
    async bootstrapCompletedAt(): Promise<string | null> {
      return (await rBoot()).completedAt ?? null;
    },
    async markBootstrapComplete(userId: string): Promise<void> {
      const f = await rBoot();
      f.completedAt = new Date().toISOString();
      f.completedByUserId = userId;
      await writeJsonAtomic(cfg.bootstrapPath, f);
    },
  };
}
