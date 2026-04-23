import { NextResponse } from "next/server";
import { getMessages } from "@/lib/bridge-client";
import { requireAuthApi, AuthFailure } from "@/lib/auth/current-user";

export async function GET(request: Request) {
  try {
    await requireAuthApi();
    const url = new URL(request.url);
    const conversationKey = url.searchParams.get("conversationKey");
    const limit = Number(url.searchParams.get("limit")) || 20;
    if (!conversationKey) return NextResponse.json({ error: "conversationKey required" }, { status: 400 });
    const events = await getMessages(conversationKey, limit);
    return NextResponse.json(events);
  } catch (err: any) {
    if (err instanceof AuthFailure) {
      return NextResponse.json({ error: err.message, missing: err.missing }, { status: err.status });
    }
    return NextResponse.json({ error: err.message || "Failed" }, { status: 502 });
  }
}
