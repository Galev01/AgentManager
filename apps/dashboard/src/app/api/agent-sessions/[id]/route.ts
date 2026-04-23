import { NextResponse } from "next/server";
import {
  sendSessionMessage,
  resetSession,
  abortSession,
  compactSession,
  deleteSession,
  getSessionUsage,
} from "@/lib/bridge-client";
import { requireAuthApi, AuthFailure } from "@/lib/auth/current-user";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuthApi();
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
  try {
    await requireAuthApi();
    const { id } = await params;
    const body = await request.json();
    let result: unknown;

    switch (body.action) {
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
    await requireAuthApi();
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
