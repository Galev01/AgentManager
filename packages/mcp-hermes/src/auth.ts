import type { Request, Response, NextFunction } from "express";

export function bearerAuth(expected: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!expected) {
      res.status(500).json({ error: "MCP_HERMES_TOKEN not configured" });
      return;
    }
    const header = req.headers.authorization ?? "";
    if (header !== `Bearer ${expected}`) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    next();
  };
}
