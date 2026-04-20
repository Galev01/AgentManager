import { NextResponse } from "next/server";
import { getClaudeCodeConnectConfig } from "@/lib/bridge-client";

export async function GET() {
  try {
    return NextResponse.json(await getClaudeCodeConnectConfig());
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
