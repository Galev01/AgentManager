import { NextResponse } from "next/server";
import { getYoutubeSummary, deleteYoutubeSummary } from "@/lib/bridge-client";
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
    try {
      const result = await getYoutubeSummary(videoId);
      return NextResponse.json(result);
    } catch (err: any) {
      return NextResponse.json(
        { error: err?.message || "Summary not found" },
        { status: 404 }
      );
    }
  } catch (err) {
    if (err instanceof AuthFailure) {
      return NextResponse.json({ error: err.message, missing: err.missing }, { status: err.status });
    }
    throw err;
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ videoId: string }> }
) {
  try {
    await requirePermissionApi("youtube.delete");
    const { videoId } = await params;
    if (!VIDEO_ID_RE.test(videoId)) {
      return NextResponse.json({ error: "invalid videoId" }, { status: 400 });
    }
    try {
      await deleteYoutubeSummary(videoId);
      return new Response(null, { status: 204 });
    } catch (err: any) {
      return NextResponse.json(
        { error: err?.message || "Failed to delete summary" },
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
