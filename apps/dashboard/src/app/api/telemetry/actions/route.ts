// apps/dashboard/src/app/api/telemetry/actions/route.ts
import { NextResponse, type NextRequest } from "next/server";
import { isAuthenticated } from "@/lib/session";
import type { TelemetryEventInput } from "@openclaw-manager/types";

const BRIDGE_URL = process.env.OPENCLAW_BRIDGE_URL || "http://127.0.0.1:3100";
const BRIDGE_TOKEN = process.env.OPENCLAW_BRIDGE_TOKEN || "";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const authed = await isAuthenticated();
  if (!authed) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: TelemetryEventInput;
  try {
    body = (await req.json()) as TelemetryEventInput;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  // Server overwrites trusted fields. Single-admin app, so actor.id = "admin".
  const trusted: TelemetryEventInput = {
    ...body,
    schemaVersion: 1,
    source: "dashboard",
    surface: body.surface === "web" ? "web" : undefined,
    actor: { type: "user", id: "admin" },
  };

  try {
    const res = await fetch(`${BRIDGE_URL}/telemetry/actions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${BRIDGE_TOKEN}`,
      },
      body: JSON.stringify(trusted),
    });
    const text = await res.text();
    return new NextResponse(text, {
      status: res.status,
      headers: { "Content-Type": res.headers.get("Content-Type") ?? "application/json" },
    });
  } catch {
    return NextResponse.json({ error: "bridge unreachable" }, { status: 503 });
  }
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const authed = await isAuthenticated();
  if (!authed) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const qs = req.nextUrl.search;
  try {
    const res = await fetch(`${BRIDGE_URL}/telemetry/actions${qs}`, {
      headers: { Authorization: `Bearer ${BRIDGE_TOKEN}` },
    });
    const text = await res.text();
    return new NextResponse(text, {
      status: res.status,
      headers: { "Content-Type": res.headers.get("Content-Type") ?? "application/json" },
    });
  } catch {
    return NextResponse.json({ error: "bridge unreachable" }, { status: 503 });
  }
}
