import type { Request, Response, NextFunction, RequestHandler } from "express";
import { config } from "./config.js";
import { verifyAssertion, type AssertionClaims } from "./services/auth/assertion.js";
import type { AuthService } from "./services/auth/service.js";
import type { AuthUserPublic, PermissionId } from "@openclaw-manager/types";

declare global {
  namespace Express {
    interface Request {
      auth?: {
        claims: AssertionClaims;
        user: AuthUserPublic;
        permissions: PermissionId[];
      };
    }
  }
}

export type ActorAssertionOpts = { strict: boolean };

export function actorAssertionAuth(svc: AuthService, opts: ActorAssertionOpts = { strict: true }) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const header = req.headers["x-ocm-actor"];
    const token = Array.isArray(header) ? header[0] : header;
    if (!token) {
      if (opts.strict) { res.status(401).json({ error: "missing_actor_assertion" }); return; }
      next();
      return;
    }
    const claims = verifyAssertion(config.authAssertionSecret, token, { clockSkewMs: 30_000 });
    if (!claims) { res.status(401).json({ error: "invalid_actor_assertion" }); return; }
    const resolved = await svc.resolveSession({ sid: claims.sid });
    if (!resolved || resolved.user.id !== claims.sub) {
      res.status(401).json({ error: "stale_session" });
      return;
    }
    req.auth = { claims, user: resolved.user, permissions: resolved.permissions };
    next();
  };
}

export function requirePerm(...perms: PermissionId[]): RequestHandler<any> {
  return (req: Request, res: Response, next: NextFunction): void => {
    const eff = req.auth?.permissions ?? [];
    for (const p of perms) {
      if (!eff.includes(p)) {
        res.status(403).json({ error: "forbidden", missing: p });
        return;
      }
    }
    next();
  };
}
