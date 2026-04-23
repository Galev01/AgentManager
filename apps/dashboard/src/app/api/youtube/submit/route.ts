import { NextResponse } from "next/server";
import { submitYoutubeJobs } from "@/lib/bridge-client";
import { requirePermissionApi, AuthFailure } from "@/lib/auth/current-user";

export async function POST(request: Request) {
  try {
    await requirePermissionApi("youtube.submit");
    const body = await request.json().catch(() => ({}));
    const urls = Array.isArray(body?.urls) ? body.urls.map(String) : [];
    const result = await submitYoutubeJobs(urls);
    return NextResponse.json(result, { status: 202 });
  } catch (err: any) {
    if (err instanceof AuthFailure) {
      return NextResponse.json({ error: err.message, missing: err.missing }, { status: err.status });
    }
    return NextResponse.json(
      { error: err?.message || "Failed to submit youtube jobs" },
      { status: 502 }
    );
  }
}
