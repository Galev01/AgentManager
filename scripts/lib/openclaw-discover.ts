import fs from "node:fs";
import path from "node:path";
import os from "node:os";

export interface OpenClawDiscovery {
  home: string | null;
  gatewayToken: string | null;
}

export function discoverOpenClaw(home?: string): OpenClawDiscovery {
  const candidate = home || process.env.OPENCLAW_HOME || path.join(os.homedir(), ".openclaw");
  const configPath = path.join(candidate, "openclaw.json");
  if (!fs.existsSync(configPath)) {
    return { home: null, gatewayToken: null };
  }
  try {
    const raw = JSON.parse(fs.readFileSync(configPath, "utf8"));
    const token = raw?.gateway?.token ?? raw?.gatewayToken ?? null;
    return { home: candidate, gatewayToken: token };
  } catch {
    return { home: candidate, gatewayToken: null };
  }
}

export function toForwardSlash(p: string): string {
  return p.replace(/\\/g, "/");
}
