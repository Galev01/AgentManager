import { NextResponse } from "next/server";
import {
  sendSessionMessage,
  resetSession,
  abortSession,
  compactSession,
  deleteSession,
  getSessionUsage,
} from "@/lib/bridge-client";
import { requirePermissionApi, AuthFailure } from "@/lib/auth/current-user";
import type { PermissionId } from "@openclaw-manager/types";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requirePermissionApi("agent_sessions.view");
    const { id } = await params;
    const usage = await getSessionUsage(id);
    return NextResponse.json(usage);
  } catch (err: any) {
    if (err instanceof AuthFailure) {
      return NextResponse.json({ error: err.message, missing: err.missing }, { status: err.status });
    }
    return NextResponse.json(
      { error: err.message || "Failed to get session usage" },
      { status: 502 }
    );
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const action = body?.action;
  const needed: PermissionId =
    action === "reset"
      ? "agent_sessions.reset"
      : action === "abort"
      ? "agent_sessions.abort"
      : action === "compact"
      ? "agent_sessions.compact"
      : "agent_sessions.send";
  try {
    await requirePermissionApi(needed);
    let result: unknown;

    switch (action) {
      case "send":
        result = await sendSessionMessage(id, body.message);
        break;
      case "reset":
        result = await resetSession(id);
        break;
      case "abort":
        result = await abortSession(id);
        break;
      case "compact":
        result = await compactSession(id);
        break;
      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }

    return NextResponse.json(result);
  } catch (err: any) {
    if (err instanceof AuthFailure) {
      return NextResponse.json({ error: err.message, missing: err.missing }, { status: err.status });
    }
    return NextResponse.json(
      { error: err.message || "Action failed" },
      { status: 502 }
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requirePermissionApi("agent_sessions.delete");
    const { id } = await params;
    const result = await deleteSession(id);
    return NextResponse.json(result);
  } catch (err: any) {
    if (err instanceof AuthFailure) {
      return NextResponse.json({ error: err.message, missing: err.missing }, { status: err.status });
    }
    return NextResponse.json(
      { error: err.message || "Failed to delete session" },
      { status: 502 }
    );
  }
}
