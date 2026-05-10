import { pathToFileURL } from "node:url";
import { config } from "../config.js";

// Dynamically import OpenClaw SDK's callGateway which handles device identity,
// auth handshake, and WebSocket protocol automatically. The path is resolved
// once at config load via the SDK resolver (env override -> workspace package
// -> workspace glob -> global glob with warning -> throw).
const OPENCLAW_SDK_PATH = config.openclawSdkPath;

let sdkCallGateway:
  | ((opts: { method: string; params: Record<string, unknown> }) => Promise<unknown>)
  | null = null;

async function loadSdk(): Promise<void> {
  try {
    const mod = await import(pathToFileURL(OPENCLAW_SDK_PATH).href);
    sdkCallGateway = mod.r; // callGateway is exported as 'r'
    console.log(
      `OpenClaw SDK loaded for gateway calls (source=${config.openclawSdkSource})`,
    );
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
