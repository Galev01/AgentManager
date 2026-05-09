#!/usr/bin/env tsx
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import readline from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { fileURLToPath } from "node:url";
import { randomHex, readablePassword } from "./lib/secrets.js";
import { pickFreePort } from "./lib/ports.js";
import { discoverOpenClaw, toForwardSlash } from "./lib/openclaw-discover.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface Args {
  yes: boolean;
  nonInteractive: boolean;
  resetAdminPassword: boolean;
  resetRuntimes: boolean;
  bridgePort: number | null;
  dashboardPort: number | null;
  openclawHome: string | null;
}

function parseArgs(argv: string[]): Args {
  const a: Args = {
    yes: false, nonInteractive: false, resetAdminPassword: false, resetRuntimes: false,
    bridgePort: null, dashboardPort: null, openclawHome: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const v = argv[i];
    if (v === "--yes" || v === "-y") a.yes = true;
    else if (v === "--non-interactive") { a.nonInteractive = true; a.yes = true; }
    else if (v === "--reset-admin-password") a.resetAdminPassword = true;
    else if (v === "--reset-runtimes") a.resetRuntimes = true;
    else if (v === "--bridge-port") a.bridgePort = Number(argv[++i]);
    else if (v === "--dashboard-port") a.dashboardPort = Number(argv[++i]);
    else if (v === "--openclaw-home") a.openclawHome = argv[++i];
  }
  return a;
}

interface Answers {
  bridgePort: number;
  dashboardPort: number;
  openclawHome: string;
  gatewayToken: string;
  hermesEnabled: boolean;
  hermesBaseUrl: string;
  hermesToken: string;
}

async function prompt(rl: readline.Interface, q: string, fallback: string): Promise<string> {
  const ans = await rl.question(`${q}${fallback ? ` [${fallback}]` : ""}: `);
  return ans.trim() || fallback;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const repoRoot = path.resolve(__dirname, "..");
  const bridgeEnvPath = path.join(repoRoot, "apps/bridge/.env");
  const dashboardEnvPath = path.join(repoRoot, "apps/dashboard/.env.local");
  const runtimesPath = path.join(repoRoot, "apps/bridge/config/runtimes.json");

  console.log("OpenClaw-Manager setup\n");

  // Pre-flight: Node version
  const nodeMajor = Number(process.versions.node.split(".")[0]);
  if (nodeMajor < 20) {
    console.error(`Node ${process.version} found; need >= 20.11. Aborting.`);
    process.exit(1);
  }

  // Discover OpenClaw
  const discovered = discoverOpenClaw(args.openclawHome ?? undefined);
  const defaultHome = args.openclawHome || discovered.home || path.join(os.homedir(), ".openclaw");

  let answers: Answers;
  if (args.yes) {
    answers = {
      bridgePort: args.bridgePort ?? await pickFreePort(3100),
      dashboardPort: args.dashboardPort ?? await pickFreePort(3000),
      openclawHome: defaultHome,
      gatewayToken: discovered.gatewayToken ?? "",
      hermesEnabled: false,
      hermesBaseUrl: "",
      hermesToken: "",
    };
  } else {
    const rl = readline.createInterface({ input: stdin, output: stdout });
    try {
      answers = {
        bridgePort: Number(await prompt(rl, "Bridge port", String(await pickFreePort(args.bridgePort ?? 3100)))),
        dashboardPort: Number(await prompt(rl, "Dashboard port", String(await pickFreePort(args.dashboardPort ?? 3000)))),
        openclawHome: await prompt(rl, "OpenClaw home", defaultHome),
        gatewayToken: discovered.gatewayToken ?? await prompt(rl, "OpenClaw gateway token (paste from your OpenClaw config)", ""),
        hermesEnabled: (await prompt(rl, "Enable a remote Hermes runtime? (y/N)", "N")).toLowerCase().startsWith("y"),
        hermesBaseUrl: "",
        hermesToken: "",
      };
      if (answers.hermesEnabled) {
        answers.hermesBaseUrl = await prompt(rl, "Hermes base URL", "http://127.0.0.1:9119");
        answers.hermesToken = await prompt(rl, "Hermes bearer token", "");
      }
    } finally {
      rl.close();
    }
  }

  // Generate secrets
  const bridgeToken = randomHex(32);
  const sessionSecret = randomHex(32);
  const authAssertionSecret = randomHex(32);
  const authBootstrapToken = randomHex(16);
  const adminPassword = readablePassword();

  // Idempotency check
  if (fs.existsSync(bridgeEnvPath) && !args.yes) {
    const rl = readline.createInterface({ input: stdin, output: stdout });
    const ok = await rl.question(`${bridgeEnvPath} exists. Overwrite? [y/N]: `);
    rl.close();
    if (!ok.trim().toLowerCase().startsWith("y")) {
      console.log("Aborted. Existing files untouched.");
      process.exit(0);
    }
  }

  // Write bridge .env
  const bridgeEnv = renderBridgeEnv({
    host: "127.0.0.1",
    port: answers.bridgePort,
    bridgeToken,
    openclawHome: toForwardSlash(answers.openclawHome),
    gatewayToken: answers.gatewayToken,
    authAssertionSecret,
    authBootstrapToken,
    hermesBaseUrl: answers.hermesEnabled ? answers.hermesBaseUrl : "",
    hermesToken: answers.hermesEnabled ? answers.hermesToken : "",
  });
  fs.mkdirSync(path.dirname(bridgeEnvPath), { recursive: true });
  fs.writeFileSync(bridgeEnvPath, bridgeEnv, { mode: 0o600 });
  console.log(`Wrote ${bridgeEnvPath}`);

  // Write dashboard .env.local
  const dashEnv = renderDashboardEnv({
    bridgeUrl: `http://127.0.0.1:${answers.bridgePort}`,
    bridgeToken,
    authAssertionSecret,
    sessionSecret,
    cookieSecure: false,
  });
  fs.mkdirSync(path.dirname(dashboardEnvPath), { recursive: true });
  fs.writeFileSync(dashboardEnvPath, dashEnv, { mode: 0o600 });
  console.log(`Wrote ${dashboardEnvPath}`);

  // Regenerate manager-owned runtimes.json
  const runtimes: any[] = [{
    id: "oc-main", kind: "openclaw", displayName: "OpenClaw (local)",
    endpoint: "http://127.0.0.1:18789", transport: "sdk", authMode: "token-env",
    notes: "Default OpenClaw runtime. Edit this file or rerun `pnpm setup` to change.",
  }];
  if (answers.hermesEnabled) {
    runtimes.push({
      id: "hermes-remote", kind: "hermes", displayName: "Hermes (remote)",
      endpoint: answers.hermesBaseUrl, transport: "http", authMode: "bearer",
      healthPath: "/v1/health",
    });
  }
  fs.mkdirSync(path.dirname(runtimesPath), { recursive: true });
  fs.writeFileSync(runtimesPath, JSON.stringify({ runtimes }, null, 2));
  console.log(`Wrote ${runtimesPath}`);

  // Seed plugin runtimes.json only if absent
  const pluginRuntimesPath = path.join(answers.openclawHome, "workspace/.openclaw/extensions/whatsapp-auto-reply/management/runtimes.json");
  if (fs.existsSync(pluginRuntimesPath)) {
    if (args.resetRuntimes) {
      fs.writeFileSync(pluginRuntimesPath, JSON.stringify({ runtimes }, null, 2));
      console.log(`Reset plugin file: ${pluginRuntimesPath}`);
    } else {
      console.log(`Note: ${pluginRuntimesPath} already exists; left untouched. Manager-owned config above is authoritative.`);
    }
  } else if (fs.existsSync(path.dirname(pluginRuntimesPath))) {
    fs.writeFileSync(pluginRuntimesPath, JSON.stringify({ runtimes }, null, 2));
    console.log(`Seeded plugin file: ${pluginRuntimesPath}`);
  }

  console.log("\nGenerated admin password (write it down; bootstrap with it once):\n");
  console.log(`    ${adminPassword}`);
  console.log("\nNext:\n  pnpm dev\n");
  console.log(`Then visit http://localhost:${answers.dashboardPort}/bootstrap to create the admin user.`);
  console.log(`Bootstrap token: ${authBootstrapToken}`);
}

