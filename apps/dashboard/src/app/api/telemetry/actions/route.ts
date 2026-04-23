// apps/dashboard/src/app/api/telemetry/actions/route.ts
import { NextResponse, type NextRequest } from "next/server";
import { requireAuthApi, AuthFailure } from "@/lib/auth/current-user";
import { TELEMETRY_SCHEMA_VERSION, type TelemetryEventInput } from "@openclaw-manager/types";

const BRIDGE_URL = process.env.OPENCLAW_BRIDGE_URL || "http://127.0.0.1:3100";
const BRIDGE_TOKEN = process.env.OPENCLAW_BRIDGE_TOKEN || "";

export async function POST(req: NextRequest): Promise<NextResponse> {
  let session;
  try {
    session = await requireAuthApi();
  } catch (err) {
    if (err instanceof AuthFailure) {
      return NextResponse.json({ error: err.message, missing: err.missing }, { status: err.status });
    }
    throw err;
  }

  let body: TelemetryEventInput;
  try {
    body = (await req.json()) as TelemetryEventInput;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  // Server overwrites trusted fields with authenticated identity.
  const trusted: TelemetryEventInput = {
    ...body,
    schemaVersion: TELEMETRY_SCHEMA_VERSION,
    source: "dashboard",
    surface: body.surface === "web" ? "web" : undefined,
    actor: { type: "user", id: session.user.id },
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
  try {
    await requireAuthApi();
  } catch (err) {
    if (err instanceof AuthFailure) {
      return NextResponse.json({ error: err.message, missing: err.missing }, { status: err.status });
    }
    throw err;
  }

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
