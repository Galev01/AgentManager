import { NextResponse } from "next/server";

const BRIDGE_URL = process.env.OPENCLAW_BRIDGE_URL || "http://localhost:3100";
const BRIDGE_TOKEN = process.env.OPENCLAW_BRIDGE_TOKEN || "";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const lines = Number(searchParams.get("lines")) || 100;

    const res = await fetch(`${BRIDGE_URL}/logs/tail`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${BRIDGE_TOKEN}`,
      },
    });

    if (!res.ok) {
      return NextResponse.json({ error: "Failed to fetch logs" }, { status: 502 });
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Bridge unreachable" }, { status: 503 });
  }
}
