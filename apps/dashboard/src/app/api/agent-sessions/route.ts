import { NextResponse } from "next/server";
import { listAgentSessions, createAgentSession } from "@/lib/bridge-client";
import { requireAuthApi, AuthFailure } from "@/lib/auth/current-user";

export async function GET(request: Request) {
  try {
    await requireAuthApi();
    const { searchParams } = new URL(request.url);
    const agent = searchParams.get("agent") ?? undefined;
    const status = searchParams.get("status") ?? undefined;
    const sessions = await listAgentSessions({ agent, status });
    return NextResponse.json(sessions);
  } catch (err: any) {
    if (err instanceof AuthFailure) {
      return NextResponse.json({ error: err.message, missing: err.missing }, { status: err.status });
    }
    return NextResponse.json(
      { error: err.message || "Failed to list sessions" },
      { status: 502 }
    );
  }
}

export async function POST(request: Request) {
  try {
    await requireAuthApi();
    const body = await request.json();
    const session = await createAgentSession(body.agentName);
    return NextResponse.json(session, { status: 201 });
  } catch (err: any) {
    if (err instanceof AuthFailure) {
      return NextResponse.json({ error: err.message, missing: err.missing }, { status: err.status });
    }
    return NextResponse.json(
      { error: err.message || "Failed to create session" },
      { status: 502 }
    );
  }
}
