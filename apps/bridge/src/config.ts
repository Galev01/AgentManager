import path from "node:path";
import os from "node:os";
import { resolveSdkPath, type ResolveSource } from "./openclaw/resolve-sdk.js";

// ---------------------------------------------------------------------------
// Pure defaults computation. Exposed for tests; takes injectable env+homedir.
// ---------------------------------------------------------------------------

export interface ComputeDefaultsOptions {
  env?: NodeJS.ProcessEnv;
  homedir?: () => string;
}

export interface BridgeDefaults {
  bridgeHost: string;
  bridgePort: number;
  openclawHome: string;
  openclawStatePath: string;
  managementDir: string;
  sessionsDir: string;
  brainVaultPath: string;
  reviewerScanRoots: string[];
  reviewerStateDir: string;
  hermesEnabled: boolean;
  hermesBaseUrl: string;
  hermesToken: string;
}

export function computeDefaults(opts: ComputeDefaultsOptions = {}): BridgeDefaults {
  const env = opts.env ?? process.env;
  const home = (opts.homedir ?? os.homedir)();

  const openclawHome =
    env.OPENCLAW_HOME && env.OPENCLAW_HOME.length > 0
      ? env.OPENCLAW_HOME
      : path.join(home, ".openclaw");

  const managementDir =
    env.MANAGEMENT_DIR && env.MANAGEMENT_DIR.length > 0
      ? env.MANAGEMENT_DIR
      : path.join(
          openclawHome,
          "workspace/.openclaw/extensions/whatsapp-auto-reply/management",
        );

  const openclawStatePath =
    env.OPENCLAW_STATE_PATH && env.OPENCLAW_STATE_PATH.length > 0
      ? env.OPENCLAW_STATE_PATH
      : path.join(
          openclawHome,
          "workspace/.openclaw/extensions/whatsapp-auto-reply/whatsapp-auto-reply-state.json",
        );

  const sessionsDir =
    env.OPENCLAW_SESSIONS_DIR && env.OPENCLAW_SESSIONS_DIR.length > 0
      ? env.OPENCLAW_SESSIONS_DIR
      : path.join(openclawHome, "agents/main/sessions");

  const brainVaultPath =
    env.BRAIN_VAULT_PATH && env.BRAIN_VAULT_PATH.length > 0
      ? env.BRAIN_VAULT_PATH
      : path.join(home, "Documents/Brainclaw/OpenClaw Brain");

  const scanRootsRaw =
    env.REVIEWER_SCAN_ROOTS ||
    env.REVIEWER_SCAN_ROOT ||
    path.join(home, "Documents");
  const reviewerScanRoots = scanRootsRaw
    .split(/[;]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const reviewerStateDir =
    env.REVIEWER_STATE_DIR ||
    path.join(
      home,
      ".openclaw/workspace/.openclaw/extensions/codebase-reviewer",
    );

  const hermesBaseUrl = env.HERMES_BASE_URL ?? "";
  const hermesToken = env.HERMES_TOKEN ?? "";
  const hermesEnabled = hermesBaseUrl.length > 0;

  return {
    bridgeHost: env.BRIDGE_HOST || "127.0.0.1",
    bridgePort: Number(env.BRIDGE_PORT) || 3100,
    openclawHome,
    openclawStatePath,
    managementDir,
    sessionsDir,
    brainVaultPath,
    reviewerScanRoots,
    reviewerStateDir,
    hermesEnabled,
    hermesBaseUrl,
    hermesToken,
  };
}

// ---------------------------------------------------------------------------
// Required-env aggregation. Single multi-line throw instead of failing fast.
// ---------------------------------------------------------------------------

export interface MissingEnv {
  name: string;
  reason: string;
}

export function aggregateMissing(env: NodeJS.ProcessEnv): MissingEnv[] {
  const missing: MissingEnv[] = [];
  if (!env.BRIDGE_TOKEN) {
    missing.push({ name: "BRIDGE_TOKEN", reason: "required" });
  }
  if (!env.OPENCLAW_GATEWAY_TOKEN) {
    missing.push({ name: "OPENCLAW_GATEWAY_TOKEN", reason: "required" });
  }
  if (!env.AUTH_ASSERTION_SECRET || env.AUTH_ASSERTION_SECRET.length < 32) {
    missing.push({
      name: "AUTH_ASSERTION_SECRET",
      reason: "must be set and >= 32 chars",
    });
  }
  return missing;
}

function formatMissingError(missing: MissingEnv[]): string {
  const lines = ["Bridge configuration is incomplete:"];
  for (const m of missing) {
    lines.push(`  - ${m.name}: ${m.reason}`);
  }
  lines.push("Set the missing values in apps/bridge/.env (see .env.example).");
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Top-level validation + config object.
// ---------------------------------------------------------------------------

const _missing = aggregateMissing(process.env);
if (_missing.length > 0) {
  throw new Error(formatMissingError(_missing));
}

const _defaults = computeDefaults();

const _sdkResolved = resolveSdkPath();

export const config = {
  host: _defaults.bridgeHost,
  port: _defaults.bridgePort,
  token: process.env.BRIDGE_TOKEN as string,
  openclawHome: _defaults.openclawHome,
  openclawStatePath: _defaults.openclawStatePath,
  managementDir: _defaults.managementDir,
  runtimesConfigPath:
    process.env.RUNTIMES_CONFIG_PATH ?? `${_defaults.managementDir}/runtimes.json`,
  gatewayUrl: process.env.OPENCLAW_GATEWAY_URL || "http://127.0.0.1:18789",
  gatewayToken: process.env.OPENCLAW_GATEWAY_TOKEN as string,
  sessionsDir: _defaults.sessionsDir,
  brainVaultPath: _defaults.brainVaultPath,
  // OpenClaw SDK resolution — single source of truth.
  openclawSdkPath: _sdkResolved.path,
  openclawSdkSource: _sdkResolved.source as ResolveSource,
  reviewerScanRoots: _defaults.reviewerScanRoots,
  get reviewerScanRoot(): string {
    return (this as any).reviewerScanRoots[0] ?? "";
  },
  reviewerStateDir: _defaults.reviewerStateDir,
  reviewerAgent: process.env.REVIEWER_AGENT || "reviewer",
  reviewerTimeoutMs: Number(process.env.REVIEWER_TIMEOUT_MS) || 600000,
  reviewerAckCooldownMs:
    Number(process.env.REVIEWER_ACK_COOLDOWN_MS) || 86400000,
  // Hermes — optional.
  hermesEnabled: _defaults.hermesEnabled,
  hermesBaseUrl: _defaults.hermesBaseUrl,
  hermesToken: _defaults.hermesToken,
  get reviewerStatePath() {
    return path.join(this.reviewerStateDir, "state.json");
  },
  get reviewerRunsPath() {
    return path.join(this.reviewerStateDir, "runs.jsonl");
  },
  get reviewerIdeasPath() {
    return path.join(this.reviewerStateDir, "ideas.json");
  },
  get reviewerReportMetaPath() {
    return path.join(this.reviewerStateDir, "report-meta.json");
  },
  get runtimeSettingsPath() {
    return path.join(this.managementDir, "runtime-settings.json");
  },
  get eventsPath() {
    return path.join(this.managementDir, "events.jsonl");
  },
  get commandsPath() {
    return path.join(this.managementDir, "commands.jsonl");
  },
  get youtubeDir() {
    return path.join(this.managementDir, "youtube");
  },
  get youtubeJobsPath() {
    return path.join(this.managementDir, "youtube", "jobs.jsonl");
  },
  get youtubeIndexPath() {
    return path.join(this.managementDir, "youtube", "summaries-index.jsonl");
  },
  get youtubeSummariesDir() {
    return path.join(this.managementDir, "youtube", "summaries");
  },
  get youtubeVideosDir() {
    return path.join(this.managementDir, "youtube", "videos");
  },
  claudeCodePendingTimeoutMs:
    Number(process.env.CLAUDE_CODE_PENDING_TIMEOUT_MS) || 300000,
  claudeCodeOpenclawAgentId:
    process.env.CLAUDE_CODE_OPENCLAW_AGENT_ID || "claude-code",
  get claudeCodeDir() {
    return path.join(this.managementDir, "claude-code");
  },
  get claudeCodeSessionsPath() {
    return path.join(this.managementDir, "claude-code", "sessions.json");
  },
  get claudeCodePendingPath() {
    return path.join(this.managementDir, "claude-code", "pending.json");
  },
  telemetryRetentionDays:
    Number(process.env.TELEMETRY_RETENTION_DAYS) || 30,
  telemetryMaxDiskMB:
    Number(process.env.TELEMETRY_MAX_DISK_MB) || 200,
  get telemetryDir() {
    return path.join(this.managementDir, "telemetry");
  },
  // --- Auth ---
  authAssertionSecret: process.env.AUTH_ASSERTION_SECRET || "",
  authBootstrapToken: process.env.AUTH_BOOTSTRAP_TOKEN || "",
  authSessionTtlMs: Number(process.env.AUTH_SESSION_TTL_MS) || 7 * 24 * 60 * 60 * 1000,
  authSessionLastSeenThrottleMs: Number(process.env.AUTH_SESSION_LASTSEEN_THROTTLE_MS) || 60 * 1000,
  authWsTicketTtlMs: Number(process.env.AUTH_WS_TICKET_TTL_MS) || 60 * 1000,
  authLegacyAdminPassword: process.env.ADMIN_PASSWORD || "",
  oidcIssuerUrl: process.env.AUTH_OIDC_ISSUER_URL || "",
  oidcClientId: process.env.AUTH_OIDC_CLIENT_ID || "",
  oidcClientSecret: process.env.AUTH_OIDC_CLIENT_SECRET || "",
  oidcRedirectUri: process.env.AUTH_OIDC_REDIRECT_URI || "",
  oidcScopes: (process.env.AUTH_OIDC_SCOPES || "openid email profile").split(/\s+/).filter(Boolean),
  oidcProviderName: process.env.AUTH_OIDC_PROVIDER_NAME || "Single Sign-On",
  oidcProviderKey: process.env.AUTH_OIDC_PROVIDER_KEY || "default",
  oidcAutoProvision: process.env.AUTH_OIDC_AUTO_PROVISION === "true",
  get authDir():        string { return path.join(this.managementDir, "auth"); },
  get authUsersPath():  string { return path.join(this.managementDir, "auth", "users.json"); },
  get authRolesPath():  string { return path.join(this.managementDir, "auth", "roles.json"); },
  get authOidcLinksPath(): string { return path.join(this.managementDir, "auth", "oidc-links.json"); },
  get authBootstrapPath(): string { return path.join(this.managementDir, "auth", "bootstrap.json"); },
  get authSessionsDir(): string { return path.join(this.managementDir, "auth", "sessions"); },
  get authAuditPath():  string { return path.join(this.managementDir, "auth", "audit.jsonl"); },
} as const;
