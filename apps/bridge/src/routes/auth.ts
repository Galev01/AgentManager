import express, { type Router } from "express";
import { config } from "../config.js";
import type { AuthService } from "../services/auth/service.js";
import { requirePerm } from "../auth-middleware.js";
import { buildAuthRequest, discoverClient, exchangeAndClaims, parseCallback } from "../services/auth/oidc.js";
import type { OidcProviderConfig } from "@openclaw-manager/types";

const oidcStates = new Map<string, { nonce: string; codeVerifier: string; returnTo?: string; expiresAt: number }>();
function cleanOidc(): void {
  const now = Date.now();
  for (const [k, v] of oidcStates) if (v.expiresAt <= now) oidcStates.delete(k);
}
function oidcProvider(): OidcProviderConfig | null {
  if (!config.oidcIssuerUrl || !config.oidcClientId || !config.oidcClientSecret || !config.oidcRedirectUri) return null;
  return {
    key: config.oidcProviderKey, displayName: config.oidcProviderName,
    issuerUrl: config.oidcIssuerUrl, clientId: config.oidcClientId,
    clientSecret: config.oidcClientSecret, redirectUri: config.oidcRedirectUri,
    scopes: config.oidcScopes, autoProvision: config.oidcAutoProvision,
  };
}

export function createPublicAuthRouter(svc: AuthService): Router {
  const r = express.Router();

  r.post("/auth/login", async (req, res) => {
    const { username, password } = req.body ?? {};
    if (typeof username !== "string" || typeof password !== "string") {
      res.status(400).json({ error: "username and password required" });
      return;
    }
    if (await svc.isEmpty() && !config.authLegacyAdminPassword) {
      res.status(401).json({ error: "bootstrap_required" });
      return;
    }
    const result = await svc.login({
      username, password,
      userAgent: req.headers["user-agent"] ?? undefined, ip: req.ip,
    });
    if (!result.ok) { res.status(401).json({ error: "invalid_credentials" }); return; }
    res.json({
      sessionId: result.sessionId, expiresAt: result.expiresAt,
      user: result.user, permissions: result.permissions,
    });
  });

  r.post("/auth/login-legacy", async (req, res) => {
    const { password } = req.body ?? {};
    if (typeof password !== "string") { res.status(400).json({ error: "password required" }); return; }
    const result = await svc.loginLegacy(
      { password, userAgent: req.headers["user-agent"] ?? undefined, ip: req.ip },
      { legacyPassword: config.authLegacyAdminPassword },
    );
    if (!result.ok) { res.status(401).json({ error: "not_available" }); return; }
    res.json({
      sessionId: result.sessionId, expiresAt: result.expiresAt,
      user: result.user, permissions: result.permissions,
    });
  });

  r.post("/auth/bootstrap", async (req, res) => {
    const { token, username, password } = req.body ?? {};
    if (typeof token !== "string" || typeof username !== "string" || typeof password !== "string") {
      res.status(400).json({ error: "token, username, password required" });
      return;
    }
    const result = await svc.bootstrap({ token, username, password }, { token: config.authBootstrapToken });
    if (!result.ok) { res.status(403).json({ error: result.reason }); return; }
    res.json({ user: result.user });
  });

  r.post("/auth/session/resolve", async (req, res) => {
    const { sid } = req.body ?? {};
    if (typeof sid !== "string") { res.status(400).json({ error: "sid required" }); return; }
    const r2 = await svc.resolveSession({
      sid, userAgent: req.headers["user-agent"] ?? undefined, ip: req.ip,
    });
    if (!r2) { res.status(401).json({ error: "invalid_session" }); return; }
    res.json(r2);
  });

  r.get("/auth/oidc/config", (_req, res) => {
    const p = oidcProvider();
    res.json({ enabled: !!p, displayName: p?.displayName });
  });

  r.post("/auth/oidc/start", async (req, res) => {
    cleanOidc();
    const p = oidcProvider();
    if (!p) { res.status(404).json({ error: "oidc_not_configured" }); return; }
    try {
      const ctx = await discoverClient(p);
      const meta: any = ctx.config.serverMetadata();
      const ar = buildAuthRequest({
        issuerUrl: p.issuerUrl, clientId: p.clientId,
        redirectUri: p.redirectUri, scopes: p.scopes,
        authorizationEndpoint: String(meta.authorization_endpoint),
      });
      oidcStates.set(ar.state, {
        nonce: ar.nonce, codeVerifier: ar.codeVerifier,
        returnTo: typeof req.body?.returnTo === "string" ? req.body.returnTo : undefined,
        expiresAt: Date.now() + 10 * 60 * 1000,
      });
      res.json({ authorizationUrl: ar.url, state: ar.state });
    } catch (err) {
      res.status(500).json({ error: "oidc_discovery_failed", detail: String((err as Error).message) });
    }
  });

  r.post("/auth/oidc/callback", async (req, res) => {
    cleanOidc();
    const p = oidcProvider();
    if (!p) { res.status(404).json({ error: "oidc_not_configured" }); return; }
    const { url } = req.body ?? {};
    if (typeof url !== "string") { res.status(400).json({ error: "url required" }); return; }
    const parsed = parseCallback(url);
    if (!parsed) { res.status(400).json({ error: "invalid_callback" }); return; }
    const state = oidcStates.get(parsed.state);
    if (!state) { res.status(400).json({ error: "invalid_state" }); return; }
    oidcStates.delete(parsed.state);
    try {
      const ctx = await discoverClient(p);
      const id = await exchangeAndClaims(ctx, {
        currentUrl: new URL(url), state: parsed.state,
        nonce: state.nonce, codeVerifier: state.codeVerifier,
      });
      let user = await svc.store.findUserByOidc(p.key, id.issuer, id.sub);
      if (!user && p.autoProvision) {
        const created = await svc.adminCreateUser(
          { username: id.email || `oidc-${id.sub.slice(0, 8)}`, displayName: id.name, email: id.email },
          "oidc-provision",
        );
        await svc.store.linkOidc(created.id, {
          providerKey: p.key, issuer: id.issuer, sub: id.sub, email: id.email, displayName: id.name,
        });
        user = await svc.store.getUser(created.id);
      }
      if (!user) {
        await svc.audit.append({
          kind: "oidc.login.unlinked",
          meta: { issuer: id.issuer, sub: id.sub, email: id.email ?? "" },
        });
        res.status(401).json({ kind: "unlinked", issuer: id.issuer, sub: id.sub, email: id.email });
        return;
      }
      if (user.status !== "active") { res.status(403).json({ error: "disabled" }); return; }
      const sess = await svc.sessions.create({
        userId: user.id, origin: "oidc",
        userAgent: req.headers["user-agent"] ?? undefined, ip: req.ip,
      });
      await svc.store.recordLogin(user.id);
      await svc.audit.append({
        kind: "oidc.login.success", actorUserId: user.id, actorUsername: user.username,
        sessionId: sess.id,
      });
      res.json({ kind: "logged_in", sessionId: sess.id, expiresAt: sess.expiresAt, returnTo: state.returnTo });
    } catch (err) {
      res.status(400).json({ error: "oidc_exchange_failed", detail: String((err as Error).message) });
    }
  });

  return r;
}

