import { NextResponse } from "next/server";
import { listAgentSessions, createAgentSession } from "@/lib/bridge-client";
import { isAuthenticated } from "@/lib/session";

export async function GET(request: Request) {
  const authed = await isAuthenticated();
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { searchParams } = new URL(request.url);
    const agent = searchParams.get("agent") ?? undefined;
    const status = searchParams.get("status") ?? undefined;
    const sessions = await listAgentSessions({ agent, status });
    return NextResponse.json(sessions);
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to list sessions" },
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
    const session = await createAgentSession(body.agentName);
    return NextResponse.json(session, { status: 201 });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to create session" },
      { status: 502 }
    );
  }
}
