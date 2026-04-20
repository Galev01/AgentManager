import { NextResponse } from "next/server";
import { postYoutubeRebuild } from "@/lib/bridge-client";
import { isAuthenticated } from "@/lib/session";
import type { YoutubeRebuildPart } from "@openclaw-manager/types";

const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;
const VALID_PARTS: ReadonlySet<YoutubeRebuildPart> = new Set<YoutubeRebuildPart>([
  "captions",
  "chunks",
  "summary",
  "highlights",
  "chapters",
  "chat-history",
]);

export async function POST(
  request: Request,
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
  const body = await request.json().catch(() => ({}));
  const rawParts = body?.parts;
  if (!Array.isArray(rawParts) || rawParts.length === 0) {
    return NextResponse.json(
      { error: "parts must be a non-empty array" },
      { status: 400 }
    );
  }
  const parts: YoutubeRebuildPart[] = [];
  for (const p of rawParts) {
    if (typeof p !== "string" || !VALID_PARTS.has(p as YoutubeRebuildPart)) {
      return NextResponse.json(
        { error: `invalid part: ${String(p)}` },
        { status: 400 }
      );
    }
    parts.push(p as YoutubeRebuildPart);
  }
  const url = typeof body?.url === "string" ? body.url : undefined;
  try {
    const result = await postYoutubeRebuild(videoId, parts, url);
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Failed to rebuild" },
      { status: 502 }
    );
  }
}
