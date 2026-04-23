import fs from "node:fs/promises";
import type { AuthAuditEntry } from "@openclaw-manager/types";
import { appendJsonl } from "../atomic-file.js";

export type AuditLogConfig = { path: string };

export function createAuditLog(cfg: AuditLogConfig) {
  return {
    async append(entry: Omit<AuthAuditEntry, "at">): Promise<void> {
      await appendJsonl(cfg.path, { ...entry, at: new Date().toISOString() });
    },
    async tail(limit: number): Promise<AuthAuditEntry[]> {
      let raw = "";
      try { raw = await fs.readFile(cfg.path, "utf8"); } catch { return []; }
      const out: AuthAuditEntry[] = [];
      for (const l of raw.split("\n")) {
        const t = l.trim();
        if (!t) continue;
        try { out.push(JSON.parse(t)); } catch {}
      }
      out.reverse();
      return out.slice(0, limit);
    },
  };
}
