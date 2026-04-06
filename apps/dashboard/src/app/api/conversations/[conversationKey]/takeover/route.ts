import { NextResponse } from "next/server";
import { sendTakeover } from "@/lib/bridge-client";

export async function POST(_req: Request, { params }: { params: Promise<{ conversationKey: string }> }) {
  try {
    const { conversationKey } = await params;
    const result = await sendTakeover(conversationKey);
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "Bridge unreachable" }, { status: 503 });
  }
}
