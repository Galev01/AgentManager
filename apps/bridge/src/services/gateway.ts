import { pathToFileURL } from "node:url";
import path from "node:path";

// Dynamically import OpenClaw SDK's callGateway which handles device identity,
// auth handshake, and WebSocket protocol automatically.
// `APPDATA` resolves to the system profile path when running as a Windows
// service (LocalSystem), so allow an explicit override.
const OPENCLAW_SDK_PATH = process.env.OPENCLAW_SDK_PATH || path.join(
  process.env.APPDATA || "",
  "npm/node_modules/openclaw/dist/call-CQ0eH9Ew.js"
);

let sdkCallGateway: ((opts: { method: string; params: Record<string, unknown> }) => Promise<unknown>) | null = null;

async function loadSdk(): Promise<void> {
  try {
    const mod = await import(pathToFileURL(OPENCLAW_SDK_PATH).href);
    sdkCallGateway = mod.r; // callGateway is exported as 'r'
    console.log("OpenClaw SDK loaded for gateway calls");
  } catch (err) {
    console.warn("Failed to load OpenClaw SDK:", (err as Error).message);
  }
}

// Load SDK on startup
void loadSdk();

export async function callGateway(method: string, params?: Record<string, unknown>): Promise<unknown> {
  if (!sdkCallGateway) {
    await loadSdk();
    if (!sdkCallGateway) {
      throw new Error("OpenClaw SDK not available");
    }
  }
  return sdkCallGateway({ method, params: params || {} });
}
