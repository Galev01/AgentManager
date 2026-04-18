import { NextResponse } from "next/server";
import { rerunYoutubeSummary } from "@/lib/bridge-client";
import { isAuthenticated } from "@/lib/session";

const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ videoId: string }> }
) {
  const authed = await isAuthenticated();
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
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
}
