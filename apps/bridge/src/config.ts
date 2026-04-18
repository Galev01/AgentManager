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
  reviewerScanRoot:
    process.env.REVIEWER_SCAN_ROOT || "C:\\Users\\GalLe\\Cursor projects",
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
} as const;
