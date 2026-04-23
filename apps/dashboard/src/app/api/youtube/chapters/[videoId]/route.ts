import { NextResponse } from "next/server";
import { getYoutubeChapters } from "@/lib/bridge-client";
import { requirePermissionApi, AuthFailure } from "@/lib/auth/current-user";

const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ videoId: string }> }
) {
  try {
    await requirePermissionApi("youtube.view");
    const { videoId } = await params;
    if (!VIDEO_ID_RE.test(videoId)) {
      return NextResponse.json({ error: "invalid videoId" }, { status: 400 });
    }
    const result = await getYoutubeChapters(videoId);
    return NextResponse.json(result);
  } catch (err: any) {
    if (err instanceof AuthFailure) {
      return NextResponse.json({ error: err.message, missing: err.missing }, { status: err.status });
    }
    return NextResponse.json(
      { error: err?.message || "Failed to load chapters" },
      { status: 502 }
    );
  }
}
