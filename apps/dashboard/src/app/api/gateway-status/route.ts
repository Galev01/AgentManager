import { NextResponse } from "next/server";
import { requirePermissionApi, AuthFailure } from "@/lib/auth/current-user";
import { callGatewayMethod } from "@/lib/bridge-client";

const BRIDGE_URL = process.env.OPENCLAW_BRIDGE_URL || "http://localhost:3100";
const BRIDGE_TOKEN = process.env.OPENCLAW_BRIDGE_TOKEN || "";

async function bridgeFetch(path: string, options?: RequestInit) {
  const res = await fetch(`${BRIDGE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${BRIDGE_TOKEN}`,
      ...options?.headers,
    },
  });
  return res;
}

export async function GET() {
  try {
    await requirePermissionApi("commands.gateway_proxy");
    try {
      await callGatewayMethod("models.list", {});
      return NextResponse.json({ status: "online" });
    } catch {
      return NextResponse.json({ status: "offline" });
    }
  } catch (err) {
    if (err instanceof AuthFailure) {
      return NextResponse.json({ error: err.message, missing: err.missing }, { status: err.status });
    }
    throw err;
  }
}

export async function POST(request: Request) {
  try {
    await requirePermissionApi("commands.gateway_proxy");
    const { action } = await request.json();
    if (action === "start") {
      const res = await bridgeFetch("/gateway-control/start", { method: "POST" });
      const data = await res.json();
      if (!res.ok) return NextResponse.json(data, { status: res.status });
      return NextResponse.json(data);
    }
    if (action === "stop") {
      const res = await bridgeFetch("/gateway-control/stop", { method: "POST" });
      const data = await res.json();
      if (!res.ok) return NextResponse.json(data, { status: res.status });
      return NextResponse.json(data);
    }
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (err: any) {
    if (err instanceof AuthFailure) {
      return NextResponse.json({ error: err.message, missing: err.missing }, { status: err.status });
    }
    return NextResponse.json({ error: err.message || "Failed" }, { status: 502 });
  }
}
