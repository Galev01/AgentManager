import { NextResponse } from "next/server";
import { getYoutubeChunks } from "@/lib/bridge-client";
import { requireAuthApi, AuthFailure } from "@/lib/auth/current-user";

const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ videoId: string }> }
) {
  try {
    await requireAuthApi();
    const { videoId } = await params;
    if (!VIDEO_ID_RE.test(videoId)) {
      return NextResponse.json({ error: "invalid videoId" }, { status: 400 });
    }
    const result = await getYoutubeChunks(videoId);
    return NextResponse.json(result);
  } catch (err: any) {
    if (err instanceof AuthFailure) {
      return NextResponse.json({ error: err.message, missing: err.missing }, { status: err.status });
    }
    return NextResponse.json(
      { error: err?.message || "Failed to load chunks" },
      { status: 502 }
    );
  }
}
