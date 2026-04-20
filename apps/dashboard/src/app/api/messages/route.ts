import { NextResponse } from "next/server";
import { getMessages } from "@/lib/bridge-client";
import { isAuthenticated } from "@/lib/session";

export async function GET(request: Request) {
  const authed = await isAuthenticated();
  if (!authed) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const url = new URL(request.url);
  const conversationKey = url.searchParams.get("conversationKey");
  const limit = Number(url.searchParams.get("limit")) || 20;
  if (!conversationKey) return NextResponse.json({ error: "conversationKey required" }, { status: 400 });
  try {
    const events = await getMessages(conversationKey, limit);
    return NextResponse.json(events);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed" }, { status: 502 });
  }
}
