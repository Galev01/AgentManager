import { NextResponse } from "next/server";
import { requirePermissionApi, AuthFailure } from "@/lib/auth/current-user";

const BRIDGE_URL = process.env.OPENCLAW_BRIDGE_URL || "http://localhost:3100";
const BRIDGE_TOKEN = process.env.OPENCLAW_BRIDGE_TOKEN || "";

export async function POST(request: Request) {
  try {
    await requirePermissionApi("commands.gateway_proxy");
    const { method, params } = await request.json();
    if (!method || typeof method !== "string") {
      return NextResponse.json({ error: "Missing method" }, { status: 400 });
    }

    const parts = method.split(".");
    const path = parts.length === 2
      ? `/gateway/${encodeURIComponent(parts[0])}/${encodeURIComponent(parts[1])}`
      : `/gateway/${encodeURIComponent(method)}`;

    const res = await fetch(`${BRIDGE_URL}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${BRIDGE_TOKEN}`,
      },
      body: JSON.stringify(params || {}),
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    if (err instanceof AuthFailure) {
      return NextResponse.json({ error: err.message, missing: err.missing }, { status: err.status });
    }
    return NextResponse.json({ error: "Bridge unreachable" }, { status: 503 });
  }
}
