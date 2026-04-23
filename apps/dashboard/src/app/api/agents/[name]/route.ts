import { NextResponse } from "next/server";
import { getAgent, updateAgent, deleteAgent } from "@/lib/bridge-client";
import { requireAuthApi, AuthFailure } from "@/lib/auth/current-user";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ name: string }> }
) {
  try {
    await requireAuthApi();
    const { name } = await params;
    const agent = await getAgent(decodeURIComponent(name));
    if (!agent) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(agent);
  } catch (err: any) {
    if (err instanceof AuthFailure) {
      return NextResponse.json({ error: err.message, missing: err.missing }, { status: err.status });
    }
    return NextResponse.json(
      { error: err.message || "Failed to get agent" },
      { status: 502 }
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ name: string }> }
) {
  try {
    await requireAuthApi();
    const { name } = await params;
    const body = await request.json();
    const agent = await updateAgent(decodeURIComponent(name), body);
    return NextResponse.json(agent);
  } catch (err: any) {
    if (err instanceof AuthFailure) {
      return NextResponse.json({ error: err.message, missing: err.missing }, { status: err.status });
    }
    return NextResponse.json(
      { error: err.message || "Failed to update agent" },
      { status: 502 }
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ name: string }> }
) {
  try {
    await requireAuthApi();
    const { name } = await params;
    const result = await deleteAgent(decodeURIComponent(name));
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
