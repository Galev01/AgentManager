import { config } from "../config.js";

export async function callGateway(method: string, params?: Record<string, unknown>): Promise<unknown> {
  const res = await fetch(config.gatewayUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.gatewayToken}`,
    },
    body: JSON.stringify({ method, params: params || {} }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gateway ${res.status}: ${text}`);
  }

  return res.json();
}
