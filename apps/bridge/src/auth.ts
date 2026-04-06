import type { Request, Response, NextFunction } from "express";
import { config } from "./config.js";

export function bearerAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing or invalid Authorization header" });
    return;
  }
  const token = header.slice(7);
  if (token !== config.token) {
    res.status(401).json({ error: "Invalid token" });
    return;
  }
  next();
}
