/**
 * Nanobot adapter — Phase 1.
 *
 * Nanobot is MCP-native; we use @modelcontextprotocol/sdk to connect over
 * stdio (default) or http. The endpoint string carries the transport
 * choice — `mcp:stdio:<bin>` or `mcp:http:<url>`. Phase 1 exposes tool
 * catalog only. Tool invocation stays unsupported pending Phase 2 once
 * auth modes and UX are clear.
 *
 * Connection lifecycle: the adapter holds ONE MCP client instance and
 * connects lazily once. Subsequent calls reuse the connection. dispose()
 * closes the transport and marks the adapter unusable. The registry calls
 * dispose() on shutdown; tests must call dispose() explicitly.
 */
import type {
  RuntimeAdapter, RuntimeEntity, RuntimeEntityKind, RuntimeActivityEvent,
  InvokeActionRequest, InvokeActionResult, RuntimeAuthMode, CapabilitySnapshot,
} from "@openclaw-manager/types";
import { ADAPTER_CONTRACT_VERSION, type AdapterConfig } from "./adapter-base.js";

export type NanobotMcpClient = {
  connect(): Promise<void>;
  listTools(): Promise<{ tools: Array<{ name: string; description?: string }> }>;
  close(): Promise<void>;
};

export type NanobotAdapterDeps = {
  mcpClient: NanobotMcpClient;
};

export function createNanobotAdapter(cfg: AdapterConfig, deps: NanobotAdapterDeps): RuntimeAdapter {
  const { descriptor } = cfg;
  const { mcpClient } = deps;

  let connectPromise: Promise<void> | null = null;
  let disposed = false;

  async function ensureConnected(): Promise<void> {
    if (disposed) throw new Error("nanobot adapter disposed");
    if (!connectPromise) {
      connectPromise = mcpClient.connect().catch((e) => {
        // On failure, clear the cached promise so a later retry can try again.
        connectPromise = null;
        throw e;
      });
    }
    await connectPromise;
  }

  return {
    async describeRuntime() { return descriptor; },
    async getCapabilities(): Promise<CapabilitySnapshot> {
      return {
        supported: ["tools.list"],
        partial: [],
        unsupported: [
          "agents.list", "agents.read",
          "sessions.list", "sessions.read", "sessions.send",
          "channels.list", "channels.status",
          "memory.query", "memory.write",
          "skills.list", "skills.install",
          "tools.invoke",
          "cron.list", "cron.write",
          "logs.tail", "config.get", "config.set",
        ],
        version: ADAPTER_CONTRACT_VERSION,
      };
    },
    async listEntities(kind: RuntimeEntityKind): Promise<RuntimeEntity[]> {
      if (kind !== "tool") return [];
      await ensureConnected();
      const { tools } = await mcpClient.listTools();
      return tools.map((t) => ({
        runtimeKind: "nanobot" as const, runtimeId: descriptor.id,
        entityKind: "tool" as const, entityId: t.name, displayName: t.name,
        nativeType: t.description,
        nativeRef: { name: t.name, description: t.description ?? null },
      }));
    },
    async getEntity(kind, id) {
      const list = await this.listEntities(kind);
      return list.find((e) => e.entityId === id) ?? null;
    },
    async listActivity(): Promise<RuntimeActivityEvent[]> { return []; },
    async invokeAction(_req: InvokeActionRequest): Promise<InvokeActionResult> {
      return { ok: false, error: "nanobot write actions not implemented in Phase 1", projectionMode: "exact" };
    },
    async getAuthModes(): Promise<RuntimeAuthMode[]> {
      return [{ id: "service", label: "MCP transport", description: "Nanobot MCP does not currently gate by bearer." }];
    },
    async getExtensions() { return ["mcp-hosts", "tools", "executions", "vllm-runtime"]; },
    async health() {
      try { await ensureConnected(); return { ok: true }; }
      catch (e) { return { ok: false, detail: (e as Error).message }; }
    },
    async dispose() {
      if (disposed) return;
      disposed = true;
      if (connectPromise) {
        try { await mcpClient.close(); } catch { /* best-effort */ }
      }
    },
  };
}
