import type { RuntimeAdapter, RuntimeDescriptor, CapabilitySnapshot, JsonValue } from "@openclaw-manager/types";

// HttpClient is injectable so HTTP adapters are testable without binding
// real ports. Default implementation (`defaultHttp`) calls fetch.
export type HttpRequest = {
  method: "GET" | "POST" | "PATCH" | "DELETE";
  headers?: Record<string, string>;
  body?: JsonValue;
  timeoutMs?: number;
};
export type HttpClient = {
  json(url: string, req: HttpRequest): Promise<JsonValue>;
};

export const defaultHttp: HttpClient = {
  async json(url, req) {
    const controller = new AbortController();
    const to = setTimeout(() => controller.abort(), req.timeoutMs ?? 5000);
    try {
      const res = await fetch(url, {
        method: req.method,
        headers: req.headers,
        body: req.body === undefined ? undefined : JSON.stringify(req.body),
        signal: controller.signal,
      });
      const text = await res.text();
      if (!res.ok) throw new Error(`${res.status}: ${text.slice(0, 300)}`);
      return text ? (JSON.parse(text) as JsonValue) : null;
    } finally { clearTimeout(to); }
  },
};

export type AdapterConfig = {
  descriptor: RuntimeDescriptor;
  bearer?: string;
  timeoutMs?: number;
  http?: HttpClient;
};

export const ADAPTER_CONTRACT_VERSION = "1.0.0";

export function emptyCapabilities(): CapabilitySnapshot {
  return { supported: [], partial: [], unsupported: [], version: ADAPTER_CONTRACT_VERSION };
}

export type AdapterFactory = (cfg: AdapterConfig) => RuntimeAdapter;
