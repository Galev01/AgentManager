import { NextResponse } from "next/server";
import {
  getGatewayConfig,
  getGatewayConfigSchema,
  setGatewayConfig,
  applyGatewayConfig,
} from "@/lib/bridge-client";
import { isAuthenticated } from "@/lib/session";

export async function GET(request: Request) {
  const authed = await isAuthenticated();
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { searchParams } = new URL(request.url);
  try {
    if (searchParams.get("schema") === "true") {
      const schema = await getGatewayConfigSchema();
      return NextResponse.json(schema);
    }
    const config = await getGatewayConfig();
    return NextResponse.json(config);
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to fetch config" },
      { status: 502 }
    );
  }
}

export async function PATCH(request: Request) {
  const authed = await isAuthenticated();
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const body = await request.json();
    const result = await setGatewayConfig(body);
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to update config" },
      { status: 502 }
    );
  }
}

export async function POST(request: Request) {
  const authed = await isAuthenticated();
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const body = await request.json();
    if (body.action === "apply") {
      const result = await applyGatewayConfig();
      return NextResponse.json(result);
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to apply config" },
      { status: 502 }
    );
  }
}
