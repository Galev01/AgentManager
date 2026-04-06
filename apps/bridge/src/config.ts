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
