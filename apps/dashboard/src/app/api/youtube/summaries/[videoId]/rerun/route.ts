import { NextResponse } from "next/server";
import { rerunYoutubeSummary } from "@/lib/bridge-client";
import { requirePermissionApi, AuthFailure } from "@/lib/auth/current-user";

const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ videoId: string }> }
) {
  try {
    await requirePermissionApi("youtube.rerun");
    const { videoId } = await params;
    if (!VIDEO_ID_RE.test(videoId)) {
      return NextResponse.json({ error: "invalid videoId" }, { status: 400 });
    }
    try {
      const result = await rerunYoutubeSummary(videoId);
      return NextResponse.json(result, { status: 202 });
    } catch (err: any) {
      return NextResponse.json(
        { error: err?.message || "Failed to re-run summary" },
        { status: 502 }
      );
    }
  } catch (err) {
    if (err instanceof AuthFailure) {
      return NextResponse.json({ error: err.message, missing: err.missing }, { status: err.status });
    }
    throw err;
  }
}
