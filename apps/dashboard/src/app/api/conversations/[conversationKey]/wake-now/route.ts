import { NextResponse } from "next/server";
import { sendWakeNow } from "@/lib/bridge-client";

export async function POST(_req: Request, { params }: { params: Promise<{ conversationKey: string }> }) {
  try {
    const { conversationKey } = await params;
    const result = await sendWakeNow(conversationKey);
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "Bridge unreachable" }, { status: 503 });
  }
}
