import { NextResponse } from "next/server";
import { listCronJobs, addCronJob, removeCronJob } from "@/lib/bridge-client";
import { requirePermissionApi, AuthFailure } from "@/lib/auth/current-user";

export async function GET() {
  try {
    await requirePermissionApi("cron.view");
    const jobs = await listCronJobs();
    return NextResponse.json(jobs);
  } catch (err: any) {
    if (err instanceof AuthFailure) {
      return NextResponse.json({ error: err.message, missing: err.missing }, { status: err.status });
    }
    return NextResponse.json(
      { error: err.message || "Failed to list cron jobs" },
      { status: 502 }
    );
  }
}

export async function POST(request: Request) {
  try {
    await requirePermissionApi("cron.manage");
    const body = await request.json();
    const job = await addCronJob(body);
    return NextResponse.json(job, { status: 201 });
  } catch (err: any) {
    if (err instanceof AuthFailure) {
      return NextResponse.json({ error: err.message, missing: err.missing }, { status: err.status });
    }
    return NextResponse.json(
      { error: err.message || "Failed to add cron job" },
      { status: 502 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    await requirePermissionApi("cron.manage");
    const { id } = await request.json();
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
