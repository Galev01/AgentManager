import { NextResponse } from "next/server";
import { postYoutubeChat, getYoutubeChat } from "@/lib/bridge-client";
import { isAuthenticated } from "@/lib/session";

const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;

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
  const message = typeof body?.message === "string" ? body.message : "";
  const chatSessionId =
    typeof body?.chatSessionId === "string" ? body.chatSessionId : undefined;
  if (!message.trim()) {
    return NextResponse.json(
      { error: "message must be a non-empty string" },
      { status: 400 }
    );
  }
  try {
    const result = await postYoutubeChat(videoId, message, chatSessionId);
    return NextResponse.json(result, { status: 202 });
  } catch (err: any) {
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
  const authed = await isAuthenticated();
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { videoId } = await params;
  if (!VIDEO_ID_RE.test(videoId)) {
    return NextResponse.json({ error: "invalid videoId" }, { status: 400 });
  }
  const url = new URL(request.url);
  const sessionId = url.searchParams.get("sessionId") ?? undefined;
  const after = url.searchParams.get("after") ?? undefined;
  try {
    const result = await getYoutubeChat(videoId, sessionId, after);
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Failed to load chat" },
      { status: 502 }
    );
  }
}
