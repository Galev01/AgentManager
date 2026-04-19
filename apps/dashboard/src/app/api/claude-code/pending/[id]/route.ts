import { NextRequest, NextResponse } from "next/server";
import { resolveClaudeCodePending } from "@/lib/bridge-client";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { action, text } = await req.json();
  try {
    const out = await resolveClaudeCodePending(id, action, text);
    return NextResponse.json(out);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
