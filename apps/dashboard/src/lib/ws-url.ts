export function getBridgeWsUrl(): string {
  const bridgeUrl = process.env.OPENCLAW_BRIDGE_URL || "http://localhost:3100";
  const token = process.env.OPENCLAW_BRIDGE_TOKEN || "";
  const wsUrl = bridgeUrl.replace(/^http/, "ws") + `/ws?token=${encodeURIComponent(token)}`;
  return wsUrl;
}
