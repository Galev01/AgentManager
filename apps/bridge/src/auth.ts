import type { Request, Response, NextFunction } from "express";
import crypto from "node:crypto";
import { config } from "./config.js";

export function bearerAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing or invalid Authorization header" });
    return;
  }
  const token = header.slice(7);
  const tokenBuf = Buffer.from(token);
  const expectedBuf = Buffer.from(config.token);
  if (tokenBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(tokenBuf, expectedBuf)) {
    res.status(401).json({ error: "Invalid token" });
    return;
  }
  next();
}
