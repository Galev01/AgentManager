import path from "node:path";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

export const config = {
  host: process.env.BRIDGE_HOST || "127.0.0.1",
  port: Number(process.env.BRIDGE_PORT) || 3100,
  token: requireEnv("BRIDGE_TOKEN"),
  openclawStatePath: requireEnv("OPENCLAW_STATE_PATH"),
  managementDir: requireEnv("MANAGEMENT_DIR"),
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
  claudeCodePendingTimeoutMs:
    Number(process.env.CLAUDE_CODE_PENDING_TIMEOUT_MS) || 300000,
  claudeCodeSharedOpenclawSessionId:
    process.env.CLAUDE_CODE_SHARED_OPENCLAW_SESSION_ID || "oc-shared-claude-code",
  get claudeCodeDir() {
    return path.join(this.managementDir, "claude-code");
  },
  get claudeCodeSessionsPath() {
    return path.join(this.managementDir, "claude-code", "sessions.json");
  },
  get claudeCodePendingPath() {
    return path.join(this.managementDir, "claude-code", "pending.json");
  },
} as const;
