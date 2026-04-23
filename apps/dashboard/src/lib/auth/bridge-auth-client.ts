import type {
  AuthUserPublic, PermissionId, AuthRole, AuthSession,
  AuthAuditEntry, WsTicketResponse, AuthUserCreateInput, AuthUserUpdateInput,
  AuthRoleCreateInput, AuthRoleUpdateInput,
} from "@openclaw-manager/types";
import { signActorAssertion } from "./assertion.js";

const BRIDGE_URL = process.env.OPENCLAW_BRIDGE_URL || "http://localhost:3100";
const BRIDGE_TOKEN = process.env.OPENCLAW_BRIDGE_TOKEN || "";

function headers(base: Record<string, string> = {}): Record<string, string> {
  return { "Content-Type": "application/json", Authorization: `Bearer ${BRIDGE_TOKEN}`, ...base };
}

function authHeaders(sub: string, sid: string, username?: string): Record<string, string> {
  return headers({ "x-ocm-actor": signActorAssertion({ sub, sid, username }) });
}

async function bridge<T>(path: string, init?: RequestInit & { sub?: string; sid?: string; username?: string }): Promise<T> {
  const h = init?.sub && init?.sid ? authHeaders(init.sub, init.sid, init.username) : headers();
  const res = await fetch(`${BRIDGE_URL}${path}`, {
    ...init, headers: { ...h, ...(init?.headers as Record<string, string>) },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`bridge ${res.status} ${path}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

export async function bridgeLogin(input: { username: string; password: string }): Promise<{
  sessionId: string; expiresAt: string; user: AuthUserPublic; permissions: PermissionId[];
}> {
  return bridge("/auth/login", { method: "POST", body: JSON.stringify(input) });
}

export async function bridgeLoginLegacy(input: { password: string }): Promise<{
  sessionId: string; expiresAt: string; user: AuthUserPublic; permissions: PermissionId[];
}> {
  return bridge("/auth/login-legacy", { method: "POST", body: JSON.stringify(input) });
}

export async function bridgeBootstrap(input: { token: string; username: string; password: string }): Promise<{ user: AuthUserPublic }> {
  return bridge("/auth/bootstrap", { method: "POST", body: JSON.stringify(input) });
}

export async function bridgeResolveSession(sid: string): Promise<{
  user: AuthUserPublic; permissions: PermissionId[]; session: { id: string; expiresAt: string };
} | null> {
  const res = await fetch(`${BRIDGE_URL}/auth/session/resolve`, {
    method: "POST", headers: headers(), body: JSON.stringify({ sid }), cache: "no-store",
  });
  if (res.status === 401) return null;
  if (!res.ok) throw new Error(`bridge ${res.status}: ${await res.text()}`);
  return res.json();
}

export async function bridgeLogout(sub: string, sid: string, username?: string): Promise<void> {
  await fetch(`${BRIDGE_URL}/auth/logout`, {
    method: "POST", headers: authHeaders(sub, sid, username), cache: "no-store",
  });
}

export async function bridgeChangePassword(
  sub: string, sid: string, username: string,
  input: { oldPassword: string; newPassword: string },
): Promise<void> {
  const res = await fetch(`${BRIDGE_URL}/auth/change-password`, {
    method: "POST", headers: authHeaders(sub, sid, username),
    body: JSON.stringify(input), cache: "no-store",
  });
  if (!res.ok) throw new Error(`bridge ${res.status}: ${await res.text()}`);
}

export async function bridgeIssueWsTicket(sub: string, sid: string): Promise<WsTicketResponse> {
  return bridge("/auth/ws-ticket", { method: "POST", body: "{}", sub, sid });
}

export async function bridgeOidcConfig(): Promise<{ enabled: boolean; displayName?: string }> {
  return bridge("/auth/oidc/config");
}

export async function bridgeOidcStart(returnTo?: string): Promise<{ authorizationUrl: string; state: string }> {
  return bridge("/auth/oidc/start", { method: "POST", body: JSON.stringify({ returnTo }) });
}

export async function bridgeOidcCallback(url: string): Promise<
  | { kind: "logged_in"; sessionId: string; expiresAt: string; returnTo?: string }
  | { kind: "unlinked"; issuer: string; sub: string; email?: string }
> {
  const res = await fetch(`${BRIDGE_URL}/auth/oidc/callback`, {
    method: "POST", headers: headers(), body: JSON.stringify({ url }), cache: "no-store",
  });
  if (res.status === 401) return (await res.json()) as { kind: "unlinked"; issuer: string; sub: string; email?: string };
  if (!res.ok) throw new Error(`bridge ${res.status}: ${await res.text()}`);
  return res.json();
}

export async function bridgeLinkOidcComplete(
  sub: string, sid: string, username: string,
  input: { providerKey: string; issuer: string; sub: string; email?: string; displayName?: string },
): Promise<void> {
  await fetch(`${BRIDGE_URL}/auth/link-oidc/complete`, {
    method: "POST", headers: authHeaders(sub, sid, username),
    body: JSON.stringify(input), cache: "no-store",
  });
}

// --- Admin: users ---
export async function bridgeListUsers(sub: string, sid: string, username: string): Promise<AuthUserPublic[]> {
  const { users } = await bridge<{ users: AuthUserPublic[] }>("/auth/users", { sub, sid, username });
  return users;
}
export async function bridgeGetUser(sub: string, sid: string, username: string, id: string): Promise<AuthUserPublic> {
  const { user } = await bridge<{ user: AuthUserPublic }>(`/auth/users/${encodeURIComponent(id)}`, { sub, sid, username });
  return user;
}
export async function bridgeCreateUser(sub: string, sid: string, username: string, input: AuthUserCreateInput): Promise<AuthUserPublic> {
  const { user } = await bridge<{ user: AuthUserPublic }>("/auth/users", {
    method: "POST", body: JSON.stringify(input), sub, sid, username,
  });
  return user;
}
export async function bridgeUpdateUser(sub: string, sid: string, username: string, id: string, patch: AuthUserUpdateInput): Promise<AuthUserPublic> {
  const { user } = await bridge<{ user: AuthUserPublic }>(`/auth/users/${encodeURIComponent(id)}`, {
    method: "PATCH", body: JSON.stringify(patch), sub, sid, username,
  });
  return user;
}
export async function bridgeDeleteUser(sub: string, sid: string, username: string, id: string): Promise<void> {
  await bridge(`/auth/users/${encodeURIComponent(id)}`, { method: "DELETE", sub, sid, username });
}
export async function bridgeResetPassword(sub: string, sid: string, username: string, id: string, newPassword: string): Promise<void> {
  await bridge(`/auth/users/${encodeURIComponent(id)}/reset-password`, {
    method: "POST", body: JSON.stringify({ newPassword }), sub, sid, username,
  });
}
export async function bridgeUnlinkOidc(
  sub: string, sid: string, username: string,
  id: string, providerKey: string, issuer: string, ssub: string,
): Promise<void> {
  await bridge(
    `/auth/users/${encodeURIComponent(id)}/links/${encodeURIComponent(providerKey)}/${encodeURIComponent(issuer)}/${encodeURIComponent(ssub)}`,
    { method: "DELETE", sub, sid, username },
  );
}

// --- Admin: roles ---
export async function bridgeListRoles(sub: string, sid: string, username: string): Promise<AuthRole[]> {
  const { roles } = await bridge<{ roles: AuthRole[] }>("/auth/roles", { sub, sid, username });
  return roles;
}
export async function bridgeCreateRole(sub: string, sid: string, username: string, input: AuthRoleCreateInput): Promise<AuthRole> {
  const { role } = await bridge<{ role: AuthRole }>("/auth/roles", {
    method: "POST", body: JSON.stringify(input), sub, sid, username,
  });
  return role;
}
export async function bridgeUpdateRole(sub: string, sid: string, username: string, id: string, patch: AuthRoleUpdateInput): Promise<AuthRole> {
  const { role } = await bridge<{ role: AuthRole }>(`/auth/roles/${encodeURIComponent(id)}`, {
    method: "PATCH", body: JSON.stringify(patch), sub, sid, username,
  });
  return role;
}
export async function bridgeDeleteRole(sub: string, sid: string, username: string, id: string): Promise<void> {
  await bridge(`/auth/roles/${encodeURIComponent(id)}`, { method: "DELETE", sub, sid, username });
}

// --- Admin: sessions / audit / providers ---
export async function bridgeListSessions(sub: string, sid: string, username: string, userId?: string): Promise<AuthSession[]> {
  const qs = userId ? `?userId=${encodeURIComponent(userId)}` : "";
  const { sessions } = await bridge<{ sessions: AuthSession[] }>(`/auth/sessions${qs}`, { sub, sid, username });
  return sessions;
}
export async function bridgeRevokeSession(sub: string, sid: string, username: string, targetSid: string): Promise<void> {
  await bridge(`/auth/sessions/${encodeURIComponent(targetSid)}`, { method: "DELETE", sub, sid, username });
}
export async function bridgeTailAudit(sub: string, sid: string, username: string, limit = 100): Promise<AuthAuditEntry[]> {
  const { entries } = await bridge<{ entries: AuthAuditEntry[] }>(`/auth/audit?limit=${limit}`, { sub, sid, username });
  return entries;
}
export async function bridgeGetProviders(sub: string, sid: string, username: string): Promise<{ oidc: unknown }> {
  return bridge("/auth/providers", { sub, sid, username });
}
