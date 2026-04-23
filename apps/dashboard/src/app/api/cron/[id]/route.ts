import { NextResponse } from "next/server";
import { runCronJob, removeCronJob } from "@/lib/bridge-client";
import { requireAuthApi, AuthFailure } from "@/lib/auth/current-user";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuthApi();
    const { id } = await params;
    const body = await request.json();
    if (body.action === "run") {
      const result = await runCronJob(id);
      return NextResponse.json(result);
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err: any) {
    if (err instanceof AuthFailure) {
      return NextResponse.json({ error: err.message, missing: err.missing }, { status: err.status });
    }
    return NextResponse.json(
      { error: err.message || "Failed to run cron job" },
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
    const result = await removeCronJob(id);
    return NextResponse.json(result);
  } catch (err: any) {
    if (err instanceof AuthFailure) {
      return NextResponse.json({ error: err.message, missing: err.missing }, { status: err.status });
    }
    return NextResponse.json(
      { error: err.message || "Failed to delete cron job" },
      { status: 502 }
    );
  }
}
