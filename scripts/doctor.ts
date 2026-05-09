#!/usr/bin/env tsx
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface Check { name: string; ok: boolean; detail: string; }

async function main() {
  const repoRoot = path.resolve(__dirname, "..");
  const checks: Check[] = [];

  const nodeMajor = Number(process.versions.node.split(".")[0]);
  checks.push({
    name: "Node version",
    ok: nodeMajor >= 20,
    detail: `${process.version} (need >= 20.11)`,
  });

  const bridgeEnv = path.join(repoRoot, "apps/bridge/.env");
  const dashEnv = path.join(repoRoot, "apps/dashboard/.env.local");
  checks.push({ name: "apps/bridge/.env", ok: fs.existsSync(bridgeEnv), detail: bridgeEnv });
  checks.push({ name: "apps/dashboard/.env.local", ok: fs.existsSync(dashEnv), detail: dashEnv });

  const port = Number(parseEnv(bridgeEnv, "BRIDGE_PORT") || 3100);
  checks.push(await tcpProbe(`Bridge /health on 127.0.0.1:${port}`, `http://127.0.0.1:${port}/health`));

  const gateway = parseEnv(bridgeEnv, "OPENCLAW_GATEWAY_URL") || "http://127.0.0.1:18789";
  checks.push(await tcpProbe(`OpenClaw gateway ${gateway}`, gateway, true));

  const hermesUrl = parseEnv(bridgeEnv, "HERMES_BASE_URL");
  if (hermesUrl) {
    checks.push(await tcpProbe(`Hermes shim ${hermesUrl}/v1/health`, `${hermesUrl}/v1/health`, true));
  } else {
    checks.push({ name: "Hermes", ok: true, detail: "not configured (skipped)" });
  }

  for (const c of checks) {
    const tag = c.ok ? "OK " : "X  ";
    console.log(`${tag} ${c.name}  -  ${c.detail}`);
  }
  const required = checks.filter((c) => !c.name.startsWith("OpenClaw gateway") && !c.name.startsWith("Hermes"));
  process.exit(required.every((c) => c.ok) ? 0 : 1);
}

function parseEnv(p: string, key: string): string {
  if (!fs.existsSync(p)) return "";
  const raw = fs.readFileSync(p, "utf8");
  const m = raw.match(new RegExp(`^${key}=(.*)$`, "m"));
  return m?.[1]?.trim() ?? "";
}

function tcpProbe(name: string, url: string, soft = false): Promise<Check> {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      resolve({ name, ok: true, detail: `HTTP ${res.statusCode}` });
      res.resume();
    });
    req.on("error", (e) => {
      resolve({ name, ok: soft, detail: soft ? `unreachable (${e.message}) - informational only` : e.message });
    });
    req.setTimeout(2000, () => { req.destroy(); resolve({ name, ok: soft, detail: soft ? "timeout - informational only" : "timeout" }); });
  });
}

main();
