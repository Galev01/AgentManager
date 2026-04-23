import { NextResponse } from "next/server";
import { listYoutubeJobs } from "@/lib/bridge-client";
import { requireAuthApi, AuthFailure } from "@/lib/auth/current-user";

export async function GET() {
  try {
    await requireAuthApi();
    const result = await listYoutubeJobs();
    return NextResponse.json(result);
  } catch (err: any) {
    if (err instanceof AuthFailure) {
      return NextResponse.json({ error: err.message, missing: err.missing }, { status: err.status });
    }
    return NextResponse.json(
      { error: err?.message || "Failed to list youtube jobs" },
      { status: 502 }
    );
  }
}
