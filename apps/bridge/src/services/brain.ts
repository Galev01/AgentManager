import {
  createBrainClient,
  createBrainWatcher,
  createGlobalBrainClient,
  type BrainClient,
  type BrainWatcher,
  type GlobalBrainClient,
  type GlobalBrainChangeEvent,
  type PersonChangeEvent,
} from "@openclaw-manager/brain";
import { config } from "../config.js";

type ChangeListener = (event: PersonChangeEvent) => void;

let client: BrainClient | null = null;
let watcher: BrainWatcher | null = null;
const listeners: ChangeListener[] = [];

let globalClient: GlobalBrainClient | null = null;
type GlobalChangeListener = (event: GlobalBrainChangeEvent) => void;
const globalListeners: GlobalChangeListener[] = [];

function init(): void {
  if (client !== null) return;
  const vault = config.brainVaultPath.trim();
  if (!vault) return;
  try {
    client = createBrainClient(vault);
    void client.ensureLayout();
    watcher = createBrainWatcher(client.paths);
    watcher.onChange((event) => {
      for (const listener of listeners) {
        try { listener(event); } catch { /* ignore */ }
      }
    });
    globalClient = createGlobalBrainClient(client.paths);
    void globalClient.ensureLayout();
    watcher.onGlobalChange((event) => {
      for (const l of globalListeners) { try { l(event); } catch { /* ignore */ } }
    });
    watcher.start();
    console.log(`Brain: watching vault at ${vault}`);
  } catch (err) {
    console.warn(`Brain: failed to initialize vault ${vault}: ${String(err)}`);
    client = null;
    watcher = null;
  }
}

init();

export function isBrainEnabled(): boolean {
  return client !== null;
}

export function getBrainClient(): BrainClient {
  if (!client) throw new Error("Brain vault not configured (set BRAIN_VAULT_PATH)");
  return client;
}

export function onBrainChange(listener: ChangeListener): () => void {
  listeners.push(listener);
  return () => {
    const idx = listeners.indexOf(listener);
    if (idx >= 0) listeners.splice(idx, 1);
  };
}

export function getGlobalBrainClient(): GlobalBrainClient {
  if (!globalClient) throw new Error("Brain vault not configured (set BRAIN_VAULT_PATH)");
  return globalClient;
}

export function onGlobalBrainChange(listener: GlobalChangeListener): () => void {
  globalListeners.push(listener);
  return () => {
    const idx = globalListeners.indexOf(listener);
    if (idx >= 0) globalListeners.splice(idx, 1);
  };
}