export function createAuthRouter(svc: AuthService): Router {
  const r = express.Router();

  r.post("/auth/logout", async (req, res) => {
    if (!req.auth) { res.status(401).json({ error: "unauthorized" }); return; }
    await svc.logout(req.auth.claims.sid);
    res.json({ ok: true });
  });
  r.get("/auth/me", (req, res) => {
    if (!req.auth) { res.status(401).json({ error: "unauthorized" }); return; }
    res.json({ user: req.auth.user, permissions: req.auth.permissions });
  });
  r.post("/auth/change-password", async (req, res) => {
    if (!req.auth) { res.status(401).json({ error: "unauthorized" }); return; }
    const { oldPassword, newPassword } = req.body ?? {};
    if (typeof oldPassword !== "string" || typeof newPassword !== "string") {
      res.status(400).json({ error: "oldPassword and newPassword required" });
      return;
    }
    try { await svc.changePassword(req.auth.user.id, { oldPassword, newPassword }); res.json({ ok: true }); }
    catch (err) { res.status(400).json({ error: (err as Error).message }); }
  });
  r.post("/auth/ws-ticket", async (req, res) => {
    if (!req.auth) { res.status(401).json({ error: "unauthorized" }); return; }
    const t = await svc.issueWsTicket(req.auth.user.id, req.auth.claims.sid);
    res.json(t);
  });
  // Self-service: any authenticated user may link their own account.
  r.post("/auth/link-oidc/complete", async (req, res) => {
    if (!req.auth) { res.status(401).json({ error: "unauthorized" }); return; }
    const { providerKey, issuer, sub, email, displayName } = req.body ?? {};
    if (typeof providerKey !== "string" || typeof issuer !== "string" || typeof sub !== "string") {
      res.status(400).json({ error: "providerKey, issuer, sub required" });
      return;
    }
    await svc.store.linkOidc(req.auth.user.id, { providerKey, issuer, sub, email, displayName });
    await svc.audit.append({ kind: "oidc.link.added", actorUsername: req.auth.user.username, targetUserId: req.auth.user.id });
    res.json({ ok: true });
  });

  // --- Admin: users ---
  r.get("/auth/users", requirePerm("auth.users.read"), async (_req, res) => {
    res.json({ users: await svc.listUsers() });
  });
  r.post("/auth/users", requirePerm("auth.users.write"), async (req, res) => {
    if (!req.auth) { res.status(401).json({ error: "unauthorized" }); return; }
    res.json({ user: await svc.adminCreateUser(req.body ?? {}, req.auth.user.username) });
  });
  r.get("/auth/users/:id", requirePerm("auth.users.read"), async (req, res) => {
    const u = await svc.getUserPublic(req.params.id);
    if (!u) { res.status(404).json({ error: "not_found" }); return; }
    res.json({ user: u });
  });
  r.patch("/auth/users/:id", requirePerm("auth.users.write"), async (req, res) => {
    if (!req.auth) { res.status(401).json({ error: "unauthorized" }); return; }
    res.json({ user: await svc.adminUpdateUser(req.params.id, req.body ?? {}, req.auth.user.username) });
  });
  r.delete("/auth/users/:id", requirePerm("auth.users.write"), async (req, res) => {
    if (!req.auth) { res.status(401).json({ error: "unauthorized" }); return; }
    if (req.params.id === req.auth.user.id) { res.status(400).json({ error: "cannot_delete_self" }); return; }
    await svc.adminDeleteUser(req.params.id, req.auth.user.username);
    res.json({ ok: true });
  });
  r.post("/auth/users/:id/reset-password", requirePerm("auth.users.write"), async (req, res) => {
    if (!req.auth) { res.status(401).json({ error: "unauthorized" }); return; }
    const { newPassword } = req.body ?? {};
    if (typeof newPassword !== "string") { res.status(400).json({ error: "newPassword required" }); return; }
    await svc.adminResetPassword(req.params.id, newPassword, req.auth.user.username);
    res.json({ ok: true });
  });
  r.delete("/auth/users/:id/links/:providerKey/:issuer/:sub", requirePerm("auth.users.write"), async (req, res) => {
    if (!req.auth) { res.status(401).json({ error: "unauthorized" }); return; }
    await svc.store.unlinkOidc(req.params.id, req.params.providerKey,
      decodeURIComponent(req.params.issuer), req.params.sub);
    await svc.audit.append({ kind: "oidc.link.removed", actorUsername: req.auth.user.username, targetUserId: req.params.id });
    res.json({ ok: true });
  });

  // --- Admin: roles ---
  r.get("/auth/roles", requirePerm("auth.roles.read"), async (_req, res) => {
    res.json({ roles: await svc.store.listRoles() });
  });
  r.post("/auth/roles", requirePerm("auth.roles.write"), async (req, res) => {
    if (!req.auth) { res.status(401).json({ error: "unauthorized" }); return; }
    res.json({ role: await svc.createRole(req.body ?? {}, req.auth.user.username) });
  });
  r.patch("/auth/roles/:id", requirePerm("auth.roles.write"), async (req, res) => {
    if (!req.auth) { res.status(401).json({ error: "unauthorized" }); return; }
    try { res.json({ role: await svc.updateRole(req.params.id, req.body ?? {}, req.auth.user.username) }); }
    catch (err) { res.status(400).json({ error: (err as Error).message }); }
  });
  r.delete("/auth/roles/:id", requirePerm("auth.roles.write"), async (req, res) => {
    if (!req.auth) { res.status(401).json({ error: "unauthorized" }); return; }
    try { await svc.deleteRole(req.params.id, req.auth.user.username); res.json({ ok: true }); }
    catch (err) { res.status(400).json({ error: (err as Error).message }); }
  });

  // --- Admin: sessions / audit / providers ---
  r.get("/auth/sessions", requirePerm("auth.sessions.read"), async (req, res) => {
    if (!req.auth) { res.status(401).json({ error: "unauthorized" }); return; }
    const userId = typeof req.query.userId === "string" ? req.query.userId : req.auth.user.id;
    res.json({ sessions: await svc.listSessionsForUser(userId) });
  });
  r.delete("/auth/sessions/:sid", requirePerm("auth.sessions.revoke"), async (req, res) => {
    if (!req.auth) { res.status(401).json({ error: "unauthorized" }); return; }
    await svc.revokeSession(req.params.sid, req.auth.user.username);
    res.json({ ok: true });
  });
  r.get("/auth/audit", requirePerm("auth.audit.read"), async (req, res) => {
    const limit = Math.max(1, Math.min(Number(req.query.limit) || 100, 500));
    res.json({ entries: await svc.audit.tail(limit) });
  });
  r.get("/auth/providers", requirePerm("auth.providers.read"), (_req, res) => {
    const p = oidcProvider();
    res.json({
      oidc: p ? {
        key: p.key, displayName: p.displayName, issuerUrl: p.issuerUrl,
        redirectUri: p.redirectUri, scopes: p.scopes, autoProvision: p.autoProvision,
      } : null,
    });
  });

  return r;
}