function renderBridgeEnv(v: {
  host: string; port: number; bridgeToken: string; openclawHome: string; gatewayToken: string;
  authAssertionSecret: string; authBootstrapToken: string;
  hermesBaseUrl: string; hermesToken: string;
}): string {
  return `# Generated by \`pnpm setup\`. Edit freely; rerun setup to regenerate.
BRIDGE_HOST=${v.host}
BRIDGE_PORT=${v.port}
BRIDGE_TOKEN=${v.bridgeToken}
BRIDGE_SERVICE_ID=bridge-primary

OPENCLAW_HOME=${v.openclawHome}
OPENCLAW_GATEWAY_URL=http://127.0.0.1:18789
OPENCLAW_GATEWAY_TOKEN=${v.gatewayToken}

AUTH_ASSERTION_SECRET=${v.authAssertionSecret}
AUTH_BOOTSTRAP_TOKEN=${v.authBootstrapToken}

HERMES_BASE_URL=${v.hermesBaseUrl}
HERMES_TOKEN=${v.hermesToken}
`;
}

function renderDashboardEnv(v: {
  bridgeUrl: string; bridgeToken: string; authAssertionSecret: string;
  sessionSecret: string; cookieSecure: boolean;
}): string {
  return `# Generated by \`pnpm setup\`. Edit freely; rerun setup to regenerate.
OPENCLAW_BRIDGE_URL=${v.bridgeUrl}
OPENCLAW_BRIDGE_TOKEN=${v.bridgeToken}
AUTH_ASSERTION_SECRET=${v.authAssertionSecret}
SESSION_SECRET=${v.sessionSecret}
COOKIE_SECURE=${v.cookieSecure ? "true" : "false"}
`;
}

main().catch((e) => { console.error(e); process.exit(1); });
