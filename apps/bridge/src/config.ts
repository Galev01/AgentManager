import path from "node:path";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

function requireAuthAssertionSecret(): void {
  if (!process.env.AUTH_ASSERTION_SECRET || process.env.AUTH_ASSERTION_SECRET.length < 32) {
    throw new Error("AUTH_ASSERTION_SECRET must be set and >= 32 chars");
  }
}
requireAuthAssertionSecret();

export const config = {
  host: process.env.BRIDGE_HOST || "127.0.0.1",
  port: Number(process.env.BRIDGE_PORT) || 3100,
  token: requireEnv("BRIDGE_TOKEN"),
  openclawStatePath: requireEnv("OPENCLAW_STATE_PATH"),
  managementDir: requireEnv("MANAGEMENT_DIR"),
  runtimesConfigPath: process.env.RUNTIMES_CONFIG_PATH
    ?? `${process.env.MANAGEMENT_DIR}/runtimes.json`,
  gatewayUrl: process.env.OPENCLAW_GATEWAY_URL || "http://127.0.0.1:18789",
  gatewayToken: requireEnv("OPENCLAW_GATEWAY_TOKEN"),
  sessionsDir: process.env.OPENCLAW_SESSIONS_DIR || "",
  brainVaultPath: process.env.BRAIN_VAULT_PATH || "",
  reviewerScanRoots: (
    process.env.REVIEWER_SCAN_ROOTS ||
    process.env.REVIEWER_SCAN_ROOT ||
    "C:\\Users\\GalLe\\Cursor projects"
  )
    .split(/[;]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0),
  get reviewerScanRoot(): string {
    return (this as any).reviewerScanRoots[0] ?? "";
  },
  reviewerStateDir:
    process.env.REVIEWER_STATE_DIR ||
    path.join(
      process.env.USERPROFILE || "",
      ".openclaw/workspace/.openclaw/extensions/codebase-reviewer"
    ),
  reviewerAgent: process.env.REVIEWER_AGENT || "reviewer",
  reviewerTimeoutMs: Number(process.env.REVIEWER_TIMEOUT_MS) || 600000,
  reviewerAckCooldownMs:
    Number(process.env.REVIEWER_ACK_COOLDOWN_MS) || 86400000,
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
