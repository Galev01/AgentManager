import { NextResponse } from "next/server";
import { requirePermissionApi, AuthFailure } from "@/lib/auth/current-user";

const BRIDGE_URL = process.env.OPENCLAW_BRIDGE_URL || "http://localhost:3100";
const BRIDGE_TOKEN = process.env.OPENCLAW_BRIDGE_TOKEN || "";

async function bridgeFetch(path: string, init: RequestInit): Promise<Response> {
  return fetch(`${BRIDGE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${BRIDGE_TOKEN}`,
      ...(init.headers as Record<string, string> | undefined),
    },
  });
}

async function forward(
  req: Request,
  ctx: { params: Promise<{ path: string[] }> },
  method: string,
): Promise<NextResponse> {
  try {
    await requirePermissionApi("copilot.chat");
    const { path } = await ctx.params;
    const url = `/copilot/${path.map(encodeURIComponent).join("/")}${new URL(req.url).search}`;
    const init: RequestInit = { method };
    if (method !== "GET" && method !== "DELETE") {
      init.headers = { "content-type": req.headers.get("content-type") ?? "application/json" };
      init.body = await req.text();
    }
    const res = await bridgeFetch(url, init);
    const text = await res.text();
    return new NextResponse(text, {
      status: res.status,
      headers: { "content-type": res.headers.get("content-type") ?? "application/json" },
    });
  } catch (err) {
    if (err instanceof AuthFailure) {
      return NextResponse.json({ error: err.message, missing: err.missing }, { status: err.status });
    }
    return NextResponse.json({ error: "Bridge unreachable" }, { status: 503 });
  }
}

export async function GET(req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  return forward(req, ctx, "GET");
}

export async function POST(req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  return forward(req, ctx, "POST");
}

export async function DELETE(req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  return forward(req, ctx, "DELETE");
}

export async function PATCH(req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  return forward(req, ctx, "PATCH");
}
