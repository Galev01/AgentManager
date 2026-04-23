import { NextResponse } from "next/server";
import { listAgents, createAgent, deleteAgent } from "@/lib/bridge-client";
import { requirePermissionApi, AuthFailure } from "@/lib/auth/current-user";

export async function GET() {
  try {
    await requirePermissionApi("agents.view");
    const agents = await listAgents();
    return NextResponse.json(agents);
  } catch (err: any) {
    if (err instanceof AuthFailure) {
      return NextResponse.json({ error: err.message, missing: err.missing }, { status: err.status });
    }
    return NextResponse.json(
      { error: err.message || "Failed to list agents" },
      { status: 502 }
    );
  }
}

export async function POST(request: Request) {
  try {
    await requirePermissionApi("agents.manage");
    const body = await request.json();
    const agent = await createAgent(body);
    return NextResponse.json(agent, { status: 201 });
  } catch (err: any) {
    if (err instanceof AuthFailure) {
      return NextResponse.json({ error: err.message, missing: err.missing }, { status: err.status });
    }
    return NextResponse.json(
      { error: err.message || "Failed to create agent" },
      { status: 502 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    await requirePermissionApi("agents.manage");
    const { name } = await request.json();
    const result = await deleteAgent(name);
    return NextResponse.json(result);
  } catch (err: any) {
    if (err instanceof AuthFailure) {
      return NextResponse.json({ error: err.message, missing: err.missing }, { status: err.status });
    }
    return NextResponse.json(
      { error: err.message || "Failed to delete agent" },
      { status: 502 }
    );
  }
}
