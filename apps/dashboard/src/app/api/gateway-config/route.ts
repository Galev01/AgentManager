import { NextResponse } from "next/server";
import {
  getGatewayConfig,
  getGatewayConfigSchema,
  setGatewayConfig,
  applyGatewayConfig,
} from "@/lib/bridge-client";
import { requireAuthApi, AuthFailure } from "@/lib/auth/current-user";

export async function GET(request: Request) {
  try {
    await requireAuthApi();
    const { searchParams } = new URL(request.url);
    if (searchParams.get("schema") === "true") {
      const schema = await getGatewayConfigSchema();
      return NextResponse.json(schema);
    }
    const config = await getGatewayConfig();
    return NextResponse.json(config);
  } catch (err: any) {
    if (err instanceof AuthFailure) {
      return NextResponse.json({ error: err.message, missing: err.missing }, { status: err.status });
    }
    return NextResponse.json(
      { error: err.message || "Failed to fetch config" },
      { status: 502 }
    );
  }
}

function validateBody(body: any): { config: Record<string, unknown>; baseHash: string } | string {
  if (!body || typeof body !== "object") return "request body must be a JSON object";
  if (typeof body.baseHash !== "string" || body.baseHash.length === 0) {
    return "baseHash is required; reload the config to get a fresh hash";
  }
  if (!body.config || typeof body.config !== "object" || Array.isArray(body.config)) {
    return "config (object) is required";
  }
  return { config: body.config as Record<string, unknown>, baseHash: body.baseHash };
}

export async function PATCH(request: Request) {
  try {
    await requireAuthApi();
    const body = await request.json();
    const validated = validateBody(body);
    if (typeof validated === "string") {
      return NextResponse.json({ error: validated }, { status: 400 });
    }
    const result = await setGatewayConfig(validated.config, validated.baseHash);
    return NextResponse.json(result);
  } catch (err: any) {
    if (err instanceof AuthFailure) {
      return NextResponse.json({ error: err.message, missing: err.missing }, { status: err.status });
    }
    return NextResponse.json(
      { error: err.message || "Failed to update config" },
      { status: 502 }
    );
  }
}

export async function POST(request: Request) {
  try {
    await requireAuthApi();
    const body = await request.json();
    if (body?.action === "apply") {
      const validated = validateBody(body);
      if (typeof validated === "string") {
        return NextResponse.json({ error: validated }, { status: 400 });
      }
      const result = await applyGatewayConfig(validated.config, validated.baseHash);
      return NextResponse.json(result);
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err: any) {
    if (err instanceof AuthFailure) {
      return NextResponse.json({ error: err.message, missing: err.missing }, { status: err.status });
    }
    return NextResponse.json(
      { error: err.message || "Failed to apply config" },
      { status: 502 }
    );
  }
}
