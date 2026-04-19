import { NextRequest, NextResponse } from "next/server";
import { patchClaudeCodeSession } from "@/lib/bridge-client";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  try {
    const out = await patchClaudeCodeSession(id, body);
    return NextResponse.json(out);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
