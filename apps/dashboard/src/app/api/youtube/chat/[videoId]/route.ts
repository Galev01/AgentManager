import { NextResponse } from "next/server";
import { postYoutubeChat, getYoutubeChat } from "@/lib/bridge-client";
import { requirePermissionApi, AuthFailure } from "@/lib/auth/current-user";

const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ videoId: string }> }
) {
  try {
    await requirePermissionApi("youtube.chat");
    const { videoId } = await params;
    if (!VIDEO_ID_RE.test(videoId)) {
      return NextResponse.json({ error: "invalid videoId" }, { status: 400 });
    }
    const body = await request.json().catch(() => ({}));
    const message = typeof body?.message === "string" ? body.message : "";
    const chatSessionId =
      typeof body?.chatSessionId === "string" ? body.chatSessionId : undefined;
    if (!message.trim()) {
      return NextResponse.json(
        { error: "message must be a non-empty string" },
        { status: 400 }
      );
    }
    const result = await postYoutubeChat(videoId, message, chatSessionId);
    return NextResponse.json(result, { status: 202 });
  } catch (err: any) {
    if (err instanceof AuthFailure) {
      return NextResponse.json({ error: err.message, missing: err.missing }, { status: err.status });
    }
    return NextResponse.json(
      { error: err?.message || "Failed to post chat message" },
      { status: 502 }
    );
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ videoId: string }> }
) {
  try {
    await requirePermissionApi("youtube.view");
    const { videoId } = await params;
    if (!VIDEO_ID_RE.test(videoId)) {
      return NextResponse.json({ error: "invalid videoId" }, { status: 400 });
    }
    const url = new URL(request.url);
    const sessionId = url.searchParams.get("sessionId") ?? undefined;
    const after = url.searchParams.get("after") ?? undefined;
    const result = await getYoutubeChat(videoId, sessionId, after);
    return NextResponse.json(result);
  } catch (err: any) {
    if (err instanceof AuthFailure) {
      return NextResponse.json({ error: err.message, missing: err.missing }, { status: err.status });
    }
    return NextResponse.json(
      { error: err?.message || "Failed to load chat" },
      { status: 502 }
    );
  }
}
