import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/session";
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
  const authed = await isAuthenticated();
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    await callGatewayMethod("models.list", {});
    return NextResponse.json({ status: "online" });
  } catch {
    return NextResponse.json({ status: "offline" });
  }
}

export async function POST(request: Request) {
  const authed = await isAuthenticated();
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
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
    return NextResponse.json({ error: err.message || "Failed" }, { status: 502 });
  }
}
