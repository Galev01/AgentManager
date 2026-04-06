import { NextResponse } from "next/server";
import { sendRelease } from "@/lib/bridge-client";

export async function POST(_req: Request, { params }: { params: Promise<{ conversationKey: string }> }) {
  try {
    const { conversationKey } = await params;
    const result = await sendRelease(conversationKey);
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "Bridge unreachable" }, { status: 503 });
  }
}
